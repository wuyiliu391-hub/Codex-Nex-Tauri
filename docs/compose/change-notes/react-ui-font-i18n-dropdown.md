---
feature: react-ui-font-i18n-dropdown
status: delivered
updated: 2026-09-17
---

# Fix React UI: fonts, type, i18n keys, dropdown jitter

## Screenshot defects → root causes

| Symptom | Cause | Fix |
|---------|--------|-----|
| Prompt cards show `home.prompt.explain` | Wrong keys; i18n only has `explore/build/review/fix` | Restore vanilla key order + `pc-ico` / `pc-label` DOM |
| Fonts look like UA/Segoe | `t()`/language never wired from React settings; `--font-sans` not always resolving OpenAI Sans | `syncLegacyI18n` on settings load/save; `applyLanguage` after prefs; `official-tokens` defines `--font-sans` |
| Sizes / theme off | appearance prefs not applied on boot in some paths | still `startAppearance()` after `loadPreferences` |
| Dropdown “twitch” | `.ui-popover` CSS is `absolute` but coords were viewport | force `position: fixed` + `data-placement` like vanilla |

## Files

- `HomeView.tsx` — prompt cards
- `appStore.ts` — language → vanilla `state.js` + `applyLanguage`
- `main.tsx` — boot language + appearance
- `Dropdown.tsx` — fixed popover
- `official-tokens.css` — `--font-sans` fallback

## Verify

- `npm run typecheck` PASS
- `npm run build` PASS (OpenAI Sans woff2 in dist assets)
