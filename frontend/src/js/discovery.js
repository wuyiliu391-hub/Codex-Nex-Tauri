// Scheduled / Plugins / Pull requests views.

import { store } from "./state.js";
import { on, navigate } from "./router.js";
import { t } from "./i18n.js";
import { createDropdown } from "./ui-controls.js";

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
}
function $(id) { return document.getElementById(id); }

function scheduledIcon(type) {
  if (type === "daily") return `<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="6.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10 6.5V10l3 2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
  if (type === "weekly") return `<svg viewBox="0 0 20 20"><rect x="3.5" y="4.5" width="13" height="11" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M3.5 8h13M6.5 3.5v2M13.5 3.5v2" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`;
  if (type === "followup") return `<svg viewBox="0 0 20 20"><path d="M10 2.5a7.5 7.5 0 0 1 7.5 7.5c0 2.5-1.2 4.7-3 6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M10 6.5v3.5l2.5 1.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
  return "";
}

// Official suggestion row: icon + title · meta + description.
function suggestionCard(s) {
  const iconClass = s.icon === "weekly" ? "purple" : s.icon === "followup" ? "green" : "";
  // Stored crons map back to the official friendly schedule text (p16).
  const CRON_META = {
    "0 9 * * *": "工作日 8:00",
    "0 10 * * 1": "星期五（时间：16:00）",
    "0 */4 * * *": "工作日 9:00",
  };
  const meta = CRON_META[s.cron] || s.time || (s.icon === "weekly" ? "星期五（时间：16:00）" : s.icon === "followup" ? "工作日 9:00" : "工作日 8:00");
  return `<button class="suggestion-card" data-run-scheduled="${escapeHtml(s.id)}">
    <span class="sug-ico ${iconClass}">${scheduledIcon(s.icon || s.type)}</span>
    <span>
      <span class="sug-name">${escapeHtml(s.title)}</span>
      <span class="sug-meta">${escapeHtml(meta)}</span>
      <span class="sug-desc">${escapeHtml(s.desc || "")}</span>
    </span>
  </button>`;
}

/** Pull latest scheduled tasks via bridge into store; fail-soft keeps current. */
async function refreshScheduledFromBridge() {
  const api = window.go?.main?.App;
  try {
    const tasks = await api?.ListScheduledTasks?.();
    if (Array.isArray(tasks) && tasks.length) store.scheduled = tasks;
  } catch (e) {
    console.warn("[discovery] ListScheduledTasks failed", e);
  }
}

// Minimal modal reusing global .settings-modal styles (no new chrome).
function openDiscoveryModal({ title, bodyHtml, okLabel, onOk }) {
  closeDiscoveryModal();
  const back = document.createElement("div");
  back.className = "settings-modal-backdrop";
  back.id = "discovery-modal";
  back.innerHTML = `<div class="settings-modal" role="dialog" aria-label="${escapeHtml(title)}">
    <h2>${escapeHtml(title)}</h2>
    <div class="dm-body">${bodyHtml}</div>
    <div class="settings-modal-actions">
      <button class="settings-button" type="button" data-dm-cancel>${escapeHtml(t("action.cancel"))}</button>
      <button class="settings-button primary" type="button" data-dm-ok>${escapeHtml(okLabel)}</button>
    </div>
  </div>`;
  document.body.appendChild(back);
  back.addEventListener("pointerdown", (e) => {
    if (e.target === back) closeDiscoveryModal();
  });
  back.querySelector("[data-dm-cancel]")?.addEventListener("click", closeDiscoveryModal);
  back.querySelector("[data-dm-ok]")?.addEventListener("click", async () => {
    try {
      await onOk?.(back);
      closeDiscoveryModal();
    } catch (e) {
      console.error("[discovery] modal save failed", e);
    }
  });
  return back;
}

function closeDiscoveryModal() {
  document.getElementById("discovery-modal")?.remove();
}

function discoveryToast(message) {
  const el = document.createElement("div");
  el.className = "settings-toast";
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

const SCHEDULED_PRESETS = [
  { id: "daily", cron: "0 9 * * *", labelKey: "scheduled.presetDaily" },
  { id: "weekly", cron: "0 10 * * 1", labelKey: "scheduled.presetWeekly" },
  { id: "followup", cron: "0 */4 * * *", labelKey: "scheduled.presetFollowup" },
];

// Create-task editor: preset fills title/desc/cron, all fields remain editable.
function openScheduledEditor(repaint) {
  const presetItems = SCHEDULED_PRESETS.map((p) => ({ value: p.id, label: t(p.labelKey) }));
  const back = openDiscoveryModal({
    title: t("scheduled.createTitle"),
    okLabel: t("action.create"),
    bodyHtml: `
      <label class="dm-field"><span>${escapeHtml(t("scheduled.fieldTitle"))}</span>
        <input type="text" class="settings-input" data-st-title /></label>
      <label class="dm-field"><span>${escapeHtml(t("scheduled.fieldDesc"))}</span>
        <input type="text" class="settings-input" data-st-desc /></label>
      <div class="dm-field"><span>${escapeHtml(t("scheduled.fieldPreset"))}</span>
        <button type="button" class="settings-input dm-select" data-st-preset="daily" aria-haspopup="listbox"><span class="ui-dropdown-label">${escapeHtml(t(SCHEDULED_PRESETS[0].labelKey))}</span><span class="ui-dropdown-caret" aria-hidden="true"></span></button></div>
      <label class="dm-field"><span>${escapeHtml(t("scheduled.fieldCron"))}</span>
        <input type="text" class="settings-input" data-st-cron value="${SCHEDULED_PRESETS[0].cron}" /></label>`,
    onOk: async (root) => {
      const title = root.querySelector("[data-st-title]")?.value.trim();
      if (!title) return;
      const desc = root.querySelector("[data-st-desc]")?.value.trim() || "";
      const presetId = root.querySelector("[data-st-preset]")?.dataset.stPreset || "daily";
      const preset = SCHEDULED_PRESETS.find((p) => p.id === presetId);
      const cron = root.querySelector("[data-st-cron]")?.value.trim() || preset?.cron || "";
      const task = {
        id: `task-${Date.now()}`,
        title,
        desc,
        icon: preset?.id || "daily",
        cron,
        status: "enabled",
      };
      const next = [...(store.scheduled || []), task];
      await window.go?.main?.App?.SaveScheduledTasks?.(next);
      store.scheduled = next;
      discoveryToast(t("scheduled.created"));
      await refreshScheduledFromBridge().finally(() => repaint?.());
    },
  });
  // Preset picker fills the editable fields (official suggestion defaults).
  const presetBtn = back.querySelector("[data-st-preset]");
  const applyPreset = (id) => {
    const preset = SCHEDULED_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    back.querySelector("[data-st-cron]").value = preset.cron;
    const titleEl = back.querySelector("[data-st-title]");
    if (titleEl && !titleEl.value) titleEl.value = t(preset.labelKey).split(/[（(]/)[0].trim();
  };
  if (presetBtn) {
    createDropdown({
      anchor: presetBtn,
      items: presetItems,
      value: "daily",
      onSelect: (val) => {
        presetBtn.dataset.stPreset = val;
        applyPreset(val);
      },
    });
  }
  applyPreset("daily");
}

export function mountScheduled() {
  const main = $("main");
  // Official seed suggestions (p16) when store is empty.
  const SEEDS = [
    { id: "daily-brief", title: "每日简报", desc: "以日历、未读电子邮件和优先事项摘要开启每个工作日", icon: "daily" },
    { id: "weekly-review", title: "每周回顾", desc: "每周五将你最近的工作整理成简明的状态更新", icon: "weekly" },
    { id: "followup", title: "跟进监控", desc: "查看最近的电子邮箱和日历活动，并标记需要你关注的事项", icon: "followup" },
  ];
  function paint() {
    let view = main.querySelector("#view-scheduled");
    if (!view) {
      main.insertAdjacentHTML("beforeend", `
        <section class="view view-discovery" id="view-scheduled" hidden>
          <div class="discovery-topbar">
            <div></div>
            <div class="actions">
              <button class="btn-official" data-create-scheduled>
                ${escapeHtml(t("action.create"))}
                <svg class="chev" viewBox="0 0 18 18" aria-hidden="true"><path d="m5 7 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
              </button>
            </div>
          </div>
          <div class="discovery-head">
            <h2></h2>
            <p class="lede"></p>
          </div>
          <div class="discovery-search">
            <svg viewBox="0 0 18 18" aria-hidden="true"><circle cx="7.7" cy="7.7" r="4.4"/><path d="m11 11 3.4 3.4"/></svg>
            <input placeholder="" data-scheduled-search />
          </div>
          <div class="discovery-body" id="scheduled-body"></div>
        </section>`);
      view = main.querySelector("#view-scheduled");
    }
    const h2 = view.querySelector(".discovery-head h2");
    if (h2) h2.textContent = t("discovery.scheduled");
    const lede = view.querySelector(".discovery-head .lede");
    if (lede) lede.textContent = t("discovery.scheduledDesc");
    const search = view.querySelector("[data-scheduled-search]");
    if (search) search.placeholder = t("discovery.searchScheduled");
    if (!view._scheduledBound) {
      view._scheduledBound = true;
      view.querySelector("[data-create-scheduled]")?.addEventListener("click", () => openScheduledEditor(paint));
      search?.addEventListener("input", () => applyScheduledFilter(view));
    }
    const body = $("scheduled-body");
    const list = (store.scheduled && store.scheduled.length) ? store.scheduled : SEEDS;
    body.innerHTML = `<div class="discovery-section-label">${escapeHtml(t("discovery.suggestions"))}</div>
      <div class="suggestion-list">${list.map((s) => suggestionCard(s)).join("")}</div>`;
    applyScheduledFilter(view);
    body.querySelectorAll("[data-run-scheduled]").forEach((btn) => btn.addEventListener("click", async () => {
      try {
        await window.go?.main?.App?.RunScheduledTask?.(btn.dataset.runScheduled);
      } catch (e) {
        console.error(e);
      }
    }));
  }
  paint();
  on("scheduled", () => {
    document.querySelectorAll(".view").forEach((v) => (v.hidden = true));
    $("view-scheduled").hidden = false;
    // Re-fetch on route enter, then repaint.
    refreshScheduledFromBridge().finally(paint);
  });
  document.addEventListener("codex:refresh", () => {
    if ($("view-scheduled") && !$("view-scheduled").hidden) {
      refreshScheduledFromBridge().finally(paint);
    }
  });
  document.addEventListener("codex:scheduled-run", () => {
    if ($("view-scheduled") && !$("view-scheduled").hidden) paint();
  });
  document.addEventListener("codex:language-applied", () => {
    if ($("view-scheduled") && !$("view-scheduled").hidden) paint();
  });
}

/** Filter scheduled rows by the search box (official search filters in place). */
function applyScheduledFilter(view) {
  const q = view.querySelector("[data-scheduled-search]")?.value.trim().toLowerCase() || "";
  view.querySelectorAll(".suggestion-card").forEach((card) => {
    card.style.display = !q || card.textContent.toLowerCase().includes(q) ? "" : "none";
  });
}

const PLUGIN_GROUPS = ["Featured", "Productivity", "Creativity", "Developer Tools"];

function pluginIconColor(tag) {
  if (tag === "Featured") return "purple";
  if (tag === "Productivity") return "blue";
  if (tag === "Creativity") return "orange";
  if (tag === "Developer Tools") return "green";
  return "";
}

/** Normalize engine plugin objects to discovery card shape. */
function normalizePlugin(p) {
  if (!p || typeof p !== "object") return null;
  const id = p.id || p.pluginId || p.name || "";
  const name = p.name || id || "Plugin";
  return {
    id,
    name,
    desc: p.description || p.desc || p.summary || "",
    installed: p.installed !== false && (p.installed === true || p.enabled !== false || !!p.tag),
    enabled: p.enabled !== false,
    tag: p.tag || p.category || "Featured",
    logoLetter: p.logoLetter || String(name).charAt(0).toUpperCase(),
  };
}

function pluginCardHtml(p) {
  const enabled = p.enabled !== false;
  return `<div class="plugin-card" data-plugin-id="${escapeHtml(p.id)}">
    <div class="pc-row1">
      <div class="pc-logo ${pluginIconColor(p.tag)}">${escapeHtml(p.logoLetter || p.name[0])}</div>
      <div>
        <div class="pc-name">${escapeHtml(p.name)}</div>
        <div class="pc-tag">${escapeHtml(p.tag || "")}</div>
      </div>
      <button type="button" class="ui-toggle" data-plugin-toggle="${escapeHtml(p.id)}"
        role="switch" aria-checked="${enabled}" aria-label="${escapeHtml(p.name)}"
        title="${escapeHtml(p.name)}"></button>
    </div>
    <div class="pc-desc">${escapeHtml(p.desc || "")}</div>
    <div class="pc-foot">
      <button class="btn ${p.installed ? "btn-secondary" : "btn-primary"}">${p.installed ? t("discovery.manage") : t("plugins.install")}</button>
      <button class="btn btn-icon" aria-label="More">⋯</button>
    </div>
  </div>`;
}

/** Pull latest plugins via bridge into store; fail-soft keeps current. */
async function refreshPluginsFromBridge() {
  const api = window.go?.main?.App;
  try {
    const raw = await (api?.ListPlugins?.() ?? api?.ListPluginEntries?.());
    const list = Array.isArray(raw) ? raw : (raw?.plugins || raw?.data || []);
    if (Array.isArray(list) && list.length) {
      const normalized = list.map(normalizePlugin).filter(Boolean);
      if (normalized.length) store.plugins = normalized;
    }
    pluginsLoaded = true;
  } catch (e) {
    console.warn("[discovery] ListPlugins failed", e);
  }
}

/** Pull skills via bridge; fail-soft keeps the local cache. */
let skillsCache = [];
let skillsLoaded = false;
async function refreshSkillsFromBridge() {
  const api = window.go?.main?.App;
  try {
    const raw = await api?.ListSkills?.();
    const list = Array.isArray(raw) ? raw : (raw?.skills || raw?.data || []);
    if (Array.isArray(list)) {
      skillsCache = list
        .map((s) => (s && typeof s === "object"
          ? { id: s.id || s.name || "", name: s.name || s.id || "Skill", desc: s.description || s.desc || "" }
          : null))
        .filter(Boolean);
      skillsLoaded = true;
    }
  } catch (e) {
    console.warn("[discovery] ListSkills failed", e);
  }
}

function skillRowHtml(s) {
  const letter = String(s.name || "S").charAt(0).toUpperCase();
  return `<div class="plugin-card" data-skill-id="${escapeHtml(s.id)}">
    <div class="pc-row1">
      <div class="pc-logo">${escapeHtml(letter)}</div>
      <div>
        <div class="pc-name">${escapeHtml(s.name)}</div>
        <div class="pc-tag">${escapeHtml(t("discovery.skills"))}</div>
      </div>
    </div>
    <div class="pc-desc">${escapeHtml(s.desc || "")}</div>
  </div>`;
}

/** Paint the skills tab body (list-only; engine owns enablement). */
function paintSkillsBody(body) {
  const q = pluginsQuery;
  const list = skillsCache.filter((s) => {
    if (!q) return true;
    return `${s.name || ""} ${s.desc || ""}`.toLowerCase().includes(q);
  });
  if (!list.length && !skillsLoaded) {
    body.innerHTML = `<div class="discovery-loading"><span class="spin"></span><span>${escapeHtml(t("discovery.loadingPlugins", "正在加载插件..."))}</span></div>`;
    return;
  }
  body.innerHTML = list.length
    ? `<div class="plugins-grid">${list.map(skillRowHtml).join("")}</div>`
    : `<div class="discovery-empty"><h3>${escapeHtml(t("discovery.skillsEmpty"))}</h3></div>`;
}

// Discovery UI state (tabs / scope filter / search / sort).
let pluginsTab = "plugins";
let pluginsScope = "public";
let pluginsQuery = "";
let pluginsSortInstalledFirst = false;
let pluginsLoaded = false;

export function mountPlugins() {
  const main = $("main");
  function paint() {
    let view = main.querySelector("#view-plugins");
    if (!view) {
      main.insertAdjacentHTML("beforeend", `
        <section class="view view-discovery" id="view-plugins" hidden>
          <div class="discovery-topbar">
            <div class="tabs">
              <button class="tab is-active" data-plugins-tab="plugins">${escapeHtml(t("discovery.plugins"))}</button>
              <button class="tab" data-plugins-tab="skills">${escapeHtml(t("discovery.skills"))}</button>
            </div>
            <div class="actions">
              <button class="icon-btn-round" data-plugins-refresh aria-label="Refresh">
                <svg viewBox="0 0 18 18"><path d="M4 9a5 5 0 0 1 8.5-3.5M14 9a5 5 0 0 1-8.5 3.5" fill="none"/><path d="M12.5 3.5v2.5H10M5.5 14.5V12H8" fill="none"/></svg>
              </button>
              <button class="icon-btn-round" data-plugins-settings aria-label="Settings">
                <svg viewBox="0 0 18 18"><circle cx="9" cy="9" r="2.2" fill="none"/><path d="M9 2.5v1.2M9 14.3v1.2M2.5 9h1.2M14.3 9h1.2M4.4 4.4l.9.9M12.7 12.7l.9.9M13.6 4.4l-.9.9M5.3 12.7l-.9.9" fill="none"/></svg>
              </button>
              <button class="btn-official" data-plugins-add>
                ${escapeHtml(t("discovery.add"))}
                <svg class="chev" viewBox="0 0 18 18" aria-hidden="true"><path d="m5 7 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
              </button>
            </div>
          </div>
          <div class="discovery-head">
            <h2>${escapeHtml(t("discovery.plugins"))}</h2>
            <p class="lede">${escapeHtml(t("discovery.pluginsDesc"))}</p>
          </div>
          <div class="discovery-search">
            <svg viewBox="0 0 18 18" aria-hidden="true"><circle cx="7.7" cy="7.7" r="4.4"/><path d="m11 11 3.4 3.4"/></svg>
            <input placeholder="${escapeHtml(t("discovery.searchPlugins"))}" data-plugins-search />
          </div>
          <div class="discovery-filters">
            <button class="chip is-active" data-plugins-scope="public">${escapeHtml(t("discovery.public"))}</button>
            <button class="chip" data-plugins-scope="personal">${escapeHtml(t("discovery.personal"))}</button>
            <span class="filters-spacer"></span>
            <button class="icon-btn-round" data-plugins-filter aria-label="${escapeHtml(t("discovery.filter"))}" title="${escapeHtml(t("discovery.filter"))}">
              <svg viewBox="0 0 18 18"><path d="M2.5 4h13M5 8.5h8M7.5 13h3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
            </button>
          </div>
          <div class="discovery-body is-wide" id="plugins-body"></div>
        </section>`);
      view = main.querySelector("#view-plugins");
      $("plugins-create")?.remove();
      view.querySelector("[data-plugins-settings]")?.addEventListener("click", () => navigate("settings", "plugins"));
      view.querySelector("[data-plugins-add]")?.addEventListener("click", () => navigate("settings", "plugins"));
      view.querySelector("[data-plugins-refresh]")?.addEventListener("click", () => {
        (pluginsTab === "skills" ? refreshSkillsFromBridge() : refreshPluginsFromBridge()).finally(paint);
      });
      view.querySelectorAll("[data-plugins-tab]").forEach((tab) => tab.addEventListener("click", () => {
        pluginsTab = tab.dataset.pluginsTab || "plugins";
        paint();
      }));
      view.querySelectorAll("[data-plugins-scope]").forEach((chip) => chip.addEventListener("click", () => {
        pluginsScope = chip.dataset.pluginsScope || "public";
        paint();
      }));
      view.querySelector("[data-plugins-filter]")?.addEventListener("click", () => {
        pluginsSortInstalledFirst = !pluginsSortInstalledFirst;
        paint();
      });
      const searchInput = view.querySelector("[data-plugins-search]");
      searchInput?.addEventListener("input", () => {
        pluginsQuery = searchInput.value.trim().toLowerCase();
        paint();
      });
    }
    // Sync tab / scope / search chrome without rebuilding listeners.
    view.querySelectorAll("[data-plugins-tab]").forEach((tab) => {
      tab.classList.toggle("is-active", (tab.dataset.pluginsTab || "plugins") === pluginsTab);
    });
    view.querySelectorAll("[data-plugins-scope]").forEach((chip) => {
      chip.classList.toggle("is-active", (chip.dataset.pluginsScope || "public") === pluginsScope);
    });
    view.querySelector(".discovery-filters").style.display = pluginsTab === "skills" ? "none" : "";
    const searchBox = view.querySelector("[data-plugins-search]");
    if (searchBox) searchBox.placeholder = t("discovery.searchPlugins");
    const body = $("plugins-body");
    if (pluginsTab === "skills") {
      paintSkillsBody(body);
      return;
    }
    const q = pluginsQuery;
    let plugins = (store.plugins || []).filter((p) => {
      if (pluginsScope === "personal" && !p.installed) return false;
      if (!q) return true;
      return `${p.name || ""} ${p.desc || ""} ${p.tag || ""}`.toLowerCase().includes(q);
    });
    if (pluginsSortInstalledFirst) {
      plugins = [...plugins].sort((a, b) => Number(b.installed === true) - Number(a.installed === true));
    }
    if (!plugins.length && !pluginsLoaded) {
      body.innerHTML = `<div class="discovery-loading"><span class="spin"></span><span>${escapeHtml(t("discovery.loadingPlugins", "正在加载插件..."))}</span></div>`;
      return;
    }
    const installed = plugins.filter((p) => p.installed);
    let html = "";
    if (installed.length) {
      html += `<div class="plugins-grid">${installed.map(pluginCardHtml).join("")}</div>`;
    }
    PLUGIN_GROUPS.forEach((tag) => {
      const items = plugins.filter((p) => p.tag === tag && !p.installed);
      if (items.length) html += `<div class="plugins-grid">${items.map(pluginCardHtml).join("")}</div>`;
    });
    // Engine-backed plugins with unknown tags must not vanish silently.
    const rest = plugins.filter((p) => !p.installed && !PLUGIN_GROUPS.includes(p.tag));
    if (rest.length) html += `<div class="plugins-grid">${rest.map(pluginCardHtml).join("")}</div>`;
    body.innerHTML = html || `<div class="discovery-empty"><h3>${escapeHtml(t("discovery.noPlugins"))}</h3></div>`;
    body.querySelectorAll("[data-plugin-toggle]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.pluginToggle;
        const next = btn.getAttribute("aria-checked") !== "true";
        btn.setAttribute("aria-checked", String(next));
        try {
          await window.go?.main?.App?.SetPluginEnabled?.(id, next);
          await refreshPluginsFromBridge();
          if ($("view-plugins") && !$("view-plugins").hidden) paint();
        } catch (e) {
          console.error("[discovery] SetPluginEnabled failed", e);
          btn.setAttribute("aria-checked", String(!next));
        }
      });
    });
  }
  paint();
  on("plugins", () => {
    document.querySelectorAll(".view").forEach((v) => (v.hidden = true));
    $("view-plugins").hidden = false;
    refreshPluginsFromBridge().finally(paint);
    refreshSkillsFromBridge();
  });
  document.addEventListener("codex:refresh", () => {
    if ($("view-plugins") && !$("view-plugins").hidden) {
      refreshPluginsFromBridge().finally(paint);
    }
  });
  document.addEventListener("codex:language-applied", () => {
    if ($("view-plugins") && !$("view-plugins").hidden) paint();
  });
}

/** Cached PR list; empty state is the UIA default when engine/store is empty. */
let prCache = [];

/** Pull PRs via bridge; fail-soft keeps empty cache. */
async function refreshPullRequestsFromBridge() {
  const api = window.go?.main?.App;
  try {
    const prs = await api?.ListPullRequests?.();
    if (Array.isArray(prs)) prCache = prs;
  } catch (e) {
    console.warn("[discovery] ListPullRequests failed", e);
    prCache = [];
  }
}

function prCardHtml(pr) {
  return `<div class="plugin-card" data-pr-id="${escapeHtml(pr.id || pr.number || "")}">
    <div class="pc-row1">
      <div class="pc-logo">${escapeHtml(String(pr.number || pr.id || "#").replace(/^#/, "").charAt(0) || "P")}</div>
      <div>
        <div class="pc-name">${escapeHtml(pr.title || pr.name || "PR")}</div>
        <div class="pc-tag">${escapeHtml(pr.state || pr.status || "")}</div>
      </div>
    </div>
    <div class="pc-desc">${escapeHtml(pr.body || pr.desc || pr.repo || "")}</div>
  </div>`;
}

export function mountPullRequests() {
  const main = $("main");
  function paint() {
    let view = main.querySelector("#view-prs");
    if (!view) {
      main.insertAdjacentHTML("beforeend", `
        <section class="view view-discovery" id="view-prs" hidden>
          <div class="discovery-topbar">
            <div></div>
          </div>
          <div class="discovery-head">
            <h2 class="is-title-sm"></h2>
          </div>
          <div class="discovery-body" id="prs-body"></div>
        </section>`);
      view = main.querySelector("#view-prs");
    }
    const h2 = view.querySelector(".discovery-head h2");
    // Official title is "Pull Request" (singular product noun).
    if (h2) h2.textContent = t("discovery.pullrequests");
    const body = $("prs-body");
    if (prCache.length) {
      body.innerHTML = `<div class="plugins-grid">${prCache.map(prCardHtml).join("")}</div>`;
      return;
    }
    // Official empty (p15): centered title + subtitle + black pill button, no icon.
    body.innerHTML = `
      <div class="pr-empty">
        <h3>${escapeHtml(t("discovery.ghRequired"))}</h3>
        <p>${escapeHtml(t("discovery.ghDesc"))}</p>
        <button class="btn-official" data-pr-recheck>${escapeHtml(t("discovery.checkAgain"))}</button>
      </div>`;
    body.querySelector("[data-pr-recheck]")?.addEventListener("click", () => {
      refreshPullRequestsFromBridge().finally(paint);
    });
  }
  paint();
  on("pullrequests", () => {
    document.querySelectorAll(".view").forEach((v) => (v.hidden = true));
    $("view-prs").hidden = false;
    refreshPullRequestsFromBridge().finally(paint);
  });
  document.addEventListener("codex:refresh", () => {
    if ($("view-prs") && !$("view-prs").hidden) {
      refreshPullRequestsFromBridge().finally(paint);
    }
  });
  document.addEventListener("codex:language-applied", () => {
    if ($("view-prs") && !$("view-prs").hidden) paint();
  });
}
