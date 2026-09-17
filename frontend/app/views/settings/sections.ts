/**
 * Settings navigation tree.
 *
 * Four groups / nineteen tabs, mirroring the official settings sidebar. Kept as
 * data so the sidebar, the router and the page-title lookup all read the same
 * source — the vanilla version had `sectionsDef()` plus a separate
 * `pageLabel()` walk over it.
 */

export interface SettingsTab {
  id: string;
  /** i18n key under `settings.*`. */
  labelKey: string;
  icon: SettingsIconName;
}

export interface SettingsGroup {
  id: string;
  labelKey: string;
  children: SettingsTab[];
}

export type SettingsIconName =
  | "general"
  | "import"
  | "appearance"
  | "voice"
  | "configuration"
  | "personalization"
  | "pets"
  | "shortcuts"
  | "account"
  | "computer"
  | "appshot"
  | "plugins"
  | "browser"
  | "hooks"
  | "connections"
  | "git"
  | "environments"
  | "worktrees"
  | "archived";

export const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    id: "personal",
    labelKey: "settings.group.personal",
    children: [
      { id: "general", labelKey: "settings.general", icon: "general" },
      { id: "import", labelKey: "settings.import", icon: "import" },
      { id: "appearance", labelKey: "settings.appearance", icon: "appearance" },
      { id: "voice", labelKey: "settings.voice", icon: "voice" },
      { id: "configuration", labelKey: "settings.configuration", icon: "configuration" },
      { id: "personalization", labelKey: "settings.personalization", icon: "personalization" },
      { id: "pets", labelKey: "settings.pets", icon: "pets" },
      { id: "shortcuts", labelKey: "settings.shortcuts", icon: "shortcuts" },
      { id: "account", labelKey: "settings.account", icon: "account" },
    ],
  },
  {
    id: "integrations",
    labelKey: "settings.group.integrations",
    children: [
      { id: "computer-use", labelKey: "settings.computer", icon: "computer" },
      { id: "appshot", labelKey: "settings.appshot", icon: "appshot" },
      { id: "plugins", labelKey: "settings.plugins", icon: "plugins" },
      { id: "browser", labelKey: "settings.browser", icon: "browser" },
    ],
  },
  {
    id: "coding",
    labelKey: "settings.group.coding",
    children: [
      { id: "hooks", labelKey: "settings.hooks", icon: "hooks" },
      { id: "connections", labelKey: "settings.connections", icon: "connections" },
      { id: "git", labelKey: "settings.git", icon: "git" },
      { id: "environments", labelKey: "settings.environments", icon: "environments" },
      { id: "worktrees", labelKey: "settings.worktrees", icon: "worktrees" },
    ],
  },
  {
    id: "archived",
    labelKey: "settings.group.archived",
    children: [{ id: "archived-tasks", labelKey: "settings.archived", icon: "archived" }],
  },
];

/** All tab ids in sidebar order. */
export const SETTINGS_TAB_IDS: string[] = SETTINGS_GROUPS.flatMap((g) =>
  g.children.map((c) => c.id),
);

export function findTab(id: string): SettingsTab | null {
  for (const group of SETTINGS_GROUPS) {
    const tab = group.children.find((c) => c.id === id);
    if (tab) return tab;
  }
  return null;
}

/**
 * Tabs already ported to React. Anything else renders an explicit
 * "not migrated" notice rather than an empty page.
 */
export const PORTED_TABS: ReadonlySet<string> = new Set(SETTINGS_TAB_IDS);
