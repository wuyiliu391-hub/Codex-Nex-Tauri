#!/usr/bin/env node
/**
 * Static RE helper: extract UI-facing string literals from official Codex desktop
 * asar webview chunks. Read-only on the asar extract.
 *
 * Outputs:
 *   - interaction-extract.json  (per-chunk strings + CSS selectors)
 *   - interaction-strings.txt   (flat unique strings)
 */
const fs = require("fs");
const path = require("path");

const ASSETS = String.raw`C:\Users\Administrator\Desktop\codex-asar-extract\webview\assets`;
const OUT_DIR = String.raw`C:\Users\Administrator\Desktop\Codex-Tauri\docs\official-ui`;

/** High-value chunk name prefixes / exact stems (without hash). */
const CHUNK_STEMS = [
  // conversation / thread / streaming
  "conversation-blocks",
  "local-conversation-thread",
  "local-conversation-turn",
  "local-conversation-page",
  "local-conversation-thread-turn-entries",
  "local-conversation-plan-model",
  "conversation-markdown",
  "conversation-24db",
  "thread-app-shell-chrome",
  "thread-overflow-menu",
  "thread-scroll-layout",
  "thread-side-panel-tab-content",
  "thread-side-panel-tabs",
  "thread-user-message-navigation-rail-app",
  "thread-usage-breakdown",
  "thread-goal-side-panel-content",
  "thread-pin-shortcut-bridge",
  "thread-pull-request-tab-content",
  "thread-emoji-picker-content",
  "thread-virtualizer",
  "thread-context",
  "thread-panel-state",
  "thread-right-panel-state",
  "queued-message-list",
  "chunked-message-receiver",
  "local-conversation-stream-role-product-event",
  "local-conversation-git-actions",
  "local-conversation-sources-side-panel-tab",
  "local-conversation-subagents-panel-tab",
  "toggle-thread-summary-panel",
  "use-conversation-diff-comments",
  "use-resume-conversation-if-needed",
  "use-start-new-conversation",
  "new-thread-panel-page",
  "delete-thread-dialog",
  "codex-thread-report-dialog",
  "share-conversation-action",
  "conversation-move-menu-items",
  "hotkey-window-new-thread-page",
  "hotkey-window-thread-page",

  // tool activity / DIY / plugins
  "active-tool-activity-label",
  "agent-activity-item",
  "agent-activity-units",
  "tool-activity-disclosure",
  "mcp-tool-item-content",
  "webmcp-tool-calls",
  "plugin-picker-menu-content",
  "composer-work-home-plugins-control",
  "plugin-detail-page",
  "plugins-page",
  "plugins-page-section",
  "plugins-store-page",
  "plugins-settings",
  "plugins-settings-row",
  "plugin-request-empty-state",
  "plugin-mcp-app-deep-link-page",
  "category-plugins-query",
  "use-plugin-installation",
  "use-plugin-scheduled-tasks",
  "chatgpt-skill-source-dialog",

  // MCP
  "mcp-settings",
  "mcp-extension-quick-action-dialog",
  "mcp-extension-view-frame",
  "mcp-extension-view-page",
  "mcp-extension-thread-side-panel-tab",
  "mcp-app-sandbox",
  "mcp-app-follow-up-confirmation-dialog",
  "mcp-app-analytics",
  "local-conversation-webmcp-tools-model",

  // composer / home
  "composer-a3fb",
  "composer-host",
  "composer-utility-bar",
  "composer-state",
  "composer-action-bar-run-location-dropdown",
  "composer-project-selector",
  "composer-provider",
  "composer-overlay",
  "home-composer-mode-toggle",
  "home-composer-route",
  "home-starter-prompts",
  "primary-composer-at-mention-list",
  "right-panel-composer-overlay",
  "unified-floating-composer",
  "codex-micro-mini-game-composer",
  "browser-composer-disclaimer",
  "use-chatgpt-composer-controller",

  // approval / permissions
  "permissions-mode-dropdown",
  "permission-dropdown",
  "permission-denied-dialog",
  "permissions-mode-visibility",
  "auto-review-approval-nudge",
  "safety-settings",
  "security-settings",

  // settings pages
  "general-settings",
  "appearance-settings",
  "agent-settings",
  "agent-menu",
  "analytics-settings",
  "personalization-settings",
  "voice-settings",
  "browser-use-settings",
  "browser-use-settings-visibility",
  "computer-use-settings",
  "computer-use-native-app-metadata",
  "hooks-settings",
  "hooks-settings-copy",
  "hooks-settings-route",
  "git-settings",
  "local-environments-settings-page",
  "cloud-environments-settings-page",
  "worktrees-settings-page",
  "remote-connections-settings",
  "notifications-settings",
  "keyboard-shortcuts-settings",
  "storage-settings",
  "debug-settings",
  "import-settings",
  "import-settings-gate",
  "billing-settings",
  "profile-settings",
  "code-review-settings",
  "time-management-settings",
  "memory-settings-analytics",
  "appshots-settings",
  "chronicle-settings-page",
  "pets-settings-route",
  "settings-page",
  "settings-726a",
  "settings-eb67",
  "settings-host-dropdown",
  "settings-loading-row",
  "settings-route-state",
  "settings-row-disclosure",
  "settings-unsaved-changes-dialog",
  "settings-plugin-selection",
  "settings-command-menu-section-items",
  "settings-external-section",
  "use-visible-settings-sections",
  "skills-settings",
  "cloud-preferences-settings",
  "connector-settings-redirect",
  "personal-settings-access",
  "appgen-settings-dialog",
  "appgen-settings-page",

  // onboarding
  "onboarding-page",
  "onboarding-entrypoint",
  "onboarding-interactive-dynamic-tools",
  "onboarding-login-content",
  "onboarding-mail-provider",
  "chatgpt-onboarding-dialog",
  "codex-micro-onboarding-host",
  "codex-micro-onboarding-animation",
  "sidebar-onboarding-checklist",
  "sidebar-onboarding-checklist-task-config",
  "worktree-onboarding-banner-controller",
  "worktree-onboarding-state",
  "wallet-onboarding-announcement-content",
  "wallet-onboarding-announcement-modal",
  "access-splash",
  "work-mode-access-splash",

  // menus / sheets / dropdowns / context
  "git-branch-picker-dropdown-content",
  "local-remote-dropdown",
  "worktree-environment-dropdown",
  "template-picker",
  "add-sources-dialog",
  "analysis-dialog",
  "business-switch-workspace-dialog",
  "delete-archived-chats-dialog",
  "automation-dialog",
  "automation-delete-confirmation-dialog",
  "automation-frequency-section",
  "cadence-dialog",
  "workspace-file-context-menu-trigger",
  "workspace-file-tab-context-menu",
  "use-code-diff-context-menu",
  "generated-image-context-menu",
  "conversation-move-menu-items",
  "review-slash-command-submenu-registration",
  "annotation-mode-button",
  "artifact-preview-header",
  "artifact-tab-content",
  "artifact-tab-content-shell",

  // sidebar / navigation
  "sidebar-library-icon",
  "sidebar-more-icon",
  "sidebar-new-chat-icon",
  "sidebar-plugins-icon",
  "sidebar-projects-icon",
  "sidebar-search-icon",
  "sidebar-tasks-icon",
  "automations-page",
  "workspace-agents-page",
  "workspace-agent-landing",
  "workspace-agent-detail-page",
  "gpt-chat-page",
  "chatgpt-conversation-page",
  "chatgpt-gizmo-header",
  "chatgpt-subagents-panel",
  "chatgpt-temporary-chat-ui",
  "chatgpt-sources-message",
  "chatgpt-sources-side-panel-tab",
  "chatgpt-image-upload-reminder-dialog",

  // empty / loading / error
  "compact-empty-state",
  "error-page",
  "loading-page",
  "read-error",
  "pull-request-error-description",
  "revision-review-unavailable-message",
  "appgen-access-state-messages",
  "appgen-disabled-tooltip",
  "background-terminal",
  "unrestored-thread-tab-route",
  "authed-route",
  "auth-handoff-page",
  "app-connect-modal-by-id",
  "app-connect-oauth-callback-page",
  "app-info",

  // browser / computer-use secondary
  "browser-2cc7",
  "browser-address-shortcut",
  "browser-address-suggestion-overlay",
  "browser-session-queries",
  "browser-use-origin-state-queries",
  "cloud-browser-preview",
  "cloud-browser-side-panel",
  "hidden-browser-use-webview-host",
  "computer-history-query",
  "computer-history-suggestion-prompt",
  "computer-history-suggestions",
  "webview-page",
  "webview-1f92",
];

