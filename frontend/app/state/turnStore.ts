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
