/**
 * Shortcuts tab — searchable binding list with conflict detection.
 *
 * Bindings come from the engine (`list_shortcuts`). findConflicts() from
 * shell/useShortcuts is reused so the same rule that drives the dispatcher also
 * drives the warning here.
 */

import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { t } from "../../../../src/js/i18n.js";
import { findConflicts, formatKeys, type ShortcutBinding } from "@/shell/useShortcuts";
import { BlockCustom, PageHead } from "../primitives";

function label(key: string, fallback: string): string {
  return String(t(key, fallback));
}

function asBinding(value: unknown): ShortcutBinding | null {
  if (!value || typeof value !== "object") return null;
  const rec = value as Record<string, unknown>;
  const id = typeof rec["id"] === "string" ? rec["id"] : null;
  if (!id) return null;
  const keys = Array.isArray(rec["keys"]) ? (rec["keys"] as unknown[]).map(String) : [];
  return {
    id,
    label: typeof rec["label"] === "string" ? rec["label"] : id,
    keys,
  };
}

export function ShortcutsTab() {
  const [bindings, setBindings] = useState<ShortcutBinding[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    void invoke<unknown>("list_shortcuts")
      .then((raw) => {
        const list = Array.isArray(raw) ? raw : [];
        setBindings(list.map(asBinding).filter((b): b is ShortcutBinding => b !== null));
      })
      .catch((err) => console.error("[settings] list_shortcuts failed", err));
  }, []);

  const conflicts = useMemo(() => findConflicts(bindings), [bindings]);
  const conflictIds = useMemo(
    () => new Set(conflicts.flatMap((c) => c.ids)),
    [conflicts],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return bindings;
    return bindings.filter(
      (b) =>
        b.label.toLowerCase().includes(q) ||
        b.id.toLowerCase().includes(q) ||
        formatKeys(b.keys).toLowerCase().includes(q),
    );
  }, [bindings, query]);

  return (
    <>
      <PageHead
        title={label("settings.shortcuts", "Keyboard shortcuts")}
        desc={label("settings.shortcutsDesc", "")}
      />

      <BlockCustom title="">
        <label className="shortcuts-search">
          <input
            type="text"
            placeholder={label("shortcuts.search", "Search shortcuts")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </BlockCustom>

      {conflicts.length ? (
        <BlockCustom title="">
          <div className="settings-card site-empty">
            {conflicts.length} conflicting binding{conflicts.length === 1 ? "" : "s"}:{" "}
            {conflicts.map((c) => `${c.keys} (${c.ids.join(", ")})`).join("; ")}
          </div>
        </BlockCustom>
      ) : null}

      <BlockCustom title={label("settings.shortcuts", "Keyboard shortcuts")}>
        <div className="settings-card">
          {filtered.length === 0 ? (
            <div className="site-empty">{label("shortcuts.empty", "No shortcuts found.")}</div>
          ) : (
            filtered.map((binding) => (
              <div
                className={`settings-row${conflictIds.has(binding.id) ? " is-conflict" : ""}`}
                key={binding.id}
              >
                <div className="settings-row-copy">
                  <div className="settings-row-title">{binding.label}</div>
                </div>
                <div className="settings-row-control">
                  <kbd>{formatKeys(binding.keys) || "—"}</kbd>
                </div>
              </div>
            ))
          )}
        </div>
      </BlockCustom>
    </>
  );
}
