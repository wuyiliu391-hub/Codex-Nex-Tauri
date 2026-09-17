/**
 * Global shortcut dispatcher. Replaces installShortcutDispatcher() from
 * shortcuts.js.
 *
 * Bindings are data (id / label / keys), so the settings page can edit them
 * without touching this file. Typing in a field suppresses plain-key shortcuts
 * but still lets modified ones through, which is the behaviour the vanilla
 * dispatcher had.
 */

import { useEffect, useRef } from "react";

export interface ShortcutBinding {
  id: string;
  label: string;
  keys: string[];
}

export interface ShortcutConflict {
  keys: string;
  ids: string[];
}

/** Modifier order used for both normalisation and display. */
const MODIFIER_ORDER = ["Ctrl", "Shift", "Alt", "Meta"] as const;

/** Keys that keep working while a text field has focus. */
const ALWAYS_ALLOWED = new Set(["Escape", "Enter", "Tab"]);

/** Normalise `event.key` to the label used in bindings. */
function normalizeMainKey(key: string): string {
  if (key === " ") return "Space";
  if (key === "Escape") return "Esc";
  if (key === "ArrowUp") return "Up";
  if (key === "ArrowDown") return "Down";
  if (key === "ArrowLeft") return "Left";
  if (key === "ArrowRight") return "Right";
  if (key.length === 1) return key.toUpperCase();
  return key;
}

/** Turn a KeyboardEvent into the app's key-list format. */
export function normalizeKey(e: KeyboardEvent): string[] {
  const keys: string[] = [];
  if (e.ctrlKey) keys.push("Ctrl");
  if (e.shiftKey) keys.push("Shift");
  if (e.altKey) keys.push("Alt");
  if (e.metaKey) keys.push("Meta");
  keys.push(normalizeMainKey(e.key));
  return keys;
}

export function sameKeys(a: readonly string[] = [], b: readonly string[] = []): boolean {
  if (a.length !== b.length) return false;
  return a.every((k, i) => k === b[i]);
}

/** Report bindings that share the same key combination. */
export function findConflicts(bindings: ShortcutBinding[]): ShortcutConflict[] {
  const seen = new Map<string, string[]>();
  for (const binding of bindings ?? []) {
    if (!Array.isArray(binding.keys) || !binding.keys.length) continue;
    const key = binding.keys.join("+");
    const ids = seen.get(key) ?? [];
    ids.push(binding.id);
    seen.set(key, ids);
  }
  const conflicts: ShortcutConflict[] = [];
  for (const [keys, ids] of seen) {
    if (ids.length > 1) conflicts.push({ keys, ids });
  }
  return conflicts;
}

/** True when the event originated in a text-entry surface. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/**
 * Install the global keydown listener. `dispatch` is called with the binding id
 * of the first match.
 */
export function useShortcutDispatcher(
  bindings: ShortcutBinding[],
  dispatch: (id: string) => void,
): void {
  // Keep the latest values without re-registering the listener on every render.
  const bindingsRef = useRef(bindings);
  const dispatchRef = useRef(dispatch);
  bindingsRef.current = bindings;
  dispatchRef.current = dispatch;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const hasModifier = e.ctrlKey || e.metaKey || e.altKey;
      if (isTypingTarget(e.target) && !ALWAYS_ALLOWED.has(e.key) && !hasModifier) return;

      const pressed = normalizeKey(e);
      const match = bindingsRef.current.find((b) => sameKeys(b.keys, pressed));
      if (!match) return;

      e.preventDefault();
      dispatchRef.current(match.id);
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
}

/** Render a binding's keys for display. */
export function formatKeys(keys: readonly string[]): string {
  return [...keys].sort((a, b) => {
    const ai = MODIFIER_ORDER.indexOf(a as (typeof MODIFIER_ORDER)[number]);
    const bi = MODIFIER_ORDER.indexOf(b as (typeof MODIFIER_ORDER)[number]);
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  }).join("+");
}
