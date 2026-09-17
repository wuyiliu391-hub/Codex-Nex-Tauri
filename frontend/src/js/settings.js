// Settings shell + official settings pages.
import { store, updateSettings } from "./state.js";
import { on, navigate } from "./router.js";
import { t, languageOptions, LOCALES, normalizeLang } from "./i18n.js";
import { createDropdown } from "./ui-controls.js";

function $(id) {
  return document.getElementById(id);
}
function escapeHtml(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}

let settingsSearchValue = "";
let lastPluginTab = "plugins";
let shortcutSearchValue = "";
let archivedSearchValue = "";
let providerEditor = null;

const PROTOCOL_OPTIONS = [
  { value: "openai_chat", label: "OpenAI Chat Completions" },
  { value: "openai_responses", label: "OpenAI Responses" },
  { value: "anthropic", label: "Anthropic Messages" },
  { value: "ollama", label: "Ollama" },
];

const PROTOCOL_HINTS = {
  openai_chat: "POST {base}/chat/completions",
  openai_responses: "POST {base}/responses",
  anthropic: "POST {base}/v1/messages",
  ollama: "POST {base}/api/chat",
};

function sectionsDef() {
  return [
    {
      id: "personal",
      labelKey: "settings.group.personal",
      children: [
        { id: "general", labelKey: "settings.general", icon: "general" },
        { id: "import", labelKey: "settings.import", icon: "import" },
        {
          id: "appearance",
          labelKey: "settings.appearance",
          icon: "appearance",
        },
        { id: "voice", labelKey: "settings.voice", icon: "voice" },
        {
          id: "configuration",
          labelKey: "settings.configuration",
          icon: "configuration",
        },
        {
          id: "personalization",
          labelKey: "settings.personalization",
          icon: "personalization",
        },
        { id: "pets", labelKey: "settings.pets", icon: "pets" },
        { id: "shortcuts", labelKey: "settings.shortcuts", icon: "shortcuts" },
        { id: "account", labelKey: "settings.account", icon: "account" },
      ],
    },
    {
      id: "integrations",
      labelKey: "settings.group.integrations",
      children: [
        { id: "computer-use", labelKey: "settings.computer", icon: "computer" },
        { id: "appshot", labelKey: "settings.appshot", icon: "appshot" },
        { id: "plugins", labelKey: "settings.plugins", icon: "plugins" },
        { id: "browser", labelKey: "settings.browser", icon: "browser" },
      ],
    },
    {
      id: "coding",
      labelKey: "settings.group.coding",
      children: [
        { id: "hooks", labelKey: "settings.hooks", icon: "hooks" },
        {
          id: "connections",
          labelKey: "settings.connections",
          icon: "connections",
        },
        { id: "git", labelKey: "settings.git", icon: "git" },
        {
          id: "environments",
          labelKey: "settings.environments",
          icon: "environments",
        },
        { id: "worktrees", labelKey: "settings.worktrees", icon: "worktrees" },
      ],
    },
    {
      id: "archived",
      labelKey: "settings.group.archived",
      children: [
        {
          id: "archived-tasks",
          labelKey: "settings.archived",
          icon: "archived",
        },
      ],
    },
  ];
}

function pageLabel(id) {
  for (const g of sectionsDef()) {
    for (const c of g.children) {
      if (c.id === id) return t(c.labelKey);
    }
  }
  return id;
}

function iconSvg(name) {
  const ico = {
    general: `<path d="M9 4v10M4 9h10"/><circle cx="9" cy="9" r="6"/>`,
    appearance: `<circle cx="9" cy="9" r="6"/><path d="M9 3a6 6 0 0 1 0 12V3Z"/>`,
    voice: `<path d="M9 3v6M6 8v1a3 3 0 0 0 6 0V8M9 12v3M6.5 15h5"/>`,
    configuration: `<path d="M4 4h10v3H4zM4 11h10v3H4z"/>`,
    personalization: `<path d="M9 3l1.4 4.2L15 9l-4.6 1.8L9 15l-1.4-4.2L3 9l4.6-1.8Z"/>`,
    pets: `<path d="M6 10a3 3 0 0 0 6 0"/><circle cx="6.5" cy="6.5" r="1"/><circle cx="11.5" cy="6.5" r="1"/>`,
    shortcuts: `<path d="M4 5h10M4 9h10M4 13h10"/>`,
    account: `<circle cx="9" cy="7" r="2.5"/><path d="M4.5 15c.7-2.2 2.4-3.5 4.5-3.5s3.8 1.3 4.5 3.5"/>`,
    plugins: `<path d="M9 2v4M9 12v4M2 9h4M12 9h4M4.5 4.5l2.8 2.8M10.7 10.7l2.8 2.8M13.5 4.5l-2.8 2.8M7.3 10.7l-2.8 2.8"/>`,
    browser: `<circle cx="9" cy="9" r="6"/><path d="M3 9h12M9 3c2 1.8 2 10.2 0 12M9 3c-2 1.8-2 10.2 0 12"/>`,
    computer: `<path d="M3 4h12v9H3zM7 16h4"/>`,
    hooks: `<path d="M8 4a3 3 0 0 0 0 6h2a3 3 0 0 1 0 6M8 10v6"/>`,
    connections: `<circle cx="5" cy="6" r="2.5"/><circle cx="13" cy="12" r="2.5"/><path d="M7.2 7.2 10.8 10.8"/>`,
    git: `<path d="M9 3v12M6 6l3-3 3 3M6 12l3 3 3-3"/>`,
    environments: `<path d="M3 6h12M3 10h12M3 14h12"/>`,
    worktrees: `<path d="M4 4h10M4 9h10M4 14h10"/><path d="M6 4v10"/>`,
    archived: `<path d="M3 5h12v2H3zM4 7h10v8H4zM7 11h4"/>`,
    language: `<path d="M3 5h12M9 5v10M6 15h6M5 8.5h8"/><path d="M12.5 11.5c1.2 0 2.2.9 2.2 2s-1 2-2.2 2c-.7 0-1.3-.3-1.7-.8"/>`,
    import: `<path d="M9 3v8M6 8l3 3 3-3M4 14h10v2H4z"/>`,
    appshot: `<rect x="3.5" y="4.5" width="11" height="8" rx="1.5"/><circle cx="9" cy="8.5" r="2"/><path d="M6.5 15.5h5"/>`,
  };
  return `<svg viewBox="0 0 18 18" aria-hidden="true">${ico[name] || ""}</svg>`;
}

function renderSettingsShell() {
  const app = $("app");
  if ($("view-settings")) return;
  app.insertAdjacentHTML(
    "beforeend",
    `
    <section class="view view-settings" id="view-settings" hidden>
      <aside class="settings-sidebar">
        <div class="settings-sidebar-head">
          <button class="settings-back" id="settings-back" type="button">${escapeHtml(t("settings.back"))}</button>
          <label class="settings-search">
            <svg viewBox="0 0 18 18"><circle cx="7.7" cy="7.7" r="4.45"/><path d="m11 11 3.45 3.45"/></svg>
            <input id="settings-search-input" placeholder="${escapeHtml(t("settings.search"))}" />
          </label>
        </div>
        <div class="settings-links" id="settings-links"></div>
      </aside>
      <div class="settings-main" id="settings-main"></div>
    </section>`,
  );
  $("settings-back")?.addEventListener("click", () => navigate("home"));
  $("settings-search-input")?.addEventListener("input", (e) => {
    settingsSearchValue = e.target.value;
    filterSettings(settingsSearchValue);
  });
  relabelSettingsSidebar();
}

function groupShellHtml(g) {
  return `<div class="settings-group" data-group="${escapeHtml(g.id)}">
    <div class="settings-group-label">${escapeHtml(t(g.labelKey))}</div>
    ${g.children
      .map(
        (c) => `<button class="settings-link" data-link="${c.id}" type="button">
      <span class="ico">${iconSvg(c.icon)}</span>
      <span>${escapeHtml(t(c.labelKey))}</span>
    </button>`,
      )
      .join("")}
  </div>`;
}

function relabelSettingsSidebar() {
  const links = $("settings-links");
  if (!links) return;
  links.innerHTML = sectionsDef().map(groupShellHtml).join("");
  links.querySelectorAll(".settings-link").forEach((el) => {
    el.addEventListener("click", () => {
      openSettingsPage(el.dataset.link).catch((e) => console.error(e));
    });
  });
  const active = store._settingsPage || "general";
  links.querySelectorAll(".settings-link").forEach((el) => {
    el.classList.toggle("is-active", el.dataset.link === active);
  });
  const back = $("settings-back");
  if (back) back.textContent = t("settings.back");
  const search = $("settings-search-input");
  if (search) search.placeholder = t("settings.search");
  if (settingsSearchValue) filterSettings(settingsSearchValue);
}

function filterSettings(q) {
  const needle = q.trim().toLowerCase();
  document.querySelectorAll(".settings-link").forEach((el) => {
    const label = el.textContent.toLowerCase();
    el.style.display = needle === "" || label.includes(needle) ? "" : "none";
  });
  document.querySelectorAll(".settings-group").forEach((group) => {
    const visible = Array.from(group.querySelectorAll(".settings-link")).some(
      (el) => el.style.display !== "none",
    );
    group.style.display = visible ? "" : "none";
  });
}

export async function mountSettings() {
  if (!$("view-settings")) renderSettingsShell();
  on("settings", (subpage) => {
    document
      .querySelectorAll("#main > .view")
      .forEach((v) => (v.hidden = true));
    $("view-settings").hidden = false;
    openSettingsPage(subpage || "general");
  });
  document.addEventListener("codex:language-applied", () => {
    relabelSettingsSidebar();
    const page = store._settingsPage || "general";
    openSettingsPage(page).catch((e) => console.error(e));
  });
}

