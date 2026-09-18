/**
 * Settings shell: tab navigation plus the content host.
 *
 * DOM contract is the one settings.css was written against (see settings.js
 * renderSettingsShell / relabelSettingsSidebar):
 *
 *   #view-settings.view-settings
 *     aside.settings-sidebar
 *       .settings-sidebar-head > .settings-back + label.settings-search
 *       .settings-links > .settings-group > .settings-group-label + .settings-link[.ico + span]
 *     .settings-main
 *       button.settings-close-btn
 *       .settings-content
 *
 * Earlier the sidebar used invented class names (settings-nav / settings-group-head
 * / settings-link-label) that no stylesheet targeted, and omitted the back button
 * and search box entirely — which is why the sidebar looked unstyled and wrong.
 */

import { useMemo, useState } from "react";
import { t } from "../../../src/js/i18n.js";
import { navigate, useRoute } from "@/shell/useRoute";
import { useI18n } from "@/shell/useI18n";
import { SETTINGS_GROUPS, findTab } from "./sections";
import { SettingsIcon } from "./SettingsIcon";
import { AccountTab } from "./tabs/AccountTab";

function label(key: string, fallback: string): string {
  return String(t(key, fallback));
}

function TabPlaceholder({ id }: { id: string }) {
  const tab = findTab(id);
  const title = tab ? label(tab.labelKey, id) : id;
  return (
    <div className="settings-placeholder-box">
      <div className="settings-page-head">
        <h1>{title}</h1>
        <p>此模块暂未启用（已留空占位）。当前优先聚焦【自定义供应商】协议转换层与模型连通。</p>
      </div>
      <div className="settings-card site-empty" style={{ marginTop: "24px", padding: "32px 20px" }}>
        <p style={{ margin: "0 0 16px", color: "var(--fg-secondary)" }}>
          您可以在【自定义供应商】中配置 OpenAI Chat、Anthropic、Ollama 协议网关，自动适配转发至 Codex Responses 接口。
        </p>
        <button
          type="button"
          className="settings-button primary"
          onClick={() => navigate("settings", "account")}
        >
          前往配置自定义供应商
        </button>
      </div>
    </div>
  );
}

function TabContent({ id }: { id: string }) {
  switch (id) {
    case "account":
      return <AccountTab />;
    default:
      return <TabPlaceholder id={id} />;
  }
}

export function SettingsShell() {
  const route = useRoute();
  useI18n();
  const activeId = route.sub ?? "general";
  const [query, setQuery] = useState("");

  // Filter groups/links the same way settings.js filterSettings() did: hide
  // non-matching links and any group left with none.
  const filteredGroups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return SETTINGS_GROUPS;
    return SETTINGS_GROUPS.map((group) => ({
      ...group,
      children: group.children.filter((tab) =>
        label(tab.labelKey, tab.id).toLowerCase().includes(needle),
      ),
    })).filter((group) => group.children.length > 0);
  }, [query]);

  return (
    <section className="view view-settings" id="view-settings">
      <aside className="settings-sidebar">
        <div className="settings-sidebar-head">
          <button
            className="settings-back"
            id="settings-back"
            type="button"
            onClick={() => navigate("home")}
          >
            {label("settings.back", "Back")}
          </button>
          <label className="settings-search">
            <svg viewBox="0 0 18 18" aria-hidden="true">
              <circle cx="7.7" cy="7.7" r="4.45" />
              <path d="m11 11 3.45 3.45" />
            </svg>
            <input
              id="settings-search-input"
              type="text"
              placeholder={label("settings.search", "Search settings")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>

        <div className="settings-links" id="settings-links">
          {filteredGroups.map((group) => (
            <div className="settings-group" data-group={group.id} key={group.id}>
              <div className="settings-group-label">{label(group.labelKey, group.id)}</div>
              {group.children.map((tab) => (
                <button
                  className={`settings-link${tab.id === activeId ? " is-active" : ""}`}
                  data-link={tab.id}
                  key={tab.id}
                  type="button"
                  aria-current={tab.id === activeId ? "page" : undefined}
                  onClick={() => navigate("settings", tab.id)}
                >
                  <span className="ico">
                    <SettingsIcon name={tab.icon} />
                  </span>
                  <span>{label(tab.labelKey, tab.id)}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </aside>

      <div className="settings-main" id="settings-main">
        <button
          className="settings-close-btn"
          id="settings-close-btn"
          type="button"
          aria-label={String(t("action.close", "Close"))}
          title={String(t("action.close", "Close"))}
          onClick={() => navigate("home")}
        >
          <svg viewBox="0 0 18 18" aria-hidden="true">
            <path
              d="m4.5 4.5 9 9M13.5 4.5l-9 9"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <div className="settings-content" id="settings-content">
          <TabContent id={activeId} />
        </div>
      </div>
    </section>
  );
}
