import { store } from "./state.js";
import { navigate } from "./router.js";

function normalizeKey(e) {
  const keys = [];
  if (e.ctrlKey) keys.push("Ctrl");
  if (e.shiftKey) keys.push("Shift");
  if (e.altKey) keys.push("Alt");
  if (e.metaKey) keys.push("Meta");
  const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  if (!["Control", "Shift", "Alt", "Meta"].includes(key)) keys.push(key === " " ? "Space" : key);
  return keys;
}

function sameKeys(a = [], b = []) {
  if (a.length !== b.length) return false;
  return a.every((k, i) => k === b[i]);
}

export function findConflicts(bindings) {
  const seen = new Map();
  const conflicts = [];
  for (const item of bindings || []) {
    const sig = (item.keys || []).join("+");
    if (!sig) continue;
    if (seen.has(sig)) conflicts.push({ a: seen.get(sig), b: item.id, keys: item.keys });
    else seen.set(sig, item.id);
  }
  return conflicts;
}

async function runAction(id) {
  const api = window.go?.main?.App;
  switch (id) {
    case "new-task":
      navigate("home");
      document.getElementById("composer-input")?.focus();
      return;
    case "open-folder":
      await api?.PickProjectFolder?.();
      await store.onRefresh?.();
      return;
    case "settings":
      navigate("settings", "general");
      return;
    case "toggle-sidebar":
      document.body.classList.toggle("sidebar-collapsed");
      return;
    case "toggle-bottom-panel":
      document.body.classList.toggle("bottom-panel-hidden");
      return;
    case "open-terminal":
      document.body.classList.add("bottom-panel-open");
      document.dispatchEvent(new CustomEvent("codex:open-terminal"));
      return;
    case "find":
      document.getElementById("settings-search-input")?.focus() || document.querySelector("input,textarea")?.focus();
      return;
    case "previous-task":
    case "back":
      history.back();
      return;
    case "next-task":
    case "forward":
      history.forward();
      return;
    case "zoom-in":
      document.documentElement.style.zoom = String(Math.min(1.5, (Number(document.documentElement.style.zoom) || 1) + 0.1));
      return;
    case "zoom-out":
      document.documentElement.style.zoom = String(Math.max(0.7, (Number(document.documentElement.style.zoom) || 1) - 0.1));
      return;
    case "actual-size":
      document.documentElement.style.zoom = "1";
      return;
    case "fullscreen":
    case "toggle-fullscreen":
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.();
      else await document.exitFullscreen?.();
      return;
    case "interrupt":
      await api?.InterruptSession?.(store.activeSessionId) || api?.Interrupt?.();
      return;
    case "approve":
      if (store.pendingApproval?.id) await api?.ResolveApproval?.(store.pendingApproval.id, true);
      return;
    case "deny":
    case "reject":
      if (store.pendingApproval?.id) await api?.ResolveApproval?.(store.pendingApproval.id, false);
      return;
    case "send":
      document.getElementById("composer-send")?.click();
      return;
    case "quit":
      window.close();
      return;
    default:
      document.dispatchEvent(new CustomEvent("codex:shortcut", { detail: { id } }));
  }
}

export function installShortcutDispatcher() {
  document.addEventListener("keydown", (e) => {
    if (e.target?.matches?.("input, textarea, [contenteditable=true]") && !["Escape", "Enter", "Tab"].includes(e.key) && !(e.ctrlKey || e.metaKey || e.altKey)) {
      return;
    }
    const pressed = normalizeKey(e);
    const match = (store.shortcuts || []).find((s) => sameKeys(s.keys || [], pressed));
    if (!match) return;
    e.preventDefault();
    runAction(match.id).catch((err) => console.error(err));
  }, true);
}