async function openSettingsPage(id) {
  store._settingsPage = id;
  document.querySelectorAll(".settings-link").forEach((el) => {
    el.classList.toggle("is-active", el.dataset.link === id);
  });
  const root = $("settings-main");
  root.innerHTML = `
    <button class="settings-close-btn" id="settings-close-btn" aria-label="${escapeHtml(t("action.close", "关闭"))}" title="${escapeHtml(t("action.close", "关闭"))}">
      <svg viewBox="0 0 18 18"><path d="m4.5 4.5 9 9M13.5 4.5l-9 9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
    </button>
    <div class="settings-content" id="settings-content"></div>`;
  root.querySelector("#settings-close-btn")?.addEventListener("click", () => navigate("home"));
  const content = $("settings-content");
  await loadPageRuntimeState(id);
  const render = RENDERERS[id] || renderGeneral;
  render(content);
  if (settingsSearchValue) filterSettings(settingsSearchValue);
}

async function loadPageRuntimeState(id) {
  try {
    if (id === "browser")
      store.browserStatus = await api()?.GetBrowserStatus?.();
    if (id === "computer-use")
      store.computerUseStatus = await api()?.GetComputerUseStatus?.();
    if (id === "git") store.gitStatus = await api()?.GetGitStatus?.();
    if (id === "configuration" && !(store.dependencies || []).length)
      store.dependencies = (await api()?.ListDependencyChecks?.()) || [];
    if (id === "hooks")
      store.hooks = (await api()?.ListHooks?.()) || store.hooks || [];
    if (id === "plugins")
      store.mcpServers =
        (await api()?.ListMCPServers?.()) || store.mcpServers || [];
    if (id === "account")
      store.providers =
        (await api()?.ListProviders?.()) || store.providers || [];
    if (id === "voice")
      store.audioDevices = (await api()?.ListAudioInputDevices?.()) || [
        t("common.default"),
      ];
    if (id === "personalization")
      store.memory = (await api()?.ListMemoryItems?.()) || store.memory || [];
  } catch (e) {
    console.error(e);
  }
}

function pref(section, fallback = {}) {
  store.preferences[section] = {
    ...fallback,
    ...(store.preferences[section] || {}),
  };
  return store.preferences[section];
}

function pageHead(title, desc = "", compact = false) {
  return `<div class="settings-page-head ${compact ? "compact" : ""}"><h1>${escapeHtml(title)}</h1>${desc ? `<p>${escapeHtml(desc)}</p>` : ""}</div>`;
}

function block(title, rows, extra = "") {
  return `<section class="settings-block">${title ? `<div class="settings-section-heading"><h2>${escapeHtml(title)}</h2>${extra}</div>` : ""}<div class="settings-card">${rows.join("")}</div></section>`;
}

function blockCustom(title, html, extra = "") {
  return `<section class="settings-block">${title ? `<div class="settings-section-heading"><h2>${escapeHtml(title)}</h2>${extra}</div>` : ""}${html}</section>`;
}

function row(label, desc, control, cls = "") {
  return `<div class="settings-row ${cls}"><div class="settings-row-copy"><div class="settings-row-title">${escapeHtml(label)}</div>${desc ? `<div class="settings-row-description">${escapeHtml(desc)}</div>` : ""}</div><div class="settings-row-control">${control}</div></div>`;
}

function button(label, action, kind = "", disabled = false) {
  return `<button class="settings-button ${kind}" type="button" data-action="${action}" ${disabled ? "disabled" : ""}>${escapeHtml(label)}</button>`;
}

function inputEl(name, value, placeholder = "") {
  return `<input type="text" class="settings-input" data-input="${name}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" />`;
}

function numberEl(name, value, min, max) {
  return `<input type="number" class="settings-input" data-input="${name}" value="${escapeHtml(String(value))}" min="${min}" max="${max}" />`;
}

function selectEl(name, value, options, cls = "", disabled = false) {
  const label = options.find((o) => o.value === value)?.label || value || "";
  const optsJson = escapeHtml(JSON.stringify(options));
  return `<button type="button" class="ui-dropdown settings-select ${cls}" data-select="${name}" data-value="${escapeHtml(value)}" data-options="${optsJson}" ${disabled ? "disabled" : ""} aria-haspopup="listbox"><span class="ui-dropdown-label">${escapeHtml(label)}</span><span class="ui-dropdown-caret" aria-hidden="true"></span></button>`;
}

// Initialize all custom dropdowns inside root with createDropdown.
function initSelectDropdowns(root) {
  root.querySelectorAll("button.ui-dropdown[data-select]:not([disabled])").forEach((btn) => {
    let items;
    try { items = JSON.parse(btn.dataset.options); } catch { items = []; }
    btn.value = btn.dataset.value || "";
    createDropdown({
      anchor: btn,
      items,
      value: btn.dataset.value,
      // Dropdown fires change itself; only sync local dataset here.
      onSelect: (val) => {
        btn.value = val;
        btn.dataset.value = val;
      },
    });
  });
}

function switchEl(name, on, disabled = false) {
  return `<label class="settings-switch"><input type="checkbox" data-switch="${name}" ${on ? "checked" : ""} ${disabled ? "disabled" : ""} /><span></span></label>`;
}

function wireCaptureButton(root, action, save, key) {
  root.querySelector("[data-action='" + action + "']")?.addEventListener("click", (e) => {
    const btn = e.currentTarget;
    const orig = btn.textContent;
    btn.textContent = "\u2026";
    const once = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const parts = [];
      if (ev.ctrlKey) parts.push("Ctrl");
      if (ev.altKey) parts.push("Alt");
      if (ev.shiftKey) parts.push("Shift");
      if (!["Control", "Alt", "Shift", "Meta"].includes(ev.key)) parts.push(ev.key.length === 1 ? ev.key.toUpperCase() : ev.key);
      const combo = parts.join("+");
      document.removeEventListener("keydown", once, true);
      btn.textContent = orig;
      if (combo) {
        save({ [key]: combo });
        const scope = btn.closest(".settings-row");
        const v = scope ? scope.querySelector("[data-capture-value]") : null;
        if (v) v.textContent = combo;
      }
    };
    document.addEventListener("keydown", once, true);
  });
}

function rowHtml(label, descHtml, control, cls = "") {
  return `<div class="settings-row ${cls}"><div class="settings-row-copy"><div class="settings-row-title">${escapeHtml(label)}</div><div class="settings-row-description">${descHtml}</div></div><div class="settings-row-control">${control}</div></div>`;
}

function rangeEl(name, value, min, max) {
  return `<div class="settings-range"><input type="range" data-range="${name}" min="${min}" max="${max}" value="${value}" /><span class="range-value">${value}</span></div>`;
}

function segmented(name, value, options) {
  const btns = options
    .map(
      (o) =>
        `<button type="button" class="${o.value === value ? "is-active" : ""}" data-value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</button>`,
    )
    .join("");
  return `<div class="segmented" data-segmented="${name}">${btns}</div>`;
}

function api() {
  return window.go?.main?.App;
}

function requireApi(method) {
  const app = api();
  if (!app || typeof app[method] !== "function") {
    throw new Error(`${method} is unavailable. Rebuild the app bindings.`);
  }
  return app[method].bind(app);
}

async function callAction(label, fn) {
  if (typeof fn !== "function") throw new Error("Backend action unavailable.");
  const result = await fn();
  toast(label);
  return result;
}

function toast(message) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

function wireInputs(root, save) {
  root.querySelectorAll("[data-switch]").forEach((el) =>
    el.addEventListener("change", async () => {
      if (el.dataset.switch === "mcpServer") {
        await callAction(
          el.checked ? t("toast.mcpEnabled") : t("toast.mcpDisabled"),
          () => requireApi("SetMCPServerEnabled").then((fn) => fn(el.checked)),
        );
        await refreshStore();
        return;
      }
      save({ [el.dataset.switch]: el.checked });
    }),
  );
  root
    .querySelectorAll("[data-select]")
    .forEach((el) =>
      el.addEventListener("change", () =>
        save({ [el.dataset.select]: el.value }),
      ),
    );
  root.querySelectorAll("[data-input]").forEach((el) =>
    el.addEventListener("change", () =>
      save({
        [el.dataset.input]: el.type === "number" ? Number(el.value) : el.value,
      }),
    ),
  );
  root.querySelectorAll("[data-range]").forEach((el) => {
    el.addEventListener("input", () => {
      const v = el.parentElement?.querySelector(".range-value");
      if (v) v.textContent = el.value;
    });
    el.addEventListener("change", () =>
      save({ [el.dataset.range]: Number(el.value) }),
    );
  });
  root.querySelectorAll("[data-segmented]").forEach((group) => {
    group.querySelectorAll("button").forEach((btn) =>
      btn.addEventListener("click", () => {
        group
          .querySelectorAll("button")
          .forEach((b) => b.classList.toggle("is-active", b === btn));
        save({ [group.dataset.segmented]: btn.dataset.value });
      }),
    );
  });
  // Mount custom dropdown popovers on all select buttons in this root.
  initSelectDropdowns(root);
}

async function savePreferences(section, patch) {
  store.preferences[section] = {
    ...(store.preferences[section] || {}),
    ...patch,
  };
  const app = api();
  if (app?.SavePreferences) {
    await callAction(t("toast.saved"), () =>
      app.SavePreferences(store.preferences),
    );
  }
  emitPreferencesEffects(section, patch);
}

