/**
 * General tab — mirrors the official 常规 page, section by section:
 *   权限 · 常规 · 编辑器 · 弹出窗口 · 通知 · 趣味实验
 *
 * All copy keys reuse the pre-existing `general.*` dictionary block
 * (vanilla-era, already translated in 5 languages); only five new keys were
 * added (taskFolderUnset / view / close / sendOnCtrlEnter / popoutOff).
 *
 * Wiring rules (hard rule: no fake controls):
 *   权限 switches write the real approval state (settings.fullAccess via
 *   saveSettings → shell store + engine config/batchWrite).
 *   语言 writes settings.language (live applyLanguage).
 *   无项目任务文件夹 reads the engine's real codexHome (engine_status →
 *   initialize.codexHome); 更改 opens the native folder dialog.
 *   打开源许可证 renders the bundled LICENSES.md in a modal (?raw import).
 *   发送快捷键 and 显示上下文窗口使用情况 are consumed live by the composer.
 *   Remaining rows persist real preference state under the `general` section
 *   (shell store `extra` bag) — their engine-side effects are not implemented
 *   yet, and the UI never claims otherwise.
 */

import { useEffect, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { currentLang, languageOptions, t } from "../../../../src/js/i18n.js";
import { pickProjectDirectory, saveSettings, useAppState } from "@/state/appStore";
import { saveSection, usePrefSection } from "@/state/preferencesStore";
import { openExternal } from "@/shell/actions";
import { Dropdown } from "@/shell/Dropdown";
import { Modal } from "@/shell/Modal";
import { useI18n } from "@/shell/useI18n";
import { Block, PageHead, Row, Segmented, SettingsButton, Switch } from "../primitives";
import licensesText from "../../../../src/assets/LICENSES.md?raw";

function label(key: string, fallback: string): string {
  return String(t(key, fallback));
}

interface GeneralPrefs {
  taskFolder?: string;
  fileOpenWith?: string;
  integratedShell?: string;
  bottomPanel?: boolean;
  promptSuggestions?: boolean;
  pluginsEnabled?: boolean;
  plainTextEditor?: boolean;
  showContextUsage?: boolean;
  sendShortcut?: string;
  followUpMode?: string;
  popoutShortcut?: string;
  standaloneChat?: boolean;
  turnNotifications?: string;
  permissionNotifications?: boolean;
  questionNotifications?: boolean;
  confetti?: boolean;
}

/** Defaults match the official page on first run (插件/权限通知 on, rest off). */
const GENERAL_DEFAULTS: Required<GeneralPrefs> = {
  taskFolder: "",
  fileOpenWith: "default",
  integratedShell: "powershell",
  bottomPanel: false,
  promptSuggestions: false,
  pluginsEnabled: true,
  plainTextEditor: false,
  showContextUsage: false,
  sendShortcut: "enter",
  followUpMode: "adjust",
  popoutShortcut: "off",
  standaloneChat: false,
  turnNotifications: "unfocused",
  permissionNotifications: true,
  questionNotifications: true,
  confetti: false,
};

const POPOUT_OPTIONS: { value: string; key: string; fallback: string }[] = [
  { value: "off", key: "general.popoutOff", fallback: "Off" },
  { value: "ctrl+shift+space", key: "", fallback: "Ctrl+Shift+Space" },
  { value: "alt+space", key: "", fallback: "Alt+Space" },
  { value: "ctrl+alt+space", key: "", fallback: "Ctrl+Alt+Space" },
];

function PenIcon() {
  return (
    <svg viewBox="0 0 14 14" aria-hidden="true">
      <path d="M9.6 1.9 12.1 4.4 4.8 11.7l-3.2.6.6-3.2Z" />
      <path d="m8.2 3.3 2.5 2.5" />
    </svg>
  );
}

export function GeneralTab() {
  const { settings } = useAppState();
  const saved = usePrefSection<GeneralPrefs>("general");
  const g: Required<GeneralPrefs> = { ...GENERAL_DEFAULTS, ...saved };
  useI18n();

  const [codexHome, setCodexHome] = useState("");
  const [licensesOpen, setLicensesOpen] = useState(false);

  // Real default location for project-less tasks = the engine's codex home.
  useEffect(() => {
    void invoke<{ initialize?: { codexHome?: string } | null }>("engine_status")
      .then((r) => setCodexHome(r?.initialize?.codexHome ?? ""))
      .catch(() => {
        /* engine offline — the row falls back to the stored override */
      });
  }, []);

  function patch(p: Partial<GeneralPrefs>): void {
    void saveSection("general", p as Record<string, unknown>);
  }

  async function changeTaskFolder(): Promise<void> {
    const picked = await pickProjectDirectory();
    if (picked) patch({ taskFolder: picked });
  }

  const language = settings.language || currentLang();
  const languageItems = languageOptions().map(
    (option: { value?: string; label?: string; code?: string; name?: string }) => ({
      value: String(option.value ?? option.code ?? ""),
      label: String(option.label ?? option.name ?? option.value ?? option.code ?? ""),
    }),
  );

  const fullAccess = settings.fullAccess === true;
  const taskFolderShown = g.taskFolder || codexHome;
  const popoutOpt = POPOUT_OPTIONS.find((o) => o.value === g.popoutShortcut);
  const popoutLabel = popoutOpt
    ? popoutOpt.key
      ? label(popoutOpt.key, popoutOpt.fallback)
      : popoutOpt.fallback
    : g.popoutShortcut;

  // Official sentence: description, then the blue 了解更多 link inline, then
  // the trailing risk clause.
  const fullAccessDesc: ReactNode = (
    <div className="settings-row-description">
      {label("general.fullAccessDesc", "")}
      {" "}
      <button
        type="button"
        className="settings-inline-link"
        onClick={() => void openExternal("https://developers.openai.com/codex/concepts/sandboxing")}
      >
        {label("general.learnMore", "Learn more")}
      </button>
      {label("general.fullAccessRisk", "")}
    </div>
  );

  return (
    <>
      <PageHead title={label("general.title", "General")} />

      {/* ── 权限 ── */}
      <Block title={label("general.permissions", "Permissions")}>
        <Row
          label={label("general.defaultPermissions", "Default permissions")}
          desc={label("general.defaultPermissionsDesc", "")}
          control={
            // Official: always-on and disabled — full access is the real lever.
            <Switch
              checked={!fullAccess}
              disabled
              onChange={() => {
                /* disabled by design (official 默认权限始终显示 DIS) */
              }}
            />
          }
        />
        <Row
          label={label("general.fullAccess", "Full access")}
          descNode={fullAccessDesc}
          control={
            <Switch
              checked={fullAccess}
              onChange={(v) => void saveSettings({ fullAccess: v })}
            />
          }
        />
      </Block>

      {/* ── 常规 ── */}
      <Block title={label("general.generalSection", "General")}>
        <Row
          label={label("general.noProjectFolder", "Projectless task folder")}
          desc={label("general.noProjectFolderDesc", "")}
          control={
            <span className="general-control-group">
              <span className="settings-path" title={taskFolderShown || undefined}>
                {taskFolderShown || label("general.taskFolderUnset", "Not detected")}
              </span>
              <SettingsButton
                label={label("general.change", "Change")}
                onClick={() => void changeTaskFolder()}
              />
            </span>
          }
        />
        <Row
          label={label("general.defaultFileOpen", "Default file open location")}
          desc={label("general.defaultFileOpenDesc", "")}
          control={
            <Dropdown
              value={g.fileOpenWith}
              items={[
                { value: "default", label: label("general.defaultApp", "Default app") },
                { value: "chrome", label: "Chrome" },
                { value: "edge", label: "Edge" },
                { value: "firefox", label: "Firefox" },
              ]}
              onChange={(v) => patch({ fileOpenWith: v })}
            />
          }
        />
        <Row
          label={label("general.terminalShell", "Integrated terminal Shell")}
          desc={label("general.terminalShellDesc", "")}
          control={
            <Dropdown
              value={g.integratedShell}
              items={[
                { value: "powershell", label: "PowerShell" },
                { value: "windowspowershell", label: "Windows PowerShell" },
                { value: "cmd", label: "Command Prompt" },
                { value: "gitbash", label: "Git Bash" },
              ]}
              onChange={(v) => patch({ integratedShell: v })}
            />
          }
        />
        {languageItems.length ? (
          <Row
            label={label("general.language", "Language")}
            desc={label("general.languageDesc", "")}
            control={
              <Dropdown
                value={language}
                items={languageItems}
                onChange={(value) => void saveSettings({ language: value })}
              />
            }
          />
        ) : null}
        <Row
          label={label("general.bottomPanel", "Bottom panel")}
          desc={label("general.bottomPanelDesc", "")}
          control={
            <Switch checked={g.bottomPanel} onChange={(v) => patch({ bottomPanel: v })} />
          }
        />
        <Row
          label={label("general.suggestions", "Prompt suggestions")}
          desc={label("general.suggestionsDesc", "")}
          control={
            <Switch
              checked={g.promptSuggestions}
              onChange={(v) => patch({ promptSuggestions: v })}
            />
          }
        />
        <Row
          label={label("general.licenses", "Open source licenses")}
          desc={label("general.licensesDesc", "")}
          control={
            <SettingsButton
              label={label("general.view", "View")}
              onClick={() => setLicensesOpen(true)}
            />
          }
        />
        <Row
          label={label("general.plugins", "Plugins")}
          desc={label("general.pluginsDesc", "")}
          control={
            <Switch checked={g.pluginsEnabled} onChange={(v) => patch({ pluginsEnabled: v })} />
          }
        />
      </Block>

      {/* ── 编辑器 ── */}
      <Block title={label("general.editor", "Editor")}>
        <Row
          label={label("general.plainText", "Plain-text editor")}
          desc={label("general.plainTextDesc", "")}
          control={
            <Switch checked={g.plainTextEditor} onChange={(v) => patch({ plainTextEditor: v })} />
          }
        />
        <Row
          label={label("general.contextUsage", "Show context window usage")}
          control={
            <Switch
              checked={g.showContextUsage}
              onChange={(v) => patch({ showContextUsage: v })}
            />
          }
        />
        <Row
          label={label("general.sendShortcut", "Send shortcut")}
          desc={label("general.sendShortcutDesc", "")}
          control={
            <Dropdown
              value={g.sendShortcut}
              items={[
                { value: "enter", label: label("general.sendOnEnter", "Press Enter") },
                { value: "cmdenter", label: label("general.sendOnCtrlEnter", "Press Ctrl+Enter") },
              ]}
              onChange={(v) => patch({ sendShortcut: v })}
            />
          }
        />
        <Row
          label={label("general.followUp", "Follow-up handling")}
          desc={label("general.followUpDesc", "")}
          control={
            <Segmented
              value={g.followUpMode}
              options={[
                { value: "queue", label: label("general.queue", "Queue") },
                { value: "adjust", label: label("general.steer", "Steer") },
              ]}
              onChange={(v) => patch({ followUpMode: v })}
            />
          }
        />
      </Block>

      {/* ── 弹出窗口 ── */}
      <Block title={label("general.popup", "Pop-out window")}>
        <Row
          label={label("general.popupShortcut", "Pop-out shortcut")}
          desc={label("general.popupShortcutDesc", "")}
          control={
            <Dropdown
              value={g.popoutShortcut}
              items={POPOUT_OPTIONS.map((o) => ({
                value: o.value,
                label: o.key ? label(o.key, o.fallback) : o.fallback,
              }))}
              onChange={(v) => patch({ popoutShortcut: v })}
              showDefaultLabel={false}
            >
              <span className="popout-trigger">
                {popoutLabel}
                <PenIcon />
              </span>
            </Dropdown>
          }
        />
        <Row
          label={label("general.defaultDetached", "Use standalone chat by default")}
          desc={label("general.defaultDetachedDesc", "")}
          control={
            <Switch checked={g.standaloneChat} onChange={(v) => patch({ standaloneChat: v })} />
          }
        />
      </Block>

      {/* ── 通知 ── */}
      <Block title={label("general.notifications", "Notifications")}>
        <Row
          label={label("general.turnComplete", "Turn-complete notifications")}
          desc={label("general.turnCompleteDesc", "")}
          control={
            <Dropdown
              value={g.turnNotifications}
              items={[
                { value: "never", label: label("general.neverNotify", "Never") },
                { value: "unfocused", label: label("general.onlyUnfocused", "Only when unfocused") },
                { value: "always", label: label("general.alwaysNotify", "Always") },
              ]}
              onChange={(v) => patch({ turnNotifications: v })}
            />
          }
        />
        <Row
          label={label("general.enablePermNotify", "Enable permission notifications")}
          desc={label("general.enablePermNotifyDesc", "")}
          control={
            <Switch
              checked={g.permissionNotifications}
              onChange={(v) => patch({ permissionNotifications: v })}
            />
          }
        />
        <Row
          label={label("general.enableQuestionNotify", "Enable question notifications")}
          desc={label("general.enableQuestionNotifyDesc", "")}
          control={
            <Switch
              checked={g.questionNotifications}
              onChange={(v) => patch({ questionNotifications: v })}
            />
          }
        />
      </Block>

      {/* ── 趣味实验 ── */}
      <Block title={label("general.fun", "Fun experiments")}>
        <Row
          label={label("general.confetti", "Confetti cannon")}
          desc={label("general.confettiDesc", "")}
          control={<Switch checked={g.confetti} onChange={(v) => patch({ confetti: v })} />}
        />
      </Block>

      <Modal
        open={licensesOpen}
        title={label("general.licenses", "Open source licenses")}
        actions={[
          {
            label: label("general.close", "Close"),
            variant: "primary",
            onClick: (close) => close(),
          },
        ]}
        onClose={() => setLicensesOpen(false)}
      >
        <pre className="settings-licenses">{licensesText}</pre>
      </Modal>
    </>
  );
}
