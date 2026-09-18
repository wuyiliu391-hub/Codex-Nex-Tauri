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

/**
 * Type-scale defaults.
 *
 * tokens.css owns the rendered ladder (--text-base: 14px, --text-sm: 12px,
 * --text-code: 13px, …). Shell prefs (src/js/state.js) ship uiFontSize=15 /
 * codeFontSize=13. Those defaults must NOT write inline --text-* overrides —
 * a 15px-based ladder remaps sm→13/base→15 and fights the CSS tokens.
 * Only write when the user customized away from the shell defaults.
 */
const TOKENS_BASE_PX = 14; // tokens.css --text-base
const SHELL_DEFAULT_UI_PX = 15; // state.js appearance.uiFontSize
const SHELL_DEFAULT_CODE_PX = 13; // state.js codeFontSize == tokens --text-code

/** tokens.css ladder units (scale 1 = CSS defaults). Includes --text-sm-ui. */
const TYPE_LADDER: ReadonlyArray<readonly [string, number]> = [
  ["--text-2xs", 11],
  ["--text-xs", 12],
  ["--text-sm", 12],
  ["--text-sm-ui", 13],
  ["--text-md", 14],
  ["--text-base", 14],
  ["--text-lg", 16],
  ["--text-heading-sm", 18],
  ["--text-heading-md", 20],
  ["--text-heading-lg", 24],
];

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

/**
 * Rescale the whole type ladder proportionally — never overwrite --text-base alone.
 * When prefs are unset or still at shell defaults, leave tokens.css in control
 * (remove any prior inline overrides). Scale custom sizes from TOKENS_BASE_PX
 * so a user size of 14 is identity and --text-sm-ui tracks the same factor.
 */
function applyTypeScale(uiFontSize: number | undefined, codeFontSize: number | undefined): void {
  const root = document.documentElement;

  const uiRaw = uiFontSize == null ? Number.NaN : Number(uiFontSize);
  const uiCustom = Number.isFinite(uiRaw) && uiRaw !== SHELL_DEFAULT_UI_PX;

  if (uiCustom) {
    const base = Math.max(12, Math.min(18, uiRaw));
    const scale = base / TOKENS_BASE_PX;
    for (const [prop, px] of TYPE_LADDER) {
      root.style.setProperty(prop, `${(px * scale).toFixed(2)}px`);
    }
  } else {
    for (const [prop] of TYPE_LADDER) {
      root.style.removeProperty(prop);
    }
  }

  const codeRaw = codeFontSize == null ? Number.NaN : Number(codeFontSize);
  const codeCustom = Number.isFinite(codeRaw) && codeRaw !== SHELL_DEFAULT_CODE_PX;
  if (codeCustom) {
    const code = Math.max(10, Math.min(16, codeRaw));
    root.style.setProperty("--text-code", `${code}px`);
  } else {
    root.style.removeProperty("--text-code");
  }
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
