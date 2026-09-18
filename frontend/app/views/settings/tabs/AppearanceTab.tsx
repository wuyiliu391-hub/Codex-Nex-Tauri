/**
 * Appearance tab — theme choice, diff preview, per-theme cards and display prefs.
 *
 * Ports renderAppearance() from settings.js. The theme cards (colour pickers,
 * font selects, contrast sliders) are kept behaviourally faithful: edits write
 * the matching preference sub-object. The import/copy actions work on the same
 * JSON the vanilla layer produced.
 */

import { useRef } from "react";
import { t } from "../../../../src/js/i18n.js";
import { saveSection, usePrefSection, emitShellEvent } from "@/state/preferencesStore";
import { saveSettings } from "@/state/appStore";
import { Dropdown } from "@/shell/Dropdown";
import { Block, BlockCustom, PageHead, Row, Segmented, Switch } from "../primitives";

function label(key: string, fallback = ""): string {
  return String(t(key, fallback));
}

interface ThemeCard {
  accent?: string;
  background?: string;
  foreground?: string;
  codeTheme?: string;
  uiFont?: string;
  contentFont?: string;
  codeFont?: string;
  contrast?: number;
}

interface AppearancePrefs {
  theme?: string;
  pointerCursors?: boolean;
  reduceMotion?: string;
  uiFontSize?: number;
  codeFontSize?: number;
  diffMarkers?: string;
  lightTheme?: ThemeCard;
  darkTheme?: ThemeCard;
}

const UI_FONTS = ["system", "Segoe UI", "Microsoft YaHei", "PingFang SC", "OpenAI Sans"];
const CODE_FONTS = ["Cascadia Code", "Consolas", "JetBrains Mono", "Fira Code"];

export function AppearanceTab() {
  const prefs = usePrefSection<AppearancePrefs>("appearance");
  const currentTheme = prefs.theme ?? "system";

  function setTheme(theme: string): void {
    void saveSection("appearance", { theme });
    void saveSettings({});
    emitShellEvent("codex:appearance-applied");
  }

  const reduceMotionValue =
    prefs.reduceMotion === "on" ? "on" : prefs.reduceMotion === "off" ? "off" : "system";
  const diffMarkersValue = prefs.diffMarkers === "plusminus" ? "plusminus" : "color";

  return (
    <>
      <PageHead title={label("appearance.title")} />

      <Block title={label("appearance.theme")}>
        <div className="theme-options">
          {[
            { id: "system", key: "appearance.system" },
            { id: "light", key: "appearance.light" },
            { id: "dark", key: "appearance.dark" },
          ].map((th) => (
            <button
              type="button"
              key={th.id}
              className={"theme-option" + (currentTheme === th.id ? " is-active" : "")}
              data-theme={th.id}
              onClick={() => setTheme(th.id)}
            >
              <div className={"theme-preview-card theme-preview-" + th.id} />
              <div>{label(th.key)}</div>
            </button>
          ))}
        </div>
        <ThemeCodePreview
          light={{
            accent: prefs.lightTheme?.accent ?? "#2563eb",
            contrast: prefs.lightTheme?.contrast ?? 45,
          }}
          dark={{
            accent: prefs.darkTheme?.accent ?? "#0ea5e9",
            contrast: prefs.darkTheme?.contrast ?? 68,
          }}
        />
      </Block>

      <BlockCustom>
        <ThemeCardEditor
          themeKey="lightTheme"
          title={label("appearance.lightTheme")}
          card={prefs.lightTheme ?? {}}
          isLight
        />
        <ThemeCardEditor
          themeKey="darkTheme"
          title={label("appearance.darkTheme")}
          card={prefs.darkTheme ?? {}}
          isLight={false}
        />
      </BlockCustom>

      <Block title={label("appearance.prefs")}>
        <Row
          label={label("appearance.pointer")}
          desc={label("appearance.pointerDesc")}
          control={
            <Switch
              checked={prefs.pointerCursors === true}
              onChange={(v) => void saveSection("appearance", { pointerCursors: v })}
            />
          }
        />
        <Row
          label={label("appearance.reduceMotion")}
          desc={label("appearance.reduceMotionDesc")}
          control={
            <Segmented
              value={reduceMotionValue}
              options={[
                { value: "system", label: label("appearance.system") },
                { value: "on", label: label("appearance.on") },
                { value: "off", label: label("appearance.off") },
              ]}
              onChange={(v) => void saveSection("appearance", { reduceMotion: v })}
            />
          }
        />
        <Row
          label={label("appearance.uiFontSize")}
          desc={label("appearance.uiFontSizeDesc")}
          control={
            <input
              type="number"
              className="fontsize-input"
              min={10}
              max={24}
              value={prefs.uiFontSize ?? 14}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (v >= 10 && v <= 24) void saveSection("appearance", { uiFontSize: v });
              }}
            />
          }
        />
        <Row
          label={label("appearance.codeFontSize")}
          desc={label("appearance.codeFontSizeDesc")}
          control={
            <input
              type="number"
              className="fontsize-input"
              min={10}
              max={24}
              value={prefs.codeFontSize ?? 13}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (v >= 10 && v <= 24) void saveSection("appearance", { codeFontSize: v });
              }}
            />
          }
        />
        <Row
          label={label("appearance.diffMarkers")}
          desc={label("appearance.diffMarkersDesc")}
          control={
            <Segmented
              value={diffMarkersValue}
              options={[
                { value: "color", label: label("appearance.color") },
                { value: "plusminus", label: label("appearance.plusminus") },
              ]}
              onChange={(v) => void saveSection("appearance", { diffMarkers: v })}
            />
          }
        />
      </Block>
    </>
  );
}

