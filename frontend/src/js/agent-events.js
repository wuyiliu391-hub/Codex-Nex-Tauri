// Subscribe to Wails agent events and drive live turn UI + selective refresh.
// Prefer runtime.EventsOn (direct) over Go callback bridges �?more reliable for EventsEmit.

// Use the global Wails runtime directly; the generated wailsjs/runtime wrapper is outside the dev server root.
const EventsOn = (eventName, callback) => window.runtime.EventsOnMultiple(eventName, callback, -1);
import { store, setSessionActive } from "./state.js";
import {
  applyAgentEvent,
  applyRuntimeEvent,
  applyPlanMode,
  applyQuestion,
  beginLiveTurn,
  resetLiveTurn,
  liveTurn,
} from "./live-turn.js";
import { openModal } from "./modal.js";

let refreshTimer = null;
let composerDirty = false;
let wired = false;
let pollTimer = null;
// approvalId -> close fn; one modal per pending server request
const approvalModals = new Map();

function field(ev, ...keys) {
  for (const k of keys) {
    if (ev?.[k] !== undefined && ev?.[k] !== null && ev?.[k] !== "") return ev[k];
  }
  return "";
}

function markIdle(reason = "") {
  store.running = false;
  if (liveTurn.active) {
    liveTurn.active = false;
    if (!liveTurn.phase || liveTurn.phase === "preparing" || liveTurn.phase === "thinking" || liveTurn.phase === "streaming" || liveTurn.phase === "executing_tool") {
      liveTurn.phase = reason || "completed";
    }
  }
  document.dispatchEvent(new CustomEvent("codex:live-turn"));
  document.dispatchEvent(new CustomEvent("codex:composer-idle"));
  stopRunPoll();
}

function scheduleRefresh(immediate = false) {
  if (refreshTimer) clearTimeout(refreshTimer);
  const run = async () => {
    refreshTimer = null;
    await store.onRefresh?.();
    // After refresh, force idle if backend session is no longer running
    const rt = store.activeSession?.runtime?.status;
    if (rt && rt !== "running") {
      markIdle(rt);
    } else if (composerDirty) {
      composerDirty = false;
      markIdle("completed");
    }
  };
  if (immediate) run();
  else refreshTimer = setTimeout(run, 60);
}

/** Poll backend IsSessionRunning so UI cannot stick on "processing" if events drop. */
export function startRunPoll(sessionId, api) {
  stopRunPoll();
  if (!sessionId || !api?.IsSessionRunning) return;
  let ticks = 0;
  pollTimer = setInterval(async () => {
    ticks += 1;
    if (ticks > 1200) { // ~10 min at 500ms
      stopRunPoll();
      markIdle("timeout");
      await store.onRefresh?.();
      return;
    }
    try {
      const running = await api.IsSessionRunning(sessionId);
      if (!running) {
        stopRunPoll();
        markIdle("completed");
        composerDirty = true;
        scheduleRefresh(true);
      }
    } catch (e) {
      // ignore transient bridge errors
    }
  }, 500);
}

export function stopRunPoll() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function handleAgentEvent(ev, api) {
  if (!ev) return;
  // EventsOn may deliver a single object or array-wrapped payload
  if (Array.isArray(ev)) ev = ev[0];
  if (!ev || typeof ev !== "object") return;

  const type = field(ev, "type", "Type");
  const sessionId = field(ev, "sessionId", "SessionID", "SessionId");

  if (sessionId && store.activeSessionId && sessionId !== store.activeSessionId) {
    if (type === "approval") {
      const status = field(ev, "status", "Status");
      if (!status || status === "pending") showApproval(api, ev);
    }
    return;
  }
  if (sessionId && !store.activeSessionId) setSessionActive(sessionId);

  const { refresh, composer } = applyAgentEvent(ev);
  document.dispatchEvent(new CustomEvent("codex:live-turn"));

  if (type === "approval") showApproval(api, ev);
  if (type === "error") {
    const err = field(ev, "error", "Error");
    if (err) showErrorToast(err);
  }

  if (type === "idle" || type === "error" || type === "assistant_done") {
    markIdle(type === "error" ? "failed" : field(ev, "status", "Status") || "completed");
  }
  if (composer) composerDirty = true;
  if (refresh) scheduleRefresh(type === "assistant_done" || type === "idle" || type === "error");
}

