// Shared UI control helpers: custom dropdown / popover listbox.

let openPopover = null;

// Close any currently open popover and remove outside-click handler.
function closeOpenPopover() {
  if (!openPopover) return;
  openPopover.el.remove();
  openPopover.anchor?.setAttribute("aria-expanded", "false");
  if (openPopover.onOutside) document.removeEventListener("pointerdown", openPopover.onOutside, true);
  openPopover = null;
}

/**
 * Create a custom dropdown popover attached to an anchor button.
 * @param {object} opts
 * @param {HTMLElement} opts.anchor  - trigger button
 * @param {Array<{value:string,label:string}>} opts.items
 * @param {string} [opts.value] - initially selected value
 * @param {(value:string,label:string)=>void} [opts.onSelect]
 * @returns {{open:()=>void,close:()=>void,setValue:(v:string)=>void,destroy:()=>void}}
 */
export function createDropdown({ anchor, items, value, onSelect }) {
  if (!anchor) return { open() {}, close() {}, setValue() {}, destroy() {} };

  anchor.setAttribute("aria-haspopup", "listbox");
  anchor.setAttribute("aria-expanded", "false");
  // Mirror current value onto the anchor so callers can read .value
  anchor.value = value ?? "";

  let activeIndex = Math.max(0, items.findIndex((i) => i.value === value));
  if (activeIndex < 0) activeIndex = 0;

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

  function select(idx) {
    const item = items[idx];
    if (!item) return;
    activeIndex = idx;
    anchor.value = item.value;
    const labelEl = anchor.querySelector(".ui-dropdown-label");
    if (labelEl) labelEl.textContent = item.label;
    closeOpenPopover();
    onSelect?.(item.value, item.label);
    // Fire change so existing [data-select] / [data-tfont] listeners work
    anchor.dispatchEvent(new Event("change", { bubbles: true }));
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
      if (e.target.closest(".ui-popover") || e.target === anchor) return;
      closeOpenPopover();
    };
    document.addEventListener("pointerdown", onOutside, true);
    openPopover = { el: list, anchor, onOutside };
    // Focus active option
    const opts = list.querySelectorAll(".ui-option");
    opts[activeIndex]?.focus();
  }

  function onKeydown(e) {
    if (!openPopover || openPopover.anchor !== anchor) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
      return;
    }
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
  }

  anchor.addEventListener("click", (e) => {
    e.preventDefault();
    if (anchor.disabled) return;
    open();
  });
  anchor.addEventListener("keydown", onKeydown);

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
      anchor.removeEventListener("keydown", onKeydown);
    },
  };
}

// Close open popover when the window loses focus.
window.addEventListener("blur", closeOpenPopover);
