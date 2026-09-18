/**
 * Appshot tab — screenshot shortcut, target and sound.
 *
 * Ports renderAppshot() from settings.js.
 */

import { t } from "../../../../src/js/i18n.js";
import { saveSection, usePrefSection } from "@/state/preferencesStore";
import { Dropdown } from "@/shell/Dropdown";
import { Block, PageHead, Row, Switch } from "../primitives";

function label(key: string, fallback = ""): string {
  return String(t(key, fallback));
}

interface AppshotPrefs {
  appshotShortcut?: string;
  appshotTarget?: string;
  appshotSound?: boolean;
}

export function AppshotTab() {
  const prefs = usePrefSection<AppshotPrefs>("appshot");

  return (
    <>
      <PageHead title={label("appshot.title")} desc={label("appshot.desc")} />
      <p className="settings-page-sub">{label("appshot.lede")}</p>

      <Block title={label("appshot.shortcuts")}>
        <Row
          label={label("appshot.shortcut")}
          desc={label("appshot.shortcutDesc")}
          control={
            <Dropdown
              value={prefs.appshotShortcut ?? "alt-alt"}
              items={[{ value: "alt-alt", label: label("appshot.altAlt") }]}
              onChange={(v) => void saveSection("appshot", { appshotShortcut: v })}
            />
          }
        />
        <Row
          label={label("appshot.target")}
          desc={label("appshot.targetDesc")}
          control={
            <Dropdown
              value={prefs.appshotTarget ?? "auto"}
              items={[{ value: "auto", label: label("appshot.auto") }]}
              onChange={(v) => void saveSection("appshot", { appshotTarget: v })}
            />
          }
        />
        <Row
          label={label("appshot.sound")}
          control={
            <Switch
              checked={prefs.appshotSound !== false}
              ariaLabel={label("appshot.soundAria", "播放 Appshot 音效")}
              onChange={(v) => void saveSection("appshot", { appshotSound: v })}
            />
          }
        />
        <div className="settings-row is-disabled">
          <div className="settings-row-copy">
            <div className="settings-row-title">{label("appshot.noMedia")}</div>
          </div>
        </div>
      </Block>
    </>
  );
}
