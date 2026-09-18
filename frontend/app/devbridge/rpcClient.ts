/**
 * Browser-dev JSON-RPC client for the official codex-app-server.
 *
 * Port of src-tauri/src/codex/client.rs + events.rs semantics:
 *   - connects to the engine through the vite WS proxy (`/appserver` path,
 *     stripped of the browser Origin header — the engine rejects upgraded
 *     requests that carry one, see transport/websocket.rs).
 *   - performs the mandatory 3-step handshake (initialize → response →
 *     initialized notification, no params field).
 *   - requests carry string ids with a 120 s timeout, same as the Rust client.
 *   - server notifications fan out on `codex:{method}` channels with `/` and
 *     `.` replaced by `-` (dual of frontend/app/bridge/events.ts).
 *   - server→client requests route to `codex:approval` / `codex:user-input` /
 *     `codex:server-request-{...}` with the `{id, method, params}` envelope,
 *     exactly like map_server_message().
 *   - reconnects with backoff; engine_status reflects live state so the UI
 *     degrades the same way it does when the sidecar is missing.
 */

import { bridgeEmit } from "./eventBus";

const INITIALIZE_TIMEOUT_MS = 10_000;
const REQUEST_TIMEOUT_MS = 120_000;
const RECONNECT_DELAY_MS = 2_000;

type Pending = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: number;
};

export interface RpcError {
  code: number;
  message: string;
}

let ws: WebSocket | null = null;
let connected = false;
let initializeResult: Record<string, unknown> | null = null;
let seq = 0;
const pending = new Map<string, Pending>();

function serverUrl(): string {
  // Same-origin through the vite dev server; the proxy forwards frames to
  // the engine without an Origin header. Override with ?engine=ws://host:port
  const override = new URLSearchParams(location.search).get("engine");
  if (override) return override;
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/appserver`;
}

function sanitize(method: string): string {
  return method.replace(/[/.]/g, "-");
}

function send(obj: Record<string, unknown>): boolean {
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  ws.send(JSON.stringify(obj));
  return true;
}

function failAllPending(reason: string): void {
  for (const [id, entry] of pending) {
    window.clearTimeout(entry.timer);
    entry.reject(new Error(reason));
    pending.delete(id);
  }
}

function performHandshake(): void {
  const id = `initialize-${++seq}`;
  const request = {
    jsonrpc: "2.0",
    id,
    method: "initialize",
    params: {
      clientInfo: {
        name: "codex-desktop-tauri",
        title: "Codex Desktop (browser dev)",
        version: "0.1.0",
      },
      capabilities: { experimentalApi: true },
    },
  };
  const timer = window.setTimeout(() => {
    pending.delete(id);
    console.warn("[devbridge] initialize timed out; will retry on next reconnect");
  }, INITIALIZE_TIMEOUT_MS);
  pending.set(id, {
    resolve: (value) => {
      initializeResult = (value as Record<string, unknown>) ?? {};
      // Step 3: `initialized` notification — no params field at all.
      send({ jsonrpc: "2.0", method: "initialized" });
      connected = true;
      console.info("[devbridge] engine handshake complete", initializeResult);
    },
    reject: (err) => console.warn("[devbridge] initialize rejected", err),
    timer,
  });
  send(request);
}

function handleMessage(raw: unknown): void {
  let msg: Record<string, unknown>;
  try {
    msg = typeof raw === "string" ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    return;
  }
  const method = typeof msg["method"] === "string" ? msg["method"] : null;
  const id = msg["id"];

  if (method && id !== undefined) {
    // server → client request: approvals / user input / anything else, with
    // the same envelope the Rust bridge emits.
    const isApproval = method.includes("Approval") || method.includes("approval");
    const isUserInput =
      method.includes("userInput") || method.includes("requestUserInput");
    const isElicitation = method.includes("elicitation");
    const channel = isApproval
      ? "codex:approval"
      : isUserInput || isElicitation
        ? "codex:user-input"
        : `codex:server-request-${sanitize(method)}`;
    bridgeEmit(channel, { id, method, params: msg["params"] ?? null });
    return;
  }

  if (method) {
    // notification
    bridgeEmit(`codex:${sanitize(method)}`, msg["params"] ?? null);
    return;
  }

  if (id !== undefined) {
    const key = String(id);
    const entry = pending.get(key);
    if (!entry) return;
    pending.delete(key);
    window.clearTimeout(entry.timer);
    if (msg["error"]) {
      const err = msg["error"] as RpcError;
      entry.reject(new Error(`${err.code ?? "?"} ${err.message ?? "rpc error"}`));
    } else {
      entry.resolve(msg["result"]);
    }
  }
}

function connect(): void {
  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
    return;
  }
  let socket: WebSocket;
  try {
    socket = new WebSocket(serverUrl());
  } catch (err) {
    console.warn("[devbridge] WS construction failed", err);
    scheduleReconnect();
    return;
  }
  ws = socket;

  socket.onopen = () => {
    console.info(`[devbridge] connected to ${serverUrl()} — handshaking`);
    performHandshake();
  };
  socket.onmessage = (ev) => handleMessage(ev.data);
  socket.onclose = () => {
    connected = false;
    initializeResult = null;
    failAllPending("engine connection closed");
    scheduleReconnect();
  };
  socket.onerror = () => {
    /* onclose follows; nothing extra to do */
  };
}

let reconnectTimer = 0;
function scheduleReconnect(): void {
  if (reconnectTimer) return;
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = 0;
    connect();
  }, RECONNECT_DELAY_MS);
}

connect();

// ── public surface ─────────────────────────────────────────────────────

export function engineConnected(): boolean {
  return connected;
}

export function engineInitializeMeta(): Record<string, unknown> | null {
  return initializeResult;
}

export async function rpcRequest(
  method: string,
  params?: Record<string, unknown> | null,
): Promise<unknown> {
  if (!connected) throw new Error("engine not connected");
  const id = `req-${++seq}`;
  const frame: Record<string, unknown> = { jsonrpc: "2.0", id, method };
  if (params != null) frame["params"] = params;
  if (!send(frame)) throw new Error("engine not connected");
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      pending.delete(id);
      reject(new Error(`timeout waiting for ${method}`));
    }, REQUEST_TIMEOUT_MS);
    pending.set(id, {
      resolve,
      reject: (err) => reject(err),
      timer,
    });
  });
}

/** Answer a server→client request by its id (approvals, user input, …). */
export function rpcRespond(id: unknown, result: unknown, error?: RpcError): void {
  const frame: Record<string, unknown> = { jsonrpc: "2.0", id };
  if (error) frame["error"] = error;
  else frame["result"] = result;
  if (!send(frame)) throw new Error("engine not connected");
}
