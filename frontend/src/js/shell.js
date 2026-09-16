// Titlebar menu, user menu, window controls, brand, sidebar wiring.

import { navigate } from "./router.js";
import { t } from "./i18n.js";

// Menu structure: action + i18n key. Labels resolved at render time.
const MENUS = {
  file: [
    [
      { action: "new-window", key: "menu.newWindow", keys: ["Ctrl", "Shift", "N"] },
      { action: "new-task", key: "menu.newTask", keys: ["Ctrl", "N"] },
      { action: "new-projectless-task", key: "menu.newProjectlessTask", keys: ["Ctrl", "Alt", "O"] },
    ],
    [{ action: "open-folder", key: "menu.openFolder", keys: ["Ctrl", "O"] }],
    [{ action: "close", key: "menu.close", keys: ["Ctrl", "W"] }],
    [{ action: "settings", key: "menu.settings", keys: ["Ctrl", ","] }],
    [
      { action: "logout", key: "menu.logout", keys: [] },
      { action: "exit", key: "menu.exit", keys: ["Ctrl", "Q"] },
    ],
  ],
  edit: [
    [
      { action: "undo", key: "menu.undo", keys: ["Ctrl", "Z"] },
      { action: "redo", key: "menu.redo", keys: ["Ctrl", "Y"] },
    ],
    [
      { action: "cut", key: "menu.cut", keys: ["Ctrl", "X"] },
      { action: "copy", key: "menu.copy", keys: ["Ctrl", "C"] },
      { action: "paste", key: "menu.paste", keys: ["Ctrl", "V"] },
      { action: "delete", key: "menu.delete", keys: [] },
    ],
    [{ action: "select-all", key: "menu.selectAll", keys: ["Ctrl", "A"] }],
  ],
  view: [
    [
      { action: "toggle-sidebar", key: "menu.toggleSidebar", keys: ["Ctrl", "B"] },
      { action: "toggle-bottom-panel", key: "menu.toggleBottomPanel", keys: ["Ctrl", "J"] },
      { action: "toggle-pinned-summary", key: "menu.togglePinnedSummary", keys: [] },
    ],
    [
      { action: "open-terminal", key: "menu.openTerminal", keys: ["Ctrl", "`"] },
      { action: "toggle-file-tree", key: "menu.toggleFileTree", keys: ["Ctrl", "Shift", "E"] },
      { action: "toggle-side-panel", key: "menu.toggleSidePanel", keys: ["Ctrl", "Alt", "B"] },
    ],
    [
      { action: "open-browser-tab", key: "menu.openBrowserTab", keys: ["Ctrl", "T"] },
      { action: "focus-browser-address", key: "menu.focusBrowserAddress", keys: [] },
      { action: "reload-browser", key: "menu.reloadBrowser", keys: ["Ctrl", "R"] },
    ],
    [{ action: "find", key: "menu.find", keys: ["Ctrl", "F"] }],
    [
      { action: "previous-task", key: "menu.previousTask", keys: ["Ctrl", "Shift", "["] },
      { action: "next-task", key: "menu.nextTask", keys: ["Ctrl", "Shift", "]"] },
      { action: "back", key: "menu.back", keys: ["Ctrl", "["] },
      { action: "forward", key: "menu.forward", keys: ["Ctrl", "]"] },
    ],
    [
      { action: "zoom-in", key: "menu.zoomIn", keys: ["Ctrl", "Shift", "="] },
      { action: "zoom-out", key: "menu.zoomOut", keys: ["Ctrl", "-"] },
      { action: "actual-size", key: "menu.actualSize", keys: ["Ctrl", "0"] },
    ],
    [{ action: "toggle-fullscreen", key: "menu.toggleFullscreen", keys: ["F11"] }],
  ],
  help: [
    [
      { action: "documentation", key: "menu.documentation", keys: [] },
      { action: "keyboard-shortcuts", key: "menu.keyboardShortcuts", keys: ["Ctrl", "Shift", "/"] },
      { action: "whats-new", key: "menu.whatsNew", keys: [] },
    ],
    [
      { action: "troubleshooting", key: "menu.troubleshooting", keys: [] },
      { action: "system-status", key: "menu.systemStatus", keys: [] },
      { action: "send-feedback", key: "menu.sendFeedback", keys: [] },
    ],
    [{ action: "performance-trace", key: "menu.performanceTrace", keys: [] }],
    [{ action: "about", key: "menu.about", keys: [] }],
  ],
};

