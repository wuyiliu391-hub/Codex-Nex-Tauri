import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { onNotification, onServerRequest, type NotificationEnvelope } from "./bridge/events";
import { reduceNotification } from "./state/notificationReducer";
import { addPendingRequest, removePendingRequest, resetTurn } from "./state/turnStore";
import { useTurnItems, useTurnState } from "./state/hooks";
import { Block } from "./blocks/registry";
import { ApprovalHost } from "./approvals/ApprovalHost";
import { NOTIFICATION_METHODS } from "@protocol/notifications";
import { SERVER_REQUEST_METHODS } from "@protocol/requests";
import { BLOCK_TYPES } from "@protocol/blocks";
import { ITEM_STATUSES } from "@protocol/status";

interface EngineStatus {
  connected?: boolean;
}

/**
 * Batch 2 shell.
 *
 * Every value here is produced by a server notification flowing through the
 * reducer into the turn store, then rendered by the block registry. Nothing is
 * simulated: with the engine down, the stream stays empty on purpose.
 */
export function App() {
  const turn = useTurnState();
  const items = useTurnItems();
  const [engineConnected, setEngineConnected] = useState<boolean | null>(null);
  const [received, setReceived] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    void invoke<EngineStatus>("engine_status")
      .then((s) => {
        if (!cancelled) setEngineConnected(Boolean(s?.connected));
      })
      .catch(() => {
        if (!cancelled) setEngineConnected(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return onNotification((env: NotificationEnvelope) => {
      setReceived((n) => n + 1);
      reduceNotification(env);
    });
  }, []);

  // Server→client requests block the turn until answered, so they get their
  // own channel and their own UI surface.
  useEffect(() => {
    return onServerRequest((env) => {
      addPendingRequest({
        id: env.id,
        method: env.method,
        params: env.params,
        receivedAt: env.receivedAt,
      });
    });
  }, []);

  // A request that the server resolves itself (e.g. timed out) must disappear.
  useEffect(() => {
    return onNotification((env) => {
      if (env.method !== "serverRequest/resolved") return;
      const id = env.params["requestId"] ?? env.params["request_id"];
      if (typeof id === "string" || typeof id === "number") removePendingRequest(id);
    });
  }, []);

  return (
    <div className="app-shell" style={{ padding: 24, fontFamily: "var(--font-sans)" }}>
      <h1 style={{ fontSize: 20, margin: "0 0 4px" }}>Codex — React shell (batch 2)</h1>
      <p style={{ color: "#777", fontSize: 13, margin: "0 0 20px" }}>
        Turn state is produced entirely by server notifications. No mock data.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 24 }}>
        <section>
          <h2 style={{ fontSize: 14, margin: "0 0 8px" }}>Engine</h2>
          <div style={{ fontSize: 13, marginBottom: 16 }}>
            {engineConnected === null ? "checking…" : engineConnected ? "connected" : "not connected"}
          </div>

          <h2 style={{ fontSize: 14, margin: "0 0 8px" }}>Protocol</h2>
          <ul style={{ fontSize: 12, lineHeight: 1.8, margin: 0, paddingLeft: 16, color: "#555" }}>
            <li>{NOTIFICATION_METHODS.length} notifications</li>
            <li>{SERVER_REQUEST_METHODS.length} server requests</li>
            <li>{BLOCK_TYPES.length} block types</li>
            <li>{ITEM_STATUSES.length} statuses</li>
          </ul>

          <h2 style={{ fontSize: 14, margin: "18px 0 8px" }}>Stream</h2>
          <div style={{ fontSize: 12, color: "#555" }}>
            <div>received: {received}</div>
            <div>active: {String(turn.active)}</div>
            <div>phase: {turn.phase}</div>
            <div>turn status: {turn.turnStatus ?? "—"}</div>
            <div>items: {items.length}</div>
            <button type="button" onClick={() => resetTurn()} style={{ marginTop: 8, fontSize: 12 }}>
              reset
            </button>
          </div>
        </section>

        <section>
          <ApprovalHost />

          <h2 style={{ fontSize: 14, margin: "0 0 8px" }}>Turn items ({items.length})</h2>
          {items.length === 0 ? (
            <p style={{ color: "#777", fontSize: 12 }}>
              Empty. Items appear only when the server reports them.
            </p>
          ) : (
            <div className="turn-stream">
              {items.map((item) => (
                <Block key={item.id} item={item} />
              ))}
            </div>
          )}

          {turn.tokenUsage ? (
            <>
              <h2 style={{ fontSize: 14, margin: "18px 0 8px" }}>Token usage</h2>
              <pre style={{ fontSize: 11, margin: 0 }}>{JSON.stringify(turn.tokenUsage, null, 2)}</pre>
            </>
          ) : null}

          {turn.plan ? (
            <>
              <h2 style={{ fontSize: 14, margin: "18px 0 8px" }}>Plan</h2>
              <ol style={{ fontSize: 12, margin: 0, paddingLeft: 18 }}>
                {turn.plan.map((step, i) => (
                  <li key={i}>
                    [{step.status}] {step.step}
                  </li>
                ))}
              </ol>
            </>
          ) : null}

          {turn.warnings.length ? (
            <>
              <h2 style={{ fontSize: 14, margin: "18px 0 8px" }}>Warnings ({turn.warnings.length})</h2>
              <ul style={{ fontSize: 11, margin: 0, paddingLeft: 18, color: "#a15c00" }}>
                {turn.warnings.map((w, i) => (
                  <li key={i}>
                    <code>{w.method}</code> — {w.message}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}
