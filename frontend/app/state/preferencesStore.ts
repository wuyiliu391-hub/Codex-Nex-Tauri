/**
 * Preferences store — the React equivalent of settings.js's
 * pref() / savePreferences() / mergePreferences() trio.
 *
 * Preferences are per-section maps (appearance, voice, browser, git, …). The
 * whole map is persisted through save_preferences; the Rust side keeps unknown
 * sections in its `extra` bag, so a section added here needs no backend change.
 *
 * Defaults are the single source of truth from src/js/state.js so the React and
 * vanilla layers cannot drift while both exist.
 */

import { useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import { defaultPreferences, mergePreferences } from "../../src/js/state.js";

export type PrefSection = Record<string, unknown>;
export type Preferences = Record<string, PrefSection>;

let state: Preferences = mergePreferences(defaultPreferences()) as Preferences;
let loaded = false;
const listeners = new Set<() => void>();

function commit(next: Preferences): void {
  state = next;
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): Preferences {
  return state;
}

/** Read the whole preferences map. */
export function usePreferences(): Preferences {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Read one section, merged over its defaults so callers can rely on keys. */
export function usePrefSection<T extends object = PrefSection>(section: string): T {
  const prefs = usePreferences();
  return (prefs[section] ?? {}) as T;
}

export function getPrefSection<T extends object = PrefSection>(section: string): T {
  return (state[section] ?? {}) as T;
}

/**
 * Load preferences from the shell store once. Safe to call repeatedly.
 * Failures are swallowed: a missing engine/shell must not blank the page.
 */
export async function loadPreferences(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await invoke<unknown>("get_preferences");
    commit(mergePreferences(raw) as Preferences);
  } catch (err) {
    console.warn("[preferences] load failed; using defaults", err);
  }
}

/**
 * Merge a patch into a section and persist the whole map.
 *
 * The local commit happens first so the UI updates immediately; the backend
 * write is awaited so callers can surface a failure if they want to.
 */
export async function saveSection(
  section: string,
  patch: PrefSection,
): Promise<void> {
  const nextSection = { ...(state[section] ?? {}), ...patch };
  const next: Preferences = { ...state, [section]: nextSection };
  commit(next);
  try {
    await invoke("save_preferences", { preferences: next });
  } catch (err) {
    console.error("[preferences] save failed", err);
  }
}

/** Fire a shell-level CustomEvent (pet changes, appearance, …). */
export function emitShellEvent(name: string, detail?: unknown): void {
  document.dispatchEvent(new CustomEvent(name, { detail }));
}
