/**
 * Shortcuts tab — searchable binding list with conflict detection and edit.
 *
 * Bindings come from the engine (`list_shortcuts`). findConflicts() from
 * shell/useShortcuts is reused so the same rule that drives the dispatcher also
 * drives the warning here. Edits persist via save_shortcuts.
 */

import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { t } from "../../../../src/js/i18n.js";
import { findConflicts, formatKeys, type ShortcutBinding } from "@/shell/useShortcuts";
import { BlockCustom, PageHead, SettingsButton } from "../primitives";

function label(key: string, fallback: string): string {
  return String(t(key, fallback));
}

/** Backend Shortcut.keys is a string; UI bindings use string[]. */
function parseKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string" && value) {
    return value.split("+").map((k) => k.trim()).filter(Boolean);
  }
  return [];
}

function asBinding(value: unknown): ShortcutBinding | null {
  if (!value || typeof value !== "object") return null;
  const rec = value as Record<string, unknown>;
  const id = typeof rec["id"] === "string" ? rec["id"] : null;
  if (!id) return null;
  return {
    id,
    label: typeof rec["label"] === "string" ? rec["label"] : id,
    keys: parseKeys(rec["keys"]),
  };
}

/** Rust Shortcut is { id, keys: String, action }. */
function toBackendShortcuts(bindings: ShortcutBinding[]): Array<{
  id: string;
  keys: string;
  action: string;
}> {
  return bindings.map((b) => ({
    id: b.id,
    keys: b.keys.join("+"),
    action: b.id,
  }));
}

async function persistShortcuts(bindings: ShortcutBinding[]): Promise<void> {
  await invoke("save_shortcuts", { shortcuts: toBackendShortcuts(bindings) });
}

export function ShortcutsTab() {
  const [bindings, setBindings] = useState<ShortcutBinding[]>([]);
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  async function load(): Promise<void> {
    try {
      const raw = await invoke<unknown>("list_shortcuts");
      const list = Array.isArray(raw) ? raw : [];
      setBindings(list.map(asBinding).filter((b): b is ShortcutBinding => b !== null));
    } catch (err) {
      console.error("[settings] list_shortcuts failed", err);
    }
  }

  useEffect(() => {
    void load();
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

  function captureKeys(id: string): void {
    setEditingId(id);
    setStatus(label("shortcuts.pressKeys", "Press the new key combination…"));
    const once = (ev: KeyboardEvent): void => {
      ev.preventDefault();
      ev.stopPropagation();
      const parts: string[] = [];
      if (ev.ctrlKey) parts.push("Ctrl");
      if (ev.shiftKey) parts.push("Shift");
      if (ev.altKey) parts.push("Alt");
      if (ev.metaKey) parts.push("Meta");
      if (!["Control", "Alt", "Shift", "Meta"].includes(ev.key)) {
        parts.push(ev.key.length === 1 ? ev.key.toUpperCase() : ev.key);
      }
      document.removeEventListener("keydown", once, true);
      setEditingId(null);
      if (!parts.length) {
        setStatus("");
        return;
      }
      const next = bindings.map((b) => (b.id === id ? { ...b, keys: parts } : b));
      void persistShortcuts(next)
        .then(async () => {
          setBindings(next);
          setStatus(label("toast.saved", "Saved."));
          await load();
        })
        .catch((err) => {
          setStatus(err instanceof Error ? err.message : String(err));
        });
    };
    document.addEventListener("keydown", once, true);
  }

  async function clearBinding(id: string): Promise<void> {
    const next = bindings.map((b) => (b.id === id ? { ...b, keys: [] } : b));
    try {
      await persistShortcuts(next);
      setBindings(next);
      setStatus(label("toast.saved", "Saved."));
      await load();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    }
  }

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

      {status ? (
        <BlockCustom title="">
          <div className="settings-card site-empty">{status}</div>
        </BlockCustom>
      ) : null}

      <BlockCustom title={label("settings.shortcuts", "Keyboard shortcuts")}>
        <div className="settings-card">
          {filtered.length === 0 ? (
            <div className="site-empty">{label("shortcuts.empty", "No shortcuts found.")}</div>
          ) : (
            filtered.map((binding) => (
              <div
                className={`settings-row${conflictIds.has(binding.id) ? " is-conflict" : ""}${editingId === binding.id ? " is-editing" : ""}`}
                key={binding.id}
              >
                <div className="settings-row-copy">
                  <div className="settings-row-title">{binding.label}</div>
                </div>
                <div className="settings-row-control">
                  <kbd>{formatKeys(binding.keys) || "—"}</kbd>
                  <SettingsButton
                    label={label("action.edit", "Edit")}
                    disabled={editingId === binding.id}
                    onClick={() => captureKeys(binding.id)}
                  />
                  <SettingsButton
                    label={label("shortcuts.clear", "Clear")}
                    onClick={() => void clearBinding(binding.id)}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </BlockCustom>
    </>
  );
}
