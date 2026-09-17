/**
 * Tauri event bridge — the single entry point for every server-pushed message.
 *
 * Design rule for this rewrite: the UI never invents state. Everything the user
 * sees comes from a notification or a server request received here. There is no
 * polling fallback and no mock data.
 *
 * Subscription is driven by the generated protocol table, so all
 * NOTIFICATION_METHODS are wired by construction — adding a method upstream and
 * regenerating is enough to receive it.
 */

import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  NOTIFICATION_METHODS,
  type NotificationMethod,
} from "@protocol/notifications";
import {
  SERVER_REQUEST_METHODS,
  type ServerRequestMethod,
} from "@protocol/requests";

/**
 * Tauri rejects `.` and `/` in event names, and the Rust emitter
 * (`codex/events.rs`) replaces both with `-`. Keep this in sync with
 * `map_server_message`.
 */
export function tauriEventName(method: string): string {
  return `codex:${method.replace(/[/.]/g, "-")}`;
}

export interface NotificationEnvelope {
  /** Canonical protocol method, e.g. `item/agentMessage/delta`. */
  method: NotificationMethod;
  /** Raw params object exactly as the server sent it. */
  params: Record<string, unknown>;
  /** Local arrival time, used only for elapsed-time display. */
  receivedAt: number;
}

export interface ServerRequestEnvelope {
  /** JSON-RPC id to answer on. */
  id: string | number;
  method: ServerRequestMethod;
  params: Record<string, unknown>;
  receivedAt: number;
}

type NotificationHandler = (env: NotificationEnvelope) => void;
type RequestHandler = (env: ServerRequestEnvelope) => void;

const notificationHandlers = new Set<NotificationHandler>();
const requestHandlers = new Set<RequestHandler>();
const unlisteners: UnlistenFn[] = [];
let started = false;

/** Subscribe to every notification. Returns an unsubscribe function. */
export function onNotification(handler: NotificationHandler): () => void {
  notificationHandlers.add(handler);
  return () => notificationHandlers.delete(handler);
}

/** Subscribe to every server→client request (approvals, user input, …). */
export function onServerRequest(handler: RequestHandler): () => void {
  requestHandlers.add(handler);
  return () => requestHandlers.delete(handler);
}

function emitNotification(env: NotificationEnvelope): void {
  for (const handler of notificationHandlers) {
    try {
      handler(env);
    } catch (err) {
      console.error(`[events] notification handler failed for ${env.method}`, err);
    }
  }
}

function emitRequest(env: ServerRequestEnvelope): void {
  for (const handler of requestHandlers) {
    try {
      handler(env);
    } catch (err) {
      console.error(`[events] request handler failed for ${env.method}`, err);
    }
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Bind a Tauri listener for one method. Failures are logged, not thrown: one
 * unavailable channel must not stop the rest of the bridge from wiring up.
 */
async function bindNotification(method: NotificationMethod): Promise<void> {
  const channel = tauriEventName(method);
  try {
    const un = await listen(channel, (event) => {
      emitNotification({
        method,
        params: asRecord(event.payload),
        receivedAt: Date.now(),
      });
    });
    unlisteners.push(un);
  } catch (err) {
    console.error(`[events] failed to listen on ${channel}`, err);
  }
}

/**
 * Server requests are emitted by Rust under a fixed channel name rather than
 * the method, because the client must reply on the request id.
 */
async function bindServerRequest(channel: string): Promise<void> {
  try {
    const un = await listen(channel, (event) => {
      const payload = asRecord(event.payload);
      const method = String(payload.method ?? "");
      if (!SERVER_REQUEST_METHODS.includes(method as ServerRequestMethod)) {
        console.warn(`[events] unknown server request method: ${method}`);
        return;
      }
      emitRequest({
        id: (payload.id as string | number) ?? "",
        method: method as ServerRequestMethod,
        params: asRecord(payload.params),
        receivedAt: Date.now(),
      });
    });
    unlisteners.push(un);
  } catch (err) {
    console.error(`[events] failed to listen on ${channel}`, err);
  }
}

/**
 * Wire every notification and request channel. Safe to call once at boot;
 * repeat calls are ignored.
 */
export async function startEventBridge(): Promise<void> {
  if (started) return;
  started = true;

  await Promise.all(NOTIFICATION_METHODS.map((m) => bindNotification(m)));
  await Promise.all([
    bindServerRequest("codex:approval"),
    bindServerRequest("codex:user-input"),
  ]);

  console.info(
    `[events] bridge ready — ${NOTIFICATION_METHODS.length} notification channels, ` +
      `2 request channels`,
  );
}

/** Tear everything down (used by tests and hot reload). */
export function stopEventBridge(): void {
  for (const un of unlisteners.splice(0)) {
    try {
      un();
    } catch {
      /* ignore */
    }
  }
  started = false;
}
