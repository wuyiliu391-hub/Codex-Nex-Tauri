// In-flight turn state driven by agent events.
// Builds interleaved narrative segments + compact tool groups for official-style UI.

const listeners = new Set();

export const liveTurn = {
  sessionId: null,
  turnId: null,
  messageId: null,
  phase: "",
  streamingText: "",
  tools: [],
  /** @type {{kind:'text'|'tools', text?:string, tools?:any[], closed?:boolean}[]} */
  segments: [],
  changes: [],
  error: "",
  active: false,
  userPreview: "",
  startedAt: 0,
  planMode: false,
  /** @type {any[]} */
  tasks: [],
  /** Official reconnect strip (T27): 1–5 while retrying; freeze residue after recovery. */
  reconnectAttempt: 0,
  reconnectFrozen: false,
  durationMs: 0,
};

function notify() {
  for (const fn of listeners) {
    try { fn(liveTurn); } catch (e) { console.error(e); }
  }
}

export function onLiveTurn(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Apply a plan_mode toggle coming from the agent:plan_mode channel. */
export function applyPlanMode(active) {
  const next = !!active;
  if (liveTurn.planMode === next) return;
  liveTurn.planMode = next;
  // Close open text so plan node sits on its own timeline row.
  const last = lastSegment();
  if (last?.kind === "text") last.closed = true;
  liveTurn.segments.push({
    kind: "plan_mode",
    active: next,
    closed: true,
  });
  notify();
}

/** Apply an ask_user_question payload coming from the agent:question channel. */
export function applyQuestion(payload) {
  if (!payload) return;
  // surface as an inline tool-like approval row so the timeline shows the question
  const callId = payload.callId || payload.toolCallId || `ask_${Date.now()}`;
  const text = payload.question || payload.text || "Question";
  upsertTool({
    callId,
    tool: "ask_user_question",
    status: "waiting_approval",
    summary: String(text),
    approveId: callId,
    expanded: true,
  });
  notify();
}

export function resetLiveTurn() {
  liveTurn.sessionId = null;
  liveTurn.turnId = null;
  liveTurn.messageId = null;
  liveTurn.phase = "";
  liveTurn.streamingText = "";
  liveTurn.tools = [];
  liveTurn.segments = [];
  liveTurn.changes = [];
  liveTurn.error = "";
  liveTurn.active = false;
  liveTurn.userPreview = "";
  liveTurn.startedAt = 0;
  liveTurn.planMode = false;
  liveTurn.tasks = [];
  liveTurn.reconnectAttempt = 0;
  liveTurn.reconnectFrozen = false;
  liveTurn.durationMs = 0;
  notify();
}

export function beginLiveTurn(sessionId, userText = "") {
  liveTurn.sessionId = sessionId || null;
  liveTurn.turnId = null;
  liveTurn.messageId = null;
  liveTurn.phase = "preparing";
  liveTurn.streamingText = "";
  liveTurn.tools = [];
  liveTurn.segments = [];
  liveTurn.changes = [];
  liveTurn.error = "";
  liveTurn.active = true;
  liveTurn.userPreview = userText || "";
  liveTurn.startedAt = Date.now();
  liveTurn.planMode = false;
  liveTurn.tasks = [];
  liveTurn.reconnectAttempt = 0;
  liveTurn.reconnectFrozen = false;
  liveTurn.durationMs = 0;
  notify();
}

function pick(ev, ...keys) {
  for (const k of keys) {
    if (ev[k] !== undefined && ev[k] !== null && ev[k] !== "") return ev[k];
  }
  return "";
}

function normalizeEvent(ev) {
  const tasks = ev?.tasks ?? ev?.Tasks;
  return {
    type: pick(ev, "type", "Type"),
    sessionId: pick(ev, "sessionId", "SessionID", "SessionId"),
    turnId: pick(ev, "turnId", "TurnID", "TurnId"),
    messageId: pick(ev, "messageId", "MessageID", "MessageId"),
    phase: pick(ev, "phase", "Phase"),
    text: pick(ev, "text", "Text"),
    tool: pick(ev, "tool", "Tool"),
    callId: pick(ev, "callId", "CallID", "CallId"),
    args: pick(ev, "args", "Args"),
    result: pick(ev, "result", "Result"),
    path: pick(ev, "path", "Path"),
    diff: pick(ev, "diff", "Diff"),
    approveId: pick(ev, "approveId", "ApproveID", "ApproveId"),
    status: pick(ev, "status", "Status"),
    error: pick(ev, "error", "Error"),
    tasks: Array.isArray(tasks) ? tasks : null,
  };
}

function ensureTurn(n) {
  if (n.sessionId && liveTurn.sessionId && n.sessionId !== liveTurn.sessionId) {
    return false;
  }
  if (n.sessionId) liveTurn.sessionId = n.sessionId;
  if (n.turnId) liveTurn.turnId = n.turnId;
  if (n.messageId) liveTurn.messageId = n.messageId;
  liveTurn.active = true;
  if (!liveTurn.startedAt) liveTurn.startedAt = Date.now();
  return true;
}

function findTool(callId) {
  if (!callId) return null;
  return liveTurn.tools.find((t) => t.callId === callId) || null;
}

function lastSegment() {
  return liveTurn.segments[liveTurn.segments.length - 1] || null;
}

function ensureTextSegment() {
  let last = lastSegment();
  if (!last || last.kind !== "text" || last.closed) {
    last = { kind: "text", text: "", closed: false };
    liveTurn.segments.push(last);
  }
  return last;
}

function ensureToolsSegment() {
  // close open text so next narrative starts a new block (official interleave)
  const last = lastSegment();
  if (last?.kind === "text") last.closed = true;
  if (last?.kind === "tools" && !last.closed) return last;
  const seg = { kind: "tools", tools: [], closed: false };
  liveTurn.segments.push(seg);
  return seg;
}

function syncToolIntoSegments(tool) {
  // keep tools[] as source of truth; segments hold refs by callId
  for (const seg of liveTurn.segments) {
    if (seg.kind !== "tools") continue;
    const i = seg.tools.findIndex((x) => x.callId && x.callId === tool.callId);
    if (i >= 0) {
      seg.tools[i] = tool;
      return;
    }
  }
  const seg = ensureToolsSegment();
  seg.tools.push(tool);
}

function upsertTool(partial) {
  let t = findTool(partial.callId);
  if (!t) {
    t = {
      callId: partial.callId || `tool-${liveTurn.tools.length + 1}`,
      tool: partial.tool || "tool",
      args: "",
      status: "running",
      result: "",
      path: "",
      diff: "",
      approveId: "",
      summary: "",
      durationMs: 0,
      expanded: false,
      startedAt: Date.now(),
    };
    liveTurn.tools.push(t);
  }
  Object.assign(t, partial);
  if ((t.status === "done" || t.status === "error" || t.status === "denied") && t.startedAt && !t.durationMs) {
    t.durationMs = Date.now() - t.startedAt;
  }
  syncToolIntoSegments(t);
  recomputeChanges();
  return t;
}

function recomputeChanges() {
  const map = new Map();
  for (const t of liveTurn.tools) {
    const path = t.path || pathFromArgs(t.args);
    if (!path && !t.diff) continue;
    if (!/write|create|apply_patch|edit|str_replace|patch/i.test(t.tool || "") && !t.diff) continue;
    const key = path || `c-${map.size}`;
    let add = 0;
    let del = 0;
    if (t.diff) {
      for (const line of String(t.diff).split("\n")) {
        if (line.startsWith("+") && !line.startsWith("+++")) add += 1;
        else if (line.startsWith("-") && !line.startsWith("---")) del += 1;
      }
    } else {
      add = 1;
    }
    const prev = map.get(key) || { path: path || key, added: 0, removed: 0, diff: "", tool: t.tool };
    prev.added += add;
    prev.removed += del;
    if (t.diff) prev.diff = t.diff;
    map.set(key, prev);
  }
  liveTurn.changes = [...map.values()];
}

function pathFromArgs(args) {
  if (!args) return "";
  try {
    const o = typeof args === "string" ? JSON.parse(args) : args;
    return o.path || o.file_path || o.file || o.filename || "";
  } catch {
    return "";
  }
}

function prettyArgs(raw) {
  if (!raw) return "";
  if (typeof raw === "object") {
    try { return JSON.stringify(raw, null, 2); } catch { return String(raw); }
  }
  try { return JSON.stringify(JSON.parse(raw), null, 2); } catch { return String(raw); }
}

function prettyResult(raw) {
  if (!raw) return "";
  try {
    const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (obj && typeof obj.output === "string") return obj.output;
    if (obj && typeof obj === "object") return JSON.stringify(obj, null, 2);
  } catch { /* fallthrough */ }
  return String(raw);
}

/** Parse official reconnect progress: "reconnecting 3/5" / "重新连接 3/5". */
function parseReconnect(text) {
  if (!text) return 0;
  const m = String(text).match(/(?:reconnect|重新连接)[^\d]*(\d)\s*\/\s*5/i);
  if (m) return Number(m[1]);
  if (/reconnect|重新连接/i.test(String(text)) && !/\d/.test(String(text))) return 1;
  return 0;
}

export function applyAgentEvent(raw) {
  if (!raw) return { refresh: false, composer: false };
  const ev = normalizeEvent(raw);
  if (!ev.type) return { refresh: false, composer: false };

  let refresh = false;
  let composer = false;

  switch (ev.type) {
    case "user":
      if (!ensureTurn(ev)) return { refresh: false, composer: false };
      liveTurn.phase = "preparing";
      liveTurn.userPreview = "";
      refresh = true;
      break;

    case "assistant_start":
      if (!ensureTurn(ev)) return { refresh: false, composer: false };
      liveTurn.phase = "thinking";
      liveTurn.streamingText = "";
      // keep tools from previous partial? clear for new assistant message
      liveTurn.tools = [];
      liveTurn.segments = [];
      liveTurn.changes = [];
      liveTurn.error = "";
      break;

    case "delta":
      if (!ensureTurn(ev)) return { refresh: false, composer: false };
      liveTurn.phase = "streaming";
      liveTurn.streamingText += ev.text || "";
      {
        // close open tools group so text after tools is a new narrative block
        const last = lastSegment();
        if (last?.kind === "tools") last.closed = true;
        const seg = ensureTextSegment();
        seg.text += ev.text || "";
      }
      break;

    case "tool_call":
      if (!ensureTurn(ev)) return { refresh: false, composer: false };
      liveTurn.phase = "executing_tool";
      // close text segment before tools
      {
        const last = lastSegment();
        if (last?.kind === "text") last.closed = true;
      }
      upsertTool({
        callId: ev.callId,
        tool: ev.tool,
        args: prettyArgs(ev.args),
        status: "running",
        path: ev.path || pathFromArgs(ev.args),
        expanded: false,
      });
      break;

    case "tool_result":
      if (!ensureTurn(ev)) return { refresh: false, composer: false };
      upsertTool({
        callId: ev.callId,
        tool: ev.tool,
        status: ev.status || "done",
        result: prettyResult(ev.result),
        path: ev.path || "",
        expanded: false,
      });
      break;

    case "diff":
      if (!ensureTurn(ev)) return { refresh: false, composer: false };
      {
        const pending = [...liveTurn.tools].reverse().find((t) => !t.diff) || liveTurn.tools[liveTurn.tools.length - 1];
        if (pending) {
          pending.diff = ev.diff || "";
          pending.path = ev.path || pending.path;
          syncToolIntoSegments(pending);
          recomputeChanges();
        }
      }
      break;

    case "approval":
      if (!ensureTurn(ev)) return { refresh: false, composer: false };
      if (ev.status && ev.status !== "pending") {
        const t = liveTurn.tools.find((x) => x.approveId === ev.approveId) || liveTurn.tools[liveTurn.tools.length - 1];
        if (t) {
          t.status = ev.status === "approved" ? "running" : "denied";
          t.approveId = "";
          syncToolIntoSegments(t);
        }
        if (ev.status === "approved") liveTurn.phase = "executing_tool";
      } else {
        liveTurn.phase = "waiting_approval";
        let t = liveTurn.tools.find((x) => x.status === "running" && (!ev.tool || x.tool === ev.tool));
        if (!t) t = upsertTool({ callId: ev.callId || ev.approveId, tool: ev.tool || "tool" });
        t.status = "waiting_approval";
        t.approveId = ev.approveId || "";
        t.path = ev.path || t.path;
        t.diff = ev.diff || t.diff;
        t.summary = ev.text || t.summary;
        t.expanded = true;
        syncToolIntoSegments(t);
        recomputeChanges();
      }
      break;

    case "runtime_phase":
      if (!ensureTurn(ev)) return { refresh: false, composer: false };
      if (ev.phase) liveTurn.phase = ev.phase;
      break;

    case "task_state": {
      if (!ensureTurn(ev)) return { refresh: false, composer: false };
      if (Array.isArray(ev.tasks)) liveTurn.tasks = ev.tasks;
      break;
    }

    case "error":
      if (!ensureTurn(ev)) return { refresh: false, composer: false };
      liveTurn.error = ev.error || "error";
      liveTurn.phase = "failed";
      {
        const attempt = parseReconnect(ev.error || ev.text);
        if (attempt) {
          liveTurn.reconnectAttempt = attempt;
          liveTurn.phase = "reconnecting";
        }
      }
      break;

    case "assistant_done":
    case "idle":
      if (ev.sessionId && liveTurn.sessionId && ev.sessionId !== liveTurn.sessionId) {
        return { refresh: false, composer: false };
      }
      liveTurn.phase = typeStatus(ev);
      liveTurn.active = false;
      liveTurn.userPreview = "";
      if (liveTurn.startedAt) {
        liveTurn.durationMs = Date.now() - liveTurn.startedAt;
      }
      // Official T27: freeze reconnect residue into the stream after recovery.
      if (liveTurn.reconnectAttempt > 0) {
        liveTurn.reconnectFrozen = true;
      }
      liveTurn.reconnectAttempt = 0;
      // close open segments
      for (const s of liveTurn.segments) s.closed = true;
      refresh = true;
      composer = true;
      setTimeout(() => {
        if (!liveTurn.active) {
          liveTurn.streamingText = "";
          liveTurn.tools = [];
          liveTurn.segments = [];
          liveTurn.changes = [];
          liveTurn.error = "";
          liveTurn.phase = "";
          liveTurn.messageId = null;
          liveTurn.turnId = null;
          liveTurn.startedAt = 0;
          notify();
        }
      }, 120);
      break;

    default:
      break;
  }

  notify();
  return { refresh, composer };
}

function typeStatus(ev) {
  if (ev.type === "idle") return ev.status || "completed";
  return "completed";
}

export function applyRuntimeEvent(raw) {
  if (!raw) return { refresh: false };
  const type = pick(raw, "type", "Type");
  const sessionId = pick(raw, "sessionId", "SessionID", "SessionId");
  const turnId = pick(raw, "turnId", "TurnID", "TurnId");
  let payload = raw.payload || raw.Payload || null;
  // Official notification params are the Tauri event body itself (bridge may inject type).
  if (!payload || typeof payload !== "object") {
    if (raw && typeof raw === "object") {
      const { type: _type, Type: _Type, payload: _p, Payload: _P, ...rest } = raw;
      payload = rest;
    } else {
      payload = {};
    }
  }
  const p = { ...payload };
  if (raw && typeof raw === "object") {
    for (const k of ["item", "Item", "delta", "Delta", "text", "Text", "itemType", "command", "exitCode", "sessionId", "threadId"]) {
      if (raw[k] !== undefined && p[k] === undefined) p[k] = raw[k];
    }
  }

  if (sessionId && liveTurn.sessionId && sessionId !== liveTurn.sessionId) {
    return { refresh: false };
  }
  if (sessionId) liveTurn.sessionId = sessionId;
  if (turnId) liveTurn.turnId = turnId;
  if (!liveTurn.startedAt) liveTurn.startedAt = Date.now();

  // ── Official app-server event names (method / → .) ──────────────────────
  if (type === "turn.started") {
    liveTurn.active = true;
    liveTurn.phase = "thinking";
    notify();
    return { refresh: false };
  }
  if (type === "item.agentMessage.delta") {
    liveTurn.active = true;
    liveTurn.phase = "streaming";
    const text = pick(p, "delta", "text", "content") || pick(raw, "delta", "text");
    if (text) {
      liveTurn.streamingText += String(text);
      {
        const last = lastSegment();
        if (last?.kind === "tools") last.closed = true;
        const seg = ensureTextSegment();
        seg.text += String(text);
      }
    }
    notify();
    return { refresh: false };
  }
  if (type === "item.commandExecution.outputDelta" || type === "item.fileChange.outputDelta") {
    liveTurn.active = true;
    liveTurn.phase = "executing_tool";
    const callId = pick(p, "callId", "itemCallId", "toolCallId") || "cmd-live";
    const existing = findTool(callId);
    const chunk = pick(p, "delta", "outputDelta", "chunk", "text");
    if (existing) {
      existing.result = (existing.result || "") + String(chunk || "");
      syncToolIntoSegments(existing);
    } else {
      upsertTool({
        callId,
        tool: "shell",
        args: pick(p, "command", "cmd"),
        summary: pick(p, "command", "cmd"),
        status: "running",
        result: String(chunk || ""),
        expanded: false,
      });
    }
    notify();
    return { refresh: false };
  }
  if (type === "item.started") {
    liveTurn.active = true;
    const item = p.item && typeof p.item === "object" ? p.item : p;
    const itemType = String(item.itemType || item.type || item.ItemType || "");
    if (/command/i.test(itemType) || item.command || item.cmd) {
      liveTurn.phase = "executing_tool";
      upsertTool({
        callId: pick(item, "callId", "itemCallId") || `item-${Date.now()}`,
        tool: "shell",
        args: prettyArgs(item.command || item.cmd || ""),
        summary: pick(item, "command", "cmd"),
        status: "running",
        expanded: false,
      });
    }
    notify();
    return { refresh: false };
  }
  if (type === "item.completed") {
    const item = p.item && typeof p.item === "object" ? p.item : p;
    const callId = pick(item, "callId", "itemCallId", "toolCallId");
    const itemType = String(item.itemType || item.type || "");
    if (callId || /command|agent/i.test(itemType)) {
      const t = findTool(callId) || liveTurn.tools[liveTurn.tools.length - 1];
      if (t) {
        t.status = item.status === "failed" || item.error ? "error" : "done";
        if (item.output !== undefined) t.result = prettyResult(item.output);
        if (item.text && /agent/i.test(itemType)) {
          liveTurn.streamingText += String(item.text);
          {
            const last = lastSegment();
            if (last?.kind === "tools") last.closed = true;
            const seg = ensureTextSegment();
            seg.text += String(item.text);
          }
        }
        if (t.startedAt && !t.durationMs) t.durationMs = Date.now() - t.startedAt;
        syncToolIntoSegments(t);
      }
    }
    notify();
    return { refresh: true };
  }

  if (type === "tool.started") {
    liveTurn.active = true;
    liveTurn.phase = "executing_tool";
    if (payload.messageId) liveTurn.messageId = payload.messageId;
    {
      const last = lastSegment();
      if (last?.kind === "text") last.closed = true;
    }
    upsertTool({
      callId: payload.toolCallId || payload.ToolCallId || "",
      tool: payload.tool || payload.Tool || "tool",
      args: prettyArgs(payload.args || payload.Args || ""),
      status: "running",
      path: payload.path || pathFromArgs(payload.args || payload.Args || ""),
      expanded: false,
    });
    notify();
    return { refresh: false };
  }
  if (type === "tool.completed") {
    const dur = Number(payload.durationMs || payload.DurationMs || 0);
    upsertTool({
      callId: payload.toolCallId || payload.ToolCallId || "",
      tool: payload.tool || payload.Tool || "tool",
      status: payload.status || payload.Status || "done",
      result: prettyResult(payload.result || payload.Result || ""),
      path: payload.path || payload.Path || "",
      durationMs: Number.isFinite(dur) && dur > 0 ? dur : undefined,
      expanded: false,
    });
    notify();
    return { refresh: false };
  }
  if (type === "diff" || type === "file.diff" || type === "patch.generated") {
    const pending = [...liveTurn.tools].reverse().find((t) => !t.diff) || liveTurn.tools[liveTurn.tools.length - 1];
    if (pending) {
      pending.diff = payload.diff || payload.Diff || "";
      pending.path = payload.path || payload.Path || pending.path;
      syncToolIntoSegments(pending);
      recomputeChanges();
      notify();
    }
    return { refresh: false };
  }
  if (type === "task.state_updated") {
    const tasks = payload.tasks || payload.Tasks;
    if (Array.isArray(tasks)) {
      liveTurn.tasks = tasks;
      notify();
    }
    return { refresh: false };
  }
  if (type === "turn.state_changed") {
    const phase = payload.phase || payload.Phase;
    if (phase) liveTurn.phase = phase;
    liveTurn.active = true;
    const attempt = parseReconnect(payload.error || payload.Error || payload.message || payload.Message || "");
    if (attempt) {
      liveTurn.reconnectAttempt = attempt;
      liveTurn.phase = "reconnecting";
    }
    notify();
    return { refresh: false };
  }
  if (type === "turn.completed" || type === "turn.failed" || type === "turn.cancelled") {
    const status = payload.status || payload.Status || (type === "turn.failed" ? "failed" : type === "turn.cancelled" ? "cancelled" : "completed");
    const err = payload.error || payload.Error || "";
    liveTurn.active = false;
    liveTurn.phase = status;
    if (err) liveTurn.error = String(err);
    if (liveTurn.startedAt && !liveTurn.durationMs) {
      liveTurn.durationMs = Date.now() - liveTurn.startedAt;
    }
    if (liveTurn.reconnectAttempt > 0) liveTurn.reconnectFrozen = true;
    liveTurn.reconnectAttempt = 0;
    notify();
    return { refresh: true };
  }

  return { refresh: false };
}
