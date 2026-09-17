/**
 * Composer — input, send/stop, and the three chips (project, permission, model).
 *
 * Ported from home.js. Behaviour kept:
 *   Enter sends, Shift+Enter inserts a newline, Escape interrupts a running turn
 *   the textarea grows with content up to a cap
 *   the send button becomes a stop button while a turn is running
 *
 * Nothing is sent locally: the text goes straight to `send_message` (or
 * `new_session` first when no thread is open yet).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { t } from "../../src/js/i18n.js";
import { Dropdown } from "@/shell/Dropdown";
import { useAppState } from "@/state/appStore";
import { beginUserTurn, resetTurn } from "@/state/turnStore";

/** Composer growth cap, matching the vanilla shell. */
const MAX_INPUT_HEIGHT = 200;

const EFFORT_ORDER = ["low", "medium", "high", "xhigh", "ultra"] as const;
type Effort = (typeof EFFORT_ORDER)[number];

const EFFORT_FALLBACK: Record<Effort, string> = {
  low: "Light",
  medium: "Standard",
  high: "Deep",
  xhigh: "Extra high",
  ultra: "Ultra",
};

export interface ComposerSettings {
  activeModel?: string;
  activeProviderId?: string;
  modelReasoningEffort?: string;
  approvalPolicy?: string;
  fullAccess?: boolean;
}

interface ComposerProps {
  running: boolean;
  activeSessionId: string | null;
  settings: ComposerSettings;
  onSettingsChange: (patch: Partial<ComposerSettings>) => void;
  /** Called after a session was created so the shell can refresh. */
  onSessionCreated: (sessionId: string) => void;
  onRefresh: () => void;
}

function effortKey(raw: string | undefined): Effort {
  const value = String(raw ?? "xhigh").toLowerCase();
  if ((EFFORT_ORDER as readonly string[]).includes(value)) return value as Effort;
  if (value === "minimal") return "low";
  return "xhigh";
}

