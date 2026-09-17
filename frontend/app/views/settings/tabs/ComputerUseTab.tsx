/**
 * Computer-use tab — a single "any app" permission toggle.
 *
 * Ports renderComputerUse() from settings.js.
 */

import { t } from "../../../../src/js/i18n.js";
import { saveSection, usePrefSection } from "@/state/preferencesStore";
import { Block, PageHead, Row, Switch } from "../primitives";

function label(key: string, fallback = ""): string {
  return String(t(key, fallback));
}

interface ComputerUsePrefs {
  anyApp?: boolean;
}

export function ComputerUseTab() {
  const prefs = usePrefSection<ComputerUsePrefs>("computerUse");

  return (
    <>
      <PageHead title={label("computerUse.title")} />
      <Block title={label("computerUse.permissions")}>
        <Row
          label={label("computerUse.anyApp")}
          desc={label("computerUse.anyAppDesc")}
          control={
            <Switch
              checked={prefs.anyApp === true}
              onChange={(v) => void saveSection("computerUse", { anyApp: v })}
            />
          }
        />
      </Block>
    </>
  );
}
