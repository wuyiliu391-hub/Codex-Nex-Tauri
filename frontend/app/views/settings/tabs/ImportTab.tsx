/**
 * Import tab — "keep in sync" and content selection, plus the import action.
 *
 * Ports renderImport() from settings.js. Preference toggles use save_section.
 * Import opens a real file dialog, reads the chosen file via the fs plugin,
 * and forwards non-empty config edits to config/batchWrite. Failures surface
 * as error text — never a fake success.
 */

import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { t } from "../../../../src/js/i18n.js";
import { saveSection, usePrefSection } from "@/state/preferencesStore";
import { Dropdown } from "@/shell/Dropdown";
import { Block, PageHead, Row, SettingsButton, Switch } from "../primitives";

function label(key: string, fallback = ""): string {
  return String(t(key, fallback));
}

interface ImportPrefs {
  importKeepSync?: boolean;
  importContent?: string;
}

interface ConfigEdit {
  keyPath: string;
  value: unknown;
  mergeStrategy: string;
}

function asRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}

/**
 * Accept several real export shapes and normalise them to official
 * config/batchWrite edits. Empty input yields [] so the caller can fail soft.
 */
function toConfigEdits(parsed: unknown): ConfigEdit[] {
  if (parsed == null) return [];
  if (Array.isArray(parsed)) {
    const edits: ConfigEdit[] = [];
    for (const entry of parsed) {
      const rec = asRecord(entry);
      const keyPath =
        typeof rec["keyPath"] === "string"
          ? rec["keyPath"]
          : typeof rec["key"] === "string"
            ? rec["key"]
            : "";
      if (!keyPath) continue;
      edits.push({
        keyPath,
        value: rec["value"],
        mergeStrategy: typeof rec["mergeStrategy"] === "string" ? rec["mergeStrategy"] : "replace",
      });
    }
    return edits;
  }
  const rec = asRecord(parsed);
  if (Array.isArray(rec["edits"])) return toConfigEdits(rec["edits"]);
  if (Array.isArray(rec["writes"])) return toConfigEdits(rec["writes"]);
  if (Array.isArray(rec["config"])) return toConfigEdits(rec["config"]);
  // Flat key → value map (leaf config keys only).
  return Object.entries(rec)
    .filter(([, value]) => value !== null && typeof value !== "object")
    .map(([keyPath, value]) => ({ keyPath, value, mergeStrategy: "replace" }));
}

function firstPickedPath(picked: unknown): string {
  if (typeof picked === "string" && picked) return picked;
  if (Array.isArray(picked) && typeof picked[0] === "string") return picked[0];
  return "";
}

export function ImportTab() {
  const prefs = usePrefSection<ImportPrefs>("import");
  const [status, setStatus] = useState<{ kind: "idle" | "ok" | "err"; text: string }>({
    kind: "idle",
    text: "",
  });
  const [busy, setBusy] = useState(false);

  async function runImport(): Promise<void> {
    setBusy(true);
    setStatus({ kind: "idle", text: label("discovery.loading", "Loading…") });
    try {
      const picked = await invoke<unknown>("plugin:dialog|open", {
        options: {
          multiple: false,
          filters: [
            { name: label("import.title", "Import"), extensions: ["json", "toml", "txt"] },
          ],
        },
      });
      const path = firstPickedPath(picked);
      if (!path) {
        setStatus({ kind: "err", text: label("import.cancelled", "No file selected.") });
        return;
      }

      const text = await invoke<string>("plugin:fs|read_text_file", { path });
      if (!text || !text.trim()) {
        setStatus({ kind: "err", text: label("import.emptyFile", "Selected file is empty.") });
        return;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        // TOML / plain text: treat non-empty body as a hard failure rather than
        // inventing writes. Official imports are JSON config snapshots.
        setStatus({
          kind: "err",
          text: label("import.parseFailed", "File is not a valid JSON settings export."),
        });
        return;
      }

      const edits = toConfigEdits(parsed);
      if (!edits.length) {
        setStatus({
          kind: "err",
          text: label("import.noWrites", "No configuration keys found in the file."),
        });
        return;
      }

      await invoke("rpc_raw", {
        method: "config/batchWrite",
        params: { edits, reloadUserConfig: true },
      });
      setStatus({
        kind: "ok",
        text: `${label("toast.imported", "Settings imported.")} (${edits.length})`,
      });
    } catch (err) {
      setStatus({
        kind: "err",
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHead title={label("import.title")} desc={label("import.desc")} />

      <Block title={label("import.autoSync")}>
        <Row
          label={label("import.keepSync")}
          desc={label("import.keepSyncDesc")}
          control={
            <Switch
              checked={prefs.importKeepSync === true}
              onChange={(v) => void saveSection("import", { importKeepSync: v })}
            />
          }
        />
        <Row
          label={label("import.content")}
          desc={label("import.contentDesc")}
          control={
            <Dropdown
              value={prefs.importContent ?? "custom"}
              items={[{ value: "custom", label: label("import.custom") }]}
              onChange={(v) => void saveSection("import", { importContent: v })}
            />
          }
        />
      </Block>

      <Block title={label("import.fromApps")}>
        <Row
          label={label("import.fromApps")}
          desc={label("import.noSettings")}
          control={
            <SettingsButton
              label={label("import.importBtn")}
              kind="primary"
              disabled={busy}
              onClick={() => void runImport()}
            />
          }
        />
        {status.text ? (
          <div className={`settings-card site-empty${status.kind === "err" ? " is-warn" : ""}`}>
            {status.text}
          </div>
        ) : null}
      </Block>
    </>
  );
}
