#!/usr/bin/env node
/**
 * Semantic UI token extractor for official OpenAI Codex desktop CSS.
 *
 * Usage:
 *   node extract-semantic-tokens.cjs [official-assets-dir] [outDir]
 *
 * Defaults:
 *   assets: C:\Users\Administrator\Desktop\codex-asar-extract\webview\assets
 *   outDir: <this file's directory>
 *
 * Outputs:
 *   - css-vars-root.json (existing, refreshed by extract-vars.cjs optionally)
 *   - semantic-tokens.json  machine-readable semantic map
 *   - SEMANTIC_TOKENS.md    human-readable mapping + values
 *   - css-font-faces.json   @font-face families
 *   - css-layout-rules.json targeted layout rules (composer/sidebar/toolbar)
 */

const fs = require("fs");
const path = require("path");

const DEFAULT_ASSETS = "C:\\Users\\Administrator\\Desktop\\codex-asar-extract\\webview\\assets";
const assetsDir = process.argv[2] || DEFAULT_ASSETS;
const outDir = process.argv[3] || __dirname;

const CSS_FILES = [
  "app-dddf03d14541.css",
  "app-primary-42ed0a4bb496.css",
  "app-initial-a09fe9cd72bc.css",
];

/** Semantic categories we care about for Codex-Nex / Codex-Tauri parity. */
const SEMANTIC_PATTERNS = [
  // Surfaces / backgrounds
  { re: /^--color-surface(-|$)/, cat: "surface" },
  { re: /^--color-background-(primary|secondary|composer|user-message|mode-toggle|text-selection|page-search)/, cat: "surface" },
  { re: /^--color-token-main-surface/, cat: "surface" },
  { re: /^--color-token-side-bar/, cat: "surface" },
  { re: /^--app-color-background-(surface|elevated|application-menu)/, cat: "surface" },
  { re: /^--app-shell-(panel|tab)-background/, cat: "surface" },
  { re: /^--bg-elevated/, cat: "surface" },
  { re: /^--codex-diffs-surface/, cat: "surface" },

  // Text
  { re: /^--color-text(-|$)/, cat: "text" },
  { re: /^--color-token-text/, cat: "text" },
  { re: /^--app-color-text-(foreground|secondary|primary)/, cat: "text" },
  { re: /^--color-codex-description/, cat: "text" },
  { re: /^--color-codex-(icon|editor|syntax|terminal)/, cat: "text" },

  // Borders
  { re: /^--color-border(-|$)/, cat: "border" },
  { re: /^--color-token-border/, cat: "border" },
  { re: /^--app-color-border(-|$)/, cat: "border" },
  { re: /^--border-(default|heavy|light|subtle|width)/, cat: "border" },
  { re: /^--composer-attachment-border/, cat: "border" },

  // Radius
  { re: /^--radius(-|$)/, cat: "radius" },
  { re: /^--corner-radius/, cat: "radius" },
  { re: /^--codex-corner-radius/, cat: "radius" },
  { re: /rounded-token-composer/, cat: "radius-class" },
  { re: /^--avatar-overlay-native-corner-radius/, cat: "radius" },

  // Shadows / elevation
  { re: /^--shadow(-|$)/, cat: "shadow" },
  { re: /^--drop-shadow/, cat: "shadow" },
  { re: /^--elevation-/, cat: "shadow" },

  // Layout: sidebar / toolbar / composer / thread
  { re: /^--codex-sidebar/, cat: "layout" },
  { re: /^--composer-/, cat: "layout" },
  { re: /^--thread-/, cat: "layout" },
  { re: /^--height-token-/, cat: "layout" },
  { re: /^--padding-toolbar/, cat: "layout" },
  { re: /^--home-composer/, cat: "layout" },
  { re: /^--right-panel-composer/, cat: "layout" },
  { re: /^--spacing-token-(button|sidebar)/, cat: "layout" },
  { re: /^--radius-token-(composer|nav|row|empty|settings)/, cat: "layout" },
  { re: /^--app-menu-item-height/, cat: "layout" },
  { re: /^--codex-chat-font-size/, cat: "typography" },
  { re: /^--codex-content-font-family/, cat: "typography" },

  // Fonts
  { re: /^--font-(ui|code|sans|mono|brand|heading)/, cat: "typography" },
  { re: /^--text-(xs|sm|base|lg|xl|2xl|3xl|4xl)/, cat: "typography" },
  { re: /^--font-weight-/, cat: "typography" },
  { re: /^--leading-/, cat: "typography" },
  { re: /^--tracking-/, cat: "typography" },

  // Spacing
  { re: /^--spacing$/, cat: "spacing" },
  { re: /^--official-spacing/, cat: "spacing" },
  { re: /^--container-/, cat: "layout" },
];