export function Composer({
  running,
  activeSessionId,
  settings,
  onSettingsChange,
  onSessionCreated,
  onRefresh,
}: ComposerProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [multiline, setMultiline] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const { projects, providers } = useAppState();

  const activeProjectId = projects[0]?.id ?? "";
  const projectLabel = projects[0]?.name ?? String(t("home.chooseProject", "Choose project"));

  const provider = providers.find((p) => p.id === settings.activeProviderId);
  const models = provider?.models ?? [];
  const activeModel = settings.activeModel ?? "";
  const effort = effortKey(settings.modelReasoningEffort);
  const modelLabel = activeModel
    ? `${activeModel} · ${String(t(`home.effort.${effort}`, EFFORT_FALLBACK[effort]))}`
    : String(t("home.modelUnconfigured", "Model not configured"));

  const fullAccess = settings.fullAccess === true || settings.approvalPolicy === "never";

  // Grow the textarea with its content.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const height = Math.min(Math.max(el.scrollHeight, 24), MAX_INPUT_HEIGHT);
    el.style.height = `${height}px`;
    setMultiline(height > 40);
  }, [text]);

  const interrupt = useCallback(async () => {
    if (!activeSessionId) return;
    try {
      await invoke("interrupt_session", { sessionId: activeSessionId });
    } catch (err) {
      console.error("[composer] interrupt failed", err);
    }
  }, [activeSessionId]);

  const send = useCallback(async () => {
    if (running) {
      void interrupt();
      return;
    }
    const value = text.trim();
    if (!value || sending) return;

    setSending(true);
    let sessionId = activeSessionId;

    try {
      // Open a thread first when the composer is used from the blank home guide.
      if (!sessionId) {
        const created = await invoke<{ id?: string }>("new_session", { projectPath: activeProjectId });
        const newId = created?.id;
        if (!newId) {
          setSending(false);
          return;
        }
        sessionId = newId;
        onSessionCreated(newId);
        onRefresh();
      }

      setText("");
      beginUserTurn(sessionId, value);

      await invoke("send_message", { sessionId, message: value });
    } catch (err) {
      // Never leave a phantom bubble behind on failure.
      console.error("[composer] send failed", err);
      resetTurn();
      onRefresh();
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  }, [running, text, sending, activeSessionId, activeProjectId, interrupt, onSessionCreated, onRefresh]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    } else if (e.key === "Escape" && running) {
      e.preventDefault();
      void interrupt();
    }
  };

  return (
    <div className="composer" id="composer-wrap">
      <div className="composer-project-tray">
        <Dropdown
          className="composer-project"
          ariaLabel={String(t("home.chooseProject", "Choose project"))}
          value={activeProjectId}
          items={projects.map((p) => ({ value: p.id, label: p.name }))}
          onChange={() => {
            // Switching project starts a new thread on that cwd; the session
            // list is refreshed by the shell.
            onRefresh();
          }}
          disabled={projects.length === 0}
          showDefaultLabel={false}
        >
          <span className="proj-icon">
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path
                d="M16.6182 9.33203H3.38184V12.7002C3.38184 14.1253 3.44124 14.5646 3.57129 14.916C3.80618 15.5324 4.59362 15.816 5.04199 15.8379C5.40624 15.8676 5.87469 15.8682 6.54981 15.8682H13.4502C14.1253 15.8682 14.5938 15.8676 14.958 15.8379C15.516 15.7551 16.0594 15.4438 16.4287 14.916C16.6176 13.8438 16.6182 13.3753 16.6182 12.7002V9.33203ZM3.38184 8.06836H16.6143C16.6105 7.81516 16.603 7.60256 16.5879 7.41699C16.5303 6.96862 16.2824 6.42183 15.7861 6.01367C15.3146 5.8088 14.5938 5.75684 13.4502 5.75684H11.1445C10.2158 5.71466 9.65236 5.50645 9.1836 5.1543L8.55957 4.57422C8.30416 4.34653 7.98784 4.19959 7.65137 4.15039C7.45779 4.13174 7.4043 4.13184 7.24512 4.13184H6.54981C5.87469 4.13184 5.40624 4.13238 5.04199 4.16211C4.59362 4.21966 4.04683 4.4676 3.63867 4.96387C3.38238 6.15624 3.38184 6.62469 3.38184 7.29981V8.06836Z"
                fill="currentColor"
              />
            </svg>
          </span>
          <span className="proj-name">{projectLabel}</span>
        </Dropdown>
      </div>

      <div className={`composer-shell${multiline ? " is-multiline" : ""}`}>
        <textarea
          ref={textareaRef}
          className="composer-input"
          id="composer-input"
          placeholder={String(t("home.placeholder", "Ask anything"))}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
        />

        <div className="composer-toolbar">
          <div className="composer-toolbar-left">
            <button
              className="composer-add-btn"
              id="composer-add"
              type="button"
              aria-label={String(t("home.addFiles", "Add files"))}
              onClick={() => window.dispatchEvent(new CustomEvent("codex:add-attachment"))}
            >
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path
                  d="M9.33 16.5v-5.83H3.5a.83.83 0 0 1 0-1.67h5.83V3.5a.83.83 0 1 1 1.67 0v5.83h5.83a.83.83 0 0 1 0 1.67H11v5.83a.83.83 0 0 1-1.67 0Z"
                  fill="currentColor"
                />
              </svg>
            </button>

            <Dropdown
              className={`composer-pill access ${fullAccess ? "permission-full" : "permission-workspace"}`}
              ariaLabel={String(t("home.approvalTitle", "How should actions be approved?"))}
              value={fullAccess ? "never" : "ask"}
              items={[
                { value: "ask", label: String(t("home.askApproval", "Ask for approval")) },
                { value: "never", label: String(t("home.helpApproval", "Approve for me")) },
              ]}
              onChange={(value) =>
                onSettingsChange({
                  approvalPolicy: value === "never" ? "never" : "ask",
                  fullAccess: value === "never",
                })
              }
              showDefaultLabel={false}
            >
              <span className="permission-hand">
                <svg
                  viewBox="0 0 18 18"
                  aria-hidden="true"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M7 11V3.5a1.5 1.5 0 0 1 3 0V11" />
                  <path d="M10 5.5a1.5 1.5 0 0 1 3 0V11" />
                  <path d="M13 7.5a1.5 1.5 0 0 1 3 0v3.5c0 3.3-2.2 5.5-5 5.5-2.8 0-5-2.2-5-5.5V8a1.5 1.5 0 0 1 3 0v3" />
                  <path d="M4 11a1.5 1.5 0 0 0-1.5 1.5v.5" />
                </svg>
              </span>
              <span>{fullAccess ? String(t("home.helpApproval", "Approve for me")) : String(t("home.askApproval", "Ask for approval"))}</span>
              <svg className="chevron" viewBox="0 0 16 16" aria-hidden="true">
                <path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Dropdown>
          </div>

          <div className="composer-toolbar-right">
            <Dropdown
              className={`composer-pill model${activeModel ? "" : " is-unconfigured"}`}
              ariaLabel={modelLabel}
              value={activeModel}
              items={
                models.length
                  ? models.map((m) => ({ value: m, label: m }))
                  : [{ value: "", label: modelLabel }]
              }
              onChange={(value) => onSettingsChange({ activeModel: value })}
              showDefaultLabel={false}
            >
              <span>{modelLabel}</span>
              <svg className="chevron" viewBox="0 0 16 16" aria-hidden="true">
                <path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Dropdown>

            <button
              className={`composer-send${running ? " composer-stop" : ""}`}
              id="btn-send"
              type="button"
              aria-label={running ? String(t("home.stop", "Stop")) : String(t("home.send", "Send"))}
              disabled={!running && !text.trim()}
              onClick={() => void send()}
            >
              {running ? (
                <svg viewBox="0 0 18 18" aria-hidden="true">
                  <rect x="5" y="5" width="8" height="8" rx="1" fill="currentColor" stroke="none" />
                </svg>
              ) : (
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path
                    d="M9.33 16.67V4.94L4.64 9.64l-.94-.94 5.83-5.83a.83.83 0 0 1 1.18 0l5.83 5.83-.94.94-4.7-4.7v11.73a.83.83 0 0 1-1.67 0Z"
                    fill="currentColor"
                    stroke="none"
                  />
                </svg>
              )}
            </button>
          </div>
        </div>

        <div className="composer-footer-tip">{String(t("home.disclaimer", ""))}</div>
      </div>
    </div>
  );
}
