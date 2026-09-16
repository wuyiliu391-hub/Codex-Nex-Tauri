// Bootstrap: wire up state, router, shell, home, settings, and discovery.

import { installBridge } from "./bridge.js";
import { store, mergeSettings, mergePreferences } from "./state.js";
import { initRouter, applyHash } from "./router.js";
import { initShell } from "./shell.js";
import { mountHome, renderProjectList, renderTaskList } from "./home.js";
import { mountScheduled, mountPlugins, mountPullRequests } from "./discovery.js";
import { mountSettings } from "./settings.js";
import { wireAgentEvents } from "./agent-events.js";
import { applyLanguage } from "./i18n.js";
import { installShortcutDispatcher } from "./shortcuts.js";
import { renderPetOverlay, petOnAgentPhase } from "./pet.js";
import { liveTurn } from "./live-turn.js";

// Install Wails→Tauri bridge BEFORE any goAPI() use.
installBridge();

function goAPI() { return window.go?.main?.App; }

let splashHidden = false;
function hideSplash() {
  if (splashHidden) return;
  splashHidden = true;
  if (window.__codexSplashFailSafe) { clearTimeout(window.__codexSplashFailSafe); window.__codexSplashFailSafe = null; }
  const loader = document.getElementById("startup-loader");
  document.body.classList.remove("is-booting");
  if (!loader) return;
  void loader.offsetWidth; // force reflow so the transition starts from current value
  loader.classList.add("is-hidden");
  const onEnd = (e) => { if (e.target !== loader) return; loader.remove(); };
  loader.addEventListener("transitionend", onEnd);
  // Fallback: force-hide after the transition duration + buffer.
  setTimeout(() => { if (loader.parentNode) { loader.style.display = "none"; loader.remove(); } }, 500);
}
const startupStartedAt = performance.now();

function bootLog(...args) {
  const msg = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
  const time = new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const line = `[${time}] ${msg}`;
  console.log(...args);
  const el = document.getElementById("startup-log");
  if (!el) return;
  el.textContent += (el.textContent ? "\n" : "") + line;
  el.classList.add("is-visible");
}

window.onerror = (message, source, lineno, colno, err) => {
  bootLog("ERROR:", message, "at", source, lineno + ":" + colno, err);
};
window.addEventListener("unhandledrejection", (e) => {
  bootLog("UNHANDLED REJECTION:", e.reason);
});

let hasBooted = false;

async function refreshState() {
  bootLog("refreshState() start");
  const api = goAPI();
  if (!api) return null;
  try {
    const previousActiveId = store.activeSessionId;
    const snap = await api.GetState();
    store.snapshot = snap || {};
    store.settings = mergeSettings(snap.settings);
    store.providers = snap.providers || store.providers;
    store.projects = snap.projects || store.projects;
    store.sessions = snap.sessions || store.sessions;
    store.preferences = mergePreferences(snap.preferences);
    if (snap.shortcuts) store.shortcuts = snap.shortcuts;
    if (snap.plugins) store.plugins = snap.plugins;
    if (snap.connections) store.connections = snap.connections;
    if (snap.scheduled) store.scheduled = snap.scheduled;
    if (snap.pets) store.pets = snap.pets;
    store.dependencies = snap.dependencies || [];
    store.hooks = snap.hooks || [];
    store.mcpServers = snap.mcpServers || [];
    store.sitePermissions = snap.sitePermissions || [];
    store.worktrees = snap.worktrees || [];
    store.notifications = snap.notifications || [];
    store.memory = snap.memory || [];
    store.archived = (snap.sessions || []).filter((s) => s.archived);

    // First boot always opens the blank home guide (never restore last session).
    // Later refreshes keep the currently open conversation so history view stays intact.
    if (!hasBooted) {
      store.activeSessionId = null;
      store.activeSession = null;
      store.running = false;
    } else if (previousActiveId) {
      const next = (store.sessions || []).find((s) => s.id === previousActiveId) || null;
      store.activeSessionId = next?.id || null;
      store.activeSession = next;
      store.running = next?.runtime?.status === "running";
      /* sync running from runtime */
      if (!store.running && liveTurn.active) {
        liveTurn.active = false;
        liveTurn.phase = next?.runtime?.status || "completed";
      }
      // Prefer full message payload when available from backend.
      if (next?.id && (!next.messages || !next.messages.length)) {
        try {
          const full = await api.GetSession?.(next.id);
          if (full?.id) {
            const idx = store.sessions.findIndex((s) => s.id === full.id);
            if (idx >= 0) store.sessions[idx] = full;
            else store.sessions.unshift(full);
            store.activeSession = full;
          }
        } catch { /* keep summary session */ }
      }
    } else {
      store.activeSessionId = null;
      store.activeSession = null;
      store.running = false;
    }
    bootLog('refreshState() ok, sessions:', (snap.sessions || []).length);
    return snap;
  } catch (e) {
    bootLog('GetState failed:', e?.message || e);
    console.error('GetState failed', e);
    return null;
  }
}

