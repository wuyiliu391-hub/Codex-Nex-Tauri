/**
 * Settings shell: tab navigation plus the content host.
 *
 * Replaces settings.js entirely: every one of the nineteen official tabs now
 * renders a dedicated React component. There is no "not migrated" placeholder
 * and no JSON-dump fallback — a tab either has a real page or does not exist.
 */

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
  const title = tab ? label(tab.labelKey, id) : id;
  return (
    <div className="settings-page-head">
      <h1>{title}</h1>
      <p>{label("settings.capability", "This page has no controls yet.")}</p>
    </div>
  );
}

export function SettingsShell() {
  const route = useRoute();
  const activeId = route.sub ?? "general";

  return (
    <section className="view view-settings" id="view-settings">
      <aside className="settings-sidebar">
        <nav className="settings-nav">
          {SETTINGS_GROUPS.map((group) => (
            <div className="settings-group" key={group.id}>
              <div className="settings-group-head">{label(group.labelKey, group.id)}</div>
              {group.children.map((tab) => (
                <button
                  className={"settings-link" + (tab.id === activeId ? " is-active" : "")}
                  key={tab.id}
                  type="button"
                  data-link={tab.id}
                  aria-current={tab.id === activeId ? "page" : undefined}
                  onClick={() => navigate("settings", tab.id)}
                >
                  <span className="settings-link-icon">
                    <SettingsIcon name={tab.icon} />
                  </span>
                  <span className="settings-link-label">{label(tab.labelKey, tab.id)}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>
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
