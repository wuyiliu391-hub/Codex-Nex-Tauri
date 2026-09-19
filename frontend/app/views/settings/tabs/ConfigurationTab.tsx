/**
 * Configuration tab — official 26.911 layout:
 *   智能体默认设置 (用户配置 dropdown + 打开 config.toml, then five policy
 *   rows) · 模型功能 (可用推理强度 multi-select + Ultra toggle DIS) ·
 *   工作空间依赖项 (Codex 依赖项 toggle / 诊断 / 重新安装 / 当前版本).
 *
 * Wiring (hard rule: no fake controls):
 *   - The five policy rows write through saveSettings() → shell store +
 *     engine config/batchWrite (official schema fields only).
 *   - 可用推理强度 persists the selected effort levels in the local
 *     preferences store (desktop-only capability, L3 store is the sanctioned
 *     home; the model slider reads the engine config directly).
 *   - 诊断 runs the real check_dependencies command and renders its output.
 *   - 重新安装 stays disabled: no engine/L3 command exists yet, so the button
 *     must not pretend to reinstall (documented pending L3 command).
 *   - 当前版本 reports the engine version from engine_status.
 */

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { t } from "../../../../src/js/i18n.js";
import { openExternal } from "@/shell/actions";
import { saveSettings, useAppState, type SettingsState } from "@/state/appStore";
import { saveSection, usePrefSection } from "@/state/preferencesStore";
import { Dropdown } from "@/shell/Dropdown";
import { Block, PageHead, Row, SettingsButton, Switch } from "../primitives";

function label(key: string, fallback = ""): string {
  return String(t(key, fallback));
}

interface Dependency {
  name: string;
  ok: boolean;
  message: string;
}

/**
 * `check_dependencies` returns `DependencyStatus` from `app_state.rs`, whose
 * human-readable field is `detail`. This reader looked only for `message`, so
 * every row in the diagnostics list rendered with a blank description. The
 * browser-dev stub also sends `detail`; `message` is kept as a fallback for
 * any older shape.
 */
function asDeps(raw: unknown): Dependency[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    const rec = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
    const detail = rec["detail"] ?? rec["message"];
    return {
      name: typeof rec["name"] === "string" ? rec["name"] : String(rec["id"] ?? ""),
      ok: rec["ok"] === true,
      message: typeof detail === "string" ? detail : "",
    };
  });
}

interface ConfigPrefs {
  userProfile?: string;
  reasoningLevels?: string[];
  codexDeps?: boolean;
}

const ALL_EFFORT_LEVELS = [
  { value: "low", key: "home.effort.low" },
  { value: "medium", key: "home.effort.medium" },
  { value: "high", key: "home.effort.high" },
  { value: "xhigh", key: "home.effort.xhigh" },
  { value: "ultra", key: "home.effort.ultra" },
];

function effortFallback(value: string): string {
  const map: Record<string, string> = {
    low: "Low",
    medium: "Medium",
    high: "High",
    xhigh: "Extra high",
    ultra: "Ultra",
  };
  return map[value] ?? value;
}

