// Home view: hero, prompt cards, composer, project picker.

import { store, setSessionActive } from "./state.js";
import { renderMessage, renderLiveTurn, renderUserPreview, renderReviewPanel } from "./render.js";
import { beginLiveTurn, liveTurn, resetLiveTurn } from "./live-turn.js";
import { startRunPoll, stopRunPoll } from "./agent-events.js";
import { on, navigate } from "./router.js";
import { t } from "./i18n.js";

let reviewOpen = false;
let reviewChanges = [];
let liveTickTimer = null;

function $(id) { return document.getElementById(id); }

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
}

function currentProjectLabel() {
  const proj = store.projects.find((p) => p.id === store.activeSession?.projectId);
  return proj?.name || t("home.chooseProject");
}

function currentProjectPath() {
  const proj = store.projects.find((p) => p.id === store.activeSession?.projectId);
  return proj?.path || "";
}

function currentModelLabel() {
  const p = (store.providers || []).find((x) => x.id === store.settings.activeProviderId);
  const models = (p?.models || []).filter(Boolean);
  const active = (store.settings.activeModel || "").trim();
  if (!p || !active || !models.includes(active)) return t("home.modelUnconfigured");
  return active;
}

/** Providers with at least one real model id — no empty / stock placeholders. */
function providersWithModels() {
  return (store.providers || [])
    .map((p) => ({
      ...p,
      models: (p.models || []).map((m) => String(m || "").trim()).filter(Boolean),
    }))
    .filter((p) => p.models.length > 0);
}

function currentPermissionMode() {
  return store.settings.fullAccess ? "full-access" : "workspace";
}

function permissionPresentation() {
  return currentPermissionMode() === "full-access"
    ? { label: t("home.fullAccess"), tone: "permission-full" }
    : { label: t("home.askApproval"), tone: "permission-workspace" };
}

export function renderProjectList() {
  const wrap = $("project-list");
  if (!wrap) return;
  wrap.innerHTML = "";
  if (!store.projects.length) {
    wrap.innerHTML = `<div class="project-list-empty">${escapeHtml(t("nav.noProjects"))}</div>`;
    return;
  }
  for (const p of store.projects) {
    const btn = document.createElement("button");
    const active = store.activeSession?.projectId === p.id;
    btn.className = "project-row" + (active ? " is-active" : "");
    btn.innerHTML = `
      <span class="ico"><svg viewBox="0 0 20 20" fill="none"><path d="M16.6182 9.33203H3.38184V12.7002C3.38184 13.3753 3.38238 13.8438 3.41211 14.208C3.44124 14.5646 3.49494 14.766 3.57129 14.916L3.63867 15.0361C3.80618 15.3094 4.04683 15.5324 4.33399 15.6787L4.45703 15.7314C4.59362 15.7803 4.77411 15.816 5.04199 15.8379C5.40624 15.8676 5.87469 15.8682 6.54981 15.8682H13.4502C14.1253 15.8682 14.5938 15.8676 14.958 15.8379C15.3146 15.8088 15.516 15.7551 15.666 15.6787L15.7861 15.6113C16.0594 15.4438 16.2824 15.2032 16.4287 14.916L16.4814 14.793C16.5303 14.6564 16.566 14.4759 16.5879 14.208C16.6176 13.8438 16.6182 13.3753 16.6182 12.7002V9.33203ZM3.38184 8.06836H16.6143C16.6105 7.81516 16.603 7.60256 16.5879 7.41699C16.566 7.14911 16.5303 6.96862 16.4814 6.83203L16.4287 6.70899C16.2824 6.42183 16.0594 6.18118 15.7861 6.01367L15.666 5.94629C15.516 5.86994 15.3146 5.81624 14.958 5.78711C14.5938 5.75738 14.1253 5.75684 13.4502 5.75684H11.1445L10.8047 5.75098C10.2158 5.71466 9.65236 5.50645 9.1836 5.1543L8.98926 4.99414C8.91673 4.92948 8.84746 4.85908 8.7461 4.75684L8.55957 4.57422C8.30416 4.34653 7.98784 4.19959 7.65137 4.15039L7.50684 4.13477C7.45779 4.13174 7.4043 4.13184 7.24512 4.13184H6.54981C5.87469 4.13184 5.40624 4.13238 5.04199 4.16211C4.77411 4.184 4.59362 4.21966 4.45703 4.26856L4.33399 4.32129C4.04683 4.4676 3.80618 4.69061 3.63867 4.96387L3.57129 5.08399C3.49494 5.23405 3.44124 5.43543 3.41211 5.79199C3.38238 6.15624 3.38184 6.62469 3.38184 7.29981V8.06836Z" fill="currentColor"/></svg></span>
      <span class="name">${escapeHtml(p.name || p.path)}</span>`;
    btn.onclick = () => switchProject(p.id);
    wrap.appendChild(btn);
  }
}

async function activateSession(id) {
  const api = window.go?.main?.App;
  try {
    // Always hydrate full message history before switching — list payloads may omit messages.
    const session = await api?.GetSession?.(id);
    if (session?.id) {
      const index = store.sessions.findIndex((item) => item.id === id);
      if (index >= 0) store.sessions[index] = session;
      else store.sessions.unshift(session);
      store.activeSession = session;
      store.activeSessionId = session.id;
    }
  } catch (e) {
    console.error("GetSession failed", e);
  }
  setSessionActive(id);
}

