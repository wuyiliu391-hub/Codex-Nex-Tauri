/**
 * Composer — input, send/stop, and the three chips (project, permission, model).
 *
 * Ported from home.js. Behaviour kept:
 *   Enter sends, Shift+Enter inserts a newline, Escape interrupts a running turn
 *   the textarea grows with content up to a cap
 *   the send button becomes a stop button while a turn is running
 *
 * Expand panels emit the Wails-era `.composer-menu*` / `.model-panel*` /
 * `.project-menu*` class trees from home.css (via ComposerPopover). Generic
 * ui-popover/ui-option Dropdown is not used for these pills.
 *
 * Nothing is sent locally: the text goes straight to `send_message` (or
 * `new_session` first when no thread is open yet). Attachments come from the
 * native dialog and ride along on `send_message`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { t } from "../../src/js/i18n.js";
import { useI18n } from "@/shell/useI18n";
import { ComposerPopover, MenuCheck } from "@/shell/ComposerPopover";
import { navigate } from "@/shell/useRoute";
import {
  openProjectPicker,
  pickAttachmentFiles,
  setActiveProject,
  setActiveSession,
  useAppState,
} from "@/state/appStore";
import { beginUserTurn, discardItem, finishTurn } from "@/state/turnStore";
import { useTurnState } from "@/state/hooks";
import { usePrefSection } from "@/state/preferencesStore";
import { cancelMockTurn, playMockTurn } from "@/state/mockTurn";

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

function basename(path: string): string {
  return path.replace(/\\/g, "/").split("/").filter(Boolean).pop() || path;
}

function isImagePath(path: string): boolean {
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(path);
}

/** Official UserInput shapes for local files (engine just appends them). */
function toUserInput(path: string): Record<string, unknown> {
  return isImagePath(path)
    ? { type: "localImage", path }
    : { type: "file", path };
}

/** CSS fill/thumb vars for the official segmented effort track (home.js). */
function effortFillCss(idx: number): string {
  const pct =
    EFFORT_ORDER.length > 1 ? (idx / (EFFORT_ORDER.length - 1)) * 100 : 100;
  return `calc(11px + (100% - 22px) * ${pct / 100})`;
}

type OpenMenu = "permission" | "model" | "project" | null;

interface ProviderGroup {
  id: string;
  name: string;
  models: string[];
}

/** Providers with at least one real model id — no empty placeholders. */
function providersWithModels(
  providers: Array<{ id: string; name: string; models: string[] }>,
): ProviderGroup[] {
  return providers
    .map((p) => ({
      id: p.id,
      name: p.name || p.id,
      models: (p.models || []).map((m) => String(m || "").trim()).filter(Boolean),
    }))
    .filter((p) => p.models.length > 0);
}

// ── menu contents (class trees from home.js open*Menu) ─────────────────

type PermissionMode = "workspace" | "full-access" | "unrestricted";

/** Hand mark for the ask-approval row (and its pill while active). */
function HandIcon(): React.ReactElement {
  return (
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
  );
}

/** Shield mark for the help-approve row (and its pill while active). */
function ShieldIcon(): React.ReactElement {
  return (
    <svg
      viewBox="0 0 18 18"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 1.8 4 4.2v4.6c0 3.8 2.3 6.8 5 7.5 2.7-.7 5-3.7 5-7.5V4.2L9 1.8Z" />
      <path d="M6.5 9.1 8.1 10.7l3.5-3.5" />
    </svg>
  );
}

/**
 * Orange warning mark for the unrestricted row (and its pill when active).
 * Self-contained strokes: the pill container provides no fill/stroke CSS, so
 * a bare svg would fall back to a solid fill and render as a black disc.
 * The dot uses an inline style because `.menu-icon svg { fill: none }` would
 * otherwise override its presentation attribute and erase it.
 */
function WarningIcon(): React.ReactElement {
  return (
    <svg
      viewBox="0 0 18 18"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.45"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="9" cy="9" r="6.75" />
      <path d="M9 5.6v4.4" />
      <circle cx="9" cy="12.4" r="0.9" style={{ fill: "currentColor", stroke: "none" }} />
    </svg>
  );
}

