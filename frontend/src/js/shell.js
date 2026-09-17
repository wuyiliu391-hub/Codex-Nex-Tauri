// Titlebar navigation, window controls, in-titlebar menus, sidebar wiring.

import { navigate } from "./router.js";
import { iconSvg } from "./icons.js";
import { t } from "./i18n.js";
import { store } from "./state.js";

// ── In-titlebar File/Edit/View/Help (official frameless chrome) ─────────────
// OS native menus are invisible with decorations:false; official draws them here.

// Menu tree: action id + i18n key + optional accelerator label.
const MENU_TREE = {
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

let openMenuPanel = null;

// Close any open titlebar menu panel.
function closeDesktopMenus() {
  openMenuPanel?.remove();
  openMenuPanel = null;
  document.querySelectorAll(".desktop-menu-trigger.is-open").forEach((b) => b.classList.remove("is-open"));
}

// Build and position a dropdown under the File/Edit/View/Help trigger.
function openDesktopMenu(trigger, name) {
  closeDesktopMenus();
  const items = MENU_TREE[name];
  if (!items) return;
  const panel = document.createElement("div");
  panel.className = "desktop-menu-panel";
  panel.dataset.menuPanel = name;
  for (const item of items) {
    if (item.sep) {
      const sep = document.createElement("div");
      sep.className = "desktop-menu-separator";
      panel.appendChild(sep);
      continue;
    }
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "desktop-menu-item";
    btn.innerHTML = `<span>${escapeHtmlText(t(item.key, item.key))}</span>${item.keys ? `<kbd>${escapeHtmlText(item.keys)}</kbd>` : ""}`;
    btn.addEventListener("click", () => {
      closeDesktopMenus();
      handleAction(item.action);
    });
    panel.appendChild(btn);
  }
  document.body.appendChild(panel);
  const r = trigger.getBoundingClientRect();
  panel.style.left = `${Math.round(r.left)}px`;
  panel.style.top = `${Math.round(r.bottom + 2)}px`;
  trigger.classList.add("is-open");
  openMenuPanel = panel;
}

function escapeHtmlText(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// Wire titlebar menu triggers (idempotent).
function initTitlebarMenus() {
  const bar = document.querySelector(".desktop-menu-bar");
  if (!bar || bar.dataset.wired === "1") return;
  bar.dataset.wired = "1";
  bar.querySelectorAll(".desktop-menu-trigger").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const name = btn.dataset.menu;
      if (openMenuPanel?.dataset.menuPanel === name) {
        closeDesktopMenus();
        return;
      }
      openDesktopMenu(btn, name);
    });
  });
  document.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".desktop-menu-panel, .desktop-menu-trigger")) return;
    closeDesktopMenus();
  }, true);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDesktopMenus();
  });
  // Relabel on language change
  document.addEventListener("codex:language-applied", () => {
    bar.querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = t(el.dataset.i18n, el.textContent);
    });
  });
}

// ── Native menu event listener (optional; OS menu may not show frameless) ───
// Subscribe to Tauri menu events and route them to handleAction.
function initNativeMenuListener() {
  const listen =
    window.__TAURI__?.event?.listen ||
    window.tauri?.event?.listen ||
    null;
  if (typeof listen !== "function") {
    console.warn("[shell] Tauri event.listen unavailable; native menu actions disabled");
    return;
  }
  listen("menu", (e) => {
    const id = e?.payload ?? e;
    if (typeof id === "string" && id) handleAction(id);
  }).catch((err) => console.warn("[shell] menu listen failed", err));
}

// ── Sidebar toggle ──────────────────────────────────────────────────────────

// Toggle body.sidebar-collapsed and persist via SaveSettings.
function toggleSidebar() {
  document.body.classList.toggle("sidebar-collapsed");
  const collapsed = document.body.classList.contains("sidebar-collapsed");
  const api = window.go?.main?.App;
  if (api?.SaveSettings) {
    // Merge into existing settings so we don't clobber other keys.
    api.GetSettings?.()
      .then((s) => api.SaveSettings({ ...(s || {}), sidebarCollapsed: collapsed }))
      .catch(() => {});
  }
}

// ── Action router ───────────────────────────────────────────────────────────

// Dispatch a menu / shortcut action id to the appropriate handler.
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
      toggleSidebar();
      break;
    case "undo":
      document.execCommand?.("undo");
      break;
    case "redo":
      document.execCommand?.("redo");
      break;
    case "cut":
      document.execCommand?.("cut");
      break;
    case "copy":
      document.execCommand?.("copy");
      break;
    case "paste":
      document.execCommand?.("paste");
      break;
    case "delete":
      document.execCommand?.("delete");
      break;
    case "select-all":
      document.execCommand?.("selectAll");
      break;
    case "new-window":
      window.runtime?.WindowMinimise?.();
      break;
    case "close":
      window.runtime?.Quit?.();
      break;
    case "exit":
      window.runtime?.Quit?.();
      break;
    case "logout":
      navigate("settings", "account");
      break;
    case "about":
      navigate("settings", "general");
      break;
    case "documentation":
      window.runtime?.BrowserOpenURL?.("https://developers.openai.com/codex");
      break;
    case "find": {
      const el = document.getElementById("settings-search-input") || document.querySelector("input,textarea");
      el?.focus();
      break;
    }
    case "toggle-file-tree":
      document.body.classList.toggle("file-tree-open");
      break;
    case "previous-task":
    case "next-task": {
      const rows = [...document.querySelectorAll(".task-row")];
      if (!rows.length) break;
      const cur = rows.findIndex((r) => r.classList.contains("is-active"));
      const dir = action === "next-task" ? 1 : -1;
      const next = rows[(cur + dir + rows.length) % rows.length];
      next?.click();
      break;
    }
    case "open-terminal":
      navigate("home");
      document.getElementById("composer-input")?.focus();
      break;
    case "open-browser-tab":
    case "focus-browser-address":
    case "reload-browser":
      navigate("home");
      break;
    case "toggle-bottom-panel":
      document.body.classList.toggle("bottom-panel-hidden");
      break;
    case "whats-new":
      window.runtime?.BrowserOpenURL?.("https://developers.openai.com/codex/changelog");
      break;
    case "troubleshooting":
      window.runtime?.BrowserOpenURL?.("https://developers.openai.com/codex/troubleshooting");
      break;
    case "system-status":
      window.runtime?.BrowserOpenURL?.("https://status.openai.com");
      break;
    case "send-feedback":
      window.runtime?.BrowserOpenURL?.("https://github.com/openai/codex/issues");
      break;
    case "performance-trace":
      console.info("[shell] performance-trace: use startup log / browser devtools");
      break;
    case "zoom-in":
      document.documentElement.style.zoom = String(
        Math.min(1.5, (Number(document.documentElement.style.zoom) || 1) + 0.1),
      );
      break;
    case "zoom-out":
      document.documentElement.style.zoom = String(
        Math.max(0.7, (Number(document.documentElement.style.zoom) || 1) - 0.1),
      );
      break;
    case "actual-size":
      document.documentElement.style.zoom = "1";
      break;
    case "toggle-fullscreen":
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
      else document.exitFullscreen?.();
      break;
    default:
      break;
  }
}

