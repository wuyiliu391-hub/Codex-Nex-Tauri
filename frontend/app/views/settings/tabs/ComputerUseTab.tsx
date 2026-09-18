/**
 * Computer-use tab — app control permissions.
 *
 * Ports renderComputerUse() from settings.js to the official v26.911 layout:
 * a 控制 card of icon rows (any app, browser extension installs, Excel) plus
 * the 始终允许的应用 allowlist card.
 */

import type { ReactNode } from "react";
import { t } from "../../../../src/js/i18n.js";
import { saveSection, usePrefSection } from "@/state/preferencesStore";
import { Block, PageHead, SettingsButton, Switch } from "../primitives";

function label(key: string, fallback = ""): string {
  return String(t(key, fallback));
}

interface ComputerUsePrefs {
  anyApp?: boolean;
  excel?: boolean;
}

/** Icon row inside the 控制 card — placeholder icon, copy, control. */
function IconRow({
  icon,
  title,
  desc,
  control,
}: {
  icon: string;
  title: string;
  desc: ReactNode;
  control: ReactNode;
}) {
  return (
    <div className="plugin-row">
      <div className="plugin-icon">{icon}</div>
      <div>
        <div className="plugin-name">{title}</div>
        <div className="plugin-desc">{desc}</div>
      </div>
      <div className="provider-row-actions">{control}</div>
    </div>
  );
}

/** Red status dot before the missing-extension description (official look). */
function NoExtensionDesc(): React.JSX.Element {
  return (
    <span>
      <span style={{ color: "var(--red-500)" }}>● </span>
      {label("computerUse.noExtension")}
    </span>
  );
}

export function ComputerUseTab() {
  const prefs = usePrefSection<ComputerUsePrefs>("computerUse");

  return (
    <>
      <PageHead title={label("computerUse.title")} desc={label("computerUse.desc")} />

      <Block title={label("computerUse.control")}>
        <IconRow
          icon="🖥️"
          title={label("computerUse.anyApp")}
          desc={label("computerUse.anyAppDesc")}
          control={
            <Switch
              checked={prefs.anyApp !== false}
              onChange={(v) => void saveSection("computerUse", { anyApp: v })}
            />
          }
        />
        <IconRow
          icon="🌐"
          title={label("computerUse.chrome")}
          desc={<NoExtensionDesc />}
          control={
            // pending L3: no browser-extension install backend yet
            <SettingsButton label={label("computerUse.install")} disabled />
          }
        />
        <IconRow
          icon="🧭"
          title={label("computerUse.edge")}
          desc={<NoExtensionDesc />}
          control={
            // pending L3: no browser-extension install backend yet
            <SettingsButton label={label("computerUse.install")} disabled />
          }
        />
        <IconRow
          icon="📊"
          title={label("computerUse.excel")}
          desc={label("computerUse.excelDesc")}
          control={
            <Switch
              checked={prefs.excel !== false}
              onChange={(v) => void saveSection("computerUse", { excel: v })}
            />
          }
        />
      </Block>

      <Block title={label("computerUse.alwaysAllow")}>
        <div className="site-empty">{label("computerUse.none")}</div>
      </Block>
    </>
  );
}