function PermissionMenuContent({
  mode,
  onSelect,
  onLearnMore,
}: {
  mode: PermissionMode;
  onSelect: (mode: PermissionMode) => void;
  onLearnMore: () => void;
}) {
  return (
    <>
      <div className="composer-menu-label approval-head">
        <span>{String(t("home.approvalTitle", "How should ChatGPT actions be approved?"))}</span>
        <button type="button" className="approval-learn-more" onClick={onLearnMore}>
          {String(t("home.learnMore", "Learn more"))}
        </button>
      </div>
      <button
        type="button"
        className="composer-menu-item permission-item"
        data-mode="workspace"
        onClick={() => onSelect("workspace")}
      >
        <span className="menu-icon">
          <HandIcon />
        </span>
        <span>
          <strong>{String(t("home.askApproval", "Ask approval"))}</strong>
          <small>
            {String(
              t("home.askApprovalDesc", "Always ask for external files and internet"),
            )}
          </small>
        </span>
        {mode === "workspace" ? <MenuCheck /> : null}
      </button>
      <button
        type="button"
        className="composer-menu-item permission-item"
        data-mode="full-access"
        onClick={() => onSelect("full-access")}
      >
        <span className="menu-icon">
          <ShieldIcon />
        </span>
        <span>
          <strong>{String(t("home.helpApproval", "Help me approve"))}</strong>
          <small>
            {String(t("home.helpApprovalDesc", "Only ask for risky actions"))}
          </small>
        </span>
        {mode === "full-access" ? <MenuCheck /> : null}
      </button>
      <button
        type="button"
        className="composer-menu-item permission-item permission-full"
        data-mode="unrestricted"
        onClick={() => onSelect("unrestricted")}
      >
        <span className="menu-icon">
          <WarningIcon />
        </span>
        <span>
          <strong>{String(t("home.unrestrictedApproval", "Full access"))}</strong>
          <small>
            {String(
              t(
                "home.unrestrictedApprovalDesc",
                "Access any file on your computer without restriction",
              ),
            )}
          </small>
        </span>
        {mode === "unrestricted" ? <MenuCheck /> : null}
      </button>
    </>
  );
}