function handleRuntimeEvent(ev) {
  if (!ev) return;
  if (Array.isArray(ev)) ev = ev[0];
  if (!ev || typeof ev !== "object") return;

  const sessionId = field(ev, "sessionId", "SessionID", "SessionId");
  if (sessionId && store.activeSessionId && sessionId !== store.activeSessionId) return;

  const type = field(ev, "type", "Type");
  const { refresh } = applyRuntimeEvent(ev);
  document.dispatchEvent(new CustomEvent("codex:live-turn"));

  if (type === "turn.completed" || type === "turn.failed" || type === "turn.cancelled") {
    markIdle(type.replace("turn.", ""));
    composerDirty = true;
    scheduleRefresh(true);
  } else if (refresh) {
    scheduleRefresh(false);
  }
}

export function wireAgentEvents(api) {
  if (wired) return;
  wired = true;

  // Primary path: direct runtime events (matches EventsEmit on Go side)
  try {
    EventsOn("agent:event", (ev) => handleAgentEvent(ev, api));
    EventsOn("agent:runtime", (ev) => handleRuntimeEvent(ev));
    EventsOn("agent:plan_mode", (ev) => {
      if (!ev) return;
      if (Array.isArray(ev)) ev = ev[0];
      const active = ev?.active ?? ev?.Active ?? false;
      applyPlanMode(!!active);
      document.dispatchEvent(new CustomEvent("codex:live-turn"));
    });
    EventsOn("agent:question", (ev) => {
      if (!ev) return;
      if (Array.isArray(ev)) ev = ev[0];
      applyQuestion(ev);
      // Official user-input / elicitation are server→client requests with {id,method,params}
      if (ev && typeof ev === "object" && (ev.id !== undefined && ev.id !== null) && ev.method) {
        showUserInputModal(api, ev);
      }
      document.dispatchEvent(new CustomEvent("codex:live-turn"));
    });
  } catch (e) {
    console.error("EventsOn wire failed", e);
  }

  // Fallback path: Go callback bridges (older Wails / dual-wire safety)
  try {
    if (typeof api?.OnAgentEvent === "function") {
      api.OnAgentEvent((ev) => handleAgentEvent(ev, api));
    }
    if (typeof api?.OnAgentRuntime === "function") {
      api.OnAgentRuntime((ev) => handleRuntimeEvent(ev));
    }
    if (typeof api?.OnAgentPlanMode === "function") {
      api.OnAgentPlanMode((ev) => {
        if (!ev) return;
        const active = ev.active ?? ev.Active ?? false;
        applyPlanMode(!!active);
        document.dispatchEvent(new CustomEvent("codex:live-turn"));
      });
    }
    if (typeof api?.OnAgentQuestion === "function") {
      api.OnAgentQuestion((ev) => {
        if (!ev) return;
        applyQuestion(ev);
        document.dispatchEvent(new CustomEvent("codex:live-turn"));
      });
    }
  } catch (e) {
    console.error("OnAgent* wire failed", e);
  }
}

/** Pull the JSON-RPC request id from an approval / user-input payload. */
function extractRequestId(ev) {
  return field(ev, "id", "Id", "approveId", "ApproveID", "ApproveId", "requestId", "RequestId");
}

/** Close any open approval modal for a given request id. */
function dismissApprovalModal(id) {
  const key = String(id ?? "");
  const closer = approvalModals.get(key);
  if (closer) {
    approvalModals.delete(key);
    closer("resolved");
  }
}

