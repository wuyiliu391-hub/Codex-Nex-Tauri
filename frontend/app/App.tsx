import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { onNotification, type NotificationEnvelope } from "./bridge/events";
import { useTurnState } from "./state/hooks";
import { applyNotification, assertProtocolCoverage } from "./state/turnStore";
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
 * Renders only server-derived state. The protocol coverage panel is a
 * self-check: `unclassified` must be 0, otherwise a notification exists that
 * the store silently drops.
 */
export function App() {
  const [engineConnected, setEngineConnected] = useState<boolean | null>(null);
  const [received, setReceived] = useState<NotificationEnvelope[]>([]);
  const turn = useTurnState();

  const unclassified = useMemo(() => assertProtocolCoverage(), []);
  const handledCount = NOTIFICATION_METHODS.length - unclassified.length;

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

  // Feed every notification into the turn store, and keep a small log for the
  // diagnostics panel. Nothing here invents data.
  useEffect(() => {
    return onNotification((env) => {
      applyNotification(env.method, env.params);
      setReceived((prev) => [env, ...prev].slice(0, 25));
    });
  }, []);

  const itemList = turn.order.map((id) => turn.items[id]).filter(Boolean);

  return (
    <div className="app-shell" style={{ padding: 24, fontFamily: "var(--font-sans)", fontSize: 13 }}>
      <h1 style={{ fontSize: 20, margin: "0 0 4px" }}>Codex — React shell (batch 2)</h1>
      <p style={{ color: "#777", margin: "0 0 20px" }}>
        Turn store wired to the generated protocol. No mock data.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 24, maxWidth: 900 }}>
        <section>
          <h2 style={{ fontSize: 14, margin: "0 0 8px" }}>Protocol coverage</h2>
          <ul style={{ lineHeight: 1.9, margin: 0, paddingLeft: 18 }}>
            <li>
              notifications: <b>{NOTIFICATION_METHODS.length}</b> subscribed
            </li>
            <li>
              classified: <b>{handledCount}</b> (handled + acknowledged)
            </li>
            <li style={{ color: unclassified.length ? "#c33" : "#2a7" }}>
              unclassified: <b>{unclassified.length}</b>
              {unclassified.length > 0 && ` — ${unclassified.slice(0, 5).join(", ")}`}
            </li>
            <li>server requests: <b>{SERVER_REQUEST_METHODS.length}</b></li>
            <li>block types: <b>{BLOCK_TYPES.length}</b></li>
            <li>item statuses: <b>{ITEM_STATUSES.length}</b></li>
          </ul>
        </section>

        <section>
          <h2 style={{ fontSize: 14, margin: "0 0 8px" }}>Engine</h2>
          <ul style={{ lineHeight: 1.9, margin: 0, paddingLeft: 18 }}>
            <li>
              sidecar:{" "}
              <b>
                {engineConnected === null
                  ? "checking…"
                  : engineConnected
                    ? "connected"
                    : "not connected"}
              </b>
            </li>
            <li>thread: <b>{turn.threadId ?? "—"}</b></li>
            <li>turn: <b>{turn.turnId ?? "—"}</b></li>
            <li>
              state: <b>{turn.active ? "running" : (turn.status ?? "idle")}</b>
              {turn.phase ? ` · ${turn.phase}` : ""}
            </li>
            <li>items: <b>{itemList.length}</b></li>
            <li>
              tokens:{" "}
              <b>
                {turn.tokenUsage
                  ? `${turn.tokenUsage.inputTokens ?? "?"} in / ${turn.tokenUsage.outputTokens ?? "?"} out`
                  : "—"}
              </b>
            </li>
            {turn.error && <li style={{ color: "#c33" }}>error: {turn.error}</li>}
          </ul>
        </section>
      </div>

      {turn.warnings.length > 0 && (
        <section style={{ marginTop: 20 }}>
          <h2 style={{ fontSize: 14, margin: "0 0 8px" }}>Warnings ({turn.warnings.length})</h2>
          <ul style={{ lineHeight: 1.8, margin: 0, paddingLeft: 18, color: "#a60" }}>
            {turn.warnings.slice(-5).map((w, i) => (
              <li key={`${w.at}-${i}`}>
                <code>{w.method}</code> {w.message}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section style={{ marginTop: 20 }}>
        <h2 style={{ fontSize: 14, margin: "0 0 8px" }}>
          Live notifications ({received.length} recent)
        </h2>
        {received.length === 0 ? (
          <p style={{ color: "#777" }}>
            Nothing received yet. Send a message from a session to populate this.
          </p>
        ) : (
          <ol style={{ lineHeight: 1.8, margin: 0, paddingLeft: 18 }}>
            {received.map((env, i) => (
              <li key={`${env.receivedAt}-${i}`}>
                <code>{env.method}</code>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
