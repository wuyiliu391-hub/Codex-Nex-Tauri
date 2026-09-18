/**
 * Alias target for `@tauri-apps/api/event` in browser-dev mode
 * (vite `--mode browser`, see docs/BROWSER-DEV.md).
 *
 * Mirrors the real module's exported shape for the two functions our
 * frontend imports: listen / emit (+ the Event & UnlistenFn types).
 */

import { bridgeEmit, bridgeListen, type BridgeEvent, type UnlistenFn } from "./eventBus";

export type { BridgeEvent as Event, UnlistenFn };

export async function listen<T>(
  event: string,
  handler: (event: BridgeEvent<T>) => void,
): Promise<UnlistenFn> {
  return bridgeListen(event, handler as (event: BridgeEvent) => void);
}

export async function emit(event: string, payload?: unknown): Promise<void> {
  bridgeEmit(event, payload);
}