async function saveSettings(patch) {
  updateSettings(patch);
  const app = api();
  if (app?.SaveSettings) {
    await callAction(t("toast.saved"), () => app.SaveSettings(store.settings));
  }
  emitSettingsEffects(patch);
}

async function refreshStore() {
  if (store.onRefresh) await store.onRefresh();
}

function openExternal(path) {
  window.runtime?.BrowserOpenURL?.(path);
}

function emitSettingsEffects(patch) {
  if (patch.language)
    document.dispatchEvent(new CustomEvent("codex:language-applied"));
  if (patch.theme) applyTheme();
}

function emitPreferencesEffects(section, patch) {
  if (
    section === "appearance" &&
    (patch.theme || patch.uiFontSize || patch.codeFontSize)
  ) {
    document.dispatchEvent(new CustomEvent("codex:appearance-applied"));
  }
  if (section === "voice" && patch.dictionary) {
    document.dispatchEvent(new CustomEvent("codex:voice-dictionary-changed"));
  }
}

function applyTheme() {
  document.documentElement.classList.toggle(
    "theme-dark",
    store.settings.theme === "dark",
  );
  document.documentElement.classList.toggle(
    "theme-light",
    store.settings.theme === "light",
  );
}

const RENDERERS = {
  general: renderGeneral,
  import: renderImport,
  appshot: renderAppshot,
  language: renderLanguage,
  account: renderAccount,
  appearance: renderAppearance,
  voice: renderVoice,
  configuration: renderConfiguration,
  personalization: renderPersonalization,
  pets: renderPets,
  shortcuts: renderShortcuts,
  plugins: renderPlugins,
  browser: renderBrowser,
  "computer-use": renderComputerUse,
  hooks: renderHooks,
  connections: renderConnections,
  git: renderGit,
  environments: renderEnvironments,
  worktrees: renderWorktrees,
  "archived-tasks": renderArchived,
};

function renderGeneral(root) {
  const s = store.settings;
  root.innerHTML = `
    ${pageHead(t("general.title"))}
    ${block(t("general.permissions"), [
      row(t("general.defaultPermissions"), t("general.defaultPermissionsDesc"), switchEl("defaultPermissions", true, true)),
      rowHtml(t("general.fullAccess"), '<span>' + escapeHtml(t("general.fullAccessDesc")) + '</span> <button type="button" class="link" data-action="sandboxing-docs">' + escapeHtml(t("general.learnMore")) + '</button> <span>' + escapeHtml(t("general.fullAccessRisk")) + '</span>', switchEl("fullAccess", !!s.fullAccess)),
    ])}
    ${block(t("general.generalSection"), [
      rowHtml(t("general.noProjectFolder"), '<span>' + escapeHtml(t("general.noProjectFolderDesc")) + '</span> <span class="settings-path">' + escapeHtml(s.noProjectFolder || "") + '</span>', button(t("general.change"), "change-no-project-folder")),
      row(t("general.defaultFileOpen"), t("general.defaultFileOpenDesc"), selectEl("fileOpenDestination", s.fileOpenDestination || "default-app", [{ value: "default-app", label: t("general.defaultApp") }], "wide")),
      row(t("general.terminalShell"), t("general.terminalShellDesc"), selectEl("terminalShell", s.terminalShell || s.shell || "powershell", [{ value: "powershell", label: t("label.powershell") }, { value: "cmd", label: t("label.cmd") }, { value: "bash", label: t("label.bash") }], "wide")),
      row(t("general.language"), t("general.languageDesc"), selectEl("language", s.language || "auto", [{ value: "auto", label: t("general.autoDetect") }].concat(languageOptions()), "wide")),
      row(t("general.bottomPanel"), t("general.bottomPanelDesc"), switchEl("bottomPanel", !!s.bottomPanel)),
      row(t("general.suggestions"), t("general.suggestionsDesc"), switchEl("contextualSuggestions", s.contextualSuggestions !== false)),
      row(t("general.licenses"), t("general.licensesDesc"), button(t("action.view"), "licenses")),
      row(t("general.plugins"), t("general.pluginsDesc"), switchEl("pluginsEnabled", s.pluginsEnabled !== false)),
    ])}
    ${block(t("general.editor"), [
      row(t("general.plainText"), t("general.plainTextDesc"), switchEl("plainTextEditor", !!s.plainTextEditor)),
      row(t("general.contextUsage"), "", switchEl("showContextUsage", !!s.showContextUsage)),
      row(t("general.sendShortcut"), t("general.sendShortcutDesc"), selectEl("sendShortcut", s.sendShortcut || "enter", [{ value: "enter", label: t("general.sendOnEnter") }], "wide")),
      row(t("general.followUp"), t("general.followUpDesc"), segmented("followUpMode", s.followUpMode || "steer", [{ value: "queue", label: t("general.queue") }, { value: "steer", label: t("general.steer") }])),
    ])}
    ${block(t("general.popup"), [
      rowHtml(t("general.popupShortcut"), '<span>' + escapeHtml(t("general.popupShortcutDesc")) + '</span> <span class="settings-value" data-capture-value>' + escapeHtml(s.popupShortcut || t("label.off")) + '</span>', button(t("general.setShortcut"), "capture-popup-shortcut")),
      row(t("general.defaultDetached"), t("general.defaultDetachedDesc"), switchEl("popupDetachedDefault", !!s.popupDetachedDefault)),
    ])}
    ${block(t("general.notifications"), [
      row(t("general.turnComplete"), t("general.turnCompleteDesc"), selectEl("turnCompleteNotify", s.turnCompleteNotify || "unfocused", [{ value: "always", label: t("general.alwaysNotify") }, { value: "unfocused", label: t("general.onlyUnfocused") }, { value: "never", label: t("general.neverNotify") }], "wide")),
      row(t("general.enablePermNotify"), t("general.enablePermNotifyDesc"), switchEl("notifyPermissions", s.notifyPermissions !== false)),
      row(t("general.enableQuestionNotify"), t("general.enableQuestionNotifyDesc"), switchEl("notifyQuestions", s.notifyQuestions !== false)),
    ])}
    ${block(t("general.fun"), [
      row(t("general.confetti"), t("general.confettiDesc"), switchEl("confetti", !!s.confetti)),
    ])}`;
  wireInputs(root, saveSettings);
  root.querySelector("[data-action='licenses']")?.addEventListener("click", () => openExternal("assets/LICENSES.md"));
  root.querySelector("[data-action='sandboxing-docs']")?.addEventListener("click", () => openExternal("https://developers.openai.com/codex/sandboxing"));
  root.querySelector("[data-action='change-no-project-folder']")?.addEventListener("click", async () => {
    const picked = await api()?.SelectProjectDirectory?.();
    if (picked) {
      saveSettings({ noProjectFolder: picked });
      const label = root.querySelector(".settings-path");
      if (label) label.textContent = picked;
    }
  });
  wireCaptureButton(root, "capture-popup-shortcut", saveSettings, "popupShortcut");
}

function renderImport(root) {
  const s = store.settings;
  root.innerHTML = `
    ${pageHead(t("import.title"), t("import.desc"))}
    ${block(t("import.autoSync"), [
      row(t("import.keepSync"), t("import.keepSyncDesc"), switchEl("importKeepSync", !!s.importKeepSync)),
      row(t("import.content"), t("import.contentDesc"), selectEl("importContent", s.importContent || "custom", [{ value: "custom", label: t("import.custom") }], "wide", true)),
    ])}
    ${block(t("import.fromApps"), [
      row(t("import.fromApps"), t("import.noSettings"), button(t("import.importBtn"), "import-from-apps", "", true)),
    ])}`;
  wireInputs(root, saveSettings);
}

function renderAppshot(root) {
  const s = store.settings;
  root.innerHTML = `
    ${pageHead(t("appshot.title"), t("appshot.desc"))}
    <p class="settings-page-sub">${escapeHtml(t("appshot.lede"))}</p>
    ${block("", [
      row(t("appshot.shortcut"), t("appshot.shortcutDesc"), selectEl("appshotShortcut", s.appshotShortcut || "alt-alt", [{ value: "alt-alt", label: t("appshot.altAlt") }], "wide")),
      row(t("appshot.target"), t("appshot.targetDesc"), selectEl("appshotTarget", s.appshotTarget || "auto", [{ value: "auto", label: t("appshot.auto") }], "wide")),
      row(t("appshot.sound"), "", switchEl("appshotSound", s.appshotSound !== false)),
      '<div class="settings-row is-disabled"><div class="settings-row-copy"><div class="settings-row-title">' + escapeHtml(t("appshot.noMedia")) + '</div></div></div>',
    ])}`;
  wireInputs(root, saveSettings);
}

function renderLanguage(root) {
  const opts = languageOptions()
    .map(
      (o) =>
        `<label class="language-option"><input type="radio" name="language" value="${escapeHtml(o.value)}" ${normalizeLang(store.settings.language || "en") === o.value ? "checked" : ""} /><span>${escapeHtml(o.label)}</span></label>`,
    )
    .join("");
  root.innerHTML = `
    ${pageHead(t("language.title"))}
    ${block(t("language.select"), [`<div class="language-list">${opts}</div>`])}`;
  root.querySelectorAll("input[name='language']").forEach((el) =>
    el.addEventListener("change", () => {
      saveSettings({ language: el.value });
    }),
  );
}

