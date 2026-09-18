/**
 * Shortcuts tab — mirrors the official Codex desktop v26.911 键盘快捷键 page
 * (Windows UIA capture t41: docs/uia/outlines-t41/shortcuts.txt).
 *
 * Rows come from the static catalog in app/data/shortcuts-catalog.ts. The
 * catalog holds the official zh labels/descriptions, so they render as-is for
 * every UI language — only a zh capture exists (the official zh build shows
 * exactly these strings; an en localization of the catalog is pending a new
 * capture).
 *
 * Rebinding is intentionally NOT wired: catalog rows carry no action ids that
 * map onto the Rust shortcut store (AppState.shortcuts), and the shell has no
 * L3 rebind command yet. 更改/清除/为…设置快捷键 therefore render disabled
 * alongside read-only chord pills — no fake capture flows, no invented
 * backend commands.
 */

import { useEffect, useMemo, useState } from "react";
import { t } from "../../../../src/js/i18n.js";
import { formatKeys, normalizeKey } from "@/shell/useShortcuts";
import { saveSection, usePrefSection } from "@/state/preferencesStore";
import { SHORTCUTS_CATALOG, type ShortcutCatalogRow } from "../../../data/shortcuts-catalog";
import { PageHead } from "../primitives";

/** Catalog chord label marking an unassigned row. */
const UNASSIGNED = "未分配";

/** Bare modifier keys never form a chord on their own. */
const MODIFIER_KEYS = new Set(["Control", "Alt", "Shift", "Meta"]);

function label(key: string, fallback: string): string {
  return String(t(key, fallback));
}

/** "为…设置快捷键" → "为 <name> 设置快捷键"; plain fallbacks append the name. */
function setForLabel(name: string): string {
  const tpl = label("shortcuts.setFor", "Set shortcut for");
  return tpl.includes("…") ? tpl.replace("…", ` ${name} `) : `${tpl} ${name}`;
}

function CatalogRow({ row }: { row: ShortcutCatalogRow }) {
  return (
    <div className="shortcut-row shortcut-row-catalog">
      <div className="shortcut-copy">
        <div className="shortcut-name">{row.name}</div>
        {row.desc ? <div className="shortcut-description">{row.desc}</div> : null}
      </div>
      <div className="shortcut-chords">
        {row.chords.map((chord, index) => (
          <div className="shortcut-chord" key={`${index}-${chord}`}>
            {chord === UNASSIGNED ? (
              <>
                <div className="shortcut-bindings">
                  <span className="shortcut-unassigned">
                    {label("shortcuts.unassigned", "Unassigned")}
                  </span>
                </div>
                <button type="button" className="settings-button shortcut-set" disabled>
                  {setForLabel(row.name)}
                </button>
              </>
            ) : (
              <>
                <div className="shortcut-bindings">
                  <kbd className="key">{chord}</kbd>
                </div>
                <button
                  type="button"
                  className="shortcut-edit"
                  disabled
                  aria-label={`${label("shortcuts.change", "Change")} ${row.name}`}
                />
                <button
                  type="button"
                  className="shortcut-delete"
                  disabled
                  aria-label={`${label("shortcuts.clear", "Clear")} ${row.name}`}
                />
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ShortcutsTab() {
  const [query, setQuery] = useState("");
  const [chordFilter, setChordFilter] = useState("");
  const prefs = usePrefSection<{ searchByKeys?: boolean }>("shortcuts");
  const captureOn = prefs.searchByKeys === true;

  function toggleCapture(): void {
    void saveSection("shortcuts", { searchByKeys: !captureOn });
    setChordFilter("");
  }

  // 使用快捷键搜索: while on, every non-modifier keydown becomes the chord
  // filter. The capture swallows the event so the global dispatcher does not
  // also fire the shortcut being typed.
  useEffect(() => {
    if (!captureOn) return;
    const onKeyDown = (ev: KeyboardEvent): void => {
      if (MODIFIER_KEYS.has(ev.key)) return;
      ev.preventDefault();
      ev.stopPropagation();
      setChordFilter(formatKeys(normalizeKey(ev)));
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [captureOn]);

  const filtered = useMemo(() => {
    if (captureOn) {
      return chordFilter
        ? SHORTCUTS_CATALOG.filter((row) => row.chords.includes(chordFilter))
        : SHORTCUTS_CATALOG;
    }
    const q = query.trim().toLowerCase();
    if (!q) return SHORTCUTS_CATALOG;
    return SHORTCUTS_CATALOG.filter(
      (row) =>
        row.name.toLowerCase().includes(q) ||
        row.desc.toLowerCase().includes(q) ||
        row.chords.some((chord) => chord.toLowerCase().includes(q)),
    );
  }, [captureOn, chordFilter, query]);

  return (
    <>
      <PageHead title={label("shortcuts.title", "Keyboard shortcuts")} />

      <div className="shortcuts-search-bar">
        <span className="shortcuts-search-icon" />
        <input
          type="text"
          className="shortcuts-search-input"
          placeholder={label("shortcuts.search", "Search shortcuts")}
          value={captureOn ? chordFilter : query}
          readOnly={captureOn}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          type="button"
          className={`shortcuts-keys-toggle${captureOn ? " is-on" : ""}`}
          aria-pressed={captureOn}
          aria-label={label("shortcuts.searchByKeys", "Search by shortcut")}
          title={label("shortcuts.searchByKeys", "Search by shortcut")}
          onClick={toggleCapture}
        />
      </div>

      <div className="shortcuts-list">
        {filtered.length === 0 ? (
          <div className="site-empty">{label("shortcuts.empty", "No shortcuts found.")}</div>
        ) : (
          filtered.map((row) => <CatalogRow key={row.name} row={row} />)
        )}
      </div>
    </>
  );
}
