// Scheduled / Plugins / Pull requests views.

import { store } from "./state.js";
import { on, navigate } from "./router.js";
import { t } from "./i18n.js";

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

function suggestionCard(s) {
  return `<button class="suggestion-card" data-run-scheduled="${escapeHtml(s.id)}">
    <span class="sug-ico">${scheduledIcon(s.icon)}</span>
    <div>
      <div class="sug-name">${escapeHtml(s.title)}</div>
      <div class="sug-desc">${escapeHtml(s.desc || s.cron || "")}</div>
    </div>
    <span class="sug-badge">${escapeHtml(t("discovery.run"))}</span>
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

export function mountScheduled() {
  const main = $("main");
  function paint() {
    let view = main.querySelector("#view-scheduled");
    if (!view) {
      main.insertAdjacentHTML("beforeend", `
        <section class="view view-discovery" id="view-scheduled" hidden>
          <div class="discovery-head">
            <div><h2 data-i18n-text></h2></div>
            <div class="actions"><button class="btn btn-primary" data-i18n-text-action>${escapeHtml(t("action.create"))}</button></div>
          </div>
          <div class="discovery-body" id="scheduled-body"></div>
        </section>`);
      view = main.querySelector("#view-scheduled");
    }
    const h2 = view.querySelector(".discovery-head h2");
    if (h2) h2.textContent = t("discovery.scheduled");
    const createBtn = view.querySelector(".discovery-head .btn-primary");
    if (createBtn) createBtn.textContent = t("action.create");
    const body = $("scheduled-body");
    const list = store.scheduled || [];
    body.innerHTML = list.length
      ? `<div class="suggestion-list">${list.map((s) => suggestionCard(s)).join("")}</div>`
      : `<div class="discovery-empty"><h3>${escapeHtml(t("discovery.scheduled"))}</h3></div>`;
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
  } catch (e) {
    console.warn("[discovery] ListPlugins failed", e);
  }
}

export function mountPlugins() {
  const main = $("main");
  function paint() {
    let view = main.querySelector("#view-plugins");
    if (!view) {
      main.insertAdjacentHTML("beforeend", `
        <section class="view view-discovery" id="view-plugins" hidden>
          <div class="plugins-tabs">
            <button class="tab is-active" data-plugins-tab="plugins">${escapeHtml(t("discovery.plugins"))}</button>
            <button class="tab" data-plugins-tab="skills">${escapeHtml(t("discovery.skills"))}</button>
          </div>
          <div class="plugins-toolbar">
            <div class="search-box">
              <svg viewBox="0 0 18 18"><circle cx="7.7" cy="7.7" r="4.45" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="m11 11 3.45 3.45" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>
              <input placeholder="${escapeHtml(t("discovery.searchPlugins"))}" />
            </div>
            <div class="view-toggle">
              <button class="is-active">${escapeHtml(t("discovery.public"))}</button>
              <button>${escapeHtml(t("discovery.personal"))}</button>
            </div>
            <button class="btn btn-primary" id="plugins-create">${escapeHtml(t("action.create"))}</button>
          </div>
          <div class="discovery-body" id="plugins-body"></div>
        </section>`);
      view = main.querySelector("#view-plugins");
      $("plugins-create")?.addEventListener("click", () => navigate("settings", "plugins"));
    } else {
      const tab = view.querySelector('[data-plugins-tab="plugins"]');
      if (tab) tab.textContent = t("discovery.plugins");
      const create = $("plugins-create");
      if (create) create.textContent = t("action.create");
    }
    const body = $("plugins-body");
    const plugins = store.plugins || [];
    const installed = plugins.filter((p) => p.installed);
    let html = "";
    if (installed.length) {
      html += `<div class="plugin-section"><h3>${escapeHtml(t("discovery.installed"))}</h3><div class="plugins-grid">${installed.map(pluginCardHtml).join("")}</div></div>`;
    }
    PLUGIN_GROUPS.forEach((tag) => {
      const items = plugins.filter((p) => p.tag === tag && !p.installed);
      if (items.length) {
        html += `<div class="plugin-section"><h3>${escapeHtml(tag)}</h3><div class="plugins-grid">${items.map(pluginCardHtml).join("")}</div></div>`;
      }
    });
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
          <div class="discovery-head">
            <h2></h2>
          </div>
          <div class="discovery-body" id="prs-body"></div>
        </section>`);
      view = main.querySelector("#view-prs");
    }
    const h2 = view.querySelector(".discovery-head h2");
    if (h2) h2.textContent = t("discovery.pullrequests");
    const body = $("prs-body");
    if (prCache.length) {
      body.innerHTML = `<div class="plugins-grid">${prCache.map(prCardHtml).join("")}</div>`;
      return;
    }
    body.innerHTML = `
      <div class="pr-empty">
        <div class="pr-icon">
          <svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="11" cy="11" r="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="29" cy="29" r="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M11 15v7c0 3 1.5 4.5 4.5 4.5h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M29 25V15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </div>
        <h3>${escapeHtml(t("discovery.ghRequired"))}</h3>
        <p>${escapeHtml(t("discovery.ghDesc"))}</p>
        <button class="btn btn-primary" data-pr-recheck>${escapeHtml(t("config.checkAgain"))}</button>
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