function renderAppearance(root) {
  const a = pref("appearance", {});
  const currentTheme = a.theme || "system";
  const themePreview = (id) => {
    if (id === "system") {
      return `<div class="theme-preview-card theme-preview-system"><div class="tp-half light-half"></div><div class="tp-half dark-half"></div><div class="tp-lines"><div class="tp-line"></div><div class="tp-line short"></div><div class="tp-line"></div></div></div>`;
    }
    if (id === "light") {
      return `<div class="theme-preview-card theme-preview-light"><div class="tp-lines"><div class="tp-line"></div><div class="tp-line short"></div><div class="tp-line"></div><div class="tp-line"></div></div></div>`;
    }
    return `<div class="theme-preview-card theme-preview-dark"><div class="tp-lines"><div class="tp-line"></div><div class="tp-line short"></div><div class="tp-line"></div><div class="tp-line"></div></div></div>`;
  };
  const themeOptions = () => {
    const themes = [
      { id: "system", label: t("appearance.system") },
      { id: "light", label: t("appearance.light") },
      { id: "dark", label: t("appearance.dark") },
    ];
    return `<div class="theme-options">${themes.map((th) => `<button class="theme-option ${currentTheme === th.id ? "is-active" : ""}" data-theme="${th.id}" type="button">${themePreview(th.id)}<div>${escapeHtml(th.label)}</div></button>`).join("")}</div>`;
  };
  const diffPreview = `<div class="diff-preview"><div class="diff-pane"><div class="diff-line del"><span class="line-no">1</span><code>const themePreview: ThemeConfig = {</code></div><div class="diff-line del"><span class="line-no">2</span><code>  surface: "sidebar",</code></div><div class="diff-line del"><span class="line-no">3</span><code>  accent: "#2563eb",</code></div><div class="diff-line del"><span class="line-no">4</span><code>  contrast: 42,</code></div><div class="diff-line del"><span class="line-no">5</span><code>};</code></div></div><div class="diff-pane"><div class="diff-line add"><span class="line-no">1</span><code>const themePreview: ThemeConfig = {</code></div><div class="diff-line add"><span class="line-no">2</span><code>  surface: "sidebar-elevated",</code></div><div class="diff-line add"><span class="line-no">3</span><code>  accent: "#0ea5e9",</code></div><div class="diff-line add"><span class="line-no">4</span><code>  contrast: 68,</code></div><div class="diff-line add"><span class="line-no">5</span><code>};</code></div></div></div>`;
  const uiFontList = [
    { value: "system", label: t("appearance.fontSystem") },
    { value: "Segoe UI", label: "Segoe UI" },
    { value: "Microsoft YaHei", label: "Microsoft YaHei" },
    { value: "PingFang SC", label: "PingFang SC" },
    { value: "OpenAI Sans", label: "OpenAI Sans" },
  ];
  const codeFontList = [
    { value: "Cascadia Code", label: "Cascadia Code" },
    { value: "Consolas", label: "Consolas" },
    { value: "JetBrains Mono", label: "JetBrains Mono" },
    { value: "Fira Code", label: "Fira Code" },
  ];
  const themeCard = (label, themeKey) => {
    const tc = a[themeKey] || {};
    const isLight = themeKey === "lightTheme";
    const accent = tc.accent || (isLight ? "#2563eb" : "#0ea5e9");
    const bg = tc.background || (isLight ? "#FFFFFF" : "#181818");
    const fg = tc.foreground || (isLight ? "#1A1C1F" : "#FFFFFF");
    const codeTheme = tc.codeTheme || "Codex";
    const uiFont = tc.uiFont || "system";
    const contentFont = tc.contentFont || "system";
    const codeFont = tc.codeFont || "Cascadia Code";
    const contrast = tc.contrast ?? (isLight ? 45 : 60);
    const styleSel = (field) => `<button type="button" class="ui-dropdown theme-font-select" data-tfont="${themeKey}|${field}Style" disabled aria-label="${escapeHtml(label + " " + t("appearance.uiFont") + t("appearance.style"))}"><span class="ui-dropdown-label">${escapeHtml(t("appearance.regular"))}</span><span class="ui-dropdown-caret" aria-hidden="true"></span></button>`;
    const themeFontSel = (field, cur, list) => {
      const label = list.find((f) => f.value === cur)?.label || cur;
      const optsJson = escapeHtml(JSON.stringify(list));
      return `<button type="button" class="ui-dropdown theme-font-select" data-tfont="${themeKey}|${field}" data-value="${escapeHtml(cur)}" data-options="${optsJson}" aria-haspopup="listbox" aria-label="${escapeHtml(label + " " + t("appearance." + (field === "codeTheme" ? "codeTheme" : field === "codeFont" ? "codeFont" : field === "contentFont" ? "contentFont" : "uiFont")))}"><span class="ui-dropdown-label">${escapeHtml(label)}</span><span class="ui-dropdown-caret" aria-hidden="true"></span></button>`;
    };
    return `
    <div class="theme-card-block">
      <div class="theme-card-head">
        <span class="theme-card-label">${escapeHtml(label)}</span>
        <div class="theme-card-actions">
          <button type="button" class="theme-card-btn" data-theme-import="${themeKey}">${escapeHtml(t(isLight ? "appearance.importLight" : "appearance.importDark"))}</button>
          <button type="button" class="theme-card-btn" data-theme-copy="${themeKey}">${escapeHtml(t(isLight ? "appearance.copyLight" : "appearance.copyDark"))}</button>
        </div>
      </div>
      <div class="theme-card-row">
        <span class="theme-card-field-label">${escapeHtml(t("appearance.codeTheme"))}</span>
        ${themeFontSel("codeTheme", codeTheme, [{ value: codeTheme, label: codeTheme }])}
      </div>
      <div class="theme-card-row">
        <span class="theme-card-field-label">${escapeHtml(t("appearance.accent"))}</span>
        <div class="theme-color-wrap" data-tcolor-wrap><label class="theme-color-swatch" style="background:${accent}"><input type="color" data-tcolor="${themeKey}|accent" value="${accent}" aria-label="${escapeHtml(label + " " + t("appearance.accent"))}" /><span>${accent}</span></label></div>
      </div>
      <div class="theme-card-row">
        <span class="theme-card-field-label">${escapeHtml(t("appearance.background"))}</span>
        <div class="theme-color-wrap" data-tcolor-wrap><label class="theme-color-swatch" style="background:${bg}"><input type="color" data-tcolor="${themeKey}|background" value="${bg}" aria-label="${escapeHtml(label + " " + t("appearance.background"))}" /><span>${bg}</span></label><input type="text" class="theme-hex-input" data-tcolor="${themeKey}|background" value="${bg}" /></div>
      </div>
      <div class="theme-card-row">
        <span class="theme-card-field-label">${escapeHtml(t("appearance.foreground"))}</span>
        <div class="theme-color-wrap" data-tcolor-wrap><label class="theme-color-swatch" style="background:${fg}"><input type="color" data-tcolor="${themeKey}|foreground" value="${fg}" aria-label="${escapeHtml(label + " " + t("appearance.foreground"))}" /><span>${fg}</span></label><input type="text" class="theme-hex-input" data-tcolor="${themeKey}|foreground" value="${fg}" /></div>
      </div>
      <div class="theme-card-row">
        <span class="theme-card-field-label">${escapeHtml(t("appearance.uiFont"))}</span>
        <div class="theme-font-pair">${themeFontSel("uiFont", uiFont, uiFontList)}${styleSel("uiFont")}</div>
      </div>
      <div class="theme-card-row">
        <span class="theme-card-field-label">${escapeHtml(t("appearance.contentFont"))}</span>
        <div class="theme-font-pair">${themeFontSel("contentFont", contentFont, uiFontList)}${styleSel("contentFont")}</div>
      </div>
      <div class="theme-card-row">
        <span class="theme-card-field-label">${escapeHtml(t("appearance.codeFont"))}</span>
        <div class="theme-font-pair">${themeFontSel("codeFont", codeFont, codeFontList)}${styleSel("codeFont")}</div>
      </div>
      <div class="theme-card-row">
        <span class="theme-card-field-label">${escapeHtml(t("appearance.contrast"))}</span>
        <div class="theme-contrast-row"><input type="range" class="settings-range theme-contrast-range" min="0" max="100" value="${contrast}" data-theme-contrast="${themeKey}" aria-label="${escapeHtml(label + " " + t("appearance.contrast"))}" /><span class="theme-contrast-value">${contrast}</span></div>
      </div>
    </div>`;
  };
  const reduceMotionValue = a.reduceMotion === "on" ? "on" : a.reduceMotion === "off" ? "off" : "system";
  const diffMarkersValue = a.diffMarkers === "plusminus" ? "plusminus" : "color";
  root.innerHTML = `
    ${pageHead(t("appearance.title"))}
    ${block(t("appearance.theme"), [themeOptions()])}
    ${blockCustom("", diffPreview)}
    ${blockCustom("", themeCard(t("appearance.lightTheme"), "lightTheme"))}
    ${blockCustom("", themeCard(t("appearance.darkTheme"), "darkTheme"))}
    ${block(t("appearance.prefs"), [
      row(t("appearance.pointer"), t("appearance.pointerDesc"), switchEl("pointerCursors", a.pointerCursors === true)),
      row(t("appearance.reduceMotion"), t("appearance.reduceMotionDesc"), segmented("reduceMotion", reduceMotionValue, [{ value: "system", label: t("appearance.system") }, { value: "on", label: t("appearance.on") }, { value: "off", label: t("appearance.off") }])),
      row(t("appearance.uiFontSize"), t("appearance.uiFontSizeDesc"), '<div class="fontsize-input-row"><input type="number" class="fontsize-input" data-fontsize="uiFontSize" aria-label="' + escapeHtml(t("appearance.sansSize")) + '" value="' + (a.uiFontSize || 14) + '" min="10" max="24" /><span class="fontsize-unit">px</span></div>'),
      row(t("appearance.codeFontSize"), t("appearance.codeFontSizeDesc"), '<div class="fontsize-input-row"><input type="number" class="fontsize-input" data-fontsize="codeFontSize" aria-label="' + escapeHtml(t("appearance.codeFontSize")) + '" value="' + (a.codeFontSize || 13) + '" min="10" max="24" /><span class="fontsize-unit">px</span></div>'),
      row(t("appearance.diffMarkers"), t("appearance.diffMarkersDesc"), segmented("diffMarkers", diffMarkersValue, [{ value: "color", label: t("appearance.color") }, { value: "plusminus", label: t("appearance.plusminus") }])),
    ])}`;
  root.querySelectorAll("[data-theme]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      root.querySelectorAll("[data-theme]").forEach((b) => b.classList.toggle("is-active", b === btn));
      await savePreferences("appearance", { theme: btn.dataset.theme });
      updateSettings({ theme: btn.dataset.theme });
      applyTheme();
    })
  );
  root.querySelectorAll("[data-fontsize]").forEach((input) =>
    input.addEventListener("change", async () => {
      const val = parseInt(input.value, 10);
      if (val >= 10 && val <= 24) {
        await savePreferences("appearance", { [input.dataset.fontsize]: val });
      }
    })
  );
  root.querySelectorAll("[data-theme-contrast]").forEach((input) => {
    const valSpan = input.parentElement.querySelector(".theme-contrast-value");
    input.addEventListener("input", () => { if (valSpan) valSpan.textContent = input.value; });
    input.addEventListener("change", async () => {
      const key = input.dataset.themeContrast;
      const tc = a[key] || {};
      await savePreferences("appearance", { [key]: { ...tc, contrast: parseInt(input.value, 10) } });
    });
  });
  root.querySelectorAll("[data-tfont]:not([disabled])").forEach((el) =>
    el.addEventListener("change", async () => {
      const parts = el.dataset.tfont.split("|");
      const tc = a[parts[0]] || {};
      await savePreferences("appearance", { [parts[0]]: { ...tc, [parts[1]]: el.value } });
    })
  );
  // Mount custom dropdowns for theme font selects.
  root.querySelectorAll("button.ui-dropdown[data-tfont]:not([disabled])").forEach((btn) => {
    let items;
    try { items = JSON.parse(btn.dataset.options); } catch { items = []; }
    btn.value = btn.dataset.value || "";
    createDropdown({
      anchor: btn,
      items,
      value: btn.dataset.value,
      // Dropdown fires change itself; only sync local dataset here.
      onSelect: (val) => {
        btn.value = val;
        btn.dataset.value = val;
      },
    });
  });
  root.querySelectorAll("[data-tcolor]").forEach((el) =>
    el.addEventListener("change", async () => {
      const parts = el.dataset.tcolor.split("|");
      const tc = a[parts[0]] || {};
      let val = el.value.trim();
      if (el.type === "text" && !val.startsWith("#")) val = "#" + val;
      await savePreferences("appearance", { [parts[0]]: { ...tc, [parts[1]]: val } });
      const wrap = el.closest("[data-tcolor-wrap]");
      if (wrap) {
        const sw = wrap.querySelector(".theme-color-swatch");
        if (sw) {
          sw.style.background = val;
          const sp = sw.querySelector("span");
          if (sp) sp.textContent = val;
        }
        const hex = wrap.querySelector('input[type="text"]');
        if (hex && hex !== el) hex.value = val;
        const pick = wrap.querySelector('input[type="color"]');
        if (pick && pick !== el && /^#[0-9a-fA-F]{6}$/.test(val)) pick.value = val;
      }
    })
  );
  root.querySelectorAll("[data-theme-import]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const key = btn.dataset.themeImport;
      const inp = document.createElement("input");
      inp.type = "file";
      inp.accept = "application/json,.json";
      inp.onchange = async () => {
        const f = inp.files && inp.files[0];
        if (!f) return;
        try {
          const obj = JSON.parse(await f.text());
          await savePreferences("appearance", { [key]: { ...(a[key] || {}), ...obj } });
          renderAppearance(root);
        } catch (e) {
          toast(String((e && e.message) || e));
        }
      };
      inp.click();
    })
  );
  root.querySelectorAll("[data-theme-copy]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const tc = a[btn.dataset.themeCopy] || {};
      try {
        await navigator.clipboard.writeText(JSON.stringify(tc, null, 2));
        toast(t("toast.copied", "Copied"));
      } catch (e) {
        toast(String((e && e.message) || e));
      }
    })
  );
  wireInputs(root, (patch) => savePreferences("appearance", patch));
}