/** Preferred mapping official var → Codex-Tauri tokens.css variable. */
const SUGGESTED_MAP = {
  "--font-sans": "--font-sans",
  "--font-sans-default": "--font-sans (base stack)",
  "--font-ui-family": "--font-ui-family / --font-brand",
  "--font-mono": "--font-mono",
  "--font-mono-default": "--font-mono (base stack)",
  "--font-code-family": "--font-code-family",
  "--color-surface": "--surface-app-*",
  "--color-surface-elevated": "--surface-elevated-*",
  "--color-surface-elevated-secondary": "--surface-elevated-* / composer elevated",
  "--color-surface-secondary": "--surface-panel-muted-*",
  "--color-surface-tertiary": "--surface-panel-muted-*",
  "--color-text": "--fg-primary / --text-primary-*",
  "--color-text-primary": "--text-primary-*",
  "--color-text-secondary": "--text-secondary-*",
  "--color-text-tertiary": "--text-tertiary-*",
  "--color-text-emphasis": "--text-primary-* (stronger)",
  "--color-text-inverse": "--text-on-dark-*",
  "--color-text-composer-primary": "--semantic-composer-button-text-*",
  "--color-text-user-message": "--surface-user-bubble contrast",
  "--color-border": "--border-default",
  "--color-border-subtle": "--border-subtle-* / --border-light",
  "--color-border-strong": "--border-heavy",
  "--color-token-main-surface-primary": "--surface-app-* / --bg-canvas",
  "--color-token-side-bar-background": "--surface-sidebar-* / --bg-sidebar",
  "--color-token-text-primary": "--fg-primary",
  "--color-token-text-secondary": "--fg-secondary",
  "--color-token-text-tertiary": "--fg-description / --fg-meta",
  "--color-token-border": "--border-default",
  "--color-token-border-light": "--border-light",
  "--color-token-border-heavy": "--border-heavy",
  "--color-token-focus-border": "--focus-outline-color-*",
  "--color-background-composer-primary": "--semantic-composer-surface-*",
  "--color-background-user-message": "--surface-user-bubble-*",
  "--color-background-primary-solid": "--semantic-button-primary-surface-*",
  "--color-text-on-accent": "--semantic-button-primary-text-*",
  "--color-codex-description": "--fg-description / --fg-meta",
  "--codex-sidebar-preferred-width": "--width-sidebar",
  "--composer-adjacent-max-width": "--composer-adjacent-max-width",
  "--composer-inline-overhang": "--composer-inline-overhang",
  "--thread-content-max-width": "--thread-content-max-width",
  "--padding-toolbar": "--padding-toolbar",
  "--height-token-button-composer": "--spacing-token-button-composer",
  "--height-token-empty-state-page": "--height-token-empty-state-page",
  "--radius-token-composer-single-line": "--radius-token-composer-single-line",
  "--codex-corner-radius-scale": "--corner-radius-scale",
  "--codex-chat-font-size": "--text-base / --text-md",
  "--codex-content-font-family": "--font-sans / --font-brand",
  "--spacing": "--official-spacing / --space-1",
  "--shadow-sm": "--shadow-sm-* (verify theme overlay)",
  "--shadow-md": "--shadow-md-*",
  "--shadow-lg": "--shadow-lg-*",
  "--text-xs": "--text-xs",
  "--text-sm": "--text-sm",
  "--text-base": "--text-base",
  "--text-lg": "--text-lg",
  "--text-xl": "--text-xl / --text-heading-xl",
};

function readCss(file) {
  const p = path.join(assetsDir, file);
  if (!fs.existsSync(p)) {
    console.error("missing", file);
    return null;
  }
  return fs.readFileSync(p, "utf8");
}

