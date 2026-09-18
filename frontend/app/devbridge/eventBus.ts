/**
 * Browser-dev event bus — Tauri `@tauri-apps/api/event` semantics without
 * Tauri. Aliased in via vite `--mode browser` (see docs/BROWSER-DEV.md).
 *
 * Only what our frontend actually uses is implemented: listen (async, returns
 * an unlisten promise-fn) and emit. Payloads are plain JSON values, exactly
 * as the Rust event bridge (src-tauri/src/codex/events.rs) sends them.
 */

export interface BridgeEvent<T = unknown> {
  event: string;
  payload: T;
}

export type UnlistenFn = () => void;

type Handler = (event: BridgeEvent) => void;

const handlers = new Map<string, Set<Handler>>();

export async function bridgeListen(
  event: string,
  handler: Handler,
): Promise<UnlistenFn> {
  let set = handlers.get(event);
  if (!set) {
    set = new Set();
    handlers.set(event, set);
  }
  set.add(handler);
  return () => {
    set?.delete(handler);
  };
}

export function bridgeEmit(event: string, payload: unknown): void {
  const set = handlers.get(event);
  if (!set) return;
  for (const handler of [...set]) {
    try {
      handler({ event, payload });
    } catch (err) {
      console.error(`[devbridge] handler failed for ${event}`, err);
    }
  }
}
