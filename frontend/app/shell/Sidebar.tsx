/**
 * Sidebar: brand header, primary navigation, project list, recent sessions,
 * footer (profile + help), model configuration & reasoning effort, plus
 * pending permission approval badge and real session deletion.
 */

import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { t } from "../../src/js/i18n.js";
import {
  refreshAppState,
  saveSettings,
  setActiveProject,
  setActiveSession,
  useAppState,
} from "@/state/appStore";
import {
  getSnapshot as getTurnSnapshot,
  loadThreadFromSession,
  resetTurn,
} from "@/state/turnStore";
import { usePendingRequests } from "@/state/hooks";
import { Dropdown } from "./Dropdown";
import { useRoute, navigate } from "./useRoute";
import { dispatchAction, type ShellContext } from "./actions";
import { useI18n } from "./useI18n";

const NAV_ITEMS = [
  { view: "home", key: "nav.newTask", fallback: "New task" },
  { view: "pullrequests", key: "nav.pullrequests", fallback: "Pull requests" },
  { view: "scheduled", key: "nav.scheduled", fallback: "Scheduled" },
  { view: "plugins", key: "nav.plugins", fallback: "Plugins" },
] as const;

const REASONING_LEVELS = [
  { value: "low", label: "低 (Low)" },
  { value: "medium", label: "中 (Medium)" },
  { value: "high", label: "高 (High)" },
  { value: "xhigh", label: "极高 (Extra High)" },
  { value: "ultra", label: "Ultra" },
];

