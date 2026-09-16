// Lucide-style path-only SVG strings. Stroke currentColor; wrap in <svg> at call site.

export const search = `<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>`;
export const clock = `<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>`;
export const plugin = `<path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>`;
export const gitPullRequest = `<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" x2="6" y1="9" y2="21"/>`;
export const settings = `<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.39a2 2 0 0 0 .73 2.73l.15.08a2 2 0 0 1 1 1.74v.5a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>`;
export const helpCircle = `<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>`;
export const plus = `<path d="M5 12h14"/><path d="M12 5v14"/>`;
export const chevronDown = `<path d="m6 9 6 6 6-6"/>`;
export const check = `<path d="M20 6 9 17l-5-5"/>`;
export const panelLeft = `<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/>`;
export const folder = `<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>`;

// Return a complete <svg> element string for the given icon path.
export function iconSvg(name, size = 18, extraClass = "") {
  const paths = {
    search,
    clock,
    plugin,
    "git-pull-request": gitPullRequest,
    settings,
    "help-circle": helpCircle,
    plus,
    "chevron-down": chevronDown,
    check,
    "panel-left": panelLeft,
    folder,
  };
  const p = paths[name] || "";
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${extraClass}" aria-hidden="true">${p}</svg>`;
}
