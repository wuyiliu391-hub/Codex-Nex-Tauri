---
feature: react-frontend-migration
status: delivered
updated: 2026-09-17
---

# React settings tabs — migration completed

## What was built

The previous React migration left **13 of 19 settings tabs** rendering a generic
`BackendSettingsTab` JSON dump. Every one now has a dedicated React component
ported 1:1 from `frontend/src/js/settings.js`:

| Tab | Component | Source renderer |
|-----|-----------|-----------------|
| Import | `ImportTab.tsx` | `renderImport` |
| Appearance | `AppearanceTab.tsx` | `renderAppearance` |
| Voice | `VoiceTab.tsx` | `renderVoice` |
| Personalization | `PersonalizationTab.tsx` | `renderPersonalization` |
| Computer use | `ComputerUseTab.tsx` | `renderComputerUse` |
| Appshot | `AppshotTab.tsx` | `renderAppshot` |
| Plugins | `PluginsTab.tsx` | `renderPlugins` |
| Browser | `BrowserTab.tsx` | `renderBrowser` |
| Hooks | `HooksTab.tsx` | `renderHooks` |
| Connections | `ConnectionsTab.tsx` | `renderConnections` |
| Git | `GitTab.tsx` | `renderGit` |
| Environments | `EnvironmentsTab.tsx` | `renderEnvironments` |
| Worktrees | `WorktreesTab.tsx` | `renderWorktrees` |
| Archived tasks | `ArchivedTab.tsx` | `renderArchived` |

`ConfigurationTab` gained the real dependency-check list (`check_dependencies`)
that `renderConfiguration` showed.

## Persistence fix (root cause)

`savePreferences()` in the vanilla layer wrote **top-level section objects**
(`appearance`, `voice`, `browser`, …) into `save_preferences`. The Rust
`Preferences` struct only declared `pets_enabled` / `reduced_motion` /
`compact_mode` + `extra`, and without `#[serde(flatten)]` on `extra` **every
unknown section was silently dropped on deserialize** — so nothing a settings
page wrote survived a restart. Added `#[serde(flatten)]`; the sections now
round-trip through `shell-state.json`.

New `frontend/app/state/preferencesStore.ts` is the React equivalent of
`pref()` / `savePreferences()` / `mergePreferences()`: it seeds from the same
`defaultPreferences()` in `src/js/state.js` (no drift), commits locally for an
instant paint, then persists the whole map.

## Also fixed

- `Modal.close` now takes an optional reason (matched the `ModalAction.onClick`
  signature); `notificationReducer` uses `mcpServer` (the field
  `blocks/registry.tsx` actually reads); `HomeView` counts `turn.order`.
- `SettingsShell` no longer marks any tab "pending" — every route is real.
- Removed the `BackendSettingsTab` JSON-dump fallback and `PORTED_TABS` set.

## Verification

- `npm run build` (tsc --noEmit + vite build): PASS, 100 modules.
- `node scripts/check-frontend.mjs`: PASS (13 .ts, 38 .tsx, 173 imports).
- `node scripts/verify-notification-coverage.mjs`: PASS (83/83).
- `node scripts/migration-status.mjs`: MIGRATION COMPLETE.

## Not in this change

Browser / LSP / SSH backends remain unimplemented (engine has no endpoints);
those tabs render honest empty states, not fake controls.
