/**
 * In-titlebar menu tree.
 *
 * The official app runs with `decorations: false`, so the OS menu bar is
 * invisible; File/Edit/View/Help are drawn inside the titlebar instead. This
 * table is the single source for both the rendered menu and the action
 * dispatcher.
 */

export interface MenuItem {
  action: string;
  /** i18n key under `menu.*`. */
  key: string;
  /** Accelerator shown on the right; also matched by the shortcut dispatcher. */
  keys?: string;
}

export interface MenuSeparator {
  sep: true;
}

export type MenuEntry = MenuItem | MenuSeparator;

export const MENU_TREE: Record<"file" | "edit" | "view" | "help", MenuEntry[]> = {
  file: [
    { action: "new-window", key: "menu.newWindow", keys: "Ctrl+Shift+N" },
    { action: "new-task", key: "menu.newTask", keys: "Ctrl+N" },
    { action: "new-projectless-task", key: "menu.newProjectlessTask", keys: "Ctrl+Alt+O" },
    { sep: true },
    { action: "open-folder", key: "menu.openFolder", keys: "Ctrl+O" },
    { sep: true },
    { action: "close", key: "menu.close", keys: "Ctrl+W" },
    { sep: true },
    { action: "settings", key: "menu.settings", keys: "Ctrl+," },
    { sep: true },
    { action: "logout", key: "menu.logout" },
    { action: "exit", key: "menu.exit", keys: "Ctrl+Q" },
  ],
  edit: [
    { action: "undo", key: "menu.undo", keys: "Ctrl+Z" },
    { action: "redo", key: "menu.redo", keys: "Ctrl+Y" },
    { sep: true },
    { action: "cut", key: "menu.cut", keys: "Ctrl+X" },
    { action: "copy", key: "menu.copy", keys: "Ctrl+C" },
    { action: "paste", key: "menu.paste", keys: "Ctrl+V" },
    { sep: true },
    { action: "delete", key: "menu.delete", keys: "Del" },
    { action: "select-all", key: "menu.selectAll", keys: "Ctrl+A" },
  ],
  view: [
    { action: "toggle-sidebar", key: "menu.toggleSidebar", keys: "Ctrl+B" },
    { action: "toggle-bottom-panel", key: "menu.toggleBottomPanel", keys: "Ctrl+J" },
    { action: "toggle-file-tree", key: "menu.toggleFileTree" },
    { sep: true },
    { action: "open-terminal", key: "menu.openTerminal", keys: "Ctrl+`" },
    { action: "find", key: "menu.find", keys: "Ctrl+F" },
    { sep: true },
    { action: "previous-task", key: "menu.previousTask" },
    { action: "next-task", key: "menu.nextTask" },
    { sep: true },
    { action: "zoom-in", key: "menu.zoomIn", keys: "Ctrl+=" },
    { action: "zoom-out", key: "menu.zoomOut", keys: "Ctrl+-" },
    { action: "actual-size", key: "menu.actualSize", keys: "Ctrl+0" },
    { sep: true },
    { action: "toggle-fullscreen", key: "menu.toggleFullscreen", keys: "F11" },
  ],
  help: [
    { action: "documentation", key: "menu.documentation" },
    { action: "whats-new", key: "menu.whatsNew" },
    { action: "keyboard-shortcuts", key: "menu.keyboardShortcuts", keys: "Ctrl+Shift+/" },
    { sep: true },
    { action: "troubleshooting", key: "menu.troubleshooting" },
    { action: "system-status", key: "menu.systemStatus" },
    { action: "send-feedback", key: "menu.sendFeedback" },
    { sep: true },
    { action: "about", key: "menu.about" },
  ],
};

export const MENU_NAMES = ["file", "edit", "view", "help"] as const;
export type MenuName = (typeof MENU_NAMES)[number];

export function isSeparator(entry: MenuEntry): entry is MenuSeparator {
  return "sep" in entry;
}
