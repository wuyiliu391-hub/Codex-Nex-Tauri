/**
 * Import tab — "keep in sync" and content selection, plus the import action.
 *
 * Ports renderImport() from settings.js. All controls are shell preferences;
 * the import button is a one-shot action against the backend.
 */

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

export function ImportTab() {
  const prefs = usePrefSection<ImportPrefs>("import");

  async function runImport(): Promise<void> {
    try {
      await invoke("rpc_raw", { method: "config/batchWrite", params: { writes: [] } });
    } catch (err) {
      console.warn("[settings] import-from-apps failed", err);
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
              onClick={() => void runImport()}
            />
          }
        />
      </Block>
    </>
  );
}