export function renderTaskList() {
  const wrap = $("task-list");
  if (!wrap) return;
  wrap.innerHTML = "";
  const activeProjectId = store.activeSession?.projectId || store.projects[0]?.id;
  const list = (store.sessions || []).filter((s) => {
    if (s.archived || s.projectId !== activeProjectId || !s.messages?.length) return false;
    const title = String(s.title || "").trim();
    return title && !/^[?？\s]+$/.test(title);
  }).slice(0, 20);
  if (!list.length) {
    wrap.innerHTML = `<div class="task-list-empty">${escapeHtml(t("nav.noChats"))}</div>`;
    return;
  }
  for (const s of list) {
    const btn = document.createElement("button");
    btn.className = "task-row" + (store.activeSessionId === s.id ? " is-active" : "");
    btn.innerHTML = `<span class="ico"><svg viewBox="0 0 18 18"><path d="M14.5 9a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0Z"/><path d="M6 9h6M9 6v6"/></svg></span><span class="name">${escapeHtml(s.title || t("nav.newTask"))}</span>`;
    btn.onclick = () => activateSession(s.id);
    wrap.appendChild(btn);
  }
}

async function switchProject(projectId) {
  const api = window.go?.main?.App;
  try {
    const sess = await api.NewSession(projectId);
    await store.onRefresh();
    if (sess?.id) setSessionActive(sess.id);
  } catch (e) { console.error(e); }
}

async function addProjectViaDialog() {
  const api = window.go?.main?.App;
  if (!api?.PickProjectFolder) return;
  try {
    const project = await api.PickProjectFolder();
    if (project?.id) {
      await store.onRefresh();
      await switchProject(project.id);
    }
  } catch (e) { console.error(e); }
}

const HERO_ICON = `<svg class="home-hero" viewBox="0 0 500 500" aria-hidden="true" fill="currentColor"><path d="M330.34,313.62h-67.84c-7.65,0-13.85-6.2-13.85-13.85s6.2-13.85,13.85-13.85h67.84c7.65,0,13.85,6.2,13.85,13.85s-6.2,13.85-13.85,13.85Z"/><path d="M169.65,313.38c-2.36,0-4.74-.6-6.93-1.87-6.62-3.83-8.88-12.31-5.05-18.93l23.78-41.08-23.91-43.21c-3.7-6.69-1.28-15.12,5.41-18.82,6.69-3.71,15.12-1.28,18.82,5.41l31.51,56.94-31.64,54.65c-2.57,4.43-7.22,6.91-12,6.91Z"/><path d="M144.61,144.5c1.42-41.82,35.79-75.27,77.95-75.25,27.89.02,52.35,14.68,66.11,36.71,10.93-5.82,23.41-9.12,36.65-9.11,43.05.02,77.94,34.94,77.91,78,0,13.24-3.32,25.72-9.16,36.64,22.02,13.79,36.66,38.26,36.64,66.15-.02,42.16-33.52,76.48-75.34,77.86-1.42,41.82-35.78,75.28-77.94,75.25-27.89-.02-52.35-14.68-66.11-36.72-10.93,5.82-23.4,9.13-36.65,9.12-43.05-.02-77.94-34.94-77.91-78,0-13.24,3.32-25.72,9.16-36.64-22.02-13.79-36.65-38.26-36.64-66.15.02-42.16,33.51-76.48,75.33-77.86ZM297.77,71.99c-19.24-19.26-45.83-31.17-75.2-31.19-49.23-.03-90.67,33.39-102.84,78.79-45.41,12.12-78.87,53.52-78.9,102.76-.02,29.37,11.87,55.97,31.1,75.23-2.35,8.79-3.62,18.03-3.63,27.56-.03,58.77,47.58,106.44,106.35,106.47,9.53,0,18.77-1.25,27.55-3.6,19.24,19.26,45.84,31.18,75.21,31.2,49.24.03,90.67-33.39,102.84-78.8,45.42-12.11,78.88-53.51,78.91-102.75.02-29.37-11.87-55.98-31.11-75.24,2.35-8.78,3.62-18.02,3.63-27.55.03-58.77-47.58-106.44-106.35-106.47-9.53,0-18.77,1.25-27.56,3.59Z"/></svg>`;