function NavIcon({ view }: { view: string }) {
  switch (view) {
    case "home":
      return (
        <svg viewBox="0 0 18 18" aria-hidden="true">
          <path d="M4.1 13.2 4.6 10.5 11.8 3.3a1.35 1.35 0 0 1 1.9 0l1 1a1.35 1.35 0 0 1 0 1.9l-7.2 7.2-2.7.5-.7-.7Z" />
          <path d="m10.9 4.3 2.8 2.8" />
        </svg>
      );
    case "pullrequests":
      return (
        <svg viewBox="0 0 18 18" aria-hidden="true">
          <circle cx="5" cy="4.5" r="1.35" />
          <circle cx="13" cy="13.5" r="1.35" />
          <path d="M5 5.9v6.2M13 12.1V9.7c0-2.5-1.4-3.6-3.8-3.6H8" />
        </svg>
      );
    case "scheduled":
      return (
        <svg viewBox="0 0 18 18" aria-hidden="true">
          <circle cx="9" cy="9" r="5.5" />
          <path d="M9 5.8V9l2.1 1.25" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 18 18" aria-hidden="true">
          <path
            d="M9 2.5a6.5 6.5 0 1 0 6.5 6.5c0-1.8-1.2-2.5-2.2-2.5s-1.8.8-1.8 1.8a2.5 2.5 0 1 1-2.5-2.5c1.2 0 2.2.6 2.7 1.4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
  }
}

interface SidebarProps {
  ctx: ShellContext;
  collapsed: boolean;
}

export function Sidebar({ ctx, collapsed }: SidebarProps) {
  const { projects, sessions, activeSessionId, activeProjectId, settings } = useAppState();
  const pendingRequests = usePendingRequests();
  const route = useRoute();
  useI18n();

  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Recent sessions for the active project (or all when none is selected).
  const selectedProjectId = activeProjectId ?? projects[0]?.id ?? "";
  const recent = sessions
    .filter((s) => !s.archived && (s.projectId === selectedProjectId || !selectedProjectId))
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    .slice(0, 20);

  async function handleDeleteSession(e: React.MouseEvent, sessionId: string): Promise<void> {
    e.stopPropagation();
    if (!window.confirm("确定要删除此会话吗？")) return;
    setDeletingId(sessionId);
    try {
      await invoke("delete_session", { sessionId });
      if (activeSessionId === sessionId) {
        resetTurn();
        setActiveSession(null);
      }
      await refreshAppState();
    } catch (err) {
      console.error("[sidebar] delete_session failed", err);
    } finally {
      setDeletingId(null);
    }
  }

  function handleNewTask(): void {
    resetTurn();
    setActiveSession(null);
    navigate("home");
  }

  return (
    <aside className="sidebar" id="sidebar" aria-hidden={collapsed}>
      <div className="sidebar-brand">
        <span className="brand-title-wrap" id="brand-menu-btn">
          <span className="brand-title">{String(t("app.brand.name", "Codex"))}</span>
        </span>
        <div className="brand-actions">
          <button
            className="brand-icon-btn brand-search"
            type="button"
            title={String(t("nav.search", "Search"))}
            aria-label={String(t("nav.search", "Search"))}
            onClick={() => dispatchAction("find", ctx)}
          >
            <svg viewBox="0 0 18 18" aria-hidden="true">
              <circle cx="7.7" cy="7.7" r="4.45" />
              <path d="m11 11 3.45 3.45" />
            </svg>
          </button>
          <button
            className="brand-icon-btn brand-notify"
            id="btn-notifications"
            type="button"
            title={String(t("nav.notifications", "Notifications"))}
            aria-label={String(t("nav.notifications", "Notifications"))}
            onClick={() => navigate("settings", "general")}
          >
            <svg viewBox="0 0 18 18" aria-hidden="true">
              <path
                d="M9 2.5a3.5 3.5 0 0 0-3.5 3.5c0 2.2-.8 3.5-1.5 4.3-.3.3-.4.7-.2 1 .2.4.6.7 1 .7h8.4c.5 0 .9-.3 1-.7.2-.4.1-.8-.2-1-.7-.8-1.5-2.1-1.5-4.3A3.5 3.5 0 0 0 9 2.5ZM7.5 13.5a1.5 1.5 0 0 0 3 0"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>

      <nav className="nav-top">
        {NAV_ITEMS.map((item) => (
          <button
            className={`nav-item${route.view === item.view ? " is-active" : ""}`}
            key={item.view}
            type="button"
            data-view={item.view}
            id={item.view === "home" ? "nav-new" : undefined}
            onClick={() => {
              if (item.view === "home") {
                handleNewTask();
              } else {
                navigate(item.view);
              }
            }}
          >
            <span className="ico">
              <NavIcon view={item.view} />
            </span>
            <span>{String(t(item.key, item.fallback))}</span>
          </button>
        ))}
      </nav>

      {/* 待决权限请求面板入口 */}
      {pendingRequests.length > 0 ? (
        <div className="sidebar-permission-badge" onClick={() => navigate("home")}>
          <span className="perm-dot" />
          <span>待决权限请求 ({pendingRequests.length})</span>
        </div>
      ) : null}

      {/* 模型与思考等级快速调节 */}
      <div className="sidebar-model-box">
        <div className="sidebar-model-row">
          <span className="sidebar-model-label">模型:</span>
          <Dropdown
            value={settings.activeModel || "gpt-4o"}
            items={[
              { value: "gpt-4o", label: "gpt-4o" },
              { value: "gpt-4o-mini", label: "gpt-4o-mini" },
              { value: "o1", label: "o1" },
              { value: "o3-mini", label: "o3-mini" },
              { value: "claude-3-5-sonnet-20241022", label: "claude-3-5-sonnet" },
              { value: "deepseek-chat", label: "deepseek-chat" },
            ]}
            onChange={(model) => void saveSettings({ activeModel: model })}
          />
        </div>
        <div className="sidebar-model-row">
          <span className="sidebar-model-label">思考等级:</span>
          <Dropdown
            value={settings.modelReasoningEffort || "medium"}
            items={REASONING_LEVELS}
            onChange={(effort) => void saveSettings({ modelReasoningEffort: effort })}
          />
        </div>
      </div>

      <div className="section-head">
        <span>{String(t("nav.projects", "Projects"))}</span>
      </div>
      <div className="project-list" id="project-list">
        {projects.length === 0 ? (
          <div className="project-list-empty">{String(t("nav.noProjects", "No projects"))}</div>
        ) : (
          projects.map((project) => (
            <button
              className={`project-row${project.id === selectedProjectId ? " is-active" : ""}`}
              key={project.id}
              type="button"
              onClick={() => setActiveProject(project.id)}
            >
              <span className="ico">
                <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path
                    d="M16.6 9.3H3.4v3.4c0 2.4.5 3.1 3.2 3.1h6.9c2.6 0 3.1-.7 3.1-3.1V9.3ZM3.4 8.1h13.2c0-1.8-.4-2.3-3.1-2.3h-2.3c-1 0-1.5-.2-2-.6l-.6-.6c-.3-.3-.7-.5-1.1-.5h-1c-2.6 0-3.1.6-3.1 3.2v.8Z"
                    fill="currentColor"
                  />
                </svg>
              </span>
              <span className="name">{project.name}</span>
            </button>
          ))
        )}
      </div>

      <div className="section-head task-section-head">
        <span>{String(t("nav.tasks", "Recent"))}</span>
      </div>
      <div className="task-list" id="task-list">
        {recent.length === 0 ? (
          <div className="task-list-empty">{String(t("nav.noChats", "No chats"))}</div>
        ) : (
          recent.map((session) => (
            <div
              className={`task-row${session.id === activeSessionId ? " is-active" : ""}`}
              key={session.id}
              onClick={() => {
                const turn = getTurnSnapshot();
                if (!(turn.active && turn.sessionId === session.id)) {
                  void loadThreadFromSession(session.id);
                }
                setActiveSession(session.id);
                navigate("home");
              }}
            >
              <span className="ico">
                <svg viewBox="0 0 18 18" aria-hidden="true">
                  <path d="M14.5 9a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0Z" />
                  <path d="M6 9h6M9 6v6" />
                </svg>
              </span>
              <span className="name">{session.title || session.preview || String(t("nav.newTask", "New task"))}</span>
              <button
                type="button"
                className="task-delete-btn"
                title="删除会话"
                disabled={deletingId === session.id}
                onClick={(e) => void handleDeleteSession(e, session.id)}
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>

      <div className="sidebar-foot">
        <button
          className="nav-item sidebar-profile"
          id="sidebar-profile-btn"
          type="button"
          aria-haspopup="menu"
          onClick={() => navigate("settings", "account")}
        >
          <span className="ico">
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <circle cx="10" cy="10" r="3.2" />
              <path d="M4.5 16.2a6.2 6.2 0 0 1 11 0" fill="none" stroke="currentColor" strokeWidth="1.4" />
            </svg>
          </span>
          <span className="profile-name">{String(t("app.brand.name", "Codex"))}</span>
        </button>
        <button
          className="sidebar-help-btn"
          id="sidebar-help-btn"
          type="button"
          title={String(t("menu.help", "Help"))}
          aria-label={String(t("menu.help", "Help"))}
          onClick={() => navigate("settings", "general")}
        >
          <svg viewBox="0 0 18 18" aria-hidden="true">
            <circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" strokeWidth="1.3" />
            <path
              d="M7.2 7.2a2 2 0 1 1 2.8 1.8c-.5.3-.8.7-.8 1.4M9 13h.01"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </aside>
  );
}
