/**
 * Voice tab — microphone, dictation hotkeys and the custom dictionary.
 *
 * Ports renderVoice() from settings.js. The dictionary is stored as an ordered
 * string array; add/remove keep at least one row.
 */

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { t } from "../../../../src/js/i18n.js";
import { saveSection, usePrefSection } from "@/state/preferencesStore";
import { Dropdown } from "@/shell/Dropdown";
import { Block, PageHead, Row, SettingsButton, TextInput } from "../primitives";

function label(key: string, fallback = ""): string {
  return String(t(key, fallback));
}

interface VoicePrefs {
  microphone?: string;
  dictEntries?: string[];
  holdKey?: string;
  toggleKey?: string;
}

/** Ask the next key chord and hand it back as "Ctrl+Shift+K". */
function captureKey(onCapture: (combo: string) => void): void {
  const once = (ev: KeyboardEvent): void => {
    ev.preventDefault();
    ev.stopPropagation();
    const parts: string[] = [];
    if (ev.ctrlKey) parts.push("Ctrl");
    if (ev.altKey) parts.push("Alt");
    if (ev.shiftKey) parts.push("Shift");
    if (!["Control", "Alt", "Shift", "Meta"].includes(ev.key)) {
      parts.push(ev.key.length === 1 ? ev.key.toUpperCase() : ev.key);
    }
    document.removeEventListener("keydown", once, true);
    const combo = parts.join("+");
    if (combo) onCapture(combo);
  };
  document.addEventListener("keydown", once, true);
}

export function VoiceTab() {
  const prefs = usePrefSection<VoicePrefs>("voice");
  const [mics, setMics] = useState<string[]>([]);
  // Official 26.911: the 语言 row shows a bare "Retry" button when the
  // language list failed to load. We attempt the same audio listing the mic
  // row uses; while it has never succeeded the row stays on Retry — no fake
  // dropdown, matching the captured official state.
  const [langState, setLangState] = useState<"failed" | "loading" | "ready">("failed");

  function loadLanguages(): void {
    setLangState("loading");
    void invoke<unknown>("rpc_raw", { method: "audio/list", params: {} })
      .then(() => setLangState("ready"))
      .catch(() => setLangState("failed"));
  }

  // Audio devices are engine-reported; a missing engine leaves just the default.
  useEffect(() => {
    void invoke<unknown>("rpc_raw", { method: "audio/list", params: {} })
      .then((raw) => {
        if (Array.isArray(raw)) setMics(raw.map(String));
      })
      .catch(() => {
        /* engine offline; the system default remains */
      });
  }, []);

  const dict =
    Array.isArray(prefs.dictEntries) && prefs.dictEntries.length ? prefs.dictEntries : [""];

  function updateDict(next: string[]): void {
    void saveSection("voice", { dictEntries: next.length ? next : [""] });
  }

  const micItems = [
    { value: "default", label: label("voice.systemDefault") },
    ...mics.map((m) => ({ value: m, label: m })),
  ];

  return (
    <>
      <PageHead title={label("voice.title")} />

      <Block title={label("voice.general")}>
        <Row
          label={label("voice.mic")}
          desc={label("voice.micDesc")}
          control={
            <Dropdown
              value={prefs.microphone ?? "default"}
              items={micItems}
              onChange={(v) => void saveSection("voice", { microphone: v })}
            />
          }
        />
        <Row
          label={label("voice.language", "Language")}
          control={
            langState === "ready" ? (
              <Dropdown
                value="default"
                items={[{ value: "default", label: label("voice.systemDefault") }]}
                onChange={() => {}}
              />
            ) : (
              <SettingsButton
                label="Retry"
                disabled={langState === "loading"}
                onClick={loadLanguages}
              />
            )
          }
        />
      </Block>

      <Block title={label("voice.chat")}>
        <Row
          label={label("voice.chatUnavailable")}
          desc={label("voice.chatUnavailableDesc")}
          control={null}
        />
      </Block>

      <Block title={label("voice.dictation")}>
        <Row
          label={label("voice.holdKey")}
          desc={label("voice.holdKeyDesc") + " " + (prefs.holdKey ?? label("label.off"))}
          control={
            <SettingsButton
              label={label("voice.setHoldKey")}
              onClick={() => captureKey((combo) => void saveSection("voice", { holdKey: combo }))}
            />
          }
        />
        <Row
          label={label("voice.toggleKey")}
          desc={label("voice.toggleKeyDesc") + " " + (prefs.toggleKey ?? label("label.off"))}
          control={
            <SettingsButton
              label={label("voice.setToggleKey")}
              onClick={() => captureKey((combo) => void saveSection("voice", { toggleKey: combo }))}
            />
          }
        />
        <Row
          label={label("voice.dictionary")}
          desc={label("voice.dictionaryDesc")}
          control={
            <SettingsButton label={label("voice.addEntry")} onClick={() => updateDict([...dict, ""])} />
          }
        />
        {dict.map((word, i) => (
          <div className="settings-row dict-row" key={i}>
            <TextInput
              name={"dict-" + i}
              value={word}
              onChange={(value) => {
                const next = dict.slice();
                next[i] = value;
                updateDict(next);
              }}
            />
            <SettingsButton
              label={label("voice.remove")}
              kind="danger"
              disabled={dict.length <= 1}
              onClick={() => {
                const next = dict.slice();
                next.splice(i, 1);
                updateDict(next);
              }}
            />
          </div>
        ))}
        <Row label={label("voice.recent")} desc={label("voice.recentDesc")} control={null} />
      </Block>
    </>
  );
}
