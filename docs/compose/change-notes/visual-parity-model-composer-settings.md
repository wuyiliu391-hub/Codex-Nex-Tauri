# Visual parity pass — model panel / composer / settings (post-screenshot)

## Why

User screenshot-compare of official Codex desktop vs built shell showed
infra work (tokens, dropdowns, native menu) did **not** change the faces
they see: model popover, composer project chip, settings gray boxes.
Reflection: previous verify was structural only; product CSS still had
hardcoded `rgba(13,13,13,…)` borders and model menu was a long list.

## Reference captures

- `docs/visual/official-home.png` — home / composer
- `docs/visual/official-settings.png` — settings 常规 cards
- `docs/visual/official-model-menu.png` — model popover + 5-dot slider

## Changes

1. **Model panel** (`home.js` + `home.css`): compact official layout —
   effort name (blue) + reset, model name, 5-dot blue track with white
   thumb. Model list hidden behind chevron, not first paint.
2. **Composer project chip**: soft filled card, no 1px tab border.
3. **composer-menu / project search**: elevation + 6% ring instead of
   `1px solid --border-default`.
4. **official-tokens**: `--border-default/subtle` are text-mix (CDP 8%/5%),
   not solid `#cdcdcd`.
5. **settings.css**: search filled, cards use faint ring, buttons/selects
   borderless soft fills, remaining `rgba(13,13,13,…)` borders tokenized.

## Constraints

- Component CSS uses CSS variables / color-mix only for chrome colors.
- No local `tauri dev`; visual verify is source + official screenshots.
- Change-note required on this commit.

## Verify

- `node --check frontend/src/js/home.js` PASS
- `rg 'rgba(13, 13, 13' frontend/src/styles/settings.css` empty (or focus only)
- Official screenshots remain in docs/visual for next binary compare
