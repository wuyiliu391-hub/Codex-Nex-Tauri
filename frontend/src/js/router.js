// Tiny hash-based router. Supports "settings" and "settings/subpage".

const routes = new Map();
let currentRoute = "home";
let currentSubpage = null;

export function initRouter() {
  window.addEventListener("hashchange", applyHash);
  document.addEventListener("codex:navigate", (e) => navigate(e.detail));
}

export function on(name, fn) { routes.set(name, fn); }
export function getRoute() { return currentRoute; }
export function getSubpage() { return currentSubpage; }

export function navigate(name, subpage) {
  const target = subpage ? `${name}/${subpage}` : name;
  if (location.hash !== "#" + target) location.hash = target;
  else applyHash();
}

export function applyHash() {
  const raw = (location.hash || "#home").slice(1);
  const [name, ...rest] = raw.split("/");
  currentRoute = name || "home";
  currentSubpage = rest.join("/") || null;

  document.body.classList.toggle("settings-open", currentRoute === "settings");
  if (currentRoute !== "settings") {
    const settingsView = document.getElementById("view-settings");
    if (settingsView) settingsView.hidden = true;
  }

  document.querySelectorAll(".nav-item[data-view]").forEach((btn) => {
    const view = btn.dataset.view;
    btn.classList.toggle("is-active", view === currentRoute || (currentRoute === "settings" && view === "settings"));
  });

  const fn = routes.get(currentRoute);
  if (fn) fn(currentSubpage);
}