function renderVoice(root) {
  const v = pref("voice", {});
  const mics = [{ value: "default", label: t("voice.systemDefault") }].concat(
    (store.audioDevices || []).filter((d) => d && d !== t("common.default")).map((d) => ({ value: d, label: d }))
  );
  const dict = Array.isArray(v.dictEntries) ? v.dictEntries : [""];
  const dictRows = dict.map((w, i) => '<div class="settings-row dict-row"><input type="text" class="settings-input" data-dict="' + i + '" value="' + escapeHtml(w) + '" aria-label="' + escapeHtml(t("voice.dictEntry") + " " + (i + 1)) + '" /><button type="button" class="settings-button" data-dict-remove="' + i + '" aria-label="' + escapeHtml(t("voice.removeEntry") + " " + (i + 1)) + '"' + (dict.length <= 1 ? " disabled" : "") + '>' + escapeHtml(t("voice.remove")) + '</button></div>').join("");
  root.innerHTML = `
    ${pageHead(t("voice.title"))}
    ${block(t("voice.general"), [
      row(t("voice.mic"), t("voice.micDesc"), selectEl("microphone", v.microphone || "default", mics, "wide")),
    ])}
    ${block(t("voice.chat"), [
      row(t("voice.chatUnavailable"), t("voice.chatUnavailableDesc"), ""),
    ])}
    ${block(t("voice.dictation"), [
      rowHtml(t("voice.holdKey"), '<span>' + escapeHtml(t("voice.holdKeyDesc")) + '</span> <span class="settings-value" data-capture-value>' + escapeHtml(v.holdKey || t("label.off")) + '</span>', button(t("voice.setHoldKey"), "capture-hold-key")),
      rowHtml(t("voice.toggleKey"), '<span>' + escapeHtml(t("voice.toggleKeyDesc")) + '</span> <span class="settings-value" data-capture-value>' + escapeHtml(v.toggleKey || t("label.off")) + '</span>', button(t("voice.setToggleKey"), "capture-toggle-key")),
      row(t("voice.dictionary"), t("voice.dictionaryDesc"), button(t("voice.addEntry"), "dict-add")),
      dictRows,
      row(t("voice.recent"), t("voice.recentDesc"), ""),
    ])}`;
  const save = (patch) => savePreferences("voice", patch);
  wireInputs(root, save);
  wireCaptureButton(root, "capture-hold-key", save, "holdKey");
  wireCaptureButton(root, "capture-toggle-key", save, "toggleKey");
  root.querySelector("[data-action='dict-add']")?.addEventListener("click", async () => {
    await savePreferences("voice", { dictEntries: dict.concat([""]) });
    renderVoice(root);
  });
  root.querySelectorAll("[data-dict]").forEach((el) =>
    el.addEventListener("change", () => {
      const next = dict.slice();
      next[Number(el.dataset.dict)] = el.value;
      savePreferences("voice", { dictEntries: next });
    })
  );
  root.querySelectorAll("[data-dict-remove]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const next = dict.slice();
      next.splice(Number(btn.dataset.dictRemove), 1);
      await savePreferences("voice", { dictEntries: next.length ? next : [""] });
      renderVoice(root);
    })
  );
}

function renderAccount(root) {
  const providers = store.providers || [];
  const active =
    providers.find((p) => p.id === store.settings.activeProviderId) ||
    providers[0];
  const rows = providers
    .map((p) => providerRow(p, active?.id === p.id))
    .join("");
  root.innerHTML = `
    ${pageHead(t("account.title"))}
    ${block(t("account.activeProvider"), [
      `
      <div class="provider-active">${active ? escapeHtml(active.name + " (" + active.protocol + ")") : escapeHtml(t("account.none"))}</div>
      ${selectEl("activeProviderId", active?.id || "", providers.map((p) => ({ value: p.id, label: `${p.name}${p.hasApiKey ? " ? key" : ""}` })).concat([{ value: "", label: t("account.none") }]), "wide")}
    `,
    ])}
    ${block(t("account.providers"), [
      `
      <div class="provider-list">${rows || `<div class="settings-card site-empty">${escapeHtml(t("account.noProviders"))}</div>`}</div>
      ${button(t("account.addProvider"), "add-provider", "primary")}
    `,
    ])}`;
  wireInputs(root, (patch) => {
    if (patch.activeProviderId !== undefined) {
      updateSettings({ activeProviderId: patch.activeProviderId || "" });
      api()?.SaveSettings?.(store.settings);
    }
  });
  root
    .querySelector("[data-action='add-provider']")
    ?.addEventListener("click", () => openProviderEditor(root));
  root
    .querySelectorAll("[data-edit-provider]")
    .forEach((btn) =>
      btn.addEventListener("click", () =>
        openProviderEditor(root, btn.dataset.editProvider),
      ),
    );
  root.querySelectorAll("[data-delete-provider]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      if (!confirm(t("account.deleteConfirm"))) return;
      await callAction(t("account.deleted"), () =>
        requireApi("DeleteProvider").then((fn) =>
          fn(btn.dataset.deleteProvider),
        ),
      );
      await refreshStore();
      renderAccount(root);
    }),
  );
  root.querySelectorAll("[data-set-active]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      updateSettings({ activeProviderId: btn.dataset.setActive });
      await api()?.SaveSettings?.(store.settings);
      await refreshStore();
      renderAccount(root);
    }),
  );
}