async function boot() {
  bootLog("boot() start");
  initShell();
  initRouter();

  document.getElementById("nav-new")?.addEventListener("click", () => location.hash = "home");
  document.querySelectorAll(".nav-item[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const view = btn.dataset.view;
      location.hash = view === "settings" ? "settings/general" : view;
    });
  });

  await refreshState();
  bootLog('state ready, hasBooted=true');
  hasBooted = true;
  applyTheme(store.preferences.appearance.theme || "light");
  applyAppearanceVars();
  applyChromeFromSettings();
  watchSystemTheme();
  document.addEventListener("codex:language", () => applyLanguage());
  document.addEventListener("codex:appearance", () => {
    applyTheme(store.preferences.appearance.theme || "light");
    applyAppearanceVars();
  });
  document.addEventListener("codex:refresh", () => applyChromeFromSettings());

  store.onRefresh = async () => {
    await refreshState();
    applyChromeFromSettings();
    document.dispatchEvent(new CustomEvent("codex:refresh"));
  };

  // If no project exists yet, the composer project pill shows a prompt to add
  // one via the native directory picker (see home.js addProjectViaDialog).

  bootLog('mounting views...');
  mountHome();
  mountScheduled();
  mountPlugins();
  mountPullRequests();
  await mountSettings();
  renderProjectList();
  renderTaskList();

  bootLog('wiring agent events...');
  wireAgentEvents(goAPI());

  // Ensure the initial view is rendered.
  applyHash();
  applyLanguage();
  document.dispatchEvent(new CustomEvent('codex:boot'));
  paintPet();
  bootLog('boot complete, hiding splash');

  const remaining = Math.max(0, 1100 - (performance.now() - startupStartedAt));
  if (remaining) await new Promise((resolve) => setTimeout(resolve, remaining));

  requestAnimationFrame(() => hideSplash());
}

function applyTheme(theme) {
  const html = document.documentElement;
  html.classList.remove("theme-dark", "theme-light");
  if (theme === "system") {
    const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    html.classList.add(prefersDark ? "theme-dark" : "theme-light");
  } else {
    html.classList.add(theme === "dark" ? "theme-dark" : "theme-light");
  }
}

/** Shell chrome driven by settings �?apply without remounting views. */
function applyChromeFromSettings() {
  const s = store.settings || {};
  document.body.classList.toggle("bottom-panel-hidden", s.bottomPanel === false);
}

