/**
 * Hooks tab — the engine-reported hook list.
 *
 * Ports renderHooks() from settings.js. The official app-server exposes
 * `hooks/list`; if it is unavailable the page shows an honest empty state.
 */

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { t } from "../../../../src/js/i18n.js";
import { Block, PageHead } from "../primitives";

function label(key: string, fallback = ""): string {
  return String(t(key, fallback));
}

interface HookEntry {
  name: string;
  command: string;
}

function asHooks(raw: unknown): HookEntry[] {
  const rec = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray(rec["data"])
      ? (rec["data"] as unknown[])
      : Array.isArray(rec["hooks"])
        ? (rec["hooks"] as unknown[])
        : [];
  return list.map((entry) => {
    const h = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
    return {
      name: typeof h["name"] === "string" ? h["name"] : String(h["event"] ?? ""),
      command: typeof h["command"] === "string" ? h["command"] : "",
    };
  });
}

export function HooksTab() {
  const [hooks, setHooks] = useState<HookEntry[] | null>(null);

  useEffect(() => {
    void invoke<unknown>("rpc_raw", { method: "hooks/list", params: {} })
      .then((raw) => setHooks(asHooks(raw)))
      .catch(() => setHooks([]));
  }, []);

  return (
    <>
      <PageHead title={label("hooks.title")} />
      <Block title={label("hooks.list")}>
        {hooks === null ? (
          <div className="site-empty">{label("discovery.loading", "Loading…")}</div>
        ) : hooks.length === 0 ? (
          <div className="settings-card site-empty">{label("hooks.empty")}</div>
        ) : (
          <div className="hooks-list">
            {hooks.map((hook, i) => (
              <div className="plugin-row" key={i}>
                <div className="plugin-icon">H</div>
                <div>
                  <div className="plugin-name">{hook.name}</div>
                  <div className="plugin-desc">{hook.command}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Block>
    </>
  );
}