function providerRow(p, isActive) {
  const models = (p.models || []).slice(0, 3).join(", ");
  return `
    <div class="provider-row ${isActive ? "is-active" : ""}">
      <div class="plugin-icon">${escapeHtml((p.name || "P").slice(0, 1).toUpperCase())}</div>
      <div class="provider-row-meta">
        <div class="provider-row-name">${escapeHtml(p.name)}${isActive ? `<span class="provider-pill">${escapeHtml(t("account.activePill"))}</span>` : ""}</div>
        <div class="provider-row-desc">${escapeHtml(p.protocol)} ? ${escapeHtml(p.baseUrl || "")}${p.hasApiKey ? " ? key saved" : ""}${models ? " ? " + escapeHtml(models) : ""}</div>
      </div>
      <div class="provider-row-actions">
        <button type="button" data-set-active="${p.id}" ${isActive ? "disabled" : ""}>${escapeHtml(t("account.use"))}</button>
        <button type="button" data-edit-provider="${p.id}">${escapeHtml(t("action.edit"))}</button>
        <button type="button" data-delete-provider="${p.id}" class="danger">${escapeHtml(t("action.delete"))}</button>
      </div>
    </div>`;
}

function openProviderEditor(root, providerId) {
  const existing = providerId
    ? (store.providers || []).find((p) => p.id === providerId)
    : null;
  const d = {
    id: existing?.id || "",
    name: existing?.name || "",
    protocol: existing?.protocol || "openai_chat",
    baseUrl: existing?.baseUrl || "",
    apiKey: existing?.apiKey || "",
    defaultModel: existing?.defaultModel || "",
    models: existing?.models || [],
    contextWindow: existing?.contextWindow || 128000,
    maxOutputTokens: existing?.maxOutputTokens || existing?.maxOutput || 8192,
    hasApiKey: !!existing?.hasApiKey,
  };
  showModal(
    existing ? t("account.editProvider") : t("account.addProvider"),
    t("account.providerDesc"),
    `
    ${row(t("account.providerName"), "", inputEl("name", d.name, "My Provider"))}
    ${row(t("account.protocol"), "", selectEl("protocol", d.protocol, PROTOCOL_OPTIONS, "wide"))}
    ${row(t("account.baseUrl"), "", inputEl("baseUrl", d.baseUrl, "https://api.openai.com/v1"))}
    ${row(t("account.apiKey"), d.hasApiKey ? t("account.apiKeyKeep") : t("account.apiKeyNew"), inputEl("apiKey", d.apiKey, d.hasApiKey ? "???????? (unchanged if blank)" : "sk-..."))}
    ${row(t("account.model"), "", inputEl("defaultModel", d.defaultModel, "gpt-4o"))}
    ${row(t("account.contextWindow"), "", numberEl("contextWindow", d.contextWindow, 1, 10000000))}
    ${row(t("account.maxOutputTokens"), "", numberEl("maxOutputTokens", d.maxOutputTokens, 1, 10000000))}
    <div class="provider-probe"><button type="button" data-probe class="settings-button">${escapeHtml(t("account.probe"))}</button><span class="probe-result"></span></div>
  `,
    [
      { label: t("action.cancel") },
      {
        label: t("action.save"),
        primary: true,
        action: async (modal) => {
          const get = (k) =>
            modal
              .querySelector(`[data-input='${k}'],[data-select='${k}']`)
              ?.value?.trim() || "";
          const provider = {
            id: d.id || undefined,
            name: get("name") || "Provider",
            protocol: get("protocol") || "openai_chat",
            baseUrl: get("baseUrl"),
            apiKey: get("apiKey"),
            defaultModel: get("defaultModel"),
            models: d.models || [],
            contextWindow: Number(get("contextWindow")) || 128000,
            maxOutputTokens: Number(get("maxOutputTokens")) || 8192,
            hasApiKey: !!(d.hasApiKey || get("apiKey")),
          };
          await callAction(t("account.saved"), () =>
            requireApi("SaveProvider").then((fn) => fn(provider)),
          );
          await refreshStore();
          renderAccount(root);
        },
      },
    ],
  );
  const probeBtn = document.querySelector("[data-probe]");
  const resultEl = document.querySelector(".probe-result");
  probeBtn?.addEventListener("click", async () => {
    const modal = probeBtn.closest(".settings-modal");
    const get = (k) =>
      modal
        .querySelector(`[data-input='${k}'],[data-select='${k}']`)
        ?.value?.trim() || "";
    resultEl.textContent = t("account.probing");
    try {
      const result = await api()?.ProbeProvider?.(
        d.id || "",
        get("baseUrl"),
        get("protocol"),
        get("apiKey"),
        get("defaultModel"),
        true,
        true,
        false,
      );
      resultEl.textContent = result?.ok
        ? t("account.probeOk")
        : result?.error || t("account.probeFail");
    } catch (e) {
      resultEl.textContent = String(e.message || e);
    }
  });
}

function showModal(title, desc, body, actions) {
  document.querySelector(".settings-modal-backdrop")?.remove();
  const wrap = document.createElement("div");
  wrap.className = "settings-modal-backdrop";
  wrap.innerHTML = `<div class="settings-modal"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(desc)}</p><div class="settings-modal-body">${body}</div><div class="settings-modal-actions"></div></div>`;
  const modal = wrap.querySelector(".settings-modal");
  const actionsEl = wrap.querySelector(".settings-modal-actions");
  for (const action of actions) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `settings-button ${action.primary ? "primary" : ""}`;
    b.textContent = action.label;
    b.addEventListener("click", async () => {
      await action.action?.(modal);
      wrap.remove();
    });
    actionsEl.appendChild(b);
  }
  wrap.addEventListener("click", (e) => {
    if (e.target === wrap) wrap.remove();
  });
  document.body.appendChild(wrap);
  // Mount custom dropdown popovers inside the modal.
  initSelectDropdowns(wrap);
}

function renderConfiguration(root) {
  const deps = store.dependencies || [];
  root.innerHTML = `
    ${pageHead(t("configuration.title"))}
    ${block(t("configuration.checks"), [`<div class="dependency-list">${deps.map((d) => `<div class="plugin-row"><div class="plugin-icon">${d.ok ? "?" : "?"}</div><div><div class="plugin-name">${escapeHtml(d.name)}</div><div class="plugin-desc">${escapeHtml(d.message || "")}</div></div></div>`).join("") || `<div class="settings-card site-empty">${escapeHtml(t("configuration.empty"))}</div>`}</div>`])}`;
}

function renderPersonalization(root) {
  const p = pref("personalization", {});
  const agents = p.agents ?? "";
  root.innerHTML = `
    ${pageHead(t("personal.title"))}
    ${blockCustom(t("personal.instructions"), '<p class="settings-page-sub">' + escapeHtml(t("personal.instructionsDesc")) + ' <button type="button" class="link" data-action="agents-docs">' + escapeHtml(t("personal.learnMore")) + '</button></p><textarea class="settings-textarea" data-agents aria-label="' + escapeHtml(t("personal.instructions")) + '">' + escapeHtml(agents) + '</textarea>', button(t("action.save"), "save-agents", "", true))}
    ${blockCustom(t("personal.memory"), '<p class="settings-page-sub">' + escapeHtml(t("personal.memoryDesc")) + ' <button type="button" class="link" data-action="memory-docs">' + escapeHtml(t("personal.learnMore")) + '</button></p><div class="settings-card">' + row(t("personal.localMemory"), t("personal.localMemoryDesc"), switchEl("localMemory", !!p.localMemory)) + row(t("personal.toolMemory"), t("personal.toolMemoryDesc"), switchEl("toolMemory", true, true)) + row(t("personal.deleteMemory"), t("personal.deleteMemoryDesc"), button(t("action.delete"), "delete-memory")) + '</div>')}`;
  wireInputs(root, (patch) => savePreferences("personalization", patch));
  const editor = root.querySelector("[data-agents]");
  const saveBtn = root.querySelector("[data-action='save-agents']");
  editor?.addEventListener("input", () => { if (saveBtn) saveBtn.disabled = editor.value === agents; });
  saveBtn?.addEventListener("click", async () => {
    await savePreferences("personalization", { agents: editor ? editor.value : agents });
    if (saveBtn) saveBtn.disabled = true;
    toast(t("toast.saved", "Saved"));
  });
  root.querySelector("[data-action='agents-docs']")?.addEventListener("click", () => openExternal("https://developers.openai.com/codex/guides/agents-md"));
  root.querySelector("[data-action='memory-docs']")?.addEventListener("click", () => openExternal("https://developers.openai.com/codex/memories"));
  root.querySelector("[data-action='delete-memory']")?.addEventListener("click", async () => {
    try { await api()?.DeleteLocalMemories?.(); } catch (e) {}
    await savePreferences("personalization", { localMemory: false });
    toast(t("personal.deleted"));
    renderPersonalization(root);
  });
}

