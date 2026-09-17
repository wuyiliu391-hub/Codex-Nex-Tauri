/**
 * Turn store — the single source of truth for the in-flight turn.
 *
 * Driven exclusively by server notifications (see bridge/events.ts). There is
 * no local simulation of progress: if the server does not say it, the UI does
 * not show it.
 *
 * Kept outside React and exposed through `subscribe`/`getSnapshot` so the
 * bindings live in state/hooks.ts and a high-frequency stream does not need a
 * context provider.
 */

import { invoke } from "@tauri-apps/api/core";
import { emptyTurn, newItem } from "./types";
import type {
  PendingRequest,
  PlanStep,
  ServerWarning,
  TokenUsage,
  TurnItem,
  TurnState,
} from "./types";
import type { ItemStatus } from "@protocol/status";

// Re-exported so renderers can import the item shape from the store.
export type { TurnItem, TurnState } from "./types";

let state: TurnState = emptyTurn();
const listeners = new Set<() => void>();

function commit(next: TurnState): void {
  state = next;
  for (const listener of listeners) listener();
}

// ── subscription ──────────────────────────────────────────────────────

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSnapshot(): TurnState {
  return state;
}

// ── actions ───────────────────────────────────────────────────────────

export function resetTurn(): void {
  commit(emptyTurn());
}

/** `turn/started` — a new turn began. */
export function beginTurn(params: { threadId?: string; turnId?: string }, at: number): void {
  commit({
    ...emptyTurn(),
    sessionId: typeof params.threadId === "string" ? params.threadId : state.sessionId,
    turnId: typeof params.turnId === "string" ? params.turnId : null,
    active: true,
    phase: "commentary",
    startedAt: at,
  });
}

/**
 * Show the user's message immediately while the turn spins up.
 *
 * This is the one place the UI shows something before the server confirms it.
 * The alternative — waiting for `turn/started` — leaves the composer feeling
 * dead for the round-trip. If the send fails the caller must call resetTurn(),
 * so a failed send never leaves a phantom bubble behind.
 */
export function beginUserTurn(sessionId: string, text: string): void {
  const id = `user-${Date.now()}`;
  commit({
    ...state,
    sessionId,
    active: true,
    phase: "commentary",
    startedAt: Date.now(),
    items: {
      ...state.items,
      [id]: newItem(id, "user-message", { text, status: "completed" }),
    },
    order: [...state.order, id],
  });
}

/** Insert or update an item, preserving arrival order. */
export function upsertItem(id: string, patch: Partial<TurnItem> & { type: string }): void {
  const existing = state.items[id];
  const items = { ...state.items };
  const order = state.order.slice();

  if (existing) {
    items[id] = { ...existing, ...patch };
  } else {
    items[id] = newItem(id, patch.type, patch);
    order.push(id);
  }

  commit({ ...state, items, order });
}

/** Append streamed text, creating the item if the delta arrives first. */
export function appendItemText(
  id: string,
  type: string,
  delta: string,
  patch: Partial<TurnItem> = {},
): void {
  if (!delta) return;
  const existing = state.items[id];
  if (!existing) {
    upsertItem(id, { ...patch, type, text: delta });
    return;
  }
  commit({
    ...state,
    items: { ...state.items, [id]: { ...existing, text: (existing.text ?? "") + delta } },
  });
}

/** Append tool output, creating the item if needed. */
export function appendItemOutput(
  id: string,
  delta: string,
  patch: Partial<TurnItem> & { type: string },
): void {
  if (!delta) return;
  const existing = state.items[id];
  if (!existing) {
    upsertItem(id, { ...patch, output: delta });
    return;
  }
  commit({
    ...state,
    items: { ...state.items, [id]: { ...existing, output: (existing.output ?? "") + delta } },
  });
}

/** Append one MCP progress message. */
export function pushItemProgress(id: string, message: string, type = "mcp-tool-call"): void {
  const existing = state.items[id];
  if (!existing) {
    upsertItem(id, { type, progress: [message] });
    return;
  }
  commit({
    ...state,
    items: { ...state.items, [id]: { ...existing, progress: [...existing.progress, message] } },
  });
}

