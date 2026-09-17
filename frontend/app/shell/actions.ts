/**
 * Shell action dispatcher.
 *
 * Ported from shell.js `handleAction`. Differences from the vanilla version:
 *   - window control uses @tauri-apps/api/window instead of the Wails
 *     `window.runtime` shim
 *   - navigation goes through an injected context rather than
 *     `document.getElementById(...).click()` chains
 *   - `document.execCommand` is kept only for the native clipboard verbs, where
 *     it is still the only API that reaches the OS clipboard from a menu
 *     (documented as deprecated but not yet replaceable for this use)
 */

import { invoke } from "@tauri-apps/api/core";

/** Capabilities the dispatcher needs from the React shell. */
export interface ShellContext {
  /** Navigate to a top-level view, optionally with a sub-page. */
  navigate: (view: string, sub?: string) => void;
  toggleSidebar: () => void;
  focusComposer: () => void;
  /** Ask the host to open the project picker. */
  addProject: () => void;
  /** Cycle the recent-task list. */
  stepTask: (direction: 1 | -1) => void;
}

/** Open a URL with the OS default handler via tauri-plugin-shell. */
export async function openExternal(url: string): Promise<void> {
  try {
    await invoke("plugin:shell|open", { path: url });
  } catch (err) {
    console.error("[shell] openExternal failed", url, err);
  }
}

async function windowCall(method: "minimize" | "toggleMaximize" | "close"): Promise<void> {
  try {
    await invoke(`plugin:window|${method === "toggleMaximize" ? "toggle_maximize" : method}`, {
      label: "main",
    });
  } catch (err) {
    console.error(`[shell] window.${method} failed`, err);
  }
}

function setZoom(delta: number | "reset"): void {
  const root = document.documentElement;
  const current = Number(root.style.zoom) || 1;
  const next = delta === "reset" ? 1 : Math.min(1.5, Math.max(0.7, current + delta));
  root.style.zoom = String(next);
}

/** Execute a menu / shortcut action. Unknown actions are ignored on purpose. */
export function dispatchAction(action: string, ctx: ShellContext): void {
  switch (action) {
    case "new-task":
    case "new-projectless-task":
      ctx.navigate("home");
      break;

    case "settings":
    case "about":
      ctx.navigate("settings", "general");
      break;

    case "keyboard-shortcuts":
      ctx.navigate("settings", "shortcuts");
      break;

    case "logout":
      ctx.navigate("settings", "account");
      break;

    case "show-pet":
      ctx.navigate("settings", "pets");
      break;

    case "open-folder":
      ctx.addProject();
      break;

    case "toggle-sidebar":
      ctx.toggleSidebar();
      break;

    // Clipboard verbs: execCommand is the only path to the OS clipboard here.
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

    case "minimise":
      void windowCall("minimize");
      break;

    case "maximise":
      void windowCall("toggleMaximize");
      break;

    case "close":
    case "exit":
      void windowCall("close");
      break;

    case "new-window":
      // Officially opens a second window; the shell has no multi-window support
      // yet, so this deliberately does nothing rather than minimising.
      console.info("[shell] new-window is not supported yet");
      break;

    case "find":
      ctx.focusComposer();
      break;

    case "open-terminal":
      ctx.navigate("home");
      ctx.focusComposer();
      break;

    case "toggle-file-tree":
      document.body.classList.toggle("file-tree-open");
      break;

    case "toggle-bottom-panel":
      document.body.classList.toggle("bottom-panel-hidden");
      break;

    case "previous-task":
      ctx.stepTask(-1);
      break;
    case "next-task":
      ctx.stepTask(1);
      break;

    case "documentation":
      void openExternal("https://developers.openai.com/codex");
      break;
    case "whats-new":
      void openExternal("https://developers.openai.com/codex/changelog");
      break;
    case "troubleshooting":
      void openExternal("https://developers.openai.com/codex/troubleshooting");
      break;
    case "system-status":
      void openExternal("https://status.openai.com");
      break;
    case "send-feedback":
      void openExternal("https://github.com/openai/codex/issues");
      break;

    case "zoom-in":
      setZoom(0.1);
      break;
    case "zoom-out":
      setZoom(-0.1);
      break;
    case "actual-size":
      setZoom("reset");
      break;

    case "toggle-fullscreen":
      if (!document.fullscreenElement) void document.documentElement.requestFullscreen?.();
      else void document.exitFullscreen?.();
      break;

    default:
      break;
  }
}