function petThumbUrl(pet) {
  const thumb = pet?.thumb || "";
  if (!thumb) return "";
  if (/^https?:\/\//i.test(thumb) || thumb.startsWith("data:")) return thumb;
  return "/" + thumb.replace(/^\/+/, "");
}

function renderPets(root) {
  const PETS = [
    { id: "mini", name: "杩蜂綘", desc: "杞婚噺绾?Codex 浼欎即" },
    { id: "codex", name: "Codex", desc: "The original Codex companion." },
    { id: "dewey", name: "Dewey", desc: "A calm companion for focused workspace days" },
    { id: "fireball", name: "Fireball", desc: "Hot path energy for fast iteration." },
    { id: "hoots", name: "Hoots", desc: "A sharp-eyed owl for polished work in a blink." },
    { id: "rocky", name: "Rocky", desc: "A steady rock when the diff gets large." },
    { id: "seedy", name: "Seedy", desc: "Small green shoots for new ideas." },
    { id: "stacky", name: "Stacky", desc: "A balanced stack for deep work." },
    { id: "bsod", name: "BSOD", desc: "A tiny blue-screen gremlin." },
    { id: "null-signal", name: "Null Signal", desc: "Quiet signal from the void." },
  ];
  const p = pref("pets", {});
  const active = p.active || "codex";
  const customs = Array.isArray(p.custom) ? p.custom : [];
  const all = PETS.concat(customs);
  const cards = all.map((pet) => '<button type="button" class="pet-card' + (active === pet.id ? " is-active" : "") + '" data-pet="' + pet.id + '" aria-pressed="' + (active === pet.id) + '"><span class="pet-name">' + escapeHtml(pet.name) + '</span><span class="pet-desc">' + escapeHtml(pet.desc) + '</span></button>').join("");
  root.innerHTML = `
    ${pageHead(t("pets.title"), t("pets.desc"))}
    ${blockCustom("", '<div class="pet-top-row">' + button(t("pets.show"), "show-pet", "primary") + selectEl("petVariant", p.variant || "custom", [{ value: "custom", label: t("pets.custom") }], "") + '</div>')}
    ${blockCustom(t("pets.mine"), '<div class="pet-actions-row">' + button(t("pets.refresh"), "pets-refresh") + button(t("pets.create"), "pet-create") + '</div><div class="pet-grid">' + cards + '</div>')}`;
  wireInputs(root, (patch) => savePreferences("pets", patch));
  root.querySelector("[data-action='show-pet']")?.addEventListener("click", () => document.dispatchEvent(new CustomEvent("codex:show-pet")));
  root.querySelector("[data-action='pets-refresh']")?.addEventListener("click", () => renderPets(root));
  root.querySelector("[data-action='pet-create']")?.addEventListener("click", async () => {
    const n = customs.length + 1;
    await savePreferences("pets", { custom: customs.concat([{ id: "custom-" + Date.now(), name: t("pets.custom") + " " + n, desc: "" }]) });
    renderPets(root);
  });
  root.querySelectorAll("[data-pet]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      await savePreferences("pets", { active: btn.dataset.pet });
      document.dispatchEvent(new CustomEvent("codex:pet-changed", { detail: btn.dataset.pet }));
      renderPets(root);
    })
  );
}

function renderShortcuts(root) {
  const list = store.shortcuts || [];
  const q = (shortcutSearchValue || "").toLowerCase();
  const filtered = q ? list.filter((s) => (s.label || "").toLowerCase().includes(q) || (s.id || "").toLowerCase().includes(q)) : list;
  const rows = filtered
    .map(
      (s) => `
    <div class="shortcut-row">
      <div>
        <div class="shortcut-name">${escapeHtml(s.label)}</div>
        <div class="shortcut-description">${escapeHtml(s.desc || s.id)}</div>
      </div>
      <div class="shortcut-bindings">${(s.keys || []).length ? `<kbd class="key">${escapeHtml((s.keys || []).join("+"))}</kbd>` : `<span class="shortcut-unassigned">${escapeHtml(t("shortcuts.unassigned"))}</span>`}</div>
      <button class="shortcut-edit" data-edit-shortcut="${s.id}" type="button"></button>
      <button class="shortcut-delete" data-delete-shortcut="${s.id}" type="button"></button>
    </div>`,
    )
    .join("");
  root.innerHTML = `
    ${pageHead(t("shortcuts.title"))}
    <div class="shortcuts-search-bar">
      <span class="shortcuts-search-icon"></span>
      <input type="text" class="shortcuts-search-input" placeholder="${escapeHtml(t("shortcuts.search"))}" value="${escapeHtml(shortcutSearchValue)}" />
      <button type="button" class="shortcuts-search-clear" data-clear-search></button>
    </div>
    <div class="shortcuts-list">${rows || `<div class="settings-card site-empty">${escapeHtml(t("shortcuts.empty"))}</div>`}</div>
  `;
  const searchInput = root.querySelector(".shortcuts-search-input");
  searchInput?.addEventListener("input", () => {
    shortcutSearchValue = searchInput.value;
    renderShortcuts(root);
    searchInput.focus();
  });
  root.querySelector("[data-clear-search]")?.addEventListener("click", () => {
    shortcutSearchValue = "";
    renderShortcuts(root);
  });
  root.querySelectorAll("[data-edit-shortcut]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const id = btn.dataset.editShortcut;
      const shortcut = list.find((s) => s.id === id);
      if (!shortcut) return;
      showModal(
        t("shortcuts.editTitle", { name: shortcut.label }),
        t("shortcuts.editDesc"),
        `<div class="hotkey-capture-box" data-capture>${escapeHtml(t("shortcuts.pressKeys"))}</div>`,
        [
          { label: t("shortcuts.clear"), action: async () => {
              const updated = list.map((s) => s.id === id ? { ...s, keys: [] } : s);
              await api()?.SaveShortcuts?.(updated);
              await refreshStore();
              renderShortcuts(root);
            }
          },
          { label: t("shortcuts.done"), primary: true },
        ],
      );
      const captureBox = document.querySelector("[data-capture]");
      if (captureBox) {
        const handler = (e) => {
          e.preventDefault();
          const keys = [];
          if (e.ctrlKey) keys.push("Ctrl");
          if (e.shiftKey) keys.push("Shift");
          if (e.altKey) keys.push("Alt");
          if (e.metaKey) keys.push("Meta");
          if (e.key && !["Control", "Shift", "Alt", "Meta"].includes(e.key)) {
            keys.push(e.key.length === 1 ? e.key.toUpperCase() : e.key);
          }
          if (keys.length) {
            const updated = list.map((s) => s.id === id ? { ...s, keys } : s);
            api()?.SaveShortcuts?.(updated).then(async () => {
              await refreshStore();
              renderShortcuts(root);
              const modal = document.querySelector(".modal-overlay");
              if (modal) modal.remove();
            });
          }
        };
        captureBox.addEventListener("keydown", handler);
        captureBox.setAttribute("tabindex", "0");
        captureBox.focus();
      }
    }),
  );
  root.querySelectorAll("[data-delete-shortcut]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const id = btn.dataset.deleteShortcut;
      const updated = list.filter((s) => s.id !== id);
      await api()?.SaveShortcuts?.(updated);
      await refreshStore();
      renderShortcuts(root);
    }),
  );
}

function renderPlugins(root) {
  const servers = store.mcpServers || [];
  root.innerHTML = `
    ${pageHead(t("plugins.title"))}
    ${block(t("plugins.mcpServers"), [
      `
      <div class="plugin-list">${servers.map((s) => `<div class="plugin-row"><div class="plugin-icon">M</div><div><div class="plugin-name">${escapeHtml(s.name)}</div><div class="plugin-desc">${escapeHtml(s.transport)}</div></div></div>`).join("") || `<div class="settings-card site-empty">${escapeHtml(t("plugins.empty"))}</div>`}</div>
      ${button(t("plugins.addMcp"), "add-mcp", "primary")}
    `,
    ])}`;
  root
    .querySelector("[data-action='add-mcp']")
    ?.addEventListener("click", () => {
      showModal(
        t("plugins.addMcpTitle"),
        t("plugins.addMcpDesc"),
        `
      ${row(t("plugins.mcpName"), "", inputEl("name", "", "MCP server"))}
      ${row(
        t("plugins.mcpTransport"),
        "",
        selectEl(
          "transport",
          "stdio",
          [
            { value: "stdio", label: "stdio" },
            { value: "http", label: "http" },
            { value: "sse", label: "sse" },
          ],
          "wide",
        ),
      )}
      ${row(t("plugins.mcpCommand"), "", inputEl("command", ""))}
    `,
        [
          { label: t("action.cancel") },
          {
            label: t("action.save"),
            primary: true,
            action: async (modal) => {
              const get = (k) =>
                modal
                  .querySelector(`[data-input='${k}'],[data-select='${k}']`)
                  ?.value?.trim() || "";
              const entry = {
                name: get("name") || "MCP server",
                transport: get("transport") || "stdio",
                command: get("command"),
                enabled: true,
              };
              await callAction(t("plugins.mcpSaved"), () =>
                requireApi("SaveMCPServer").then((fn) => fn(entry)),
              );
              await refreshStore();
              renderPlugins(root);
            },
          },
        ],
      );
    });
}

function renderBrowser(root) {
  const b = pref("browser", {});
  root.innerHTML = `
    ${pageHead(t("browser.title"))}
    ${block(t("browser.general"), [
      row(
        t("browser.enabled"),
        t("browser.enabledDesc"),
        switchEl("enabled", b.enabled !== false),
      ),
      row(
        t("browser.openLinks"),
        t("browser.openLinksDesc"),
        selectEl(
          "openTarget",
          b.openTarget || "embedded",
          [
            { value: "embedded", label: t("browser.embedded") },
            { value: "system", label: t("browser.system") },
          ],
          "wide",
        ),
      ),
      row(
        t("browser.screenshots"),
        t("browser.screenshotsDesc"),
        selectEl(
          "screenshots",
          b.screenshots || "ask",
          [
            { value: "always", label: t("browser.always") },
            { value: "ask", label: t("browser.ask") },
            { value: "never", label: t("browser.never") },
          ],
          "wide",
        ),
      ),
    ])}`;
  wireInputs(root, (patch) => savePreferences("browser", patch));
}

