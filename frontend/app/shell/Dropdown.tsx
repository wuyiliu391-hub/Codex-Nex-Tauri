/**
 * Declarative listbox dropdown. Replaces the imperative createDropdown() from
 * ui-controls.js.
 *
 * Behaviour kept 1:1 with the vanilla control:
 *   click / ArrowDown / Enter / Space to open
 *   ArrowUp / ArrowDown to move, Enter / Space to commit, Escape to cancel
 *   outside pointerdown dismisses
 *   flips above the anchor when there is not enough room below
 *
 * The popover is rendered in place (position: fixed) rather than portalled —
 * the app has no scroll containers above it, and this keeps the DOM shallow.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export interface DropdownItem {
  value: string;
  label: string;
}

interface DropdownProps {
  items: DropdownItem[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}

/** Minimum popover width, matching the vanilla control. */
const MIN_WIDTH = 120;
/** Below this much space we flip the popover above the anchor. */
const FLIP_THRESHOLD = 180;

export function Dropdown({
  items,
  value,
  onChange,
  disabled = false,
  className = "",
  ariaLabel,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.max(0, items.findIndex((i) => i.value === value)),
  );
  const [placement, setPlacement] = useState<{ left: number; top?: number; bottom?: number; width: number }>({
    left: 0,
    top: 0,
    width: MIN_WIDTH,
  });

  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const selected = items.find((i) => i.value === value) ?? items[0];

  const close = useCallback(() => setOpen(false), []);

  // Position under (or over) the anchor whenever the popover opens or the
  // window resizes while it is open.
  useEffect(() => {
    if (!open) return;
    const anchor = anchorRef.current;
    if (!anchor) return;

    const place = (): void => {
      const rect = anchor.getBoundingClientRect();
      const width = Math.max(rect.width, MIN_WIDTH);
      const spaceBelow = window.innerHeight - rect.bottom;
      if (spaceBelow < FLIP_THRESHOLD && rect.top > spaceBelow) {
        setPlacement({ left: Math.round(rect.left), bottom: Math.round(window.innerHeight - rect.top + 2), width });
      } else {
        setPlacement({ left: Math.round(rect.left), top: Math.round(rect.bottom + 2), width });
      }
    };

    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  // Outside click / Escape while open.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent): void => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (listRef.current?.contains(target) || anchorRef.current === target) return;
      close();
    };
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        anchorRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open, close]);

  // Keep the active row in sync with the current value while closed.
  useEffect(() => {
    if (open) return;
    const idx = items.findIndex((i) => i.value === value);
    if (idx >= 0) setActiveIndex(idx);
  }, [value, items, open]);

  function commit(index: number): void {
    const item = items[index];
    if (!item) return;
    setActiveIndex(index);
    close();
    if (item.value !== value) onChange(item.value);
    anchorRef.current?.focus();
  }

  function onAnchorKeyDown(e: React.KeyboardEvent<HTMLButtonElement>): void {
    if (open) return;
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen(true);
    }
  }

  function onListKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      commit(activeIndex);
    }
  }

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className={`ui-dropdown ${className}`.trim()}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={(e) => {
          e.preventDefault();
          if (disabled) return;
          setOpen((v) => !v);
        }}
        onKeyDown={onAnchorKeyDown}
      >
        <span className="ui-dropdown-label">{selected?.label ?? ""}</span>
        <span className="ui-dropdown-caret" aria-hidden="true" />
      </button>

      {open ? (
        <div
          ref={listRef}
          className="ui-popover"
          role="listbox"
          tabIndex={-1}
          style={{
            left: placement.left,
            width: placement.width,
            ...(placement.top !== undefined ? { top: placement.top } : {}),
            ...(placement.bottom !== undefined ? { bottom: placement.bottom } : {}),
          }}
          onKeyDown={onListKeyDown}
        >
          {items.map((item, index) => (
            <button
              type="button"
              key={item.value}
              className={`ui-option${index === activeIndex ? " is-active" : ""}`}
              role="option"
              aria-selected={index === activeIndex}
              data-value={item.value}
              onClick={() => commit(index)}
              autoFocus={index === activeIndex}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}
