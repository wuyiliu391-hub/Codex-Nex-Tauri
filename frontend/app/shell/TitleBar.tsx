/**
 * Frameless titlebar: navigation buttons, File/Edit/View/Help menus, window
 * controls. Replaces the titlebar half of shell.js.
 *
 * Menus are rendered from MENU_TREE, so the tree and the dispatcher can never
 * disagree about which actions exist.
 */

import { useEffect, useRef, useState } from "react";
import { t } from "../../src/js/i18n.js";
import { MENU_NAMES, MENU_TREE, isSeparator, type MenuName } from "./menuTree";
import { dispatchAction, type ShellContext } from "./actions";

interface TitleBarProps {
  ctx: ShellContext;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
}

function label(key: string): string {
  // i18n returns the key itself when missing, which is a useful fallback here.
  return String(t(key, key.replace(/^menu\./, "")));
}

export function TitleBar({ ctx, sidebarCollapsed, onToggleSidebar }: TitleBarProps) {
  const [openMenu, setOpenMenu] = useState<MenuName | null>(null);
  const barRef = useRef<HTMLElement | null>(null);

  // Dismiss the open menu on outside pointerdown or Escape.
  useEffect(() => {
    if (!openMenu) return;
    const onPointerDown = (e: PointerEvent): void => {
      if (!barRef.current?.contains(e.target as Node)) setOpenMenu(null);
    };
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setOpenMenu(null);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openMenu]);

  function run(action: string): void {
    setOpenMenu(null);
    dispatchAction(action, ctx);
  }

  return (
    <header className="app-toolbar" id="app-toolbar" ref={barRef} data-tauri-drag-region>
      <div className="toolbar-navigation">
        <button
          className="toolbar-button"
          id="titlebar-sidebar"
          type="button"
          aria-label={String(t("menu.toggleSidebar", "Toggle sidebar"))}
          aria-pressed={!sidebarCollapsed}
          onClick={onToggleSidebar}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M3.5 4.5h13v11h-13zM7.5 4.5v11" />
          </svg>
        </button>
        <button
          className="toolbar-button"
          id="titlebar-back"
          type="button"
          aria-label="Back"
          onClick={() => window.history.back()}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="m11.5 5.5-4.5 4.5 4.5 4.5" />
          </svg>
        </button>
        <button
          className="toolbar-button toolbar-forward"
          id="titlebar-forward"
          type="button"
          aria-label="Forward"
          onClick={() => window.history.forward()}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="m8.5 5.5 4.5 4.5-4.5 4.5" />
          </svg>
        </button>
      </div>

      <nav className="desktop-menu-bar" aria-label="Application menu">
        {MENU_NAMES.map((name) => (
          <div className="desktop-menu" key={name}>
            <button
              className={`desktop-menu-trigger${openMenu === name ? " is-open" : ""}`}
              type="button"
              data-menu={name}
              aria-haspopup="menu"
              aria-expanded={openMenu === name}
              onClick={() => setOpenMenu((cur) => (cur === name ? null : name))}
            >
              {label(`menu.${name}`)}
            </button>

            {openMenu === name ? (
              <div className="desktop-menu-panel" role="menu">
                {MENU_TREE[name].map((entry, i) =>
                  isSeparator(entry) ? (
                    <div className="desktop-menu-separator" key={`sep-${i}`} role="separator" />
                  ) : (
                    <button
                      className="desktop-menu-item"
                      key={entry.action}
                      type="button"
                      role="menuitem"
                      onClick={() => run(entry.action)}
                    >
                      <span>{label(entry.key)}</span>
                      {entry.keys ? <kbd>{entry.keys}</kbd> : null}
                    </button>
                  ),
                )}
              </div>
            ) : null}
          </div>
        ))}
      </nav>

      <div className="toolbar-spacer" />

      <div className="window-controls">
        <button
          className="window-control"
          id="window-minimise"
          type="button"
          aria-label="Minimise"
          onClick={() => dispatchAction("minimise", ctx)}
        >
          <span className="caption-glyph">&#xE921;</span>
        </button>
        <button
          className="window-control"
          id="window-maximise"
          type="button"
          aria-label="Maximise"
          onClick={() => dispatchAction("maximise", ctx)}
        >
          <span className="caption-glyph">&#xE922;</span>
        </button>
        <button
          className="window-control window-close"
          id="window-close"
          type="button"
          aria-label="Close"
          onClick={() => dispatchAction("close", ctx)}
        >
          <span className="caption-glyph">&#xE8BB;</span>
        </button>
      </div>
    </header>
  );
}