function renderComputerUse(root) {
  const c = pref("computerUse", {});
  root.innerHTML = `
    ${pageHead(t("computerUse.title"))}
    ${block(t("computerUse.permissions"), [
      row(
        t("computerUse.anyApp"),
        t("computerUse.anyAppDesc"),
        switchEl("anyApp", !!c.anyApp),
      ),
    ])}`;
  wireInputs(root, (patch) => savePreferences("computerUse", patch));
}

function renderHooks(root) {
  const hooks = store.hooks || [];
  root.innerHTML = `
    ${pageHead(t("hooks.title"))}
    ${block(t("hooks.list"), [`<div class="hooks-list">${hooks.map((h) => `<div class="plugin-row"><div class="plugin-icon">H</div><div><div class="plugin-name">${escapeHtml(h.name || h.event)}</div><div class="plugin-desc">${escapeHtml(h.command || "")}</div></div></div>`).join("") || `<div class="settings-card site-empty">${escapeHtml(t("hooks.empty"))}</div>`}</div>`])}`;
}

// Settings → 连接: SSH-only per official UIA (REPORT-2026-09-16 §2.2).
// Rows come from the Rust connectors store (list/save/delete/test).
let connectionsCache = null;

async function refreshConnectionsCache() {
  try {
    const list = await api()?.ListConnectors?.();
    if (Array.isArray(list)) connectionsCache = list;
  } catch (e) {
    console.warn("[settings] ListConnectors failed", e);
  }
  return connectionsCache || [];
}

function renderConnections(root) {
  const paint = (conns) => {
    const ssh = (conns || []).filter((c) => !c.kind || c.kind === "ssh");
    const rows = ssh.map((c) => {
      const cfg = (c.config && typeof c.config === "object") ? c.config : {};
      const host = cfg.host || c.host || "";
      const user = cfg.user || c.user || "";
      const sub = [user ? `${user}@` : "", host].join("") || c.id || "";
      return `<div class="plugin-row" data-conn-id="${escapeHtml(c.id)}">
        <div class="plugin-icon">S</div>
        <div><div class="plugin-name">${escapeHtml(c.name || host || c.id)}</div>
        <div class="plugin-desc">${escapeHtml(sub)}</div></div>
        <div class="provider-row-actions">
          <button class="settings-button" type="button" data-conn-test="${escapeHtml(c.id)}">${escapeHtml(t("connections.test"))}</button>
          <button class="settings-button danger" type="button" data-conn-del="${escapeHtml(c.id)}">${escapeHtml(t("action.delete"))}</button>
        </div>
      </div>`;
    }).join("");
    root.innerHTML = `
      ${pageHead(t("connections.title"))}
      ${block(t("connections.sshHead"), [
        `<div class="connections-list">${rows || `<div class="settings-card site-empty">${escapeHtml(t("connections.empty"))}</div>`}</div>
         <div class="connections-foot">${button(t("connections.add"), "add-conn", "primary")}</div>`,
      ])}`;
    root.querySelector("[data-action='add-conn']")?.addEventListener("click", () => {
      showModal(
        t("connections.addTitle"),
        t("connections.addDesc"),
        `
        ${row(t("connections.name"), "", inputEl("name", ""))}
        ${row(t("connections.host"), "", inputEl("host", "", "host.example.com"))}
        ${row(t("connections.user"), "", inputEl("user", ""))}
        `,
        [
          { label: t("connections.cancel") },
          {
            label: t("connections.save"),
            primary: true,
            action: async (modal) => {
              const get = (k) => modal.querySelector(`[data-input='${k}']`)?.value?.trim() || "";
              const host = get("host");
              if (!host) return;
              const entry = {
                id: `ssh-${Date.now()}`,
                name: get("name") || host,
                kind: "ssh",
                config: { host, user: get("user") },
              };
              await callAction(t("toast.saved"), () =>
                requireApi("SaveConnector").then((fn) => fn(entry)),
              );
              await refreshStore();
              renderConnections(root);
            },
          },
        ],
      );
    });
    root.querySelectorAll("[data-conn-test]").forEach((btn) => btn.addEventListener("click", async () => {
      try {
        await callAction(t("connections.checked"), () =>
          requireApi("TestConnector").then((fn) => fn(btn.dataset.connTest)),
        );
      } catch (e) {
        toast(String((e && e.message) || e));
      }
    }));
    root.querySelectorAll("[data-conn-del]").forEach((btn) => btn.addEventListener("click", async () => {
      try {
        await callAction(t("toast.saved"), () =>
          requireApi("DeleteConnector").then((fn) => fn(btn.dataset.connDel)),
        );
        await refreshStore();
        renderConnections(root);
      } catch (e) {
        toast(String((e && e.message) || e));
      }
    }));
  };
  if (connectionsCache) {
    paint(connectionsCache);
  } else {
    root.innerHTML = `${pageHead(t("connections.title"))}`;
  }
  refreshConnectionsCache().then((conns) => {
    // Avoid painting over a navigated-away page.
    if (document.contains(root) && root.innerHTML !== undefined) paint(conns);
  });
}

function renderGit(root) {
  const g = pref("git", {});
  root.innerHTML = `
    ${pageHead(t("git.title"))}
    ${block(t("git.prefs"), [
      row(
        t("git.branchPrefix"),
        "",
        inputEl("branchPrefix", g.branchPrefix || ""),
      ),
      row(
        t("git.mergeMethod"),
        "",
        selectEl(
          "mergeMethod",
          g.mergeMethod || "squash",
          [
            { value: "squash", label: "squash" },
            { value: "merge", label: "merge" },
            { value: "rebase", label: "rebase" },
          ],
          "wide",
        ),
      ),
      row(
        t("git.forcePush"),
        t("git.forcePushDesc"),
        switchEl("forcePush", !!g.forcePush),
      ),
      row(
        t("git.draftPR"),
        t("git.draftPRDesc"),
        switchEl("draftPR", !!g.draftPR),
      ),
    ])}`;
  wireInputs(root, (patch) => savePreferences("git", patch));
}

function renderEnvironments(root) {
  const env = pref("environments", { projects: [] });
  root.innerHTML = `
    ${pageHead(t("environments.title"))}
    ${block(t("environments.projects"), [`<div class="env-list">${(env.projects || []).map((p) => `<div class="plugin-row"><div class="plugin-icon">E</div><div><div class="plugin-name">${escapeHtml(p.name)}</div><div class="plugin-desc">${escapeHtml(p.path || "")}</div></div></div>`).join("") || `<div class="settings-card site-empty">${escapeHtml(t("environments.empty"))}</div>`}</div>`])}`;
}

function renderWorktrees(root) {
  const w = pref("worktrees", {});
  root.innerHTML = `
    ${pageHead(t("worktrees.title"))}
    ${block(t("worktrees.root"), [
      `
      <div class="worktree-root">${escapeHtml(w.root || t("worktrees.notSet"))}</div>
      ${button(t("worktrees.pickRoot"), "pick-root")}
      ${button(t("worktrees.refresh"), "refresh-worktrees")}
    `,
    ])}
    ${block(t("worktrees.list"), [`<div class="worktree-list">${(store.worktrees || []).map((w) => `<div class="plugin-row"><div class="plugin-icon">W</div><div><div class="plugin-name">${escapeHtml(w.branch || w.status || "worktree")}</div><div class="plugin-desc">${escapeHtml(w.path)}</div></div><span>${escapeHtml(w.status || "active")}</span></div>`).join("") || `<div class="settings-card site-empty">${escapeHtml(t("worktrees.empty"))}</div>`}</div>`])}`;
  root
    .querySelector("[data-action='pick-root']")
    ?.addEventListener("click", async () => {
      const folder = await api()?.PickWorktreeRoot?.();
      if (folder) await savePreferences("worktrees", { root: folder });
      renderWorktrees(root);
    });
  root
    .querySelector("[data-action='refresh-worktrees']")
    ?.addEventListener("click", async () => {
      store.worktrees = (await api()?.RefreshWorktrees?.(w.root || "")) || [];
      renderWorktrees(root);
    });
}

function renderArchived(root) {
  const list = store.archived || [];
  root.innerHTML = `
    ${pageHead(t("archived.title"))}
    ${block(t("archived.list"), [
      `
      <div class="archived-list">${list.map((s) => `<div class="archived-item"><span>${escapeHtml(s.title || t("archived.untitled"))}</span><button type="button" data-unarchive="${s.id}">${escapeHtml(t("archived.unarchive"))}</button></div>`).join("") || `<div class="settings-card site-empty">${escapeHtml(t("archived.empty"))}</div>`}</div>
      ${button(t("archived.deleteAll"), "delete-all-archived", "danger")}
    `,
    ])}`;
  root
    .querySelector("[data-action='delete-all-archived']")
    ?.addEventListener("click", async () => {
      if (!confirm(t("archived.deleteAllConfirm"))) return;
      await api()?.DeleteArchivedSessions?.();
      await refreshStore();
      renderArchived(root);
    });
  root.querySelectorAll("[data-unarchive]").forEach((b) =>
    b.addEventListener("click", async () => {
      await api()?.UnarchiveSession?.(b.dataset.unarchive);
      await refreshStore();
      renderArchived(root);
    }),
  );
}