const CAP_ICONS = {
  read: `<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M10 2H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M12 5h3a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  search: `<svg viewBox="0 0 18 18" aria-hidden="true"><circle cx="7.7" cy="7.7" r="4.4" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="m11 11 3.4 3.4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,
  run: `<svg viewBox="0 0 18 18" aria-hidden="true"><rect x="2.5" y="3.5" width="13" height="11" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M5 7h1M5 10h1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,
  browse: `<svg viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="7" fill="none" stroke="currentColor" stroke-width="1.4"/><ellipse cx="9" cy="9" rx="3" ry="7" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M2 9h14" stroke="currentColor" stroke-width="1.4"/></svg>`,
  complex: `<svg viewBox="0 0 18 18" aria-hidden="true"><path d="m4 14 1.5-1.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 2.5 6.5 8l3 3L15.5 5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};

function renderCapabilities() {
  const items = ["read", "search", "run", "browse", "complex"];
  const cwd = currentProjectPath();
  const list = items.map((k) => `
    <li class="capability-item">
      <span class="capability-icon">${CAP_ICONS[k]}</span>
      <span class="capability-text">${escapeHtml(t(`home.capability.${k}`))}</span>
    </li>`).join("");
  return `
    <div class="capability-list-wrap">
      <div class="capability-title">${escapeHtml(t("home.capabilitiesTitle"))}</div>
      <ul class="capability-list">${list}</ul>
      ${cwd ? `<p class="capability-cwd">${escapeHtml(t("home.cwdLine", "", { path: cwd }))}</p>` : ""}
    </div>`;
}


function renderPromptCards() {
  const cards = [
    { key: "explore", color: "blue", icon: CAP_ICONS.search || CAP_ICONS.read },
    { key: "build", color: "purple", icon: CAP_ICONS.complex },
    { key: "review", color: "green", icon: CAP_ICONS.read },
    { key: "fix", color: "orange", icon: CAP_ICONS.run },
  ];
  // Prefer dedicated prompt icons if CAP missing shapes
  const icons = {
    explore: `<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="9" cy="9" r="5.2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="m13 13 3.2 3.2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    build: `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 3.5 16.5 7.5 8 16H4v-4L12.5 3.5Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="m11 5 4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    review: `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 4.5h12v11H4z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M7 8h6M7 11h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    fix: `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M11 3.5c2.2 1 3.5 3.2 3.5 5.7 0 1.4-.5 2.7-1.3 3.7L16 15.7 14.7 17l-2.8-2.8A6 6 0 0 1 5 9.2C5 6.7 6.3 4.5 8.5 3.5L10 6l1-2.5Z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>`,
  };
  return `<div class="prompt-cards" id="prompt-cards">${["explore","build","review","fix"].map((key, i) => {
    const color = ["blue","purple","green","orange"][i];
    return `<button type="button" class="prompt-card" data-prompt="${key}">
      <span class="pc-ico ${color}">${icons[key]}</span>
      <span class="pc-label">${escapeHtml(t("home.prompt." + key))}</span>
    </button>`;
  }).join("")}</div>`;
}


function renderMainHome() {
  const main = $("main");
  const projectLabel = currentProjectLabel();
  const modelLabel = currentModelLabel();
  const permission = permissionPresentation();
  const unconfigured = modelLabel === t("home.modelUnconfigured");
  const hasProject = projectLabel !== t("home.chooseProject") && !!projectLabel;
  // Official empty-state: "我们要构建什么？" (no project) / project-scoped title.
  const title = hasProject
    ? t("home.titleWithProject", "", { project: projectLabel })
    : t("home.title");
  const titleHtml = (() => {
    const escTitle = escapeHtml(title);
    const escProj = escapeHtml(projectLabel || "");
    if (hasProject && escProj && escTitle.includes(escProj)) {
      return escTitle.replace(escProj, `<span class="project-name">${escProj}</span>`);
    }
    return escTitle;
  })();
  const sessionTitle = store.activeSession?.title || "";
  const headerIcon = `<span class="chat-header-icon" aria-hidden="true"><svg viewBox="0 0 18 18"><path d="M4 5.5h10M4 9h10M4 12.5h7"/><rect x="2.5" y="2.5" width="13" height="13" rx="2.5"/></svg></span>`;
  main.innerHTML = `
    <section class="view view-home${reviewOpen ? " has-review" : ""}" id="view-home">
      <div class="home-main-col" id="home-main-col">
        <div class="chat-header" id="chat-header" ${sessionTitle ? "" : "hidden"}>
          ${headerIcon}
          <span class="chat-header-title">${escapeHtml(sessionTitle)}</span>
        </div>
        <div class="home-center" id="home-empty">
          ${HERO_ICON}
          <h1 class="home-title">${titleHtml}</h1>
        </div>
        <div class="thread" id="thread" hidden></div>
        <div class="composer" id="composer-wrap">
          <div class="composer-project-tray">
            <button class="composer-project" id="composer-project" aria-haspopup="menu">
              <span class="proj-icon"><svg viewBox="0 0 20 20" fill="none"><path d="M16.6182 9.33203H3.38184V12.7002C3.38184 14.1253 3.44124 14.5646 3.57129 14.916C3.80618 15.5324 4.59362 15.816 5.04199 15.8379C5.40624 15.8676 5.87469 15.8682 6.54981 15.8682H13.4502C14.1253 15.8682 14.5938 15.8676 14.958 15.8379C15.516 15.7551 16.0594 15.4438 16.4287 14.916C16.6176 13.8438 16.6182 13.3753 16.6182 12.7002V9.33203ZM3.38184 8.06836H16.6143C16.6105 7.81516 16.603 7.60256 16.5879 7.41699C16.5303 6.96862 16.2824 6.42183 15.7861 6.01367C15.3146 5.8088 14.5938 5.75684 13.4502 5.75684H11.1445C10.2158 5.71466 9.65236 5.50645 9.1836 5.1543L8.55957 4.57422C8.30416 4.34653 7.98784 4.19959 7.65137 4.15039C7.45779 4.13174 7.4043 4.13184 7.24512 4.13184H6.54981C5.87469 4.13184 5.40624 4.13238 5.04199 4.16211C4.59362 4.21966 4.04683 4.4676 3.63867 4.96387C3.38238 6.15624 3.38184 6.62469 3.38184 7.29981V8.06836Z" fill="currentColor"/></svg></span>
              <span class="proj-name">${escapeHtml(projectLabel)}</span>
            </button>
          </div>
          <div class="composer-shell">
            <textarea class="composer-input" id="composer-input" placeholder="${escapeHtml(t("home.placeholder"))}" rows="1"></textarea>
            <div class="composer-toolbar">
              <div class="composer-toolbar-left">
              <button class="composer-add-btn" id="composer-add" aria-label="${escapeHtml(t("home.addFiles"))}">
                <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M9.33496 16.5V10.665H3.5C3.13273 10.665 2.83496 10.3673 2.83496 10C2.83496 9.63273 3.13273 9.33496 3.5 9.33496H9.33496V3.5C9.33496 3.13273 9.63273 2.83496 10 2.83496C10.3673 2.83496 10.665 3.13273 10.665 3.5V9.33496H16.5L16.6338 9.34863C16.9369 9.41057 17.165 9.67857 17.165 10C17.165 10.3214 16.9369 10.5894 16.6338 10.6514L16.5 10.665H10.665V16.5C10.665 16.8673 10.3673 17.165 10 17.165C9.63273 17.165 9.33496 16.8673 9.33496 16.5Z" fill="currentColor"/></svg>
              </button>
              <button class="composer-pill access ${permission.tone}" id="chip-full-access" aria-haspopup="menu">
                <span class="shield"><svg viewBox="0 0 18 18" aria-hidden="true"><path d="M9 1.5 4 4v5c0 4 2.5 7.5 5 7.5s5-3.5 5-7.5V4l-5-2.5Z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M9 6.5l1.2 2.4 2.6.4-1.9 1.8.5 2.6-2.4-1.3-2.4 1.3.5-2.6L6.2 9.3l2.6-.4L9 6.5Z" fill="currentColor" stroke="none"/></svg></span>
                <span>${escapeHtml(permission.label)}</span>
                <svg class="chevron" viewBox="0 0 18 18" aria-hidden="true"><path d="m5 7 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
              </div>
              <div class="composer-toolbar-right">
              <button class="composer-pill model${unconfigured ? " is-unconfigured" : ""}" id="chip-model" aria-haspopup="menu">
                <span>${escapeHtml(modelLabel)}</span>
                <svg class="chevron" viewBox="0 0 18 18" aria-hidden="true"><path d="m5 7 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
              <button class="composer-send${store.running ? " composer-stop" : ""}" id="btn-send" aria-label="${store.running ? t("home.stop") : t("home.send")}" ${store.running ? "" : "disabled"}>
                ${store.running
                  ? '<svg viewBox="0 0 18 18" aria-hidden="true"><rect x="5" y="5" width="8" height="8" rx="1" fill="currentColor" stroke="none"/></svg>'
                  : '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M9.33467 16.6663V4.93978L4.6374 9.63704L3.69599 8.69661L9.52998 2.86263C9.78798 2.60753 10.2433 2.63564 10.4704 2.86263L16.3034 8.69661C16.5588 8.95462 16.5306 9.40982 16.3034 9.63704C16.0762 9.86414 15.7255 9.89242 15.4675 9.722L10.6647 4.9388V16.6663C10.6647 17.0336 10.367 17.3314 9.99971 17.3314C9.63259 17.3312 9.33467 17.0335 9.33467 16.6663Z" fill="currentColor" stroke="none"/></svg>'}
              </button>
              </div>
            </div>
          <div class="composer-footer-tip">${escapeHtml(t("home.disclaimer"))}</div>
        </div>
      </div>
      <aside class="review-panel" id="review-panel" ${reviewOpen ? "" : "hidden"}></aside>
    </section>`;
  bindHomeEvents();
  renderThread();
  paintReviewPanel();
  ensureLiveTick();
}

