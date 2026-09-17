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
import { SETTINGS_GROUPS, findTab } from "./sections";
import { SettingsIcon } from "./SettingsIcon";
import { GeneralTab } from "./tabs/GeneralTab";
import { ImportTab } from "./tabs/ImportTab";
import { AppearanceTab } from "./tabs/AppearanceTab";
import { VoiceTab } from "./tabs/VoiceTab";
import { ConfigurationTab } from "./tabs/ConfigurationTab";
import { PersonalizationTab } from "./tabs/PersonalizationTab";
import { PetsTab } from "./tabs/PetsTab";
import { ShortcutsTab } from "./tabs/ShortcutsTab";
import { AccountTab } from "./tabs/AccountTab";
import { ComputerUseTab } from "./tabs/ComputerUseTab";
import { AppshotTab } from "./tabs/AppshotTab";
import { PluginsTab } from "./tabs/PluginsTab";
import { BrowserTab } from "./tabs/BrowserTab";
import { HooksTab } from "./tabs/HooksTab";
import { ConnectionsTab } from "./tabs/ConnectionsTab";
import { GitTab } from "./tabs/GitTab";
import { EnvironmentsTab } from "./tabs/EnvironmentsTab";
import { WorktreesTab } from "./tabs/WorktreesTab";
import { ArchivedTab } from "./tabs/ArchivedTab";

function label(key: string, fallback: string): string {
  return String(t(key, fallback));
}

function TabContent({ id }: { id: string }) {
  switch (id) {
    case "general":
      return <GeneralTab />;
    case "import":
      return <ImportTab />;
    case "appearance":
      return <AppearanceTab />;
    case "voice":
      return <VoiceTab />;
    case "configuration":
      return <ConfigurationTab />;
    case "personalization":
      return <PersonalizationTab />;
    case "pets":
      return <PetsTab />;
    case "shortcuts":
      return <ShortcutsTab />;
    case "account":
      return <AccountTab />;
    case "computer-use":
      return <ComputerUseTab />;
    case "appshot":
      return <AppshotTab />;
    case "plugins":
      return <PluginsTab />;
    case "browser":
      return <BrowserTab />;
    case "hooks":
      return <HooksTab />;
    case "connections":
      return <ConnectionsTab />;
    case "git":
      return <GitTab />;
    case "environments":
      return <EnvironmentsTab />;
    case "worktrees":
      return <WorktreesTab />;
    case "archived-tasks":
      return <ArchivedTab />;
    default:
      break;
  }

  const tab = findTab(id);
  return (
    <div className="settings-page-head">
      <h1>{tab ? label(tab.labelKey, id) : id}</h1>
    </div>
  );
}

export function SettingsShell() {
  const route = useRoute();
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