/** CSS sheets to parse for selectors. */
const CSS_STEMS = [
  "conversation-blocks",
  "thread-scroll-layout",
  "thread-user-message-navigation-rail-app",
  "home-composer-mode-toggle",
  "local-conversation-page",
  "onboarding-page",
  "right-panel-composer-overlay",
  "thread-emoji-picker-content",
  "worktree-environment-dropdown",
  "wallet-onboarding-announcement-modal",
  "avatar-overlay-quick-chat-bar",
  "app-initial",
  "app-primary",
  "app-dddf", // main app css
];

function listAssets() {
  return fs.readdirSync(ASSETS).map((name) => {
    const full = path.join(ASSETS, name);
    const st = fs.statSync(full);
    return { name, size: st.size };
  });
}

function stemOf(filename) {
  // strip extension
  const noExt = filename.replace(/\.(js|css)$/, "");
  // strip trailing -<8-12 hex>
  return noExt.replace(/-[0-9a-f]{8,12}(\.[a-z]+)?$/i, "").replace(/\.electron$/i, "");
}

function matchChunk(filename, stems) {
  const base = stemOf(filename);
  return stems.some((s) => base === s || base.startsWith(s + "-") || base === s || filename.startsWith(s));
}

/** Extract double/single-quoted string literals that look like UI labels. */
function extractJsStrings(code) {
  const out = new Set();
  // double-quoted
  const dq = code.match(/"((?:[^"\\\n]|\\.){2,180})"/g) || [];
  const sq = code.match(/'((?:[^'\\\n]|\\.){2,180})'/g) || [];
  const all = dq.concat(sq);
  for (const raw of all) {
    let s = raw.slice(1, -1);
    // unescape common sequences
    s = s.replace(/\\n/g, " ").replace(/\\t/g, " ").replace(/\\"/g, '"').replace(/\\'/g, "'").replace(/\\\\/g, "\\");
    if (!s || s.length < 2) continue;
    // skip obvious non-UI
    if (/^(https?:|data:|application\/|text\/|image\/|font\/)/.test(s)) continue;
    if (/^[\w./\\-]+\.(js|css|png|svg|woff2?|json|map|mp4|webp|wav)$/.test(s)) continue;
    if (/^[a-z0-9_]+$/i.test(s) && s.length < 4) continue; // short ids
    if (/^(true|false|null|undefined|function|object|string|number|boolean)$/i.test(s)) continue;
    if (/^[\d.\s-]+$/.test(s)) continue;
    // skip pure code-like tokens without spaces that look like hashes/ids
    if (/^[a-f0-9]{8,}$/i.test(s)) continue;
    if (/^(px|em|rem|%|auto|none|block|flex|grid|absolute|relative|fixed|sticky)$/i.test(s)) continue;

    const hasSpace = /\s/.test(s);
    const hasPunct = /[?!:：，。、·—–…"'“”‘’]/.test(s);
    const looksCjk = /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(s);
    const looksTestid = /data-testid|aria-label|role=|testid/i.test(s);
    const looksRoute = /^\/[a-z0-9_/-]+$/i.test(s) && s.length > 3;
    const looksClass = /^[a-z][a-z0-9]*(-[a-z0-9]+)+$/i.test(s) && s.includes("-") && s.length > 6;
    const looksKey = /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9_]+){1,6}$/.test(s); // i18n keys
    const looksLabel =
      (hasSpace && /[A-Za-z\u4e00-\u9fff]/.test(s)) ||
      looksCjk ||
      looksTestid ||
      looksRoute ||
      looksKey;

    // Keep human labels, routes, i18n keys, testids. Drop pure CSS class-looking unless also label.
    if (!looksLabel) continue;
    // Drop very long hex/base64
    if (s.length > 160) continue;
    // Drop React internals
    if (/^__|react|fiber|element|children|className$/.test(s) && !hasSpace) continue;

    out.add(s);
  }
  return [...out];
}