function paintReviewPanel() {
  const panel = $("review-panel");
  const home = $("view-home");
  if (!panel || !home) return;
  home.classList.toggle("has-review", !!reviewOpen);
  if (!reviewOpen) {
    panel.hidden = true;
    panel.innerHTML = "";
    return;
  }
  panel.hidden = false;
  panel.innerHTML = "";
  panel.appendChild(renderReviewPanel(reviewChanges));
}

function openReview(changes) {
  reviewChanges = changes || [];
  reviewOpen = true;
  // if view already mounted, just paint panel
  if ($("review-panel")) {
    paintReviewPanel();
  } else {
    renderMainHome();
  }
}

function closeReview() {
  reviewOpen = false;
  paintReviewPanel();
}

function ensureLiveTick() {
  if (liveTickTimer) return;
  liveTickTimer = setInterval(() => {
    if (!liveTurn.active || !liveTurn.startedAt) return;
    if (!$("live-turn-row")) return;
    paintLiveTurn($("thread"));
    updateJumpToLatest($("thread"));
  }, 1000);
}

function bindHomeEvents() {
  document.querySelectorAll(".prompt-card[data-prompt]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-prompt");
      const inputEl = document.getElementById("composer-input");
      if (!inputEl || !key) return;
      inputEl.value = t("home.prompt." + key);
      inputEl.dispatchEvent(new Event("input", { bubbles: true }));
      inputEl.focus();
    });
  });
  const input = $("composer-input");
  if (!input) return;
  input.addEventListener("input", () => {
    input.style.height = "auto";
    // Keep composer flat — cap growth to match official single-line-first shell.
    const h = Math.min(Math.max(input.scrollHeight, 24), 200);
      input.style.height = h + "px";
      input.closest(".composer-shell")?.classList.toggle("is-multiline", h > 40);
    const btn = $("btn-send");
    if (btn && !store.running) btn.disabled = !input.value.trim();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
    else if (e.key === "Escape" && store.running) { e.preventDefault(); interrupt(); }
  });
  $("btn-send")?.addEventListener("click", store.running ? interrupt : send);
  $("composer-add")?.addEventListener("click", (e) => openAttachMenu(e.currentTarget));
  $("composer-project")?.addEventListener("click", openProjectPicker);
  $("chip-full-access")?.addEventListener("click", (e) => openPermissionMenu(e.currentTarget));
  $("chip-model")?.addEventListener("click", (e) => openModelMenu(e.currentTarget));
  $("btn-add-project")?.addEventListener("click", addProjectViaDialog);
}

