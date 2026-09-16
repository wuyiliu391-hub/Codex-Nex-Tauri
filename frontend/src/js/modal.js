// Shared modal dialog — token-based, Esc + backdrop close. No hex; uses Agent A tokens.

let stylesReady = false;
const openModals = new Set();

// Inject modal CSS once; only references existing CSS variables.
function ensureModalStyles() {
  if (stylesReady || document.getElementById("ui-modal-styles")) {
    stylesReady = true;
    return;
  }
  const style = document.createElement("style");
  style.id = "ui-modal-styles";
  style.textContent = `
.ui-modal-root {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-token-4);
}
.ui-modal-backdrop {
  position: absolute;
  inset: 0;
  background: var(--surface-overlay-light);
}
html.theme-dark .ui-modal-backdrop {
  background: var(--surface-overlay-dark);
}
.ui-modal-panel {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-token-3);
  width: min(480px, calc(100vw - var(--spacing-token-8)));
  max-height: min(80vh, 640px);
  overflow: auto;
  padding: var(--spacing-token-6);
  color: var(--fg-primary);
  background: var(--semantic-dropdown-menu-surface-light);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-overlay);
  box-shadow: var(--elevation-toast);
  font-family: var(--font-sans);
}
html.theme-dark .ui-modal-panel {
  background: var(--semantic-dropdown-menu-surface-dark);
}
.ui-modal-title {
  margin: 0;
  font-size: var(--text-heading-sm);
  font-weight: var(--font-weight-medium);
  line-height: var(--leading-heading);
  letter-spacing: var(--tracking-title);
  color: var(--fg-primary);
}
.ui-modal-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  font-size: var(--text-base);
  line-height: var(--leading-body);
  color: var(--fg-primary);
  white-space: pre-wrap;
  word-break: break-word;
}
.ui-modal-body:empty { display: none; }
.ui-modal-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--spacing-token-2);
  padding-top: var(--spacing-token-1);
}
.ui-modal-actions .ui-button {
  min-width: 88px;
}
`;
  document.head.appendChild(style);
  stylesReady = true;
}

// Close one modal instance and fire onClose once.
function closeModalInstance(entry, reason) {
  if (!entry || entry.closed) return;
  entry.closed = true;
  openModals.delete(entry);
  entry.root?.remove();
  document.removeEventListener("keydown", entry.onKey, true);
  try {
    entry.onClose?.(reason);
  } catch (e) {
    console.error("[modal] onClose failed", e);
  }
}

/**
 * Open a modal dialog.
 * @param {object} opts
 * @param {string} [opts.title]
 * @param {string|Node} [opts.body] - text or DOM node
 * @param {Array<{label:string,variant?:'primary'|'ghost'|'',onClick?:Function,closeOnClick?:boolean}>} [opts.actions]
 * @param {boolean} [opts.dismissible=true] - Esc / backdrop close
 * @param {(reason:string)=>void} [opts.onClose]
 * @returns {{close:(reason?:string)=>void, el:HTMLElement, root:HTMLElement}}
 */
export function openModal({ title = "", body = "", actions = [], dismissible = true, onClose } = {}) {
  ensureModalStyles();

  const root = document.createElement("div");
  root.className = "ui-modal-root";
  root.setAttribute("role", "presentation");

  const backdrop = document.createElement("div");
  backdrop.className = "ui-modal-backdrop";

  const panel = document.createElement("div");
  panel.className = "ui-modal-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  if (title) panel.setAttribute("aria-label", String(title));

  const titleEl = document.createElement("h2");
  titleEl.className = "ui-modal-title";
  titleEl.textContent = title || "";
  panel.appendChild(titleEl);

  const bodyEl = document.createElement("div");
  bodyEl.className = "ui-modal-body";
  if (typeof body === "string") bodyEl.textContent = body;
  else if (body instanceof Node) bodyEl.appendChild(body);
  panel.appendChild(bodyEl);

  const actionsEl = document.createElement("div");
  actionsEl.className = "ui-modal-actions";
  panel.appendChild(actionsEl);

  const entry = {
    root,
    closed: false,
    onClose,
    onKey: null,
  };

  function close(reason = "dismiss") {
    closeModalInstance(entry, reason);
  }

  entry.onKey = (e) => {
    if (e.key === "Escape" && dismissible) {
      e.stopPropagation();
      e.preventDefault();
      close("escape");
    }
  };

  for (const action of actions) {
    const btn = document.createElement("button");
    btn.type = "button";
    const variant = action.variant === "primary" ? " ui-button--primary" : action.variant === "ghost" ? " ui-button--ghost" : "";
    btn.className = `ui-button${variant}`;
    btn.textContent = action.label || "";
    btn.addEventListener("click", () => {
      const keepOpen = action.closeOnClick === false;
      try {
        action.onClick?.({ close });
      } catch (err) {
        console.error("[modal] action failed", err);
      }
      if (!keepOpen) close(`action:${action.label || ""}`);
    });
    actionsEl.appendChild(btn);
  }

  if (dismissible) {
    backdrop.addEventListener("click", () => close("backdrop"));
    document.addEventListener("keydown", entry.onKey, true);
  }

  root.appendChild(backdrop);
  root.appendChild(panel);
  document.body.appendChild(root);
  openModals.add(entry);

  // Focus first primary action for keyboard users.
  const first = actionsEl.querySelector(".ui-button--primary") || actionsEl.querySelector(".ui-button");
  first?.focus();

  return { close, el: panel, root };
}

// Close every open modal (route change / shutdown).
export function closeAllModals(reason = "force") {
  for (const entry of [...openModals]) closeModalInstance(entry, reason);
}

export default openModal;