function ModelMenuContent({
  settings,
  groups,
  onSettingsChange,
  onClose,
}: {
  settings: ComposerSettings;
  groups: ProviderGroup[];
  onSettingsChange: (patch: Partial<ComposerSettings>) => void;
  onClose: () => void;
}) {
  const effort = effortKey(settings.modelReasoningEffort);
  const activeModel = (settings.activeModel ?? "").trim();
  const activeProviderId = settings.activeProviderId ?? "";
  const panelModelName =
    activeModel ||
    groups[0]?.models?.[0] ||
    String(t("home.modelUnconfigured", "Model not configured"));

  const [showList, setShowList] = useState(false);
  const [sliderIdx, setSliderIdx] = useState(() =>
    Math.max(0, EFFORT_ORDER.indexOf(effort)),
  );
  const idxRef = useRef(sliderIdx);

  const paintedKey: Effort = EFFORT_ORDER[sliderIdx] ?? "xhigh";
  const effortLabel = String(t(`home.effort.${paintedKey}`, EFFORT_FALLBACK[paintedKey]));
  const fill = effortFillCss(sliderIdx);

  const paint = (idx: number): void => {
    idxRef.current = idx;
    setSliderIdx(idx);
  };

  const commit = (idx: number): void => {
    const key = EFFORT_ORDER[idx] || "xhigh";
    paint(idx);
    if (key !== effort) onSettingsChange({ modelReasoningEffort: key });
  };

  return (
    <>
      <div className={`model-panel${showList ? " is-open" : ""}`}>
        <div className="model-panel-head">
          <button
            type="button"
            className="model-panel-effort"
            data-open-models=""
            onClick={() => setShowList((v) => !v)}
          >
            <span data-effort-name="">{effortLabel}</span>
            <svg viewBox="0 0 18 18" aria-hidden="true">
              <path
                d="m7 5 4 4-4 4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <button
            type="button"
            className="model-panel-reset"
            data-reset-effort=""
            aria-label={String(t("home.resetDefault", "Reset to default"))}
            onClick={() => commit(Math.max(0, EFFORT_ORDER.indexOf("xhigh")))}
          >
            <svg viewBox="0 0 18 18" aria-hidden="true">
              <path
                d="M4.5 9a4.5 4.5 0 1 0 1.3-3.2M4.5 4.5v3h3"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
        <div className="model-panel-model" data-model-name="">
          {panelModelName}
        </div>
        <div
          className="model-panel-track"
          data-intensity-root=""
          style={{ ["--thumb" as string]: fill } as React.CSSProperties}
        >
          <input
            type="range"
            className="intensity-slider"
            min={0}
            max={EFFORT_ORDER.length - 1}
            step={1}
            value={sliderIdx}
            aria-label={String(t("home.intensity", "Intensity"))}
            aria-valuetext={effortLabel}
            onChange={(e) => paint(Number(e.target.value) || 0)}
            onPointerUp={() => commit(idxRef.current)}
            onKeyUp={(e) => {
              if (
                e.key === "ArrowLeft" ||
                e.key === "ArrowRight" ||
                e.key === "ArrowUp" ||
                e.key === "ArrowDown"
              ) {
                commit(idxRef.current);
              }
            }}
          />
          <div
            className="model-panel-dots"
            aria-hidden="true"
            style={{ ["--fill" as string]: fill } as React.CSSProperties}
          >
            {EFFORT_ORDER.map((_, i) => (
              <span key={EFFORT_ORDER[i]} className={`dot${i <= sliderIdx ? " is-on" : ""}`} />
            ))}
          </div>
        </div>
      </div>
      <div className="model-list" hidden={!showList}>
        {groups.length ? (
          groups.map((provider) => (
            <div key={provider.id}>
              <div className="composer-menu-section">{provider.name}</div>
              {provider.models.map((model) => {
                const selected =
                  provider.id === activeProviderId && model === activeModel;
                return (
                  <button
                    key={`${provider.id}:${model}`}
                    type="button"
                    className="composer-menu-item model-item"
                    data-provider={provider.id}
                    data-model={model}
                    onClick={() => {
                      onClose();
                      onSettingsChange({
                        activeProviderId: provider.id,
                        activeModel: model,
                      });
                    }}
                  >
                    <span className="menu-icon model-icon">
                      <svg viewBox="0 0 18 18" aria-hidden="true">
                        <circle cx="9" cy="9" r="5.7" />
                        <path d="M9 6v3l2 1.2" />
                      </svg>
                    </span>
                    <span>
                      <strong>{model}</strong>
                      <small>{provider.name}</small>
                    </span>
                    {selected ? <MenuCheck /> : null}
                  </button>
                );
              })}
            </div>
          ))
        ) : (
          <>
            <div className="composer-menu-empty">
              {String(t("home.modelEmpty", "No models configured"))}
            </div>
            <button
              type="button"
              className="composer-menu-item"
              data-open-providers=""
              onClick={() => {
                onClose();
                navigate("settings", "account");
              }}
            >
              <span className="menu-icon model-icon">
                <svg viewBox="0 0 18 18" aria-hidden="true">
                  <circle cx="9" cy="9" r="5.7" />
                  <path d="M9 6v3l2 1.2" />
                </svg>
              </span>
              <span>
                <strong>{String(t("home.openProviders", "Open provider settings"))}</strong>
                <small>
                  {String(
                    t(
                      "home.modelEmptyHint",
                      "Open Settings → Providers, add a custom endpoint, then discover models.",
                    ),
                  )}
                </small>
              </span>
              <span className="menu-arrow">›</span>
            </button>
          </>
        )}
      </div>
    </>
  );
}