function renderThread() {
  const t = $("thread");
  if (!t) return;
  const empty = $("home-empty");
  const header = $("chat-header");
  const col = $("home-main-col");
  const hasHistory = !!(store.activeSession?.messages?.length);
  const hasLive = !!(
    liveTurn.active ||
    liveTurn.userPreview ||
    liveTurn.tools?.length ||
    liveTurn.streamingText ||
    liveTurn.segments?.length
  );
  // Blank new session / home: no messages and no live turn.
  // Existing history sessions always hide the hero guide.
  const showHomeGuide = !hasHistory && !hasLive;
  const sessionTitle = (store.activeSession?.title || "").trim();
  // Show title for any open historical conversation (has messages or a non-empty title while live).
  const showTitle = !showHomeGuide && !!sessionTitle && !/^[?？\s]+$/.test(sessionTitle);

  // Session title bar — top-left of chat panel only when conversation is open.
  if (header) {
    const titleEl = header.querySelector(".chat-header-title");
    if (showTitle) {
      header.removeAttribute("hidden");
      header.hidden = false;
      if (titleEl) titleEl.textContent = sessionTitle;
    } else {
      header.setAttribute("hidden", "");
      header.hidden = true;
      if (titleEl) titleEl.textContent = "";
    }
  }

  // Home guide (cloud icon / welcome / shortcuts): only brand-new blank sessions.
  if (empty) {
    if (showHomeGuide) {
      empty.removeAttribute("hidden");
      empty.hidden = false;
      empty.style.display = "";
    } else {
      empty.setAttribute("hidden", "");
      empty.hidden = true;
      empty.style.display = "none";
    }
  }

  // Toggle empty/chat layout mode. Critical: history must not reserve hero space.
  if (col) {
    col.classList.toggle("is-empty", showHomeGuide);
  }

  if (showHomeGuide) {
    t.hidden = true;
    t.style.display = "none";
    t.innerHTML = "";
    return;
  }

  t.hidden = false;
  t.style.display = "";
  const wasNearBottom = t.scrollHeight - t.scrollTop - t.clientHeight < 140;
  t.innerHTML = "";
  const api = window.go?.main?.App;
  for (const m of store.activeSession?.messages || []) t.appendChild(renderMessage(m, api));
  paintLiveTurn(t);
  if (wasNearBottom) t.scrollTop = t.scrollHeight;
  updateJumpToLatest(t);
  // auto-open review when live changes appear
  if (liveTurn.changes?.length && !reviewOpen) {
    openReview(liveTurn.changes);
  } else if (reviewOpen && liveTurn.changes?.length) {
    reviewChanges = liveTurn.changes;
    paintReviewPanel();
  }
}

function ensureJumpListener(t) {
  if (t._jumpBound) return;
  t._jumpBound = true;
  t.addEventListener("scroll", () => updateJumpToLatest(t), { passive: true });
}

function updateJumpToLatest(t) {
  ensureJumpListener(t);
  const nearBottom = t.scrollHeight - t.scrollTop - t.clientHeight < 140;
  let btn = document.getElementById("jump-to-latest");
  const show = !nearBottom && (liveTurn.active || (store.activeSession?.messages?.length));
  if (show) {
    if (!btn) {
      btn = document.createElement("button");
      btn.id = "jump-to-latest";
      btn.type = "button";
      btn.className = "jump-to-latest";
      btn.innerHTML = `<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M9 14V4M5 8l4-4 4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg><span>${escapeHtml(t("home.jumpLatest", "Jump to latest"))}</span>`;
      btn.addEventListener("click", () => {
        const th = $("thread");
        if (th) th.scrollTop = th.scrollHeight;
        updateJumpToLatest(th);
      });
      const wrap = t.parentElement || document.body;
      wrap.appendChild(btn);
    }
    btn.style.display = "";
  } else if (btn) {
    btn.style.display = "none";
  }
}

function paintLiveTurn(threadEl) {
  const t = threadEl || $("thread");
  if (!t) return;
  t.querySelector("#live-user-preview")?.remove();
  t.querySelector("#live-turn-row")?.remove();
  const show =
    liveTurn.sessionId === store.activeSessionId ||
    (!liveTurn.sessionId && store.running) ||
    (liveTurn.active && !store.activeSessionId);
  if (!show && !liveTurn.userPreview) return;
  if (liveTurn.userPreview) t.appendChild(renderUserPreview(liveTurn.userPreview));
  if (liveTurn.active || liveTurn.tools.length || liveTurn.streamingText || liveTurn.error || liveTurn.segments?.length) {
    const api = window.go?.main?.App;
    t.appendChild(renderLiveTurn(liveTurn, api));
  }
  // keep stick-to-bottom while live
  if (liveTurn.active) t.scrollTop = t.scrollHeight;
  // sync review panel with live file changes
  if (liveTurn.changes?.length) {
    if (!reviewOpen) openReview(liveTurn.changes);
    else {
      reviewChanges = liveTurn.changes;
      paintReviewPanel();
    }
  }
}

