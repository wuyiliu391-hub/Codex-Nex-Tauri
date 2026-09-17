/**
 * Configuration tab — approval policy, sandbox, web search, verbosity,
 * reasoning summary, plus dependency checks and the "open config.toml" action.
 *
 * Every control writes through saveSettings(), which does the shell-state write
 * and the engine `config/batchWrite` together. Dependency rows come from the
 * engine's own check_dependencies command.
 */

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { t } from "../../../../src/js/i18n.js";
import { saveSettings, useAppState, type SettingsState } from "@/state/appStore";
import { Dropdown } from "@/shell/Dropdown";
import { Block, BlockCustom, PageHead, Row, SettingsButton } from "../primitives";

function label(key: string, fallback = ""): string {
  return String(t(key, fallback));
}

interface Dependency {
  name: string;
  ok: boolean;
  message: string;
}

function asDeps(raw: unknown): Dependency[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    const rec = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
    return {
      name: typeof rec["name"] === "string" ? rec["name"] : String(rec["id"] ?? ""),
      ok: rec["ok"] === true,
      message: typeof rec["message"] === "string" ? rec["message"] : "",
    };
  });
}

export function ConfigurationTab() {
  const { settings } = useAppState();
  const [deps, setDeps] = useState<Dependency[] | null>(null);

  useEffect(() => {
    void invoke<unknown>("check_dependencies")
      .then((raw) => setDeps(asDeps(raw)))
      .catch(() => setDeps([]));
  }, []);

  function update(patch: Partial<SettingsState>): void {
    void saveSettings(patch);
  }

  async function openConfigToml(): Promise<void> {
    try {
      const cfg = await invoke<Record<string, unknown>>("rpc_raw", {
        method: "config/read",
        params: {},
      });
      const config = (cfg?.["config"] ?? cfg) as Record<string, unknown>;
      const path = config?.["configPath"] ?? config?.["config_path"];
      if (typeof path === "string" && path) {
        await invoke("plugin:shell|open", { path });
      }
    } catch (err) {
      console.error("[settings] open config.toml failed", err);
    }
  }

  return (
    <>
      <PageHead
        title={label("settings.configuration", "Configuration")}
        desc={label("settings.configurationDesc", "")}
      />

      <Block title={label("configuration.checks")}>
        {deps === null ? (
          <div className="site-empty">{label("discovery.loading", "Loading…")}</div>
        ) : deps.length === 0 ? (
          <div className="settings-card site-empty">{label("configuration.empty")}</div>
        ) : (
          <div className="dependency-list">
            {deps.map((dep, i) => (
              <div className="plugin-row" key={i}>
                <div className="plugin-icon">{dep.ok ? "\u2713" : "\u2715"}</div>
                <div>
                  <div className="plugin-name">{dep.name}</div>
                  <div className="plugin-desc">{dep.message}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Block>

      <Block title={label("settings.configuration", "Configuration")}>
        <Row
          label={label("config.approvalPolicy", "Approval policy")}
          desc={label("config.approvalPolicyDesc", "When the agent must ask before acting.")}
          control={
            <Dropdown
              value={settings.approvalPolicy === "never" ? "never" : "ask"}
              items={[
                { value: "ask", label: label("config.approvalOnRequest", "Ask when requested") },
                { value: "never", label: label("config.approvalNever", "Never ask") },
              ]}
              onChange={(value) =>
                update({ approvalPolicy: value, fullAccess: value === "never" })
              }
            />
          }
        />

        <Row
          label={label("config.sandbox", "Sandbox")}
          desc={label("config.sandboxDesc", "Filesystem and network access granted to commands.")}
          control={
            <Dropdown
              value={settings.sandbox}
              items={[
                { value: "read-only", label: "read-only" },
                { value: "workspace-write", label: "workspace-write" },
                { value: "danger-full-access", label: "danger-full-access" },
              ]}
              onChange={(value) => update({ sandbox: value })}
            />
          }
        />

        <Row
          label={label("config.webSearch", "Web search")}
          desc={label("config.webSearchDesc", "Whether the model may search the web.")}
          control={
            <Dropdown
              value={settings.webSearch}
              items={[
                { value: "disabled", label: "disabled" },
                { value: "cached", label: "cached" },
                { value: "live", label: "live" },
              ]}
              onChange={(value) => update({ webSearch: value })}
            />
          }
        />

        <Row
          label={label("config.verbosity", "Output verbosity")}
          desc={label("config.verbosityDesc", "How much detail the model writes.")}
          control={
            <Dropdown
              value={settings.outputVerbosity}
              items={[
                { value: "low", label: "low" },
                { value: "medium", label: "medium" },
                { value: "high", label: "high" },
              ]}
              onChange={(value) => update({ outputVerbosity: value })}
            />
          }
        />

        <Row
          label={label("config.reasoningSummary", "Reasoning summary")}
          desc={label("config.reasoningSummaryDesc", "Whether reasoning summaries are shown.")}
          control={
            <Dropdown
              value={settings.reasoningSummary}
              items={[
                { value: "auto", label: "auto" },
                { value: "concise", label: "concise" },
                { value: "detailed", label: "detailed" },
                { value: "none", label: "none" },
              ]}
              onChange={(value) => update({ reasoningSummary: value })}
            />
          }
        />
      </Block>

      <BlockCustom title={label("settings.configFile", "Config file")}>
        <div className="settings-card">
          <Row
            label={label("config.openToml", "Open config.toml")}
            desc={label("config.openTomlDesc", "Edit the engine configuration directly.")}
            control={
              <SettingsButton
                label={label("action.open", "Open")}
                action="open-config"
                onClick={() => void openConfigToml()}
              />
            }
          />
        </div>
      </BlockCustom>
    </>
  );
}
