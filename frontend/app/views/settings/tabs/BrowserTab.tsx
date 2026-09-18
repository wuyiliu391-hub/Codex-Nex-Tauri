/**
 * Browser tab — official Codex desktop 浏览器 page (docs/uia/outlines-t41/browser.txt).
 *
 * Sections: enable card, 常规, 浏览数据, 自动填充和密码, 下载, 浏览器权限,
 * 开发者模式. Preference state persists through the "browser" pref section;
 * actions without a backing L3 command (import / clear / manage / change /
 * add site) render disabled — pending L3 command.
 */

import { t } from "../../../../src/js/i18n.js";
import { saveSection, usePrefSection } from "@/state/preferencesStore";
import { Dropdown } from "@/shell/Dropdown";
import type { DropdownItem } from "@/shell/Dropdown";
import {
  Block,
  BlockCustom,
  PageHead,
  Row,
  SettingsButton,
  Switch,
} from "../primitives";
import { SettingsIcon } from "../SettingsIcon";

function label(key: string, fallback = ""): string {
  return String(t(key, fallback));
}

interface BrowserPrefs {
  enabled?: boolean;
  openTarget?: string;
  localTarget?: string;
  showFullUrl?: boolean;
  screenshots?: string;
  askWhereToSave?: boolean;
  historyAccess?: string;
  siteTools?: boolean;
  fullCdpAccess?: boolean;
  sitePermBrowse?: string;
  sitePermDownload?: string;
  sitePermUpload?: string;
}

