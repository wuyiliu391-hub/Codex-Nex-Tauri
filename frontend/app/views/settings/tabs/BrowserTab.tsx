/**
 * Browser tab — enable, link target and screenshot policy.
 *
 * Ports renderBrowser() from settings.js.
 */

import { t } from "../../../../src/js/i18n.js";
import { saveSection, usePrefSection } from "@/state/preferencesStore";
import { Dropdown } from "@/shell/Dropdown";
import { Block, PageHead, Row, Switch } from "../primitives";

function label(key: string, fallback = ""): string {
  return String(t(key, fallback));
}

interface BrowserPrefs {
  enabled?: boolean;
  openTarget?: string;
  screenshots?: string;
}

export function BrowserTab() {
  const prefs = usePrefSection<BrowserPrefs>("browser");

  return (
    <>
      <PageHead title={label("browser.title")} />

      <Block title={label("browser.general")}>
        <Row
          label={label("browser.enabled")}
          desc={label("browser.enabledDesc")}
          control={
            <Switch
              checked={prefs.enabled !== false}
              onChange={(v) => void saveSection("browser", { enabled: v })}
            />
          }
        />
        <Row
          label={label("browser.openLinks")}
          desc={label("browser.openLinksDesc")}
          control={
            <Dropdown
              value={prefs.openTarget ?? "embedded"}
              items={[
                { value: "embedded", label: label("browser.embedded") },
                { value: "system", label: label("browser.system") },
              ]}
              onChange={(v) => void saveSection("browser", { openTarget: v })}
            />
          }
        />
        <Row
          label={label("browser.screenshots")}
          desc={label("browser.screenshotsDesc")}
          control={
            <Dropdown
              value={prefs.screenshots ?? "ask"}
              items={[
                { value: "always", label: label("browser.always") },
                { value: "ask", label: label("browser.ask") },
                { value: "never", label: label("browser.never") },
              ]}
              onChange={(v) => void saveSection("browser", { screenshots: v })}
            />
          }
        />
      </Block>
    </>
  );
}
