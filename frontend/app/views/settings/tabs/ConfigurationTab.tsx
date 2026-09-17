/**
 * Configuration tab — approval policy, sandbox, web search, verbosity,
 * reasoning summary, plus the "open config.toml" action.
 *
 * Every control writes through saveSettings(), which does the shell-state write
 * and the engine `config/batchWrite` together. That double write is the whole
 * point: previously these looked saved but never reached config.toml.
 */

import { invoke } from "@tauri-apps/api/core";
import { t } from "../../../../src/js/i18n.js";
import { saveSettings, useAppState, type SettingsState } from "@/state/appStore";
import { Dropdown } from "@/shell/Dropdown";
import { Block, BlockCustom, PageHead, Row, SettingsButton } from "../primitives";

function label(key: string, fallback: string): string {
  return String(t(key, fallback));
}

export function ConfigurationTab() {
  const { settings } = useAppState();

  function update(patch: Partial<SettingsState>): void {
    void saveSettings(patch);
  }

  async function openConfigToml(): Promise<void> {
    try {
      // The engine reports its config path through config/read.
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