/** Dual-column ThemeConfig code preview under the theme radios (official 26.911). */
function ThemeCodePreview({
  light,
  dark,
}: {
  light: { accent: string; contrast: number };
  dark: { accent: string; contrast: number };
}) {
  const columns = [
    { surface: "sidebar", ...light },
    { surface: "sidebar-elevated", ...dark },
  ];
  return (
    <div className="theme-code-preview">
      {columns.map((col) => {
        const source =
          `const themePreview: ThemeConfig = { surface: "${col.surface}", ` +
          `accent: "${col.accent}", contrast: ${col.contrast}, };`;
        return (
          <div className="theme-code-col" key={col.surface}>
            <div className="theme-code-gutter" aria-hidden="true">
              <span>1</span>
              <span>2</span>
              <span>3</span>
              <span>4</span>
              <span>5</span>
            </div>
            <pre className="theme-code-source">{source}</pre>
          </div>
        );
      })}
    </div>
  );
}

function ThemeCardEditor({
  themeKey,
  title,
  card,
  isLight,
}: {
  themeKey: "lightTheme" | "darkTheme";
  title: string;
  card: ThemeCard;
  isLight: boolean;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const accent = card.accent ?? (isLight ? "#2563eb" : "#0ea5e9");
  const background = card.background ?? (isLight ? "#FFFFFF" : "#181818");
  const foreground = card.foreground ?? (isLight ? "#1A1C1F" : "#FFFFFF");
  const codeTheme = card.codeTheme ?? "Codex";
  const uiFont = card.uiFont ?? "system";
  const contentFont = card.contentFont ?? "system";
  const codeFont = card.codeFont ?? "Cascadia Code";
  const contrast = card.contrast ?? (isLight ? 45 : 60);

  function patch(next: Partial<ThemeCard>): void {
    void saveSection("appearance", { [themeKey]: { ...card, ...next } });
  }

  function copyCard(): void {
    void navigator.clipboard.writeText(JSON.stringify(card, null, 2));
  }

  function importCard(file: File): void {
    void file.text().then((text) => {
      try {
        patch(JSON.parse(text) as ThemeCard);
      } catch (err) {
        console.warn("[appearance] theme import failed", err);
      }
    });
  }

  return (
    <div className="theme-card-block">
      <div className="theme-card-head">
        <span className="theme-card-label">{title}</span>
        <div className="theme-card-actions">
          <button type="button" className="theme-card-btn" onClick={() => fileRef.current?.click()}>
            {label(isLight ? "appearance.importLight" : "appearance.importDark")}
          </button>
          <button type="button" className="theme-card-btn" onClick={copyCard}>
            {label(isLight ? "appearance.copyLight" : "appearance.copyDark")}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importCard(f);
            }}
          />
        </div>
      </div>

      <div className="theme-card-row">
        <span className="theme-card-field-label">{label("appearance.codeTheme")}</span>
        <Dropdown
          value={codeTheme}
          items={[{ value: codeTheme, label: codeTheme }]}
          onChange={(v) => patch({ codeTheme: v })}
        />
      </div>

      <ColorRow label={label("appearance.accent")} value={accent} onChange={(v) => patch({ accent: v })} />
      <ColorRow
        label={label("appearance.background")}
        value={background}
        onChange={(v) => patch({ background: v })}
      />
      <ColorRow
        label={label("appearance.foreground")}
        value={foreground}
        onChange={(v) => patch({ foreground: v })}
      />

      <div className="theme-card-row">
        <span className="theme-card-field-label">{label("appearance.uiFont")}</span>
        <div className="theme-font-pair">
          <Dropdown
            value={uiFont}
            items={UI_FONTS.map((f) => ({ value: f, label: f }))}
            onChange={(v) => patch({ uiFont: v })}
          />
          {/* Official: style select sits beside each font, disabled (DIS). */}
          <Dropdown
            value="regular"
            disabled
            ariaLabel={label("appearance.uiFont") + label("appearance.style", " style")}
            items={[{ value: "regular", label: label("appearance.regular", "Regular") }]}
            onChange={() => {}}
          />
        </div>
      </div>
      <div className="theme-card-row">
        <span className="theme-card-field-label">{label("appearance.contentFont")}</span>
        <div className="theme-font-pair">
          <Dropdown
            value={contentFont}
            items={UI_FONTS.map((f) => ({ value: f, label: f }))}
            onChange={(v) => patch({ contentFont: v })}
          />
          <Dropdown
            value="regular"
            disabled
            ariaLabel={label("appearance.contentFont") + label("appearance.style", " style")}
            items={[{ value: "regular", label: label("appearance.regular", "Regular") }]}
            onChange={() => {}}
          />
        </div>
      </div>
      <div className="theme-card-row">
        <span className="theme-card-field-label">{label("appearance.codeFont")}</span>
        <div className="theme-font-pair">
          <Dropdown
            value={codeFont}
            items={CODE_FONTS.map((f) => ({ value: f, label: f }))}
            onChange={(v) => patch({ codeFont: v })}
          />
          <Dropdown
            value="regular"
            disabled
            ariaLabel={label("appearance.codeFont") + label("appearance.style", " style")}
            items={[{ value: "regular", label: label("appearance.regular", "Regular") }]}
            onChange={() => {}}
          />
        </div>
      </div>

      <div className="theme-card-row">
        <span className="theme-card-field-label">{label("appearance.contrast")}</span>
        <input
          type="range"
          min={0}
          max={100}
          value={contrast}
          onChange={(e) => patch({ contrast: parseInt(e.target.value, 10) })}
        />
        <span className="theme-contrast-value">{contrast}</span>
      </div>
    </div>
  );
}

function ColorRow({
  label: text,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="theme-card-row">
      <span className="theme-card-field-label">{text}</span>
      <div className="theme-color-wrap">
        <label className="theme-color-swatch" style={{ background: value }}>
          <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
          <span>{value}</span>
        </label>
        <input
          type="text"
          className="theme-hex-input"
          value={value}
          onChange={(e) => {
            let v = e.target.value.trim();
            if (!v.startsWith("#")) v = "#" + v;
            onChange(v);
          }}
        />
      </div>
    </div>
  );
}