function applyAppearanceVars() {
  const a = store.preferences?.appearance || {};
  const root = document.documentElement;
  // OpenAI Sans was the old default; treat it as system UI for existing states.
  if (a.uiFontFamily && !["OpenAI Sans", "Segoe UI Variable"].includes(a.uiFontFamily)) {
    root.style.setProperty("--font-sans", `"${a.uiFontFamily}", "Segoe UI Variable", "Segoe UI", "Microsoft YaHei", system-ui, sans-serif`);
  } else {
    root.style.removeProperty("--font-sans");
  }
  if (a.codeFontFamily && a.codeFontFamily !== "Carlito") {
    root.style.setProperty("--font-mono", `"${a.codeFontFamily}", Carlito, Consolas, monospace`);
  } else {
    root.style.removeProperty("--font-mono");
  }
  // Scale entire type ladder proportionally �?do NOT overwrite --text-base alone
  // (that collapsed official hierarchy). Official default body = 15px.
  const base = Math.max(12, Math.min(18, Number(a.uiFontSize) || 15));
  const scale = base / 15;
  root.style.setProperty("--text-2xs", `${(11 * scale).toFixed(2)}px`);
  root.style.setProperty("--text-xs", `${(12 * scale).toFixed(2)}px`);
  root.style.setProperty("--text-sm", `${(13 * scale).toFixed(2)}px`);
  root.style.setProperty("--text-md", `${(14 * scale).toFixed(2)}px`);
  root.style.setProperty("--text-base", `${base}px`);
  root.style.setProperty("--text-lg", `${(16 * scale).toFixed(2)}px`);
  root.style.setProperty("--text-heading-sm", `${(17 * scale).toFixed(2)}px`);
  root.style.setProperty("--text-heading-md", `${(20 * scale).toFixed(2)}px`);
  root.style.setProperty("--text-heading-lg", `${(23 * scale).toFixed(2)}px`);
  const code = Math.max(10, Math.min(16, Number(a.codeFontSize) || 13));
  root.style.setProperty("--text-code", `${code}px`);
  if (a.accent) root.style.setProperty("--accent", a.accent === "blue" ? "#0285FF" : a.accent);
  // sidebar background style only �?layout/components untouched
  // classic = old Codex mesh; lavender/sky/mint/dusk migrate to classic
  let sb = a.sidebarStyle || "default";
  if (["lavender", "sky", "mint", "dusk"].includes(sb)) sb = "classic";
  if (sb && sb !== "default") root.dataset.sidebarStyle = sb;
  else delete root.dataset.sidebarStyle;
  if (a.contrast === "more") root.dataset.contrast = "more";
  else delete root.dataset.contrast;
  if (a.reduceMotion) root.dataset.reduceMotion = "true";
  else delete root.dataset.reduceMotion;
  if (a.pointerCursors === false) root.dataset.pointerCursors = "off";
  else delete root.dataset.pointerCursors;
  if (a.diffMarkers === false) root.dataset.diffMarkers = "off";
  else delete root.dataset.diffMarkers;
}

function watchSystemTheme() {
  if (!window.matchMedia) return;
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => {
    if ((store.preferences?.appearance?.theme || "system") === "system") applyTheme("system");
  };
  mq.addEventListener?.("change", onChange);
}


boot().catch((e) => {
  bootLog('BOOT FAILED:', e?.message || e);
  console.error('boot failed', e);
  hideSplash();
});

// Last-resort fail-safe: if boot() never completes (uncaught exception,
// hung await, etc.), force the splash away so the user is never trapped.
setTimeout(() => hideSplash(), 12000);


// Floating pet overlay (official Codex desk companion)
function paintPet() {
  renderPetOverlay(store);
}

document.addEventListener("codex:refresh", paintPet);
document.addEventListener("codex:boot", paintPet);
document.addEventListener("codex:appearance", paintPet);
document.addEventListener("codex:live-turn", () => {
  const phase = liveTurn?.phase || (store.running ? "executing_tool" : "idle");
  petOnAgentPhase(phase);
});

// Ensure pet paints after first boot
document.addEventListener("DOMContentLoaded", () => paintPet());
// Also paint once boot finishes (boot may complete after DOMContentLoaded)
setTimeout(() => paintPet(), 0);