/** data-testid / aria-label attribute values. */
function extractAttrs(code) {
  const testids = new Set();
  const re = /(?:data-testid|aria-label|ariaLabel|testid)\s*[:=]\s*["']([^"']{2,80})["']/gi;
  let m;
  while ((m = re.exec(code))) testids.add(m[1]);
  // also data-testid:"foo" object style already covered
  const re2 = /"data-testid"\s*:\s*"([^"]{2,80})"/g;
  while ((m = re2.exec(code))) testids.add(m[1]);
  return [...testids];
}

/** Route-like strings. */
function extractRoutes(code) {
  const routes = new Set();
  const re = /["']((?:\/[a-z0-9_-]+){1,6}(?:\/)?)["']/gi;
  let m;
  while ((m = re.exec(code))) {
    const r = m[1];
    if (/^\/(v1|api|assets|static|node_modules|usr|etc|var|tmp)/.test(r)) continue;
    if (/\.(js|css|png|svg|json)$/.test(r)) continue;
    routes.add(r);
  }
  return [...routes];
}

/** CSS class selectors from a stylesheet. */
function extractCssClasses(css) {
  const classes = new Set();
  // .foo .bar-baz, ignore keyframes names roughly
  const re = /\.([A-Za-z_][A-Za-z0-9_-]{1,60})/g;
  let m;
  while ((m = re.exec(css))) classes.add(m[1]);
  return [...classes].sort();
}

function main() {
  const assets = listAssets();
  const jsAssets = assets.filter((a) => a.name.endsWith(".js"));
  const cssAssets = assets.filter((a) => a.name.endsWith(".css"));

  const selectedJs = [];
  for (const a of jsAssets) {
    if (matchChunk(a.name, CHUNK_STEMS)) selectedJs.push(a);
  }
  const selectedCss = [];
  for (const a of cssAssets) {
    if (matchChunk(a.name, CSS_STEMS)) selectedCss.push(a);
  }

  // Dedup by stem preferring larger files
  const byStem = new Map();
  for (const a of selectedJs) {
    const s = stemOf(a.name);
    const prev = byStem.get(s);
    if (!prev || a.size > prev.size) byStem.set(s, a);
  }
  const uniqueJs = [...byStem.values()].sort((a, b) => a.name.localeCompare(b.name));

  const result = {
    generatedAt: new Date().toISOString(),
    assetsDir: ASSETS,
    totals: { jsChunks: uniqueJs.length, cssChunks: selectedCss.length },
    chunks: {},
    css: {},
  };

  const flatStrings = new Set();

  for (const a of uniqueJs) {
    let code;
    try {
      code = fs.readFileSync(path.join(ASSETS, a.name), "utf8");
    } catch {
      continue;
    }
    const strings = extractJsStrings(code);
    const testids = extractAttrs(code);
    const routes = extractRoutes(code);
    strings.forEach((s) => flatStrings.add(s));
    result.chunks[a.name] = {
      stem: stemOf(a.name),
      size: a.size,
      stringCount: strings.length,
      strings: strings.slice(0, 400),
      testids,
      routes,
    };
  }

  for (const a of selectedCss) {
    let css;
    try {
      css = fs.readFileSync(path.join(ASSETS, a.name), "utf8");
    } catch {
      continue;
    }
    const classes = extractCssClasses(css);
    result.css[a.name] = {
      stem: stemOf(a.name),
      size: a.size,
      classCount: classes.length,
      classes: classes.slice(0, 800),
    };
  }

  // Also scan the main app CSS for conversation/thread/composer selectors
  const mainCss = cssAssets.find((a) => a.name.startsWith("app-dddf"));
  if (mainCss) {
    const css = fs.readFileSync(path.join(ASSETS, mainCss.name), "utf8");
    const interesting = extractCssClasses(css).filter((c) =>
      /thread|conversation|composer|tool|approval|permission|onboard|settings|menu|sheet|dropdown|stream|message|agent|mcp|plugin|empty|loading|error|prompt|sidebar|chat|turn|block|activity|banner|dialog|modal|toast|card|pill|chip|rail|panel|hero|starter|project|model|send|stop|jump|diff|plan|question|wait/i.test(
        c,
      ),
    );
    result.css["__app-main-interesting"] = {
      stem: "app-dddf",
      size: mainCss.size,
      classCount: interesting.length,
      classes: interesting,
    };
  }

  fs.writeFileSync(path.join(OUT_DIR, "interaction-extract.json"), JSON.stringify(result, null, 2), "utf8");
  fs.writeFileSync(
    path.join(OUT_DIR, "interaction-strings.txt"),
    [...flatStrings].sort().join("\n"),
    "utf8",
  );

  console.log(
    JSON.stringify(
      {
        jsChunks: uniqueJs.length,
        cssChunks: selectedCss.length,
        totalStrings: flatStrings.size,
        topChunks: uniqueJs.slice(0, 15).map((a) => a.name),
      },
      null,
      2,
    ),
  );
}

main();