export function BrowserTab() {
  const prefs = usePrefSection<BrowserPrefs>("browser");
  const save = (patch: Record<string, unknown>) =>
    void saveSection("browser", patch);

  const targetItems: DropdownItem[] = [
    { value: "embedded", label: label("browser.embedded") },
    { value: "default-browser", label: label("browser.targetDefaultBrowser") },
  ];
  const screenshotItems: DropdownItem[] = [
    { value: "always", label: label("browser.screenshotAlways") },
    { value: "never", label: label("browser.screenshotNever") },
  ];
  const historyItems: DropdownItem[] = [
    { value: "always-allow", label: label("browser.historyAlwaysAllow") },
    { value: "always-ask", label: label("browser.historyAlwaysAsk") },
    { value: "never", label: label("browser.historyNever") },
  ];
  const permItems: DropdownItem[] = [
    { value: "default", label: label("browser.permDefault") },
    { value: "allow", label: label("browser.permAllow") },
    { value: "never", label: label("browser.never") },
  ];

  // pending L3 command — no browsing-history surface exists yet.
  const manageButton = <SettingsButton label={label("browser.manage")} disabled />;

  return (
    <>
      <PageHead title={label("browser.title")} desc={label("browser.desc")} />

      <section className="settings-block">
        <div className="settings-card browser-enable-card">
          <span className="browser-enable-icon" aria-hidden="true">
            <SettingsIcon name="browser" />
          </span>
          <div className="browser-enable-copy">
            <div className="settings-row-title">{label("browser.enabled")}</div>
            <div className="settings-row-description">
              {label("browser.enabledDesc")}
            </div>
          </div>
          <Switch
            checked={prefs.enabled !== false}
            onChange={(v) => save({ enabled: v })}
          />
        </div>
      </section>

      <Block
        title={label("browser.general")}
        extra={
          // pending L3 command — browser data import is not wired yet.
          <SettingsButton label={label("browser.importBtn")} disabled />
        }
      >
        <Row
          label={label("browser.openLinks")}
          desc={label("browser.openLinksDesc")}
          control={
            <Dropdown
              items={targetItems}
              value={prefs.openTarget ?? "embedded"}
              ariaLabel={label("browser.openLinks")}
              onChange={(v) => save({ openTarget: v })}
            />
          }
        />
        <Row
          label={label("browser.localTarget")}
          desc={label("browser.localTargetDesc")}
          control={
            <Dropdown
              items={targetItems}
              value={prefs.localTarget ?? "embedded"}
              ariaLabel={label("browser.localTarget")}
              onChange={(v) => save({ localTarget: v })}
            />
          }
        />
        <Row
          label={label("browser.showFullUrl")}
          desc={label("browser.showFullUrlDesc")}
          control={
            <Switch
              checked={prefs.showFullUrl === true}
              onChange={(v) => save({ showFullUrl: v })}
            />
          }
        />
      </Block>

      <BlockCustom>
        <div className="settings-section-heading">
          <div className="heading-copy">
            <h2>{label("browser.data")}</h2>
            <p>{label("browser.browsingDataDesc")}</p>
          </div>
          {/* pending L3 command — clear-browsing-data command is not wired yet. */}
          <SettingsButton label={label("browser.clear")} disabled />
        </div>
        <div className="settings-card">
          <Row
            label={label("browser.browsingHistory")}
            desc={label("browser.browsingHistoryDesc")}
            control={manageButton}
          />
          <Row
            label={label("browser.screenshots")}
            desc={label("browser.screenshotsDesc")}
            control={
              <Dropdown
                items={screenshotItems}
                value={prefs.screenshots === "never" ? "never" : "always"}
                ariaLabel={label("browser.screenshots")}
                onChange={(v) => save({ screenshots: v })}
              />
            }
          />
        </div>
      </BlockCustom>

      <Block title={label("browser.autofill")}>
        <Row
          label={label("browser.passwords")}
          desc={label("browser.passwordsDesc")}
          control={manageButton}
        />
        <Row
          label={label("browser.contactInfo")}
          desc={label("browser.contactInfoDesc")}
          control={manageButton}
        />
      </Block>

      <Block title={label("browser.downloads")}>
        <Row
          label={label("browser.downloadLocation")}
          desc={label("browser.downloadLocationValue")}
          control={
            // pending L3 command — folder picker command is not wired yet.
            <SettingsButton label={label("browser.change")} disabled />
          }
        />
        <Row
          label={label("browser.askWhereToSave")}
          desc={label("browser.askWhereToSaveDesc")}
          control={
            <Switch
              checked={prefs.askWhereToSave === true}
              onChange={(v) => save({ askWhereToSave: v })}
            />
          }
        />
        <Row
          label={label("browser.downloadHistory")}
          desc={label("browser.downloadHistoryDesc")}
          control={
            // pending L3 command — download-history surface is not wired yet.
            <SettingsButton label={label("browser.manageDownloadHistory")} disabled />
          }
        />
      </Block>

      <Block title={label("browser.permissions")}>
        <Row
          label={label("browser.siteSettings")}
          desc={label("browser.siteSettingsDesc")}
          control={manageButton}
        />
        <Row
          label={label("browser.historyAccess")}
          desc={label("browser.historyAccessDesc")}
          control={
            <Dropdown
              items={historyItems}
              value={prefs.historyAccess ?? "always-ask"}
              ariaLabel={label("browser.historyAccess")}
              onChange={(v) => save({ historyAccess: v })}
            />
          }
        />
        <Row
          label={label("browser.siteTools")}
          desc={label("browser.siteToolsDesc")}
          control={
            <Switch
              checked={prefs.siteTools !== false}
              onChange={(v) => save({ siteTools: v })}
            />
          }
        />
        <Row
          label={label("browser.agentPerms")}
          desc={label("browser.agentPermsDesc")}
          control={
            // pending L3 command — add-site permission flow is not wired yet.
            <SettingsButton label={label("browser.addSiteBtn")} disabled />
          }
        />
        <div className="browser-perms-table" role="table" aria-label={label("browser.agentPerms")}>
          <div className="browser-perms-tr browser-perms-th" role="row">
            <span role="columnheader">{label("browser.permColSite")}</span>
            <span role="columnheader">{label("browser.permColBrowse")}</span>
            <span role="columnheader">{label("browser.permColDownload")}</span>
            <span role="columnheader">{label("browser.permColUpload")}</span>
            <span role="columnheader">{label("browser.permColActions")}</span>
          </div>
          <div className="browser-perms-tr" role="row">
            <span className="browser-perms-cell" role="cell">
              {label("browser.permDefault")}
            </span>
            <span role="cell">
              <Dropdown
                items={permItems}
                value={prefs.sitePermBrowse ?? "default"}
                ariaLabel={label("browser.permColBrowse")}
                onChange={(v) => save({ sitePermBrowse: v })}
              />
            </span>
            <span role="cell">
              <Dropdown
                items={permItems}
                value={prefs.sitePermDownload ?? "default"}
                ariaLabel={label("browser.permColDownload")}
                onChange={(v) => save({ sitePermDownload: v })}
              />
            </span>
            <span role="cell">
              <Dropdown
                items={permItems}
                value={prefs.sitePermUpload ?? "default"}
                ariaLabel={label("browser.permColUpload")}
                onChange={(v) => save({ sitePermUpload: v })}
              />
            </span>
            <span role="cell" />
          </div>
        </div>
        <div className="browser-perms-note">{label("browser.permNote")}</div>
      </Block>

      <BlockCustom>
        <div className="settings-section-heading">
          <h2>
            {label("browser.devMode")}
            <span className="browser-risk-badge">{label("browser.elevated")}</span>
          </h2>
        </div>
        <div className="settings-card">
          <Row
            label={label("browser.fullCdp")}
            desc={label("browser.fullCdpDesc")}
            control={
              <Switch
                checked={prefs.fullCdpAccess === true}
                onChange={(v) => save({ fullCdpAccess: v })}
              />
            }
          />
        </div>
      </BlockCustom>
    </>
  );
}
