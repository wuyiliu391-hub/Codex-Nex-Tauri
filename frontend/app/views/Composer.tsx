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
  const permissionLabel = fullAccess
    ? String(t("home.helpApproval", "Approve for me"))
    : String(t("home.askApproval", "Ask for approval"));

  // Grow the textarea with its content.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const height = Math.min(Math.max(el.scrollHeight, 24), MAX_INPUT_HEIGHT);
    el.style.height = `${height}px`;
    el.closest(".composer-shell")?.classList.toggle("is-multiline", height > 40);
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
        />
      </div>

      <div className="composer-shell">
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
            />
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
            />

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
