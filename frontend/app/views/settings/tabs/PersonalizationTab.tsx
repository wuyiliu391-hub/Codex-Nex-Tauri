/**
 * Personalization tab — agent instructions, memory toggles and wipe.
 *
 * Ports renderPersonalization() from settings.js. The instructions textarea is
 * saved explicitly (not on every keystroke) so the Save button reflects dirtiness.
 */

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { t } from "../../../../src/js/i18n.js";
import { openExternal } from "@/shell/actions";
import { saveSection, usePrefSection } from "@/state/preferencesStore";
import { BlockCustom, PageHead, Row, SettingsButton, Switch, TextArea } from "../primitives";

function label(key: string, fallback = ""): string {
  return String(t(key, fallback));
}

interface PersonalizationPrefs {
  agents?: string;
  localMemory?: boolean;
}

/** Inline 了解更多 link appended to a section description (official layout). */
function LearnMore({ url }: { url: string }): React.JSX.Element {
  return (
    <button
      type="button"
      className="settings-inline-link"
      onClick={() => void openExternal(url)}
    >
      {label("general.learnMore", "Learn more")}
    </button>
  );
}

export function PersonalizationTab() {
  const prefs = usePrefSection<PersonalizationPrefs>("personalization");
  const saved = prefs.agents ?? "";
  const [draft, setDraft] = useState(saved);

  // Follow external updates (e.g. a load that lands after first paint).
  useEffect(() => setDraft(saved), [saved]);

  async function deleteMemory(): Promise<void> {
    try {
      await invoke("rpc_raw", { method: "memory/delete", params: {} });
    } catch {
      /* engine may not expose memory; local flag still resets */
    }
    await saveSection("personalization", { localMemory: false });
  }

  return (
    <>
      <PageHead title={label("personal.title")} />

      <BlockCustom
        title={label("personal.instructions")}
        extra={
          <SettingsButton
            label={label("action.save")}
            kind="primary"
            disabled={draft === saved}
            onClick={() => void saveSection("personalization", { agents: draft })}
          />
        }
      >
        <p className="settings-page-sub">
          {label("personal.instructionsDesc")} <LearnMore url="https://developers.openai.com/codex/guides/agents-md/#create-global-guidance" />
        </p>
        <TextArea value={draft} onChange={setDraft} ariaLabel={label("personal.instructions")} />
      </BlockCustom>

      <BlockCustom title={label("personal.memory")}>
        <p className="settings-page-sub">
          {label("personal.memoryDesc")} <LearnMore url="https://developers.openai.com/codex/memories" />
        </p>
        <div className="settings-card">
          <Row
            label={label("personal.localMemory")}
            desc={label("personal.localMemoryDesc")}
            control={
              <Switch
                checked={prefs.localMemory === true}
                onChange={(v) => void saveSection("personalization", { localMemory: v })}
              />
            }
          />
          <Row
            label={label("personal.toolMemory")}
            desc={label("personal.toolMemoryDesc")}
            control={
              // Official: On and disabled — gated on local memory support upstream.
              <Switch checked disabled onChange={() => {}} />
            }
          />
          <Row
            label={label("personal.deleteMemory")}
            desc={label("personal.deleteMemoryDesc")}
            control={
              <SettingsButton
                label={label("action.delete")}
                kind="danger"
                onClick={() => void deleteMemory()}
              />
            }
          />
        </div>
      </BlockCustom>
    </>
  );
}
