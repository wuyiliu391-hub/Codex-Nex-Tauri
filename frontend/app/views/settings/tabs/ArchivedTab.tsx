/**
 * Archived tasks tab — mirrors official v26.911 layout:
 *   页头 Text '已归档的聊天' + 顶部右侧 Button '全部删除' (danger)
 *   搜索栏 Edit '搜索已归档聊天' #archived-tasks-search
 *   双下拉: '筛选已归档聊天' (全部聊天) + '按项目筛选已归档的聊天' (所有项目)
 *   项目分组头: '无项目' + 'N 个聊天'
 *   列表项: 标题 + 日期 + 图标按钮 '删除已归档聊天' + Button '取消归档'
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { t } from "../../../../src/js/i18n.js";
import { Dropdown } from "@/shell/Dropdown";
import { BlockCustom, SettingsButton } from "../primitives";

function label(key: string, fallback = ""): string {
  return String(t(key, fallback));
}

interface ArchivedSession {
  id: string;
  title: string;
  updatedAt?: string;
  project?: string;
}

function asSessions(raw: unknown): ArchivedSession[] {
  const rec = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray(rec["data"])
      ? (rec["data"] as unknown[])
      : [];
  const out: ArchivedSession[] = [];
  for (const entry of list) {
    const s = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
    const id = typeof s["id"] === "string" ? s["id"] : null;
    if (!id) continue;
    out.push({
      id,
      title: typeof s["title"] === "string" ? s["title"] : typeof s["name"] === "string" ? s["name"] : "",
      updatedAt: typeof s["updatedAt"] === "string" ? s["updatedAt"] : undefined,
      project: typeof s["project"] === "string" ? s["project"] : undefined,
    });
  }
  return out;
}

export function ArchivedTab() {
  const [sessions, setSessions] = useState<ArchivedSession[] | null>(null);
  const [query, setQuery] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterProject, setFilterProject] = useState("all");

  const refresh = useCallback(() => {
    void invoke<unknown>("list_sessions", { archived: true })
      .then((raw) => setSessions(asSessions(raw)))
      .catch(() => setSessions([]));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function unarchive(id: string): Promise<void> {
    try {
      await invoke("unarchive_session", { sessionId: id });
    } catch (err) {
      console.warn("[archived] unarchive failed", err);
    }
    refresh();
  }

  async function deleteOne(id: string): Promise<void> {
    try {
      await invoke("delete_session", { sessionId: id });
    } catch (err) {
      console.warn("[archived] delete failed", err);
    }
    refresh();
  }

  async function deleteAll(): Promise<void> {
    if (!window.confirm(label("archived.deleteAllConfirm"))) return;
    for (const s of sessions ?? []) {
      try {
        await invoke("delete_session", { sessionId: s.id });
      } catch {
        /* best effort */
      }
    }
    refresh();
  }

  const filtered = useMemo(() => {
    if (!sessions) return [];
    return sessions.filter((s) => {
      if (query && !s.title.toLowerCase().includes(query.toLowerCase())) return false;
      if (filterProject !== "all" && s.project !== filterProject) return false;
      return true;
    });
  }, [sessions, query, filterProject]);

  const countLabel = label("archived.chatsCount", "{n} chats").replace(
    "{n}",
    String(filtered.length),
  );

  return (
    <>
      <div className="archived-head">
        <div className="settings-page-head">
          <h1>{label("archived.title", "Archived chats")}</h1>
        </div>
        {sessions && sessions.length > 0 ? (
          <SettingsButton
            label={label("archived.deleteAll", "Delete all")}
            kind="danger"
            onClick={() => void deleteAll()}
          />
        ) : null}
      </div>

      <div className="archived-filters-row">
        <div className="archived-search-wrap">
          <input
            type="text"
            className="settings-input archived-search-input"
            placeholder={label("archived.search", "Search archived chats")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="archived-dropdowns">
          <Dropdown
            value={filterType}
            items={[{ value: "all", label: label("archived.filterAll", "All chats") }]}
            onChange={setFilterType}
          />
          <Dropdown
            value={filterProject}
            items={[{ value: "all", label: label("archived.filterAllProjects", "All projects") }]}
            onChange={setFilterProject}
          />
        </div>
      </div>

      <BlockCustom title="">
        {sessions === null ? (
          <div className="site-empty">{label("discovery.loading", "Loading…")}</div>
        ) : filtered.length === 0 ? (
          <div className="settings-card site-empty">{label("archived.empty")}</div>
        ) : (
          <div className="settings-card archived-card">
            <div className="archived-group-head">
              <span className="archived-group-title">{label("archived.noProject", "No project")}</span>
              <span className="archived-group-count">{countLabel}</span>
            </div>
            <div className="archived-list">
              {filtered.map((s) => (
                <div className="archived-item" key={s.id}>
                  <div className="archived-item-meta">
                    <span className="archived-item-title">
                      {s.title || label("archived.untitled")}
                    </span>
                    {s.updatedAt ? (
                      <span className="archived-item-date">{s.updatedAt}</span>
                    ) : null}
                  </div>
                  <div className="archived-item-actions">
                    <button
                      type="button"
                      className="settings-button ghost"
                      title={label("archived.delete", "Delete")}
                      onClick={() => void deleteOne(s.id)}
                    >
                      ✕
                    </button>
                    <SettingsButton
                      label={label("archived.unarchive", "Unarchive")}
                      onClick={() => void unarchive(s.id)}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </BlockCustom>
    </>
  );
}
