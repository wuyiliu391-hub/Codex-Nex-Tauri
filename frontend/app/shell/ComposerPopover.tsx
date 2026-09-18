/**
 * ComposerPopover — fixed-position host for Wails-era `.composer-menu*` panels.
 *
 * Mirrors home.js openUtilityMenu() 1:1:
 *   className `composer-menu ${extra}`
 *   position:fixed, GAP=6, start-align (or end-align for model menu)
 *   flip above when there is no room below
 *   close on outside pointerdown (capture), Escape, window blur
 *
 * Emits existing class names only — the inner DOM is owned by the caller.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";

const GAP = 6;

export type ComposerMenuAlign = "start" | "end";
/** Vertical preference. Permission/project cards open downward like official. */
export type ComposerMenuPrefer = "below" | "auto";

interface ComposerPopoverProps {
  className?: string;
  align?: ComposerMenuAlign;
  /** Anchor the menu is positioned against (usually the pill trigger). */
  anchorEl: HTMLElement | null;
  /** Extra refs that should not dismiss the menu on outside pointerdown. */
  ignoreRefs?: Array<React.RefObject<HTMLElement | null>>;
  /** "below" keeps the panel under the pill; "auto" may flip up when cramped. */
  prefer?: ComposerMenuPrefer;
  onClose: () => void;
  children: React.ReactNode;
}

interface Placement {
  left: number;
  top: number;
}

function placeMenu(
  anchorRect: DOMRect,
  menuRect: DOMRect,
  align: ComposerMenuAlign,
  prefer: ComposerMenuPrefer,
): Placement {
  // Horizontal: start-align to the anchor; end-align to the anchor's right edge.
  let left =
    align === "end" ? anchorRect.right - menuRect.width : anchorRect.left;
  left = Math.min(
    Math.max(8, Math.round(left)),
    Math.max(8, window.innerWidth - menuRect.width - 8),
  );

  const below = Math.round(anchorRect.bottom + GAP);
  if (prefer === "below") {
    // Permission/project cards stay under the trigger — do not flip up.
    return { left, top: below };
  }

  // auto: prefer below; flip above only when below overflows and above fits better.
  const spaceBelow = window.innerHeight - anchorRect.bottom;
  const spaceAbove = anchorRect.top;
  const need = menuRect.height + GAP + 8;
  let top: number;
  if (spaceBelow >= need || spaceBelow >= spaceAbove) {
    top = below;
  } else {
    top = Math.max(8, Math.round(anchorRect.top - menuRect.height - GAP));
  }
  return { left, top };
}

export function ComposerPopover({
  className = "",
  align = "start",
  anchorEl,
  ignoreRefs,
  prefer = "below",
  onClose,
  children,
}: ComposerPopoverProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);

  // Position after paint-ready layout; re-run when the panel grows (model list).
  useLayoutEffect(() => {
    if (!anchorEl) return;
    const menu = menuRef.current;
    if (!menu) return;

    const apply = (): void => {
      const current = menuRef.current;
      if (!current || !anchorEl) return;
      const next = placeMenu(
        anchorEl.getBoundingClientRect(),
        current.getBoundingClientRect(),
        align,
        prefer,
      );
      setPlacement((prev) =>
        prev && prev.left === next.left && prev.top === next.top ? prev : next,
      );
    };

    apply();

    const ro =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => apply()) : null;
    ro?.observe(menu);
    window.addEventListener("resize", apply);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", apply);
    };
  }, [anchorEl, align, prefer, children]);

  // Outside pointerdown (capture) / Escape / window blur — same contract as home.js.
  useEffect(() => {
    const onPointerDown = (e: PointerEvent): void => {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (menuRef.current?.contains(target)) return;
      if (anchorEl && anchorEl.contains(target)) return;
      if (ignoreRefs?.some((ref) => ref.current?.contains(target))) return;
      onClose();
    };
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    const onBlur = (): void => onClose();

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("blur", onBlur);
    };
  }, [anchorEl, ignoreRefs, onClose]);

  return (
    <div
      ref={menuRef}
      className={`composer-menu ${className}`.trim()}
      role="menu"
      style={{
        position: "fixed",
        left: placement?.left ?? -9999,
        top: placement?.top ?? -9999,
        visibility: placement ? undefined : "hidden",
      }}
    >
      {children}
    </div>
  );
}

/** Shared check icon used by permission / model / project rows. */
export function MenuCheck(): React.ReactElement {
  return (
    <svg className="menu-check" viewBox="0 0 18 18" aria-hidden="true">
      <path d="m3.5 9 3.4 3.4 7.6-7.6" />
    </svg>
  );
}