/** `item/completed` — finalise an item and stamp its duration. */
export function completeItem(id: string, patch: Partial<TurnItem> & { type?: string }): void {
  const existing = state.items[id];
  const completedAt = patch.completedAt ?? Date.now();

  if (!existing) {
    const type = patch.type ?? "unknown";
    commit({
      ...state,
      items: {
        ...state.items,
        [id]: newItem(id, type, { ...patch, status: "completed", completedAt, durationMs: 0 }),
      },
      order: [...state.order, id],
    });
    return;
  }

  const durationMs =
    patch.durationMs ?? (existing.startedAt ? completedAt - existing.startedAt : null);

  commit({
    ...state,
    items: { ...state.items, [id]: { ...existing, ...patch, completedAt, durationMs } },
  });
}

export function setPhase(phase: TurnState["phase"]): void {
  if (state.phase === phase) return;
  commit({ ...state, phase });
}

/** `turn/completed` — close the turn. */
export function finishTurn(status: ItemStatus, at: number, error?: string | null): void {
  const durationMs = state.startedAt ? at - state.startedAt : null;
  commit({
    ...state,
    active: false,
    phase: "idle",
    turnStatus: status,
    completedAt: at,
    durationMs,
    error: error ?? state.error,
    // A frozen reconnect residue is an official quirk we must preserve.
    reconnectFrozen: state.reconnectAttempt > 0 || state.reconnectFrozen,
    reconnectAttempt: 0,
  });
}

export function setReconnect(attempt: number): void {
  commit({ ...state, reconnectAttempt: attempt });
}

export function setTokenUsage(usage: TokenUsage): void {
  commit({ ...state, tokenUsage: usage });
}

export function setPlan(steps: PlanStep[]): void {
  commit({ ...state, plan: steps });
}

export function pushWarning(warning: Omit<ServerWarning, "at">): void {
  commit({ ...state, warnings: [...state.warnings, { ...warning, at: Date.now() }] });
}

export function addPendingRequest(request: PendingRequest): void {
  const others = state.pendingRequests.filter((r) => r.id !== request.id);
  commit({ ...state, pendingRequests: [...others, request] });
}

export function removePendingRequest(id: string | number): void {
  commit({ ...state, pendingRequests: state.pendingRequests.filter((r) => r.id !== id) });
}

export function setError(message: string): void {
  commit({ ...state, error: message });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function strOf(rec: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = rec[key];
    if (typeof value === "string" && value) return value;
  }
  return "";
}