// ── User Profile Popover (official T23) ─────────────────────────────────────
let openProfilePanel = null;

function closeProfileMenu() {
  openProfilePanel?.remove();
  openProfilePanel = null;
}

function openProfileMenu(trigger) {
  if (openProfilePanel) {
    closeProfileMenu();
    return;
  }
  const panel = document.createElement("div");
  panel.className = "profile-menu";
  panel.innerHTML = `
    <button class="profile-menu-item is-disabled" type="button" disabled>
      <span>${escapeHtmlText(t("user.loggedIn", "已通过 API 密钥登录"))}</span>
    </button>
    <div class="profile-menu-divider"></div>
    <button class="profile-menu-item" type="button" data-action="show-pet">
      <span>${escapeHtmlText(t("user.showPet", "显示宠物"))}</span>
      <kbd>Alt+Win+P</kbd>
    </button>
    <button class="profile-menu-item" type="button" data-action="settings">
      <span>${escapeHtmlText(t("user.settings", "设置"))}</span>
      <kbd>Ctrl+,</kbd>
    </button>
    <div class="profile-menu-divider"></div>
    <button class="profile-menu-item" type="button" data-action="logout">
      <span>${escapeHtmlText(t("user.logout", "退出登录"))}</span>
    </button>
  `;
  panel.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.action;
      closeProfileMenu();
      handleAction(action);
    });
  });
  document.body.appendChild(panel);
  const r = trigger.getBoundingClientRect();
  panel.style.left = `${Math.round(r.left)}px`;
  panel.style.bottom = `${Math.round(window.innerHeight - r.top + 6)}px`;
  openProfilePanel = panel;
}

export function updateSidebarProfile() {
  const el = document.getElementById("sidebar-profile-name");
  if (!el) return;
  const activeId = store.settings?.activeProviderId;
  const provider = (store.providers || []).find((p) => p.id === activeId);
  el.textContent = provider?.name || activeId || "Codex";
}

// ── Init ────────────────────────────────────────────────────────────────────

export function initShell() {
  // Wire titlebar-sidebar button and stamp Lucide-style glyphs.
  const sidebarBtn = document.getElementById("titlebar-sidebar");
  sidebarBtn?.addEventListener("click", toggleSidebar);
  if (sidebarBtn && !sidebarBtn.querySelector("svg")) {
    sidebarBtn.innerHTML = iconSvg("panel-left", 15);
  }

  // In-titlebar File/Edit/View/Help (visible on frameless Windows).
  initTitlebarMenus();

  // Restore sidebar state from persisted settings.
  const api = window.go?.main?.App;
  api?.GetSettings?.()
    .then((s) => {
      if (s?.sidebarCollapsed) document.body.classList.add("sidebar-collapsed");
    })
    .catch(() => {});

  // Window controls if present.
  document.getElementById("window-minimise")?.addEventListener("click", () => {
    window.runtime?.WindowMinimise?.();
  });
  document.getElementById("window-maximise")?.addEventListener("click", async () => {
    try {
      await window.runtime?.WindowToggleMaximise?.();
    } catch { /* ignore */ }
  });
  document.getElementById("window-close")?.addEventListener("click", () => {
    window.runtime?.Quit?.();
  });

  // Profile menu in sidebar footer.
  const profileBtn = document.getElementById("sidebar-profile-btn");
  profileBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    openProfileMenu(profileBtn);
  });
  document.addEventListener("pointerdown", (e) => {
    if (openProfilePanel && !e.target.closest(".profile-menu, #sidebar-profile-btn")) {
      closeProfileMenu();
    }
  }, true);

  // Notifications button in sidebar brand.
  document.getElementById("btn-notifications")?.addEventListener("click", () => {
    navigate("settings", "general");
  });

  // Help button in sidebar footer.
  document.getElementById("sidebar-help")?.addEventListener("click", () => {
    window.runtime?.BrowserOpenURL?.("https://developers.openai.com/codex");
  });

  // Brand dropdown button in sidebar header.
  document.getElementById("brand-menu-btn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    profileBtn?.click();
  });

  // Native Tauri menu events (File/Edit/View/Help).
  initNativeMenuListener();

  // Initial sync of profile label.
  updateSidebarProfile();
  document.addEventListener("codex:refresh", updateSidebarProfile);
}
