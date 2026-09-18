/**
 * Alias target for `@tauri-apps/api/core` in browser-dev mode
 * (vite `--mode browser`, see docs/BROWSER-DEV.md).
 *
 * `invoke` routes through the command table in ./commands.ts, which replays
 * the exact Rust shell surface (src-tauri/src/commands/*) against a live
 * codex-app-server WebSocket + localStorage shell state.
 */

import { dispatchCommand } from "./commands";

export async function invoke<T = unknown>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  return (await dispatchCommand(cmd, args ?? {})) as T;
}

/** The real module exports this too; our frontend never uses it, but keep
 *  the surface honest for anything imported later. */
export function convertFileSrc(path: string): string {
  return path;
}
