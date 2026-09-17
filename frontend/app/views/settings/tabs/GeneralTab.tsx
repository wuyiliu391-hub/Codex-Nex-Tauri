/**
 * General tab — appearance theme and language.
 *
 * These are shell preferences rather than engine config, so they only write to
 * shell-state.
 */

import { languageOptions, t } from "../../../../src/js/i18n.js";
import { saveSettings, useAppState, type SettingsState } from "@/state/appStore";
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

export function GeneralTab() {
  const { settings } = useAppState();

  function update(patch: Partial<SettingsState>): void {
    void saveSettings(patch);
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

  return (
    <>
      <PageHead title={label("settings.general", "General")} />

      <Block title={label("settings.appearance", "Appearance")}>
        <Row
          label={label("settings.theme", "Theme")}
          desc={label("settings.themeDesc", "Applies to the whole app.")}
          control={
            <Dropdown
              value={document.documentElement.classList.contains("theme-dark") ? "dark" : "light"}
              items={THEMES.map((theme) => ({
                value: theme.value,
                label: label(theme.key, theme.fallback),
              }))}
              onChange={(value) => {
                const html = document.documentElement;
                html.classList.remove("theme-dark", "theme-light");
                if (value === "system") {
                  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
                  html.classList.add(prefersDark ? "theme-dark" : "theme-light");
                } else {
                  html.classList.add(value === "dark" ? "theme-dark" : "theme-light");
                }
                update({});
              }}
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