function patchComposerRunning() {
  const btn = $("btn-send");
  if (!btn) return;
  const running = !!store.running;
  btn.classList.toggle("composer-stop", running);
  btn.setAttribute("aria-label", running ? t("home.stop") : t("home.send"));
  btn.innerHTML = running
    ? '<svg viewBox="0 0 18 18" aria-hidden="true"><rect x="5" y="5" width="8" height="8" rx="1" fill="currentColor" stroke="none"/></svg>'
    : '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M9.33467 16.6663V4.93978L4.6374 9.63704L3.69599 8.69661L9.52998 2.86263C9.78798 2.60753 10.2433 2.63564 10.4704 2.86263L16.3034 8.69661C16.5588 8.95462 16.5306 9.40982 16.3034 9.63704C16.0762 9.86414 15.7255 9.89242 15.4675 9.722L10.6647 4.9388V16.6663C10.6647 17.0336 10.367 17.3314 9.99971 17.3314C9.63259 17.3312 9.33467 17.0335 9.33467 16.6663Z" fill="currentColor" stroke="none"/></svg>';
  if (!running) {
    const input = $("composer-input");
    btn.disabled = !input?.value.trim();
  } else {
    btn.disabled = false;
  }
}

async function interrupt() {
  if (!store.activeSessionId) return;
  try {
    await window.go?.main?.App?.InterruptSession?.(store.activeSessionId);
  } catch (e) {
    console.error("Interrupt failed", e);
  }
  store.running = false;
  stopRunPoll();
  if (liveTurn.active) {
    liveTurn.phase = "cancelled";
    liveTurn.active = false;
    document.dispatchEvent(new CustomEvent("codex:live-turn"));
  }
  patchComposerRunning();
}

async function send() {
  if (store.running) return interrupt();
  const input = $("composer-input");
  const text = input.value.trim();
  if (!text) return;
  if (!store.activeSessionId) {
    const api = window.go?.main?.App;
    try {
      const sess = await api.NewSession?.(store.projects[0]?.id || "");
      if (!sess?.id) return;
      await store.onRefresh();
      setSessionActive(sess.id);
    } catch (e) { console.error(e); return; }
  }
  input.value = "";
  input.dispatchEvent(new Event("input"));
  store.running = true;
  beginLiveTurn(store.activeSessionId, text);
  // Leave blank home guide immediately; history/live layout takes over.
  const empty = $("home-empty");
  const thread = $("thread");
  const col = $("home-main-col");
  if (empty) {
    empty.hidden = true;
    empty.setAttribute("hidden", "");
    empty.style.display = "none";
  }
  if (col) col.classList.remove("is-empty");
  if (thread) {
    thread.hidden = false;
    thread.style.display = "";
  }
  renderThread();
  patchComposerRunning();
  try {
    const apiSend = window.go?.main?.App;
    if (store.settings?.useCodexEngine) { await apiSend?.RunCodexTurn?.(store.activeSessionId, text); } else { await apiSend?.SendMessage?.(store.activeSessionId, text); }
    startRunPoll(store.activeSessionId, apiSend);
  } catch (e) {
    console.error("SendMessage/RunCodexTurn failed", e);
    store.running = false;
    resetLiveTurn();
    stopRunPoll();
    renderThread();
    patchComposerRunning();
    return;
  }
  $("composer-input")?.focus();
}

async function selectPermissionMode(mode) {
  const api = window.go?.main?.App;
  if (!api?.SaveSettings) return;
  const fullAccess = mode === "full-access";
  // keep local store in sync before persist so concurrent UI reads are correct
  store.settings = {
    ...store.settings,
    fullAccess,
    defaultPermissions: fullAccess ? "full" : "workspace",
  };
  try {
    await api.SaveSettings({ ...store.settings });
  } catch (e) {
    console.error(e);
    await store.onRefresh?.();
    renderMainHome();
    return;
  }
  await store.onRefresh();
  renderMainHome();
}

async function selectModel(providerId, model) {
  const api = window.go?.main?.App;
  if (!api?.SaveSettings) return;
  store.settings = {
    ...store.settings,
    activeModel: model,
    activeProviderId: providerId,
  };
  try {
    await api.SaveSettings({ ...store.settings });
  } catch (e) {
    console.error(e);
    await store.onRefresh?.();
    renderMainHome();
    return;
  }
  await store.onRefresh();
  renderMainHome();
}

let utilityMenu = null;
function closeUtilityMenu() {
  utilityMenu?.remove();
  utilityMenu = null;
  document.removeEventListener("pointerdown", closeUtilityMenuFromOutside, true);
}

function closeUtilityMenuFromOutside(e) {
  if (utilityMenu?.contains(e.target) || e.target.closest("#composer-add,#composer-project,#chip-full-access,#chip-model")) return;
  closeUtilityMenu();
}

function openUtilityMenu(anchor, html, className = "") {
  closeUtilityMenu();
  const menu = document.createElement("div");
  menu.className = `composer-menu ${className}`.trim();
  menu.innerHTML = html;
  document.body.appendChild(menu);
  const anchorRect = anchor.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  const left = Math.min(anchorRect.left, window.innerWidth - menuRect.width - 8);
  menu.style.left = `${Math.max(8, Math.round(left))}px`;
  menu.style.top = `${Math.max(8, Math.round(anchorRect.top - menuRect.height - 6))}px`;
  utilityMenu = menu;
  setTimeout(() => document.addEventListener("pointerdown", closeUtilityMenuFromOutside, true), 0);
  return menu;
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeUtilityMenu();
});
window.addEventListener("blur", closeUtilityMenu);

