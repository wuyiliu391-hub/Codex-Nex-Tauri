/**
 * Connections tab — SSH connectors from the Rust connectors store.
 *
 * Ports renderConnections() from settings.js. Only SSH connectors are shown,
 * matching the official UIA (REPORT-2026-09-16 §2.2).
 */

import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { t } from "../../../../src/js/i18n.js";
import { Block, PageHead, SettingsButton } from "../primitives";

function label(key: string, fallback = ""): string {
  return String(t(key, fallback));
}

interface Connector {
  id: string;
  name: string;
  kind: string;
  host: string;
  user: string;
}

function asConnectors(raw: unknown): Connector[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    const rec = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
    const config = (rec["config"] && typeof rec["config"] === "object" ? rec["config"] : {}) as Record<string, unknown>;
    const kind = typeof rec["kind"] === "string" ? rec["kind"] : "";
    if (kind && kind !== "ssh") return null;
    return {
      id: String(rec["id"] ?? ""),
      name: typeof rec["name"] === "string" ? rec["name"] : "",
      kind: kind || "ssh",
      host: typeof config["host"] === "string" ? config["host"] : "",
      user: typeof config["user"] === "string" ? config["user"] : "",
    };
  }).filter((c): c is Connector => c !== null && c.id !== "");
}

export function ConnectionsTab() {
  const [conns, setConns] = useState<Connector[] | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void invoke<unknown>("list_connectors")
      .then((raw) => setConns(asConnectors(raw)))
      .catch(() => setConns([]));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function addConnector(): Promise<void> {
    const host = window.prompt(label("connections.host"));
    if (!host) return;
    await invoke("save_connector", {
      connector: {
        id: "ssh-" + Date.now(),
        name: host,
        kind: "ssh",
        config: { host, user: "" },
      },
    });
    refresh();
  }

  async function remove(id: string): Promise<void> {
    await invoke("delete_connector", { id });
    refresh();
  }

  async function test(id: string): Promise<void> {
    try {
      const raw = await invoke<{ ok?: boolean; detail?: string; error?: string }>("test_connector", { id });
      if (raw && raw.ok === false) {
        setTestResult(raw.detail || raw.error || label("connections.testFailed", "Test failed"));
      } else {
        setTestResult(raw?.detail || label("connections.testOk", "Connector probe completed"));
      }
    } catch (err) {
      setTestResult(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <>
      <PageHead title={label("connections.title")} />
      <Block title={label("connections.sshHead")}>
        {conns === null ? (
          <div className="site-empty">{label("discovery.loading", "Loading…")}</div>
        ) : conns.length === 0 ? (
          <div className="settings-card site-empty">{label("connections.empty")}</div>
        ) : (
          <div className="connections-list">
            {conns.map((c) => (
              <div className="plugin-row" data-conn-id={c.id} key={c.id}>
                <div className="plugin-icon">S</div>
                <div>
                  <div className="plugin-name">{c.name || c.host || c.id}</div>
                  <div className="plugin-desc">
                    {(c.user ? c.user + "@" : "") + c.host || c.id}
                  </div>
                </div>
                <div className="provider-row-actions">
                  <SettingsButton label={label("connections.test")} onClick={() => void test(c.id)} />
                  <SettingsButton
                    label={label("action.delete")}
                    kind="danger"
                    onClick={() => void remove(c.id)}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="connections-foot">
          <SettingsButton
            label={label("connections.add")}
            kind="primary"
            onClick={() => void addConnector()}
          />
        </div>
        {testResult ? <div className="plugin-desc site-empty">{testResult}</div> : null}
      </Block>
    </>
  );
}