export function ConfigurationTab() {
  const { settings } = useAppState();
  const prefs = usePrefSection<ConfigPrefs>("configuration");
  const [deps, setDeps] = useState<Dependency[] | null>(null);
  const [engineVersion, setEngineVersion] = useState("");

  useEffect(() => {
    void invoke<unknown>("check_dependencies")
      .then((raw) => setDeps(asDeps(raw)))
      .catch(() => setDeps([]));
    void invoke<{ initialize?: { version?: string } | null }>("engine_status")
      .then((r) => setEngineVersion(r?.initialize?.version ?? ""))
      .catch(() => {});
  }, []);

  function update(patch: Partial<SettingsState>): void {
    void saveSettings(patch);
  }

  function patchPrefs(p: Partial<ConfigPrefs>): void {
    void saveSection("configuration", p as Record<string, unknown>);
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

  const levels = Array.isArray(prefs.reasoningLevels)
    ? prefs.reasoningLevels
    : ALL_EFFORT_LEVELS.map((l) => l.value);
  const levelsTrigger = `${label("configuration.levelsSelected", "Selected")} ${levels.length}`;

  function toggleLevel(value: string): void {
    const next = levels.includes(value)
      ? levels.filter((v) => v !== value)
      : [...levels, value];
    patchPrefs({ reasoningLevels: next });
  }

  const headDesc = (
    <p>
      {label("configuration.desc")}
      {" "}
      <button
        type="button"
        className="settings-inline-link"
        onClick={() => void openExternal("https://developers.openai.com/codex/config-basic")}
      >
        {label("general.learnMore", "Learn more")}
      </button>
    </p>
  );

  return (
    <>
      <PageHead title={label("settings.configuration", "Configuration")} descNode={headDesc} />

      {/* ── 智能体默认设置 ── */}
      <Block title={label("configuration.section")}>
        <div className="config-topline">
          <Dropdown
            value={prefs.userProfile ?? "default"}
            items={[{ value: "default", label: label("configuration.userProfile") }]}
            onChange={() => {}}
            ariaLabel={label("configuration.userProfile")}
          />
          <button type="button" className="settings-inline-link" onClick={() => void openConfigToml()}>
            {label("configuration.openToml")} ↗
          </button>
        </div>
        <Row
          label={label("configuration.approvalPolicy")}
          desc={label("configuration.approvalPolicyDesc")}
          control={
            <Dropdown
              value={settings.approvalPolicy === "never" ? "never" : "on-request"}
              items={[
                { value: "on-request", label: label("configuration.approvalOnRequest") },
                { value: "never", label: label("configuration.approvalNever") },
              ]}
              onChange={(value) =>
                update({ approvalPolicy: value, fullAccess: value === "never" })
              }
            />
          }
        />
        <Row
          label={label("configuration.sandbox")}
          desc={label("configuration.sandboxDesc")}
          control={
            <Dropdown
              value={settings.sandbox}
              items={[
                { value: "read-only", label: label("configuration.sandboxReadOnly") },
                { value: "workspace-write", label: label("configuration.sandboxWorkspace") },
                { value: "danger-full-access", label: label("configuration.sandboxFull") },
              ]}
              onChange={(value) => update({ sandbox: value })}
            />
          }
        />
        <Row
          label={label("configuration.webSearch")}
          desc={label("configuration.webSearchDesc")}
          control={
            <Dropdown
              value={settings.webSearch}
              items={[
                { value: "disabled", label: label("configuration.webSearchOff") },
                { value: "cached", label: label("configuration.webSearchCached") },
                { value: "live", label: label("configuration.webSearchLive") },
              ]}
              onChange={(value) => update({ webSearch: value })}
            />
          }
        />
        <Row
          label={label("configuration.verbosity")}
          desc={label("configuration.verbosityDesc")}
          control={
            <Dropdown
              value={settings.outputVerbosity}
              items={[
                { value: "", label: label("configuration.verbosityDefault") },
                { value: "low", label: label("configuration.verbosityLow") },
                { value: "medium", label: label("configuration.verbosityMedium") },
                { value: "high", label: label("configuration.verbosityHigh") },
              ]}
              onChange={(value) => update({ outputVerbosity: value })}
            />
          }
        />
        <Row
          label={label("configuration.reasoningSummary")}
          desc={label("configuration.reasoningSummaryDesc")}
          control={
            <Dropdown
              value={settings.reasoningSummary}
              items={[
                { value: "auto", label: label("configuration.summaryAuto") },
                { value: "concise", label: label("configuration.summaryConcise") },
                { value: "detailed", label: label("configuration.summaryDetailed") },
                { value: "none", label: label("configuration.summaryOff") },
              ]}
              onChange={(value) => update({ reasoningSummary: value })}
            />
          }
        />
      </Block>

      {/* ── 模型功能 ── */}
      <Block title={label("configuration.modelFeatures")}>
        <Row
          label={label("configuration.reasoningLevels")}
          desc={label("configuration.reasoningLevelsDesc")}
          control={
            <Dropdown
              value=""
              showDefaultLabel={false}
              ariaLabel={levelsTrigger}
              items={ALL_EFFORT_LEVELS.map((l) => ({
                value: l.value,
                label: label(l.key, effortFallback(l.value)),
              }))}
              onChange={(value) => toggleLevel(value)}
            >
              <span className="ui-dropdown-label">{levelsTrigger}</span>
            </Dropdown>
          }
        />
        <Row
          label={label("configuration.ultra")}
          desc={label("configuration.ultraDesc")}
          control={
            // Official: disabled and off — Ultra availability is gated upstream.
            <Switch checked={false} disabled onChange={() => {}} />
          }
        />
      </Block>

      {/* ── 工作空间依赖项 ── */}
      <Block title={label("configuration.workspaceDeps")}>
        <Row
          label={label("configuration.codexDeps")}
          desc={label("configuration.codexDepsDesc")}
          control={
            <Switch
              checked={prefs.codexDeps !== false}
              onChange={(v) => patchPrefs({ codexDeps: v })}
            />
          }
        />
        <Row
          label={label("configuration.diagnose")}
          desc={label("configuration.diagnoseDesc")}
          control={
            <SettingsButton
              label={label("configuration.diagnoseBtn")}
              onClick={() => {
                setDeps(null);
                void invoke<unknown>("check_dependencies")
                  .then((raw) => setDeps(asDeps(raw)))
                  .catch(() => setDeps([]));
              }}
            />
          }
        />
        <Row
          label={label("configuration.reinstall")}
          desc={label("configuration.reinstallDesc")}
          control={
            <SettingsButton label={label("configuration.reinstallBtn")} disabled />
          }
        />
        {deps !== null && deps.length > 0 ? (
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
        ) : null}
        <Row
          label={label("configuration.currentVersion")}
          control={<span className="theme-card-field-value">{engineVersion || "—"}</span>}
        />
      </Block>
    </>
  );
}
