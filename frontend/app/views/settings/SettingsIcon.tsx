/**
 * Settings tab icons.
 *
 * Path data transcribed from the iconSvg() table in settings.js so the sidebar
 * looks identical. Rendered as a component rather than injected as an HTML
 * string.
 */

import type { SettingsIconName } from "./sections";

const PATHS: Record<SettingsIconName, string> = {
  general: `<path d="M9 4v10M4 9h10"/><circle cx="9" cy="9" r="6"/>`,
  appearance: `<circle cx="9" cy="9" r="6"/><path d="M9 3a6 6 0 0 1 0 12V3Z"/>`,
  voice: `<path d="M9 3v6M6 8v1a3 3 0 0 0 6 0V8M9 12v3M6.5 15h5"/>`,
  configuration: `<path d="M4 4h10v3H4zM4 11h10v3H4z"/>`,
  personalization: `<path d="M9 3l1.4 4.2L15 9l-4.6 1.8L9 15l-1.4-4.2L3 9l4.6-1.8Z"/>`,
  pets: `<path d="M6 10a3 3 0 0 0 6 0"/><circle cx="6.5" cy="6.5" r="1"/><circle cx="11.5" cy="6.5" r="1"/>`,
  shortcuts: `<path d="M4 5h10M4 9h10M4 13h10"/>`,
  account: `<circle cx="9" cy="7" r="2.5"/><path d="M4.5 15c.7-2.2 2.4-3.5 4.5-3.5s3.8 1.3 4.5 3.5"/>`,
  plugins: `<path d="M9 2v4M9 12v4M2 9h4M12 9h4M4.5 4.5l2.8 2.8M10.7 10.7l2.8 2.8M13.5 4.5l-2.8 2.8M7.3 10.7l-2.8 2.8"/>`,
  browser: `<circle cx="9" cy="9" r="6"/><path d="M3 9h12M9 3c2 1.8 2 10.2 0 12M9 3c-2 1.8-2 10.2 0 12"/>`,
  computer: `<path d="M3 4h12v9H3zM7 16h4"/>`,
  hooks: `<path d="M8 4a3 3 0 0 0 0 6h2a3 3 0 0 1 0 6M8 10v6"/>`,
  connections: `<circle cx="5" cy="6" r="2.5"/><circle cx="13" cy="12" r="2.5"/><path d="M7.2 7.2 10.8 10.8"/>`,
  git: `<path d="M9 3v12M6 6l3-3 3 3M6 12l3 3 3-3"/>`,
  environments: `<path d="M3 6h12M3 10h12M3 14h12"/>`,
  worktrees: `<path d="M4 4h10M4 9h10M4 14h10"/><path d="M6 4v10"/>`,
  archived: `<path d="M3 5h12v2H3zM4 7h10v8H4zM7 11h4"/>`,
  import: `<path d="M9 3v8M6 8l3 3 3-3M4 14h10v2H4z"/>`,
  appshot: `<rect x="3.5" y="4.5" width="11" height="8" rx="1.5"/><circle cx="9" cy="8.5" r="2"/><path d="M6.5 15.5h5"/>`,
};

export function SettingsIcon({ name }: { name: SettingsIconName }) {
  return (
    <svg
      viewBox="0 0 18 18"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: PATHS[name] ?? "" }}
    />
  );
}