function ProjectMenuContent({
  projects,
  activeProjectId,
  hasActiveSessionProject,
  onSelectProject,
  onNewProject,
  onProjectless,
  onClose,
}: {
  projects: Array<{ id: string; name: string; path: string }>;
  activeProjectId: string | null;
  hasActiveSessionProject: boolean;
  onSelectProject: (id: string) => void;
  onNewProject: () => void;
  onProjectless: () => void;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const hasProjects = projects.length > 0;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = useMemo(() => {
    const value = filter.trim().toLowerCase();
    if (!value) return projects;
    return projects.filter((p) =>
      [p.name, p.path].some((text) =>
        String(text || "").toLowerCase().includes(value),
      ),
    );
  }, [projects, filter]);

  return (
    <>
      {hasProjects ? (
        <>
          <label className="project-menu-search">
            <svg viewBox="0 0 18 18" aria-hidden="true">
              <circle cx="7.7" cy="7.7" r="4.4" />
              <path d="m11 11 3.4 3.4" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              placeholder={String(t("home.searchProjects", "Search projects"))}
              aria-label={String(t("home.searchProjects", "Search projects"))}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </label>
          <div className="project-menu-list">
            {filtered.length ? (
              filtered.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  className="composer-menu-item compact"
                  data-project-id={project.id}
                  onClick={() => {
                    onClose();
                    onSelectProject(project.id);
                  }}
                >
                  <span className="menu-icon">
                    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                      <path
                        d="M16.6 9.3H3.4v3.4c0 2.4.5 3.1 3.2 3.1h6.9c2.6 0 3.1-.7 3.1-3.1V9.3ZM3.4 8.1h13.2c0-1.8-.4-2.3-3.1-2.3h-2.3c-1 0-1.5-.2-2-.6l-.6-.6c-.3-.3-.7-.5-1.1-.5h-1c-2.6 0-3.1.6-3.1 3.2v.8Z"
                        fill="currentColor"
                      />
                    </svg>
                  </span>
                  <span>
                    <strong>{project.name || project.path}</strong>
                    <small>{project.path}</small>
                  </span>
                  {project.id === activeProjectId ? <MenuCheck /> : null}
                </button>
              ))
            ) : (
              <div className="project-menu-empty">No projects found</div>
            )}
          </div>
          <div className="composer-menu-separator" />
        </>
      ) : null}
      <button
        type="button"
        className="composer-menu-item compact"
        data-new-project=""
        onClick={() => {
          onClose();
          onNewProject();
        }}
      >
        <span className="menu-icon">
          <svg viewBox="0 0 18 18" aria-hidden="true">
            <path d="M9 3v12M3 9h12" />
          </svg>
        </span>
        <span>
          <strong>
            {hasProjects
              ? String(t("home.newProject", "New project"))
              : String(t("home.addNewProject", "Add new project"))}
          </strong>
        </span>
        <span className="menu-arrow">›</span>
      </button>
      {hasActiveSessionProject ? (
        <button
          type="button"
          className="composer-menu-item compact"
          data-projectless=""
          onClick={() => {
            onClose();
            onProjectless();
          }}
        >
          <span className="menu-icon">
            <svg viewBox="0 0 18 18" aria-hidden="true">
              <circle cx="9" cy="9" r="5.7" />
              <path d="M6.5 9h5" />
            </svg>
          </span>
          <span>
            <strong>Don&apos;t work in a project</strong>
          </span>
        </button>
      ) : null}
    </>
  );
}

