/**
 * Settings shell: tab navigation plus the content host.
 *
 * Replaces the shell half of settings.js. Tabs that have not been ported yet
 * render an explicit notice instead of an empty page, so the remaining work is
 * always visible.
 */

import { t } from "../../../src/js/i18n.js";
import { navigate, useRoute } from "@/shell/useRoute";
import { PORTED_TABS, SETTINGS_GROUPS, findTab } from "./sections";
import { SettingsIcon } from "./SettingsIcon";
import { PageHead } from "./primitives";
import { GeneralTab } from "./tabs/GeneralTab";
import { ConfigurationTab } from "./tabs/ConfigurationTab";
import { AccountTab } from "./tabs/AccountTab";
import { PetsTab } from "./tabs/PetsTab";
import { ShortcutsTab } from "./tabs/ShortcutsTab";
import { BackendSettingsTab } from "./tabs/BackendSettingsTab";

function label(key: string, fallback: string): string {
  return String(t(key, fallback));
}

function TabContent({ id }: { id: string }) {
  switch (id) {
    case "general":
      return <GeneralTab />;
    case "configuration":
      return <ConfigurationTab />;
    case "account":
      return <AccountTab />;
    case "pets":
      return <PetsTab />;
    case "shortcuts":
      return <ShortcutsTab />;
    default:
      break;
  }

  const tab = findTab(id);
  const title = tab ? label(tab.labelKey, id) : id;
  const backendTab: Record<string, { command?: string; args?: Record<string, unknown> }> = {
    plugins: { command: "list_mcp_servers" },
    git: { command: "git_status", args: { cwd: "" } },
    "archived-tasks": { command: "list_sessions", args: { archived: true } },
  };
  const backend = backendTab[id];
  return (
    <BackendSettingsTab
      id={id}
      title={title}
      command={backend?.command}
      args={backend?.args}
    />
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
              <div className="settings-group-head">
                {label(group.labelKey, group.id)}
              </div>
              {group.children.map((tab) => {
                const ported = PORTED_TABS.has(tab.id);
                return (
                  <button
                    className={`settings-link${tab.id === activeId ? " is-active" : ""}${
                      ported ? "" : " is-pending"
                    }`}
                    key={tab.id}
                    type="button"
                    data-link={tab.id}
                    aria-current={tab.id === activeId ? "page" : undefined}
                    title={ported ? undefined : "Not migrated yet"}
                    onClick={() => navigate("settings", tab.id)}
                  >
                    <span className="settings-link-icon">
                      <SettingsIcon name={tab.icon} />
                    </span>
                    <span className="settings-link-label">
                      {label(tab.labelKey, tab.id)}
                    </span>
                  </button>
                );
              })}
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
