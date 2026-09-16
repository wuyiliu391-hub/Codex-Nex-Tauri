// Shared UI control helpers: custom dropdown / popover listbox.

let openPopover = null;

// Close any currently open popover and remove outside-click / key handlers.
function closeOpenPopover() {
  if (!openPopover) return;
  const { el, anchor, onOutside, onKeydownDoc } = openPopover;
  el.remove();
  anchor?.setAttribute("aria-expanded", "false");
  if (onOutside) document.removeEventListener("pointerdown", onOutside, true);
  if (onKeydownDoc) document.removeEventListener("keydown", onKeydownDoc, true);
  openPopover = null;
}

/**
 * Create a custom dropdown popover attached to an anchor button.
 * @param {object} opts
 * @param {HTMLElement} opts.anchor  - trigger button
 * @param {Array<{value:string,label:string}>} opts.items
 * @param {string} [opts.value] - initially selected value
 * @param {(value:string,label:string)=>void} [opts.onSelect]
 * @param {boolean} [opts.emitChange=true] - also fire native change on anchor
 * @returns {{open:()=>void,close:()=>void,setValue:(v:string)=>void,destroy:()=>void}}
 */
export function createDropdown({ anchor, items, value, onSelect, emitChange = true }) {
  if (!anchor) return { open() {}, close() {}, setValue() {}, destroy() {} };

  anchor.setAttribute("aria-haspopup", "listbox");
  anchor.setAttribute("aria-expanded", "false");
  // Mirror current value onto the anchor so callers can read .value
  anchor.value = value ?? "";

  let activeIndex = Math.max(0, items.findIndex((i) => i.value === value));
  if (activeIndex < 0) activeIndex = 0;

  // Build listbox DOM for the current items.
  function buildList() {
    const list = document.createElement("div");
    list.className = "ui-popover";
    list.setAttribute("role", "listbox");
    list.tabIndex = -1;
    items.forEach((item, idx) => {
      const opt = document.createElement("button");
      opt.type = "button";
      opt.className = "ui-option" + (idx === activeIndex ? " is-active" : "");
      opt.setAttribute("role", "option");
      opt.setAttribute("aria-selected", String(idx === activeIndex));
      opt.dataset.value = item.value;
      opt.textContent = item.label;
      opt.addEventListener("click", () => select(idx));
      list.appendChild(opt);
    });
    return list;
  }

  // Place popover under/over anchor within viewport.
  function position(list) {
    const rect = anchor.getBoundingClientRect();
    list.style.minWidth = `${Math.max(rect.width, 120)}px`;
    list.style.left = `${Math.round(rect.left)}px`;
    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceBelow < 180 && rect.top > spaceBelow) {
      list.style.bottom = `${Math.round(window.innerHeight - rect.top + 2)}px`;
      list.style.top = "auto";
    } else {
      list.style.top = `${Math.round(rect.bottom + 2)}px`;
      list.style.bottom = "auto";
    }
  }

  // Commit selection, close, notify caller exactly once.
  function select(idx) {
    const item = items[idx];
    if (!item) return;
    activeIndex = idx;
    anchor.value = item.value;
    const labelEl = anchor.querySelector(".ui-dropdown-label");
    if (labelEl) labelEl.textContent = item.label;
    closeOpenPopover();
    onSelect?.(item.value, item.label);
    if (emitChange) {
      anchor.dispatchEvent(new Event("change", { bubbles: true }));
    }
    anchor.focus();
  }

  function open() {
    if (openPopover?.anchor === anchor) {
      closeOpenPopover();
      return;
    }
    closeOpenPopover();
    const list = buildList();
    document.body.appendChild(list);
    position(list);
    anchor.setAttribute("aria-expanded", "true");
    const onOutside = (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (t.closest(".ui-popover") || t === anchor) return;
      closeOpenPopover();
    };
    // Keyboard stays on document while open so focus can sit on options.
    const onKeydownDoc = (e) => {
      if (!openPopover || openPopover.anchor !== anchor) return;
      const opts = [...openPopover.el.querySelectorAll(".ui-option")];
      if (e.key === "Escape") {
        e.preventDefault();
        closeOpenPopover();
        anchor.focus();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        activeIndex = Math.min(activeIndex + 1, items.length - 1);
        opts.forEach((o, i) => o.classList.toggle("is-active", i === activeIndex));
        opts[activeIndex]?.focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        activeIndex = Math.max(activeIndex - 1, 0);
        opts.forEach((o, i) => o.classList.toggle("is-active", i === activeIndex));
        opts[activeIndex]?.focus();
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        select(activeIndex);
      }
    };
    document.addEventListener("pointerdown", onOutside, true);
    document.addEventListener("keydown", onKeydownDoc, true);
    openPopover = { el: list, anchor, onOutside, onKeydownDoc };
    const opts = list.querySelectorAll(".ui-option");
    opts[activeIndex]?.focus();
  }

  // Closed-state: open on keyboard activation from the anchor.
  function onAnchorKeydown(e) {
    if (openPopover?.anchor === anchor) return;
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open();
    }
  }

  anchor.addEventListener("click", (e) => {
    e.preventDefault();
    if (anchor.disabled) return;
    open();
  });
  anchor.addEventListener("keydown", onAnchorKeydown);

  return {
    open,
    close: closeOpenPopover,
    setValue(v) {
      const idx = items.findIndex((i) => i.value === v);
      if (idx >= 0) {
        activeIndex = idx;
        anchor.value = items[idx].value;
        const labelEl = anchor.querySelector(".ui-dropdown-label");
        if (labelEl) labelEl.textContent = items[idx].label;
      }
    },
    destroy() {
      closeOpenPopover();
      anchor.removeEventListener("keydown", onAnchorKeydown);
    },
  };
}

// Close open popover when the window loses focus.
window.addEventListener("blur", closeOpenPopover);
