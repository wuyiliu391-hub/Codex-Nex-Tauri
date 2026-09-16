// Titlebar navigation, window controls, native menu event bridge, sidebar wiring.

import { navigate } from "./router.js";
import { iconSvg } from "./icons.js";

// ── Native menu event listener ──────────────────────────────────────────────
// Listens for `menu` events emitted by Rust (src-tauri/src/menu.rs) and
// dispatches the matching action through handleAction.

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

// ── Init ────────────────────────────────────────────────────────────────────

export function initShell() {
  // Wire titlebar-sidebar button and stamp Lucide-style glyphs.
  const sidebarBtn = document.getElementById("titlebar-sidebar");
  sidebarBtn?.addEventListener("click", toggleSidebar);
  if (sidebarBtn && !sidebarBtn.querySelector("svg")) {
    sidebarBtn.innerHTML = iconSvg("panel-left", 15);
  }

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

  // Native Tauri menu events (File/Edit/View/Help).
  initNativeMenuListener();
}
