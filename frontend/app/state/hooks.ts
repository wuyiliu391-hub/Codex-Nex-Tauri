/**
 * React bindings for the turn store.
 *
 * useSyncExternalStore keeps the store outside React so a high-frequency
 * stream (agent message deltas, command output) does not require a context
 * provider or prop drilling.
 */

import { useSyncExternalStore } from "react";
import {
  getSnapshot,
  subscribe,
  type TurnItem,
  type TurnState,
} from "./turnStore";

/** Subscribe to the whole turn state. */
export function useTurnState(): TurnState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Subscribe to a derived slice, recomputed only when `revision` changes. */
export function useTurnSelector<T>(select: (state: TurnState) => T): T {
  const state = useTurnState();
  return select(state);
}

/** Items in arrival order. */
export function useTurnItems(): TurnItem[] {
  const state = useTurnState();
  return state.order.map((id) => state.items[id]).filter(Boolean) as TurnItem[];
}

/** True while the server reports the turn as running. */
export function useTurnActive(): boolean {
  return useTurnState().active;
}

/** Pending approval requests awaiting user decision. */
export function usePendingRequests() {
  return useTurnState().pendingRequests;
}