export function Composer({
  running,
  activeSessionId,
  settings,
  onSettingsChange,
  onSessionCreated,
  onRefresh,
}: ComposerProps) {
  useI18n();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [multiline, setMultiline] = useState(false);
  const [attachments, setAttachments] = useState<string[]>([]);
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const [mockMode, setMockMode] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const projectBtnRef = useRef<HTMLButtonElement | null>(null);
  const permissionBtnRef = useRef<HTMLButtonElement | null>(null);
  const modelBtnRef = useRef<HTMLButtonElement | null>(null);

  const { projects, providers, activeProjectId } = useAppState();

  const selectedProject =
    projects.find((p) => p.id === activeProjectId) ?? projects[0] ?? null;
  const projectCwd = selectedProject?.path ?? "";
  const projectLabel = selectedProject?.name ?? String(t("home.chooseProject", "Choose project"));

  const provider = providers.find((p) => p.id === settings.activeProviderId);
  const models = provider?.models ?? [];
  const activeModel = (settings.activeModel ?? "").trim();
  const effort = effortKey(settings.modelReasoningEffort);
  const modelConfigured = Boolean(provider && activeModel && models.includes(activeModel));
  const modelLabel = modelConfigured
    ? `${activeModel} ${String(t(`home.effort.${effort}`, EFFORT_FALLBACK[effort]))}`
    : String(t("home.modelUnconfigured", "Model not configured"));

  const permissionMode: PermissionMode =
    settings.fullAccess === true || settings.approvalPolicy === "never"
      ? settings.approvalPolicy === "ask"
        ? "full-access"
        : "unrestricted"
      : "workspace";
  const fullAccess = permissionMode !== "workspace";

  const modelGroups = useMemo(() => providersWithModels(providers), [providers]);

  const anchorFor = useCallback(
    (menu: OpenMenu): HTMLElement | null => {
      if (menu === "permission") return permissionBtnRef.current;
      if (menu === "model") return modelBtnRef.current;
      if (menu === "project") return projectBtnRef.current;
      return null;
    },
    [],
  );

  const closeMenu = useCallback(() => setOpenMenu(null), []);

  const toggleMenu = useCallback((menu: Exclude<OpenMenu, null>) => {
    setOpenMenu((prev) => (prev === menu ? null : menu));
  }, []);

  // Grow the textarea with its content.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const height = Math.min(Math.max(el.scrollHeight, 24), MAX_INPUT_HEIGHT);
    el.style.height = `${height}px`;
    setMultiline(height > 40);
  }, [text]);

  // Prompt cards dispatch codex:use-prompt; Composer is a controlled input so
  // the fill must go through setText, not a DOM value poke.
  useEffect(() => {
    const onUsePrompt = (e: Event): void => {
      const detail = (e as CustomEvent<string>).detail ?? "";
      setText(detail);
      textareaRef.current?.focus();
    };
    window.addEventListener("codex:use-prompt", onUsePrompt);
    return () => window.removeEventListener("codex:use-prompt", onUsePrompt);
  }, []);

  const interrupt = useCallback(async () => {
    // A playing mock is frontend-only; cancel it before touching the engine.
    cancelMockTurn();
    if (!activeSessionId) return;
    try {
      await invoke("interrupt_session", { sessionId: activeSessionId });
    } catch (err) {
      console.error("[composer] interrupt failed", err);
    }
  }, [activeSessionId]);

  const addAttachments = useCallback(async () => {
    const paths = await pickAttachmentFiles();
    if (!paths.length) return;
    setAttachments((prev) => {
      const seen = new Set(prev);
      const next = prev.slice();
      for (const path of paths) {
        if (!seen.has(path)) {
          seen.add(path);
          next.push(path);
        }
      }
      return next;
    });
  }, []);

  const send = useCallback(async () => {
    if (running) {
      void interrupt();
      return;
    }
    const value = text.trim();
    if (!value || sending) return;

    setSending(true);
    let sessionId = activeSessionId;
    let userItemId: string | null = null;
    const files = attachments.slice();

    try {
      // Mock mode: play a canned turn through the real notification path.
      if (mockMode) {
        if (!sessionId) sessionId = "mock-session";
        setText("");
        setAttachments([]);
        beginUserTurn(sessionId, value);
        playMockTurn(sessionId, value);
        return;
      }
      // Open a thread first when the composer is used from the blank home guide.
      if (!sessionId) {
        const created = await invoke<{ id?: string }>("new_session", {
          projectPath: projectCwd || null,
        });
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
      setAttachments([]);
      userItemId = beginUserTurn(sessionId, value);

      const payload =
        files.length > 0
          ? {
              sessionId,
              message: value,
              attachments: files.map(toUserInput),
            }
          : { sessionId, message: value };
      await invoke("send_message", payload);
    } catch (err) {
      // Roll back only the optimistic bubble and close the turn as failed.
      // A full resetTurn() here used to wipe the loaded conversation too —
      // a send error must not destroy the thread history on screen.
      console.error("[composer] send failed", err);
      if (userItemId) discardItem(userItemId);
      finishTurn("failed", Date.now(), err instanceof Error ? err.message : String(err));
      onRefresh();
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  }, [
    running,
    text,
    sending,
    attachments,
    activeSessionId,
    projectCwd,
    interrupt,
    mockMode,
    onSessionCreated,
    onRefresh,
  ]);

  // Official 发送快捷键 semantics: "enter" sends on Enter, "cmdenter" sends
  // on Ctrl/Cmd+Enter; the opposite modifier always inserts a newline.
  const general = usePrefSection<{ sendShortcut?: string; showContextUsage?: boolean }>("general");
  const sendOnMod = general.sendShortcut === "cmdenter";
  const turnForUsage = useTurnState();

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === "Enter" && !e.shiftKey) {
      const mod = e.ctrlKey || e.metaKey;
      if (sendOnMod ? mod : !mod) {
        e.preventDefault();
        void send();
      } else {
        e.preventDefault();
        const el = e.currentTarget;
        const start = el.selectionStart ?? text.length;
        const end = el.selectionEnd ?? text.length;
        setText(text.slice(0, start) + "\n" + text.slice(end));
        requestAnimationFrame(() => {
          el.selectionStart = el.selectionEnd = start + 1;
        });
      }
    } else if (e.key === "Escape" && running) {
      e.preventDefault();
      void interrupt();
    }
  };

  const ignoreRefs = [projectBtnRef, permissionBtnRef, modelBtnRef];
  const openAnchor = openMenu ? anchorFor(openMenu) : null;

  return (
    <div className="composer" id="composer-wrap">
      <div className="composer-project-tray">
        <button
          ref={projectBtnRef}
          className="composer-project"
          id="composer-project"
          type="button"
          aria-haspopup="menu"
          aria-expanded={openMenu === "project"}
          onClick={() => toggleMenu("project")}
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
        </button>
      </div>

      {attachments.length > 0 ? (
        <div className="composer-attachments" id="composer-attachments">
          {attachments.map((path) => (
            <span className="attach-chip" key={path} title={path}>
              <span>{basename(path)}</span>
              <button
                type="button"
                aria-label={`Remove ${basename(path)}`}
                onClick={() => setAttachments((prev) => prev.filter((p) => p !== path))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}

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
              onClick={() => void addAttachments()}
            >
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path
                  d="M9.33 16.5v-5.83H3.5a.83.83 0 0 1 0-1.67h5.83V3.5a.83.83 0 1 1 1.67 0v5.83h5.83a.83.83 0 0 1 0-1.67H11v5.83a.83.83 0 0 1-1.67 0Z"
                  fill="currentColor"
                />
              </svg>
            </button>

            <button
              ref={permissionBtnRef}
              className={`composer-pill access ${
                permissionMode === "unrestricted"
                  ? "permission-unrestricted"
                  : fullAccess
                    ? "permission-full"
                    : "permission-workspace"
              }`}
              id="chip-full-access"
              type="button"
              aria-haspopup="menu"
              aria-expanded={openMenu === "permission"}
              onClick={() => toggleMenu("permission")}
            >
              <span className="permission-hand">
                {permissionMode === "unrestricted" ? (
                  <WarningIcon />
                ) : permissionMode === "full-access" ? (
                  <ShieldIcon />
                ) : (
                  <HandIcon />
                )}
              </span>
              <span>
                {permissionMode === "unrestricted"
                  ? String(t("home.fullAccess", "Full access"))
                  : permissionMode === "full-access"
                    ? String(t("home.helpApproval", "Help me approve"))
                    : String(t("home.askApproval", "Ask approval"))}
              </span>
              <svg className="chevron" viewBox="0 0 16 16" aria-hidden="true">
                <path
                  d="m4 6 4 4 4-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>

          <div className="composer-toolbar-right">
            <button
              ref={modelBtnRef}
              className={`composer-pill model${modelConfigured ? "" : " is-unconfigured"}`}
              id="chip-model"
              type="button"
              aria-haspopup="menu"
              aria-expanded={openMenu === "model"}
              onClick={() => toggleMenu("model")}
            >
              <span>{modelLabel}</span>
              <svg className="chevron" viewBox="0 0 16 16" aria-hidden="true">
                <path
                  d="m4 6 4 4 4-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            {general.showContextUsage &&
            turnForUsage.tokenUsage?.modelContextWindow != null &&
            turnForUsage.tokenUsage.modelContextWindow > 0 &&
            turnForUsage.tokenUsage.totalTokens != null ? (
              <span
                className="composer-context"
                title={String(t("general.contextUsage", "Context window usage"))}
              >
                {Math.min(
                  100,
                  Math.round(
                    (turnForUsage.tokenUsage.totalTokens /
                      turnForUsage.tokenUsage.modelContextWindow) *
                      100,
                  ),
                )}
                %
              </span>
            ) : null}
            <button
              className={`composer-pill mock${mockMode ? " is-active" : ""}`}
              id="chip-mock"
              type="button"
              aria-pressed={mockMode}
              title={String(t("home.mockTurn", "Mock turn"))}
              onClick={() => setMockMode((v) => !v)}
            >
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path
                  d="M8 2.5h4M9 2.5v5.2L4.2 16a1.2 1.2 0 0 0 1.1 1.7h9.4a1.2 1.2 0 0 0 1.1-1.7L11 7.7V2.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>{String(t("home.mockTurn", "Mock turn"))}</span>
            </button>
            <button
              className={`composer-send${running ? " composer-stop" : ""}`}
              id="btn-send"
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

      {openMenu && openAnchor ? (
        <ComposerPopover
          key={openMenu}
          className={
            openMenu === "permission"
              ? "permission-menu"
              : openMenu === "model"
                ? "model-menu is-panel"
                : "project-menu"
          }
          align={openMenu === "model" ? "end" : "start"}
          prefer={openMenu === "model" ? "auto" : "below"}
          anchorEl={openAnchor}
          ignoreRefs={ignoreRefs}
          onClose={closeMenu}
        >
          {openMenu === "permission" ? (
            <PermissionMenuContent
              mode={permissionMode}
              onLearnMore={() => {
                closeMenu();
                navigate("settings", "configuration");
              }}
              onSelect={(mode) => {
                closeMenu();
                onSettingsChange(
                  mode === "workspace"
                    ? { approvalPolicy: "ask", fullAccess: false }
                    : mode === "full-access"
                      ? { approvalPolicy: "ask", fullAccess: true }
                      : { approvalPolicy: "never", fullAccess: true },
                );
              }}
            />
          ) : null}
          {openMenu === "model" ? (
            <ModelMenuContent
              settings={settings}
              groups={modelGroups}
              onSettingsChange={onSettingsChange}
              onClose={closeMenu}
            />
          ) : null}
          {openMenu === "project" ? (
            <ProjectMenuContent
              projects={projects}
              activeProjectId={activeProjectId}
              hasActiveSessionProject={Boolean(activeProjectId)}
              onSelectProject={(id) => {
                setActiveProject(id);
                onRefresh();
              }}
              onNewProject={() => {
                void openProjectPicker().then(() => onRefresh());
              }}
              onProjectless={() => {
                setActiveSession(null);
                setActiveProject(null);
                onRefresh();
              }}
              onClose={closeMenu}
            />
          ) : null}
        </ComposerPopover>
      ) : null}
    </div>
  );
}
