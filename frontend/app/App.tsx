import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { onNotification, type NotificationEnvelope } from "./bridge/events";
import { NOTIFICATION_METHODS } from "@protocol/notifications";
import { SERVER_REQUEST_METHODS } from "@protocol/requests";
import { BLOCK_TYPES } from "@protocol/blocks";
import { ITEM_STATUSES } from "@protocol/status";

interface EngineStatus {
  connected?: boolean;
}

/**
 * Batch 1 shell.
 *
 * This is deliberately small: it proves the build pipeline, the generated
 * protocol layer, and the event bridge are all live. Every value rendered here
 * comes from the backend — there is no placeholder data.
 */
export function App() {
  const [engineConnected, setEngineConnected] = useState<boolean | null>(null);
  const [recent, setRecent] = useState<NotificationEnvelope[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});

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
    return onNotification((env) => {
      setCounts((prev) => ({ ...prev, [env.method]: (prev[env.method] ?? 0) + 1 }));
      setRecent((prev) => [env, ...prev].slice(0, 30));
    });
  }, []);

  return (
    <div className="app-shell" style={{ padding: 24, fontFamily: "var(--font-sans)" }}>
      <h1 style={{ fontSize: 20, margin: "0 0 4px" }}>Codex — React shell (batch 1)</h1>
      <p style={{ color: "#777", fontSize: 13, margin: "0 0 20px" }}>
        Protocol layer generated from the official app-server source. No mock data.
      </p>

      <section style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 14, margin: "0 0 8px" }}>Engine</h2>
        <div style={{ fontSize: 13 }}>
          {engineConnected === null
            ? "checking…"
            : engineConnected
              ? "connected"
              : "not connected — notifications will stay empty until the sidecar is up"}
        </div>
      </section>

      <section style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 14, margin: "0 0 8px" }}>Protocol coverage</h2>
        <ul style={{ fontSize: 13, lineHeight: 1.8, margin: 0, paddingLeft: 18 }}>
          <li>{NOTIFICATION_METHODS.length} notification methods subscribed</li>
          <li>{SERVER_REQUEST_METHODS.length} server request methods</li>
          <li>{BLOCK_TYPES.length} message block types</li>
          <li>{ITEM_STATUSES.length} item statuses</li>
        </ul>
      </section>

      <section>
        <h2 style={{ fontSize: 14, margin: "0 0 8px" }}>
          Live notifications ({recent.length} recent)
        </h2>
        {recent.length === 0 ? (
          <p style={{ color: "#777", fontSize: 12 }}>
            Nothing received yet. Send a message from a session to populate this.
          </p>
        ) : (
          <ol style={{ fontSize: 12, lineHeight: 1.7, margin: 0, paddingLeft: 18 }}>
            {recent.map((env, i) => (
              <li key={`${env.receivedAt}-${i}`}>
                <code>{env.method}</code>
                <span style={{ color: "#999" }}> ×{counts[env.method] ?? 0}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
