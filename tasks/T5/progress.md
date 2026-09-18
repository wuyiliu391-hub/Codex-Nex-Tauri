# T5 — Font / type / token convergence

## Goal
Single OpenAI Sans @font-face source, CJK-safe `--font-sans`, type ladder that does not fight tokens.css on boot.

## Changes

### official-tokens.css (canonical @font-face owner)
- Declares four OpenAI Sans faces on `OpenAISans-*.woff2` (on-disk / vite-emitted names):
  - 400 → Regular
  - 500 → Medium
  - 600 → Medium
  - 700 → Medium
- Rationale: official only ships 400/500; shell.css has `font-synthesis: none`, so 600/700 must resolve to a real Medium face (not stay light / synthetic).
- Removed English-only `--font-openai-sans` / `--font-ui-family` / `--font-sans` overrides that clobbered tokens.css CJK stack (import order: tokens.css → official-tokens.css).

### tokens.css
- Removed duplicate OpenAI Sans `@font-face` blocks (were `openai-sans-*.woff2` + 600/700→Medium).
- Kept Carlito faces.
- `--font-ui-family` remains the CJK-safe stack (OpenAI Sans + Segoe/PingFang/YaHei/…) and `--font-sans` aliases it.
- `--font-weight-body: 400` unchanged; `--font-weight-bold: 700` unchanged (maps to Medium via official-tokens faces).
- Type ladder tokens unchanged: base 14, sm 12, sm-ui 13, code 13.

### shell.css
- Updated bold comment: 700 is intentional and resolves to Medium via official-tokens @font-face mapping.

### appearance.ts
- Prefer (b): when `uiFontSize` is unset or shell default (15 from state.js), do **not** write `--text-*` inline overrides — leave tokens.css defaults.
- When `codeFontSize` is unset or shell default (13), do **not** write `--text-code`.
- Custom UI size scales the tokens.css ladder from base 14 (identity at 14); includes `--text-sm-ui`.
- Removed BASE_FONT_PX=15 write-always path that remapped sm→13 / base→15 on boot.

## Verification
Run after edits:
- `node scripts/check-frontend.mjs`
- `cd frontend; npm run typecheck; npm run build`

(See final agent report for PASS output.)