function checkIcon(selected) {
  return selected ? '<svg class="menu-check" viewBox="0 0 18 18"><path d="m3.5 9 3.4 3.4 7.6-7.6"/></svg>' : "";
}

function openPermissionMenu(anchor) {
  const current = currentPermissionMode();
  const menu = openUtilityMenu(anchor, `
    <div class="composer-menu-label">Permissions</div>
    <button class="composer-menu-item permission-item permission-workspace" data-mode="workspace">
      <span class="menu-icon"><svg viewBox="0 0 18 18"><path d="M9 2.2 4.2 4.5v4.2c0 3.5 2.1 6.4 4.8 7.1 2.7-.7 4.8-3.6 4.8-7.1V4.5L9 2.2Z"/><path d="M6.8 9.1 8.2 10.5l3.1-3.1"/></svg></span>
      <span><strong>Ask approval</strong><small>Approve file writes and patches</small></span>${checkIcon(current === "workspace")}
    </button>
    <button class="composer-menu-item permission-item permission-full" data-mode="full-access">
      <span class="menu-icon"><svg viewBox="0 0 18 18"><path d="M9 1.8 4 4.2v4.6c0 3.8 2.3 6.8 5 7.5 2.7-.7 5-3.7 5-7.5V4.2L9 1.8Z"/><path d="M9 5.2v4.1M9 12.3h.01"/></svg></span>
      <span><strong>Full access</strong><small>Run tools without approval prompts</small></span>${checkIcon(current === "full-access")}
    </button>`, "permission-menu");
  menu.querySelectorAll("[data-mode]").forEach((item) => item.addEventListener("click", () => {
    const mode = item.dataset.mode;
    closeUtilityMenu();
    selectPermissionMode(mode);
  }));
}

function openModelMenu(anchor) {
  const groups = providersWithModels();
  let html = `<div class="composer-menu-label">${escapeHtml(t("home.models", "Models"))}</div>`;
  if (!groups.length) {
    html += `<div class="composer-menu-empty">${escapeHtml(t("home.modelEmpty", "No models configured"))}<br><span>${escapeHtml(t("home.modelEmptyHint", "Open Settings → Account / Providers, add a real endpoint, then Discover models."))}</span></div>
      <button class="composer-menu-item" type="button" data-open-providers>
        <span><strong>${escapeHtml(t("home.openProviders", "Open provider settings"))}</strong></span>
      </button>`;
  } else {
    html += groups.map((provider) => `
      <div class="composer-menu-section">${escapeHtml(provider.name)}</div>
      ${provider.models.map((model) => {
        const selected = provider.id === store.settings.activeProviderId && model === store.settings.activeModel;
        return `<button class="composer-menu-item model-item" data-provider="${escapeHtml(provider.id)}" data-model="${escapeHtml(model)}">
          <span class="menu-icon model-icon"><svg viewBox="0 0 18 18"><circle cx="9" cy="9" r="5.7"/><path d="M9 6v3l2 1.2"/></svg></span>
          <span><strong>${escapeHtml(model)}</strong><small>${escapeHtml(provider.name)}</small></span>${checkIcon(selected)}
        </button>`;
      }).join("")}`).join("");
  }
  const menu = openUtilityMenu(anchor, html, "model-menu");
  menu.querySelectorAll("[data-model]").forEach((item) => item.addEventListener("click", () => {
    const { provider, model } = item.dataset;
    closeUtilityMenu();
    selectModel(provider, model);
  }));
  menu.querySelector("[data-open-providers]")?.addEventListener("click", () => {
    closeUtilityMenu();
    navigate("settings", "account");
  });
}

function openAttachMenu(anchor) {
  const menu = openUtilityMenu(anchor, `
    <button class="composer-menu-item" data-attach="files">
      <span class="menu-icon"><svg viewBox="0 0 18 18"><path d="M5.2 9.6 9.7 5a2.3 2.3 0 0 1 3.3 3.2l-5.3 5.4a3.3 3.3 0 0 1-4.7-4.7l5.4-5.4"/></svg></span>
      <span><strong>Add files and photos</strong><small>Attach local files to your prompt</small></span>
    </button>
    <button class="composer-menu-item" data-attach="plugins">
      <span class="menu-icon"><svg viewBox="0 0 18 18"><path d="M6 3.5v3M12 3.5v3M4.5 6.5h9v2.2a4.5 4.5 0 0 1-9 0V6.5ZM9 13.2v2"/></svg></span>
      <span><strong>Plugins</strong><small>Browse connected tools</small></span><span class="menu-arrow">›</span>
    </button>`, "attach-menu");
  menu.querySelector('[data-attach="files"]')?.addEventListener("click", async () => {
    closeUtilityMenu();
    const paths = await window.go?.main?.App?.PickAttachmentFiles?.();
    if (!paths?.length) return;
    const input = $("composer-input");
    const refs = paths.map((path) => `@${path}`).join(" ");
    input.value = `${input.value}${input.value ? " " : ""}${refs}`;
    input.dispatchEvent(new Event("input"));
    input.focus();
  });
  menu.querySelector('[data-attach="plugins"]')?.addEventListener("click", () => {
    closeUtilityMenu();
    location.hash = "plugins";
  });
}