/** Parse CSS custom property declarations: --name: value; */
function parseVarDecls(css) {
  const out = {};
  const re = /(--[a-zA-Z0-9_-]+)\s*:\s*([^;{}]+)/g;
  let m;
  while ((m = re.exec(css))) {
    const name = m[1].trim();
    const value = m[2].trim();
    // Prefer first non-empty; later theme overrides may replace
    if (!(name in out) || out[name] === "") out[name] = value;
  }
  return out;
}

/** Collect :root / .dark / [data-theme] scoped vars more carefully. */
function parseThemeBlocks(css, fileLabel) {
  const blocks = [];
  const re = /(:root(?:\[[^\]]+\])?|html(?:\.[\w-]+)*(?:\[[^\]]+\])?|\.dark\b|\.theme-dark\b|\[data-theme[^\]]*\]|\[data-color-mode[^\]]*\])[^{]*\{([\s\S]{0,20000}?)\}/g;
  let m;
  while ((m = re.exec(css))) {
    const selector = m[1];
    const body = m[2];
    const vars = parseVarDecls(body);
    if (Object.keys(vars).length) {
      blocks.push({ file: fileLabel, selector, vars });
    }
  }
  return blocks;
}

function extractFontFaces(css) {
  const faces = [];
  const re = /@font-face\s*\{([\s\S]*?)\}/g;
  let m;
  while ((m = re.exec(css))) {
    const body = m[1];
    const get = (key) => {
      const km = body.match(new RegExp(key + "\\s*:\\s*([^;]+)", "i"));
      return km ? km[1].trim() : null;
    };
    const family = get("font-family");
    if (!family) continue;
    const face = {
      family: family.replace(/["']/g, ""),
      src: get("src"),
      weight: get("font-weight"),
      style: get("font-style"),
      unicodeRange: get("unicode-range"),
      fontDisplay: get("font-display"),
    };
    faces.push(face);
  }
  return faces;
}

/** Pull rule bodies whose selector mentions layout keywords. */
function extractLayoutRules(css) {
  const keywords = [
    "composer",
    "sidebar",
    "toolbar",
    "titlebar",
    "empty-state",
    "emptyState",
    "home-hero",
    "heading-xl",
    "thread-content",
    "thread-scroll",
    "h-toolbar",
    "w-token-sidebar",
    "top-toolbar",
    "rounded-token-composer",
    "ps-token-sidebar",
  ];
  const rules = [];
  // Simplified rule parser (handles single-level; nested @layer braces are large)
  // Strategy: scan for selector { ... } where selector is short-ish and body is small.
  const re = /([^{}@]{1,400})\{([^{}]{1,2500})\}/g;
  let m;
  while ((m = re.exec(css))) {
    const selector = m[1].trim();
    const body = m[2].trim();
    if (!selector || selector.startsWith("@")) continue;
    const lower = selector.toLowerCase();
    if (!keywords.some((k) => lower.includes(k))) continue;
    // Keep only if body uses vars or has layout metrics
    if (
      /var\(--|width|height|max-width|min-height|padding|border-radius|font-size|inset|gap/.test(
        body
      )
    ) {
      rules.push({ selector: selector.slice(0, 300), body: body.slice(0, 800) });
    }
  }
  return rules;
}

function classify(name) {
  for (const p of SEMANTIC_PATTERNS) {
    if (p.re.test(name)) return p.cat;
  }
  return null;
}

function main() {
  if (!fs.existsSync(assetsDir)) {
    console.error("assets dir missing:", assetsDir);
    process.exit(1);
  }
  fs.mkdirSync(outDir, { recursive: true });

  const allVars = {};
  const allBlocks = [];
  const allFaces = [];
  const allLayout = [];
  const rawByCat = {};

  for (const f of CSS_FILES) {
    const css = readCss(f);
    if (!css) continue;
    Object.assign(allVars, parseVarDecls(css));
    allBlocks.push(...parseThemeBlocks(css, f));
    allFaces.push(...extractFontFaces(css));
    allLayout.push(...extractLayoutRules(css));
  }

  // Prefer :root block values over ambient declarations for theme vars
  const rootVars = {};
  const darkVars = {};
  for (const b of allBlocks) {
    const isDark = /dark|data-theme=['"]dark|data-color-mode=['"]dark/i.test(b.selector);
    const isRoot = b.selector.startsWith(":root") && !isDark;
    if (isRoot) Object.assign(rootVars, b.vars);
    if (isDark) Object.assign(darkVars, b.vars);
  }

  // Semantic filter over union
  const semantic = {};
  for (const [name, value] of Object.entries(allVars)) {
    const cat = classify(name);
    if (!cat) continue;
    if (!rawByCat[cat]) rawByCat[cat] = {};
    rawByCat[cat][name] = {
      value,
      rootValue: rootVars[name] || null,
      darkValue: darkVars[name] || null,
      suggested: SUGGESTED_MAP[name] || null,
      category: cat,
    };
    semantic[name] = rawByCat[cat][name];
  }

  // High-priority list (even if pattern missed)
  const HIGH_PRIORITY = [
    "--color-surface",
    "--color-surface-elevated",
    "--color-surface-elevated-secondary",
    "--color-surface-secondary",
    "--color-surface-tertiary",
    "--color-text",
    "--color-text-primary",
    "--color-text-secondary",
    "--color-text-tertiary",
    "--color-text-emphasis",
    "--color-text-inverse",
    "--color-border",
    "--color-border-subtle",
    "--color-border-strong",
    "--color-token-main-surface-primary",
    "--color-token-side-bar-background",
    "--color-token-text-primary",
    "--color-token-text-secondary",
    "--color-token-text-tertiary",
    "--color-token-border",
    "--color-token-border-light",
    "--color-token-border-heavy",
    "--color-token-focus-border",
    "--color-background-composer-primary",
    "--color-background-user-message",
    "--color-background-primary-solid",
    "--color-text-on-accent",
    "--color-text-composer-primary",
    "--color-codex-description",
    "--codex-sidebar-preferred-width",
    "--composer-adjacent-max-width",
    "--composer-inline-overhang",
    "--thread-content-max-width",
    "--padding-toolbar",
    "--height-token-button-composer",
    "--height-token-empty-state-page",
    "--radius-token-composer-single-line",
    "--codex-corner-radius-scale",
    "--codex-chat-font-size",
    "--codex-content-font-family",
    "--font-ui-family",
    "--font-code-family",
    "--font-sans",
    "--font-mono",
    "--font-sans-default",
    "--font-mono-default",
    "--spacing",
    "--shadow-sm",
    "--shadow-md",
    "--shadow-lg",
    "--elevation-prominent",
    "--app-color-background-surface",
    "--app-color-text-foreground",
    "--app-color-border",
    "--app-shell-panel-background",
  ];

  for (const name of HIGH_PRIORITY) {
    if (semantic[name]) continue;
    const value = allVars[name] || rootVars[name] || darkVars[name];
    if (value == null) continue;
    semantic[name] = {
      value,
      rootValue: rootVars[name] || null,
      darkValue: darkVars[name] || null,
      suggested: SUGGESTED_MAP[name] || null,
      category: classify(name) || "priority",
    };
  }

  // Font faces of interest
  const fontFaces = allFaces.filter((f) =>
    /openai|carlito|ui-sans|code-mono|font-ui|font-code/i.test(f.family) ||
    (f.src && /OpenAI|Carlito/i.test(f.src))
  );

  // Dedupe faces by family+weight+src prefix
  const faceSeen = new Set();
  const uniqueFaces = [];
  for (const f of fontFaces) {
    const key = `${f.family}|${f.weight}|${(f.src || "").slice(0, 120)}`;
    if (faceSeen.has(key)) continue;
    faceSeen.add(key);
    uniqueFaces.push(f);
  }

  // Layout rules dedupe by selector
  const ruleSeen = new Set();
  const uniqueRules = [];
  for (const r of allLayout) {
    const key = r.selector;
    if (ruleSeen.has(key)) continue;
    ruleSeen.add(key);
    uniqueRules.push(r);
  }

  const outJson = {
    generatedAt: new Date().toISOString(),
    assetsDir,
    cssFiles: CSS_FILES.filter((f) => fs.existsSync(path.join(assetsDir, f))),
    counts: {
      totalVars: Object.keys(allVars).length,
      semanticVars: Object.keys(semantic).length,
      themeBlocks: allBlocks.length,
      fontFaces: uniqueFaces.length,
      layoutRules: uniqueRules.length,
    },
    categories: Object.fromEntries(
      Object.entries(rawByCat).map(([k, v]) => [k, Object.keys(v).length])
    ),
    highPriority: HIGH_PRIORITY.filter((k) => semantic[k]).map((k) => ({
      name: k,
      ...semantic[k],
    })),
    semanticTokens: Object.fromEntries(
      Object.entries(semantic).sort(([a], [b]) => a.localeCompare(b))
    ),
    fontFaces: uniqueFaces,
    layoutRules: uniqueRules.slice(0, 250),
  };

  const jsonPath = path.join(outDir, "semantic-tokens.json");
  fs.writeFileSync(jsonPath, JSON.stringify(outJson, null, 2));

  fs.writeFileSync(
    path.join(outDir, "css-font-faces.json"),
    JSON.stringify(uniqueFaces, null, 2)
  );
  fs.writeFileSync(
    path.join(outDir, "css-layout-rules.json"),
    JSON.stringify(uniqueRules, null, 2)
  );

  // Markdown
  const md = [];
  md.push("# Official Codex Semantic UI Tokens");
  md.push("");
  md.push(`Generated: ${outJson.generatedAt}`);
  md.push(`Source CSS: \`${outJson.cssFiles.join("`, `")}\``);
  md.push(`Assets dir: \`${assetsDir}\``);
  md.push("");
  md.push(`| Metric | Count |`);
  md.push(`| --- | ---: |`);
  md.push(`| Total CSS custom props scanned | ${outJson.counts.totalVars} |`);
  md.push(`| Semantic tokens extracted | ${outJson.counts.semanticVars} |`);
  md.push(`| Theme blocks | ${outJson.counts.themeBlocks} |`);
  md.push(`| OpenAI/Carlito @font-face | ${outJson.counts.fontFaces} |`);
  md.push(`| Layout rules (composer/sidebar/toolbar) | ${outJson.counts.layoutRules} |`);
  md.push("");
  md.push("## High-priority tokens (official → Codex-Tauri)");
  md.push("");
  md.push("| Official var | Official value | Dark override | Suggested Codex-Tauri token |");
  md.push("| --- | --- | --- | --- |");
  for (const row of outJson.highPriority) {
    const val = String(row.rootValue || row.value || "").slice(0, 120).replace(/\|/g, "\\|");
    const dark = String(row.darkValue || "").slice(0, 80).replace(/\|/g, "\\|");
    const sug = row.suggested || "—";
    md.push(`| \`${row.name}\` | \`${val}\` | \`${dark || "—"}\` | ${sug} |`);
  }
  md.push("");
  md.push("## Categories");
  md.push("");
  for (const [cat, n] of Object.entries(outJson.categories).sort()) {
    md.push(`- **${cat}**: ${n} tokens`);
  }
  md.push("");
  md.push("## Font faces (OpenAI Sans / Carlito)");
  md.push("");
  for (const f of uniqueFaces) {
    md.push(`- \`${f.family}\` weight=${f.weight || "?"} style=${f.style || "normal"}`);
    if (f.src) md.push(`  - src: \`${f.src.slice(0, 200)}\``);
  }
  md.push("");
  md.push("## Layout rule sample (composer / sidebar / toolbar)");
  md.push("");
  for (const r of uniqueRules.slice(0, 80)) {
    md.push("```css");
    md.push(`${r.selector} { ${r.body.slice(0, 240)} }`);
    md.push("```");
  }
  md.push("");
  md.push("## Mapping notes for Codex-Tauri");
  md.push("");
  md.push("1. Prefer semantic aliases already in `frontend/src/styles/tokens.css` (`--bg-canvas`, `--fg-primary`, `--semantic-composer-*`).");
  md.push("2. Do not copy the full 820KB app CSS; apply extracted values + targeted layout rules only.");
  md.push("3. Dark theme in Codex-Tauri uses `html.theme-dark`; official uses `.dark` / `data-theme`.");
  md.push("4. `--codex-corner-radius-scale` (1.25) multiplies base radii; Codex-Tauri already mirrors this via `--corner-radius-scale`.");
  md.push("5. Dynamic/hover/runtime states still require CDP capture against the live official app.");
  md.push("");

  fs.writeFileSync(path.join(outDir, "SEMANTIC_TOKENS.md"), md.join("\n"));

  console.log("semantic tokens:", Object.keys(semantic).length);
  console.log("high priority found:", outJson.highPriority.length);
  console.log("font faces:", uniqueFaces.length);
  console.log("layout rules:", uniqueRules.length);
  console.log("wrote", jsonPath);
}

main();