/** Human-readable summary for the approval modal body. */
function approvalSummaryText(ev) {
  const params = ev.params || ev.Params || {};
  const text =
    field(ev, "text", "Text") ||
    field(ev, "diff", "Diff") ||
    field(ev, "args", "Args") ||
    field(ev, "path", "Path") ||
    (typeof params === "string" ? params : "") ||
    (params.command ? (Array.isArray(params.command) ? params.command.join(" ") : String(params.command)) : "") ||
    (params.path ? String(params.path) : "") ||
    (params.text ? String(params.text) : "");
  if (!text && params && typeof params === "object") {
    try {
      return JSON.stringify(params, null, 2).slice(0, 2000);
    } catch {
      return "";
    }
  }
  return text.length > 2000 ? text.slice(0, 2000) + "…" : text;
}

/** Tool label from legacy tool field or official method path. */
function approvalToolLabel(ev) {
  const tool = field(ev, "tool", "Tool");
  if (tool) return tool;
  const method = field(ev, "method", "Method");
  if (method) {
    const parts = String(method).split("/");
    return parts[parts.length - 2] || parts[parts.length - 1] || method;
  }
  return "tool call";
}

function showApproval(api, ev) {
  const status = field(ev, "status", "Status");
  const requestId = extractRequestId(ev);
  const key = String(requestId ?? field(ev, "approveId", "ApproveID", "ApproveId") ?? "");

  if (status && status !== "pending") {
    dismissApprovalModal(key);
    // Legacy toast cleanup if any leftover
    document.querySelectorAll(".approval-toast").forEach((el) => {
      if (el.dataset.approveId === key) el.remove();
    });
    return;
  }
  if (approvalModals.has(key)) return;

  const tool = approvalToolLabel(ev);
  const summary = approvalSummaryText(ev);
  const kind = field(ev, "kind", "Kind") || "";

  store.pendingApproval = {
    id: requestId,
    kind,
    method: field(ev, "method", "Method"),
  };

  const handle = openModal({
    title: `Approve ${tool}?`,
    body: summary,
    dismissible: true,
    actions: [
      {
        label: "Decline",
        onClick: () => {
          api?.ResolveApproval?.(requestId, false, kind || "decline");
        },
      },
      {
        label: "Accept for session",
        onClick: () => {
          api?.ResolveApproval?.(requestId, true, kind || undefined, true);
        },
      },
      {
        label: "Accept",
        variant: "primary",
        onClick: () => {
          api?.ResolveApproval?.(requestId, true, kind || undefined, false);
        },
      },
    ],
    onClose: () => {
      approvalModals.delete(key);
      if (store.pendingApproval && String(store.pendingApproval.id) === key) {
        store.pendingApproval = null;
      }
    },
  });
  approvalModals.set(key, handle.close);
}

/** Modal for official item/tool/requestUserInput + elicitation server requests. */
function showUserInputModal(api, ev) {
  const requestId = extractRequestId(ev);
  const key = `q:${String(requestId ?? "")}`;
  if (approvalModals.has(key)) return;
  const method = field(ev, "method", "Method") || "user input";
  const params = ev.params || ev.Params || {};
  const question =
    field(ev, "question", "text", "Text") ||
    (typeof params === "object" && params ? String(params.question || params.text || params.prompt || "") : "") ||
    method;

  store.pendingApproval = { id: requestId, kind: "user_input", method };

  const handle = openModal({
    title: "Input requested",
    body: question,
    dismissible: true,
    actions: [
      {
        label: "Decline",
        onClick: () => {
          api?.ResolveApproval?.(requestId, false, "decline");
        },
      },
      {
        label: "Accept",
        variant: "primary",
        onClick: () => {
          api?.ResolveApproval?.(requestId, true, undefined, false);
        },
      },
    ],
    onClose: () => {
      approvalModals.delete(key);
      if (store.pendingApproval && String(store.pendingApproval.id) === String(requestId)) {
        store.pendingApproval = null;
      }
    },
  });
  approvalModals.set(key, handle.close);
}

function showErrorToast(message) {
  const el = document.createElement("div");
  el.className = "error-toast";
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 8000);
}

export { beginLiveTurn, resetLiveTurn, liveTurn, markIdle };
