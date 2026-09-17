/**
 * General tab — appearance theme and language.
 *
 * Theme is a shell preference under `appearance.theme` (system|light|dark) so
 * System is never collapsed away, and is applied immediately via the shared
 * appearance helpers. Language writes through saveSettings (shell-state).
 */

import { languageOptions, t } from "../../../../src/js/i18n.js";
import { saveSettings, useAppState, type SettingsState } from "@/state/appStore";
import { saveSection, usePrefSection, emitShellEvent } from "@/state/preferencesStore";
import { applyTheme } from "@/state/appearance";
import { Dropdown } from "@/shell/Dropdown";
import { Block, PageHead, Row } from "../primitives";

function label(key: string, fallback: string): string {
  return String(t(key, fallback));
}

const THEMES = [
  { value: "system", key: "settings.theme.system", fallback: "System" },
  { value: "light", key: "settings.theme.light", fallback: "Light" },
  { value: "dark", key: "settings.theme.dark", fallback: "Dark" },
];

interface AppearancePrefs {
  theme?: string;
}

export function GeneralTab() {
  const { settings } = useAppState();
  const appearance = usePrefSection<AppearancePrefs>("appearance");

  function update(patch: Partial<SettingsState>): void {
    void saveSettings(patch);
  }

  function setTheme(theme: string): void {
    // Persist under appearance so System is preserved, not just DOM classes.
    void saveSection("appearance", { theme });
    applyTheme(theme);
    emitShellEvent("codex:appearance-applied");
  }

  // Language lives under preferences in the vanilla shell; keep the same key so
  // the two layers agree while both exist.
  const language = settings.language || "en";
  const languageItems = languageOptions().map(
    (option: { value?: string; label?: string; code?: string; name?: string }) => ({
      value: String(option.value ?? option.code ?? ""),
      label: String(option.label ?? option.name ?? option.value ?? option.code ?? ""),
    }),
  );

  const themeValue = appearance.theme ?? "system";

  return (
    <>
      <PageHead title={label("settings.general", "General")} />

      <Block title={label("settings.appearance", "Appearance")}>
        <Row
          label={label("settings.theme", "Theme")}
          desc={label("settings.themeDesc", "Applies to the whole app.")}
          control={
            <Dropdown
              value={themeValue}
              items={THEMES.map((theme) => ({
                value: theme.value,
                label: label(theme.key, theme.fallback),
              }))}
              onChange={(value) => setTheme(value)}
            />
          }
        />

        {languageItems.length ? (
          <Row
            label={label("settings.language", "Language")}
            desc={label("settings.languageDesc", "Interface language.")}
            control={
              <Dropdown
                value={language}
                items={languageItems}
                onChange={(value) => update({ language: value })}
              />
            }
          />
        ) : null}
      </Block>
    </>
  );
}