function panelTemplate(menu, name) {
  const wrap = document.createElement("div");
  wrap.className = "desktop-menu-panel";
  wrap.dataset.menuPanel = name;
  wrap.hidden = true;
  for (const group of menu) {
    for (const it of group) {
      const b = document.createElement("button");
      b.className = "desktop-menu-item";
      b.dataset.action = it.action;
      b.dataset.i18nKey = it.key;
      const keys = it.keys.length ? `<kbd>${it.keys.join("+")}</kbd>` : `<kbd></kbd>`;
      b.innerHTML = `<span class="menu-label">${t(it.key)}</span>${keys}`;
      wrap.appendChild(b);
    }
    const sep = document.createElement("div");
    sep.className = "desktop-menu-separator";
    wrap.appendChild(sep);
  }
  if (wrap.lastChild) wrap.removeChild(wrap.lastChild);
  return wrap;
}

function relabelMenus() {
  document.querySelectorAll(".desktop-menu-panel .desktop-menu-item[data-i18n-key]").forEach((el) => {
    const label = el.querySelector(".menu-label");
    if (label) label.textContent = t(el.dataset.i18nKey);
  });
}

export function initShell() {
  const bar = document.querySelector(".desktop-menu-bar");
  if (bar) {
    // drop old panels if re-init
    document.querySelectorAll(".desktop-menu-panel[data-menu-panel]").forEach((p) => {
      if (p.dataset.menuPanel !== "user") p.remove();
    });
    Object.entries(MENUS).forEach(([name, menu]) => {
      const panel = panelTemplate(menu, name);
      document.body.appendChild(panel);
    });
  }
  // user menu panel removed — official layout uses Settings + Help in sidebar foot

  // open/close desktop menus
  let openMenu = null;
  function closeMenus() {
    document.querySelectorAll(".desktop-menu-panel").forEach((p) => (p.hidden = true));
    openMenu = null;
  }
  document.querySelectorAll(".desktop-menu-trigger").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const name = btn.dataset.menu;
      const panel = document.querySelector(`.desktop-menu-panel[data-menu-panel="${name}"]`);
      if (!panel) return;
      const wasOpen = !panel.hidden;
      closeMenus();
      if (wasOpen) return;
      const rect = btn.getBoundingClientRect();
      panel.style.left = `${Math.round(rect.left)}px`;
      panel.style.top = `${Math.round(rect.bottom + 2)}px`;
      panel.hidden = false;
      openMenu = name;
    });
  });
  document.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".desktop-menu-panel, .desktop-menu-trigger")) return;
    closeMenus();
  });

  document.querySelectorAll(".desktop-menu-panel .desktop-menu-item").forEach((item) => {
    item.addEventListener("click", () => {
      handleAction(item.dataset.action);
      closeMenus();
    });
  });

  // user menu removed — official layout uses Settings + Help in sidebar foot

  // window controls if present
  document.getElementById("window-minimise")?.addEventListener("click", () => {
    window.runtime?.WindowMinimise?.();
  });
  document.getElementById("window-maximise")?.addEventListener("click", async () => {
    try {
      const max = await window.runtime?.WindowIsMaximised?.();
      if (max) await window.runtime?.WindowUnmaximise?.();
      else await window.runtime?.WindowMaximise?.();
    } catch { /* ignore */ }
  });
  document.getElementById("window-close")?.addEventListener("click", () => {
    window.runtime?.Quit?.();
  });

  document.addEventListener("codex:language-applied", relabelMenus);
}

function handleAction(action) {
  switch (action) {
    case "new-task":
    case "new-projectless-task":
      navigate("home");
      break;
    case "settings":
    case "keyboard-shortcuts":
      navigate("settings", action === "keyboard-shortcuts" ? "shortcuts" : "general");
      break;
    case "show-pet":
      navigate("settings", "pets");
      break;
    case "open-folder":
      document.getElementById("btn-add-project")?.click();
      break;
    case "toggle-sidebar":
      document.getElementById("sidebar")?.classList.toggle("is-collapsed");
      break;
    case "exit":
      window.runtime?.Quit?.();
      break;
    case "logout":
      // local-only app: open account/providers
      navigate("settings", "account");
      break;
    case "about":
      navigate("settings", "general");
      break;
    default:
      break;
  }
}