function numOf(rec: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = rec[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

/** Map a server itemType / type onto our block tag (mirrors notificationReducer). */
function historyBlockType(raw: string): string {
  if (!raw) return "unknown";
  if (/^command[_-]?execution$/i.test(raw)) return "commandExecution";
  if (/^file[_-]?change$/i.test(raw)) return "fileChange";
  if (/^agent[_-]?message$/i.test(raw)) return "agentMessage";
  if (/^user[_-]?message$/i.test(raw)) return "user-message";
  if (/^mcp[_-]?tool[_-]?call$/i.test(raw)) return "mcp-tool-call";
  if (/^reasoning$/i.test(raw)) return "reasoning";
  return raw;
}

/**
 * Hydrate the turn store from `get_session` + `get_runtime_events`.
 *
 * Official `thread/read` often returns an empty messages array; the real
 * conversation lives in `thread/timeline/list`. Only server-provided text is
 * shown — nothing is invented locally.
 */
export async function loadThreadFromSession(sessionId: string): Promise<void> {
  if (!sessionId) {
    commit(emptyTurn());
    return;
  }

  // Start from a clean turn bound to this thread so stale items never leak.
  commit({ ...emptyTurn(), sessionId });

  let preview = "";
  let threadMessages: unknown[] = [];

  try {
    const thread = asRecord(await invoke("get_session", { sessionId }));
    preview = strOf(thread, "preview", "title", "name");
    const messages = thread["messages"];
    if (Array.isArray(messages)) threadMessages = messages;
  } catch (err) {
    setError(err instanceof Error ? err.message : String(err));
    return;
  }

  // Timeline holds completed turns when thread.messages is empty.
  let timelineItems: unknown[] = [];
  try {
    const tl = asRecord(await invoke("get_runtime_events", { sessionId }));
    const data = tl["data"] ?? tl["items"] ?? tl;
    if (Array.isArray(data)) timelineItems = data;
    else if (Array.isArray(asRecord(data)["data"])) timelineItems = asRecord(data)["data"] as unknown[];
  } catch {
    /* offline / empty history is fine */
  }

  const items: Record<string, TurnItem> = {};
  const order: string[] = [];
  const push = (id: string, item: TurnItem): void => {
    if (items[id]) return;
    items[id] = item;
    order.push(id);
  };

  // 1. Prefer explicit thread.messages when the server provided them.
  if (threadMessages.length) {
    for (let i = 0; i < threadMessages.length; i++) {
      const msg = asRecord(threadMessages[i]);
      const role = strOf(msg, "role");
      const text = strOf(msg, "text", "content");
      const id = strOf(msg, "id") || `hist-msg-${i}`;
      if (role === "user") {
        push(id, newItem(id, "user-message", { text, status: "completed" }));
      } else if (text) {
        push(id, newItem(id, "agentMessage", { text, status: "completed" }));
      }
      const parts = msg["parts"];
      if (Array.isArray(parts)) {
        for (let p = 0; p < parts.length; p++) {
          const part = asRecord(parts[p]);
          const partType = historyBlockType(strOf(part, "type", "kind"));
          const partText = strOf(part, "text", "content");
          const partId = strOf(part, "id") || `${id}-part-${p}`;
          if (partType === "agentMessage" || partType === "user-message" || partType === "reasoning") {
            push(partId, newItem(partId, partType, { text: partText, status: "completed" }));
          } else if (partType === "commandExecution") {
            push(
              partId,
              newItem(partId, "commandExecution", {
                command: strOf(part, "command", "text"),
                output: strOf(part, "output", "stdout"),
                status: "completed",
              }),
            );
          }
        }
      }
    }
  } else {
    // 2. Fall back to timeline entries (completed turns / stored items).
    for (let i = 0; i < timelineItems.length; i++) {
      const entry = asRecord(timelineItems[i]);
      const rawType = strOf(entry, "itemType", "type", "kind");
      const blockType = historyBlockType(rawType);
      const id = strOf(entry, "id", "itemId", "turnId") || `hist-${i}`;
      const text = strOf(entry, "text", "content", "summary");
      if (blockType === "user-message" || rawType === "userMessage") {
        const body = text || (i === 0 ? preview : "");
        push(id, newItem(id, "user-message", { text: body, status: "completed" }));
        continue;
      }
      if (blockType === "agentMessage" && text) {
        push(id, newItem(id, "agentMessage", { text, status: "completed" }));
        continue;
      }
      if (blockType === "commandExecution") {
        push(
          id,
          newItem(id, "commandExecution", {
            command: strOf(entry, "command", "text"),
            output: strOf(entry, "output", "stdout"),
            status: "completed",
          }),
        );
        continue;
      }
      // Nested item payloads (timeline rows wrapping the real item).
      const nested = asRecord(entry["item"]);
      if (Object.keys(nested).length) {
        const nestedType = historyBlockType(strOf(nested, "itemType", "type", "kind"));
        const nestedText = strOf(nested, "text", "content");
        const nestedId = strOf(nested, "id") || `${id}-item`;
        if (nestedText && (nestedType === "agentMessage" || nestedType === "reasoning")) {
          push(nestedId, newItem(nestedId, nestedType, { text: nestedText, status: "completed" }));
        } else if (nestedType === "commandExecution") {
          push(
            nestedId,
            newItem(nestedId, "commandExecution", {
              command: strOf(nested, "command", "text"),
              output: strOf(nested, "output", "stdout"),
              status: "completed",
            }),
          );
        }
      }
    }
  }

  // 3. Seed a user bubble from the thread preview when history is otherwise empty.
  if (!order.length && preview) {
    push("hist-preview", newItem("hist-preview", "user-message", { text: preview, status: "completed" }));
  }

  commit({
    ...emptyTurn(),
    sessionId,
    items,
    order,
    active: false,
    phase: "idle",
  });
}