function openProjectPicker() {
  if (utilityMenu?.classList.contains("project-menu")) {
    closeUtilityMenu();
    return;
  }
  const anchor = $("composer-project");
  const currentId = store.activeSession?.projectId || store.projects[0]?.id;
  const hasProjects = store.projects.length > 0;
  const search = hasProjects ? `
    <label class="project-menu-search">
      <svg viewBox="0 0 18 18"><circle cx="7.7" cy="7.7" r="4.4"/><path d="m11 11 3.4 3.4"/></svg>
      <input type="text" placeholder="${escapeHtml(t("home.searchProjects"))}" aria-label="${escapeHtml(t("home.searchProjects"))}">
    </label>
    <div class="project-menu-list"></div>
    <div class="composer-menu-separator"></div>` : "";
  const clear = store.activeSession?.projectId ? `
    <button class="composer-menu-item compact" data-projectless>
      <span class="menu-icon"><svg viewBox="0 0 18 18"><circle cx="9" cy="9" r="5.7"/><path d="M6.5 9h5"/></svg></span>
      <span><strong>Don't work in a project</strong></span>
    </button>` : "";
  const menu = openUtilityMenu(anchor, `${search}
    <button class="composer-menu-item compact" data-new-project>
      <span class="menu-icon"><svg viewBox="0 0 18 18"><path d="M9 3v12M3 9h12"/></svg></span>
      <span><strong>${hasProjects ? t("home.newProject") : t("home.addNewProject")}</strong></span>
      <span class="menu-arrow">›</span>
    </button>${clear}`, "project-menu");
  const list = menu.querySelector(".project-menu-list");
  const input = menu.querySelector("input");
  const paint = (filter = "") => {
    if (!list) return;
    const value = filter.trim().toLowerCase();
    const projects = store.projects.filter((p) => [p.name, p.path].some((text) => String(text || "").toLowerCase().includes(value)));
    list.innerHTML = projects.length ? projects.map((project) => `
      <button class="composer-menu-item compact" data-project-id="${escapeHtml(project.id)}">
        <span class="menu-icon"><svg viewBox="0 0 20 20" fill="none"><path d="M16.6 9.3H3.4v3.4c0 2.4.5 3.1 3.2 3.1h6.9c2.6 0 3.1-.7 3.1-3.1V9.3ZM3.4 8.1h13.2c0-1.8-.4-2.3-3.1-2.3h-2.3c-1 0-1.5-.2-2-.6l-.6-.6c-.3-.3-.7-.5-1.1-.5h-1c-2.6 0-3.1.6-3.1 3.2v.8Z" fill="currentColor"/></svg></span>
        <span><strong>${escapeHtml(project.name || project.path)}</strong><small>${escapeHtml(project.path)}</small></span>
        ${checkIcon(project.id === currentId)}
      </button>`).join("") : '<div class="project-menu-empty">No projects found</div>';
  };
  paint();
  input?.addEventListener("input", () => paint(input.value));
  input?.focus();
  menu.addEventListener("click", (e) => {
    const project = e.target.closest("[data-project-id]");
    if (project) {
      closeUtilityMenu();
      switchProject(project.dataset.projectId);
      return;
    }
    if (e.target.closest("[data-new-project]")) {
      closeUtilityMenu();
      addProjectViaDialog();
      return;
    }
    if (e.target.closest("[data-projectless]")) {
      closeUtilityMenu();
      store.activeSession = null;
      store.activeSessionId = null;
      window.go?.main?.App?.SetActiveSession?.("").catch(() => {});
      renderMainHome();
    }
  });
}

export async function mountHome() {
  store.activeSessionId = null;
  store.activeSession = null;
  store.running = false;
  renderMainHome();
  renderProjectList();
  renderTaskList();
}

document.addEventListener("codex:refresh", () => {
  if (document.getElementById("view-home")) {
    renderProjectList();
    renderTaskList();
    renderThread();
    patchComposerRunning();
  }
});
document.addEventListener("codex:active-session", () => {
  // switching session clears foreign live turn visuals
  if (liveTurn.sessionId && liveTurn.sessionId !== store.activeSessionId) {
    resetLiveTurn();
  }
  renderProjectList();
  renderTaskList();
  renderMainHome();
});
document.addEventListener("codex:language-applied", () => {
  if (document.getElementById("view-home") || location.hash.replace(/^#/, "").startsWith("home") || !location.hash || location.hash === "#") {
    renderProjectList();
    renderTaskList();
    if (document.getElementById("view-home") || document.getElementById("main")) {
      // only rebuild home if currently showing home view
      const settings = document.getElementById("view-settings");
      if (!settings || settings.hidden) renderMainHome();
    }
  }
});
document.addEventListener("codex:live-turn", () => {
  if (!document.getElementById("view-home")) return;
  const thread = $("thread");
  if (!thread) return;
  // patch live row only — avoid wiping history
  if (!store.activeSession?.messages?.length && !liveTurn.active && !liveTurn.userPreview) {
    renderThread();
    return;
  }
  const empty = $("home-empty");
  const col = $("home-main-col");
  if (empty) {
    empty.hidden = true;
    empty.setAttribute("hidden", "");
    empty.style.display = "none";
  }
  if (col) col.classList.remove("is-empty");
  thread.hidden = false;
  thread.style.display = "";
  // if history missing from DOM (first paint), full render
  if (!thread.querySelector(".message-row:not(.live-turn):not(.live-user-preview)") && store.activeSession?.messages?.length) {
    renderThread();
    return;
  }
  paintLiveTurn(thread);
  patchComposerRunning();
});
document.addEventListener("codex:composer-idle", () => {
  patchComposerRunning();
});

document.addEventListener("codex:open-review", (e) => {
  openReview(e.detail?.changes || []);
});
document.addEventListener("codex:close-review", () => {
  closeReview();
});

on("home", () => mountHome());
