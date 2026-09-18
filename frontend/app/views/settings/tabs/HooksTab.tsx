/**
 * Hooks tab — the engine-reported hook list.
 *
 * Ports renderHooks() from settings.js. The official app-server exposes
 * `hooks/list`; if it is unavailable the page shows an honest empty state.
 * 重新加载钩子 re-invokes the same rpc.
 */

import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { t } from "../../../../src/js/i18n.js";
import { openExternal } from "@/shell/actions";
import { Block, PageHead, SettingsButton } from "../primitives";

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

  const refresh = useCallback((): Promise<void> => {
    return invoke<unknown>("rpc_raw", { method: "hooks/list", params: {} })
      .then((raw) => setHooks(asHooks(raw)))
      .catch(() => setHooks([]));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const headDesc = (
    <p>
      {label("hooks.desc")}
      {" "}
      <button
        type="button"
        className="settings-inline-link"
        onClick={() => void openExternal("https://developers.openai.com/codex/hooks")}
      >
        {label("general.learnMore", "Learn more")}
      </button>
    </p>
  );

  return (
    <>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <PageHead title={label("hooks.title")} descNode={headDesc} />
        <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 6 }}>
          <SettingsButton label={label("hooks.reload")} onClick={() => void refresh()} />
        </div>
      </div>

      <Block>
        {hooks === null ? (
          <div className="site-empty">{label("discovery.loading", "Loading…")}</div>
        ) : hooks.length === 0 ? (
          <div className="site-empty">
            <div>{label("hooks.emptyTitle", "No hooks found")}</div>
            <div>{label("hooks.emptyDesc", "")}</div>
          </div>
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
