/**
 * Apply appearance preferences to the document root.
 *
 * This is the React replacement for bootstrap.js's `applyTheme` +
 * `applyAppearanceVars` + `applyChromeFromSettings`. Without it, every control
 * on the Appearance settings page writes a preference that nothing consumes —
 * which is why the React port "looked wrong" no matter what the user picked:
 *
 *   - theme toggled no html.theme-dark / .theme-light class
 *   - font-size never rescaled the --text-* ladder
 *   - custom UI/code fonts never reached --font-sans / --font-mono
 *   - accent, sidebar style, contrast, motion, cursor, diff-marker datasets
 *     were never set, so all the html[data-*] rules stayed at their defaults
 *
 * Kept imperative (not React state) because it mutates documentElement, exactly
 * as the vanilla layer did.
 */

import { getPrefSection, subscribe } from "./preferencesStore";

interface AppearancePrefs {
  theme?: string;
  uiFontFamily?: string;
  codeFontFamily?: string;
  uiFontSize?: number;
  codeFontSize?: number;
  accent?: string;
  sidebarStyle?: string;
  contrast?: string;
  reduceMotion?: boolean | string;
  pointerCursors?: boolean;
  diffMarkers?: boolean | string;
}

/** Base body size the type ladder is scaled against (official default 15px). */
const BASE_FONT_PX = 15;

export function applyTheme(theme: string | undefined): void {
  const html = document.documentElement;
  html.classList.remove("theme-dark", "theme-light");
  const chosen = theme || "system";
  if (chosen === "system") {
    const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    html.classList.add(prefersDark ? "theme-dark" : "theme-light");
  } else {
    html.classList.add(chosen === "dark" ? "theme-dark" : "theme-light");
  }
}

/** Rescale the whole type ladder proportionally — never overwrite --text-base alone. */
function applyTypeScale(uiFontSize: number | undefined, codeFontSize: number | undefined): void {
  const root = document.documentElement;
  const base = Math.max(12, Math.min(18, Number(uiFontSize) || BASE_FONT_PX));
  const scale = base / BASE_FONT_PX;
  root.style.setProperty("--text-2xs", `${(11 * scale).toFixed(2)}px`);
  root.style.setProperty("--text-xs", `${(12 * scale).toFixed(2)}px`);
  root.style.setProperty("--text-sm", `${(13 * scale).toFixed(2)}px`);
  root.style.setProperty("--text-md", `${(14 * scale).toFixed(2)}px`);
  root.style.setProperty("--text-base", `${base}px`);
  root.style.setProperty("--text-lg", `${(16 * scale).toFixed(2)}px`);
  root.style.setProperty("--text-heading-sm", `${(17 * scale).toFixed(2)}px`);
  root.style.setProperty("--text-heading-md", `${(20 * scale).toFixed(2)}px`);
  root.style.setProperty("--text-heading-lg", `${(23 * scale).toFixed(2)}px`);
  const code = Math.max(10, Math.min(16, Number(codeFontSize) || 13));
  root.style.setProperty("--text-code", `${code}px`);
}

export function applyAppearanceVars(a: AppearancePrefs = {}): void {
  const root = document.documentElement;

  if (a.uiFontFamily && !["OpenAI Sans", "Segoe UI Variable"].includes(a.uiFontFamily)) {
    root.style.setProperty(
      "--font-sans",
      `"${a.uiFontFamily}", "Segoe UI Variable", "Segoe UI", "Microsoft YaHei", system-ui, sans-serif`,
    );
  } else {
    root.style.removeProperty("--font-sans");
  }
  if (a.codeFontFamily && a.codeFontFamily !== "Carlito") {
    root.style.setProperty("--font-mono", `"${a.codeFontFamily}", Carlito, Consolas, monospace`);
  } else {
    root.style.removeProperty("--font-mono");
  }

  applyTypeScale(a.uiFontSize, a.codeFontSize);

  if (a.accent) root.style.setProperty("--accent", a.accent === "blue" ? "#0285FF" : a.accent);

  // Sidebar background style only — layout/components untouched.
  let sb = a.sidebarStyle || "default";
  if (["lavender", "sky", "mint", "dusk"].includes(sb)) sb = "classic";
  if (sb && sb !== "default") root.dataset.sidebarStyle = sb;
  else delete root.dataset.sidebarStyle;

  if (a.contrast === "more") root.dataset.contrast = "more";
  else delete root.dataset.contrast;

  if (a.reduceMotion === true || a.reduceMotion === "on") root.dataset.reduceMotion = "true";
  else delete root.dataset.reduceMotion;

  if (a.pointerCursors === false) root.dataset.pointerCursors = "off";
  else delete root.dataset.pointerCursors;

  if (a.diffMarkers === false || a.diffMarkers === "plusminus") root.dataset.diffMarkers = "off";
  else delete root.dataset.diffMarkers;
}

/**
 * Wire appearance to the document and keep it in sync.
 * Returns a teardown function (not used today, but keeps this testable).
 */
export function startAppearance(): () => void {
  const apply = (): void => {
    const a = getPrefSection<AppearancePrefs>("appearance");
    applyTheme(a.theme);
    applyAppearanceVars(a);
  };

  apply();

  // Re-apply whenever any preference section changes (the store commits a new
  // object each save, so a plain subscribe is enough).
  const unsub = subscribe(apply);

  // Follow the OS theme while "system" is selected.
  const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
  const onSystemTheme = (): void => {
    if ((getPrefSection<AppearancePrefs>("appearance").theme || "system") === "system") apply();
  };
  mq?.addEventListener?.("change", onSystemTheme);

  return () => {
    unsub();
    mq?.removeEventListener?.("change", onSystemTheme);
  };
}
