/**
 * Official Codex pet catalog.
 *
 * Every value in this file is transcribed from the shipped Codex webview
 * bundle (`app-initial`) so the shell stays behaviour-compatible with the
 * official pet system. Do not hand-edit the names or descriptions — they are
 * the official strings. When the upstream bundle bumps a spritesheet version,
 * update PET_SHEETS and the `sheet` field of the affected pets together.
 *
 * Official sources:
 *   Dlo  = { 1: 9, 2: 11 }                 spriteVersionNumber → row count
 *   r4   = v2 sheet spec (1536×2288, 8 cols × 11 rows, cell 192×208)
 *   Blo  = v1 sheet spec (1536×1872, 8 cols ×  9 rows, cell 192×208)
 *   Jlo  = idle frames (row 0)             qlo = 6 → idle loop scale
 *   Xlo  = state → frames map              i4(row, frames, step, last)
 *   auo  = 16-direction look (rows 9-10)   ouo=22.5° suo=16 cuo=9 luo=8
 *   n4   = built-in pet list (9 pets)
 */

// ── Spritesheet specs ────────────────────────────────────────────────

export const PET_SHEETS = {
  1: {
    version: 1,
    width: 1536,
    height: 1872,
    cellWidth: 192,
    cellHeight: 208,
    columns: 8,
    rows: 9,
    requiredFramesByRow: [6, 8, 8, 4, 5, 8, 6, 6, 6],
  },
  2: {
    version: 2,
    width: 1536,
    height: 2288,
    cellWidth: 192,
    cellHeight: 208,
    columns: 8,
    rows: 11,
    requiredFramesByRow: [6, 8, 8, 4, 5, 8, 6, 6, 6, 8, 8],
  },
};

export const DEFAULT_SPRITE_VERSION = 2;
export const PET_COLUMNS = PET_SHEETS[DEFAULT_SPRITE_VERSION].columns;

/** Official Dlo: spriteVersionNumber → row count. */
export function spriteRowCount(version) {
  return PET_SHEETS[version]?.rows ?? PET_SHEETS[DEFAULT_SPRITE_VERSION].rows;
}

// ── Animation data ───────────────────────────────────────────────────

/** Official qlo — idle frames are stretched by this factor when looping. */
export const IDLE_LOOP_SCALE = 6;

/** Official Jlo — the idle blink cycle on row 0. */
const IDLE_FRAMES = [
  { rowIndex: 0, columnIndex: 0, frameDurationMs: 280 },
  { rowIndex: 0, columnIndex: 1, frameDurationMs: 110 },
  { rowIndex: 0, columnIndex: 2, frameDurationMs: 110 },
  { rowIndex: 0, columnIndex: 3, frameDurationMs: 140 },
  { rowIndex: 0, columnIndex: 4, frameDurationMs: 140 },
  { rowIndex: 0, columnIndex: 5, frameDurationMs: 320 },
];

/** Official Ylo — Jlo stretched for the continuous idle loop. */
export const IDLE_LOOP = IDLE_FRAMES.map((f) => ({
  ...f,
  frameDurationMs: f.frameDurationMs * IDLE_LOOP_SCALE,
}));

/** Official i4(): expand a row into per-column frames with last-frame timing. */
function rowFrames(rowIndex, frameCount, stepMs, lastMs) {
  return Array.from({ length: frameCount }, (_, i) => ({
    rowIndex,
    columnIndex: i,
    frameDurationMs: i === frameCount - 1 ? lastMs : stepMs,
  }));
}

/**
 * Official Xlo — every state the official renderer knows about.
 * Rows 1-8 are the action rows; rows 9-10 are reserved for directional look.
 */
export const PET_ACTIONS = {
  failed: rowFrames(5, 8, 140, 240),
  jumping: rowFrames(4, 5, 140, 280),
  review: rowFrames(8, 6, 150, 280),
  running: rowFrames(7, 6, 120, 220),
  "running-left": rowFrames(2, 8, 120, 220),
  "running-right": rowFrames(1, 8, 120, 220),
  waving: rowFrames(3, 4, 140, 280),
  waiting: rowFrames(6, 6, 150, 260),
};

export const PET_ACTION_NAMES = Object.keys(PET_ACTIONS);

/**
 * Official Ulo(): a one-shot action plays three times, then falls through to
 * the idle loop. Reduced motion pins the first frame of the requested state.
 */
export function buildPetSequence(state, reducedMotion = false) {
  const frames = PET_ACTIONS[state];
  if (reducedMotion) {
    return { frames: [frames ? frames[0] : IDLE_FRAMES[0]], loopStartIndex: null };
  }
  if (!frames) return { frames: IDLE_LOOP, loopStartIndex: 0 };
  const triple = [...frames, ...frames, ...frames];
  return { frames: [...triple, ...IDLE_LOOP], loopStartIndex: triple.length };
}

// ── Directional look (rows 9-10) ─────────────────────────────────────

export const LOOK_DIRECTION_STEP_DEG = 22.5; // official ouo
export const LOOK_DIRECTION_COUNT = 16; // official suo
export const LOOK_START_ROW = 9; // official cuo
export const LOOK_DEAD_ZONE_PX = 1; // official uuo

/**
 * Official auo(): map the pointer offset from the sprite centre onto one of
 * 16 compass directions. Rows 9-10 hold 8 directions each, 8 columns per row.
 * Returns null when the pointer sits inside the dead zone (or for v1 sheets,
 * which have no directional rows).
 */
export function lookFrameFromPointer(rect, pointer, version = DEFAULT_SPRITE_VERSION) {
  if (version !== 2) return null;
  const dx = pointer.x - (rect.left + rect.width / 2);
  const dy = pointer.y - (rect.top + rect.height / 2);
  if (Math.hypot(dx, dy) <= LOOK_DEAD_ZONE_PX) return null;
  const deg = (Math.atan2(dx, -dy) * (180 / Math.PI) + 360) % 360;
  const step = Math.round(deg / LOOK_DIRECTION_STEP_DEG) % LOOK_DIRECTION_COUNT;
  return {
    columnIndex: step % PET_COLUMNS,
    frameDurationMs: 0,
    rowIndex: LOOK_START_ROW + Math.floor(step / PET_COLUMNS),
  };
}

/** Official Glo(): background-position for a frame. */
export function frameToBackgroundPosition(frame, rowCount = PET_SHEETS[DEFAULT_SPRITE_VERSION].rows) {
  if (!frame) return "0% 0%";
  const x = (frame.columnIndex / (PET_COLUMNS - 1)) * 100;
  const y = (frame.rowIndex / (rowCount - 1)) * 100;
  return `${x}% ${y}%`;
}

// ── Built-in pet catalog (official n4) ───────────────────────────────

/**
 * The nine official pets. `sheet` is the built asset filename under
 * frontend/src/assets/pets — the hash suffix is part of the build output,
 * so it must be updated when the asset is replaced.
 */
export const OFFICIAL_PETS = [
  {
    id: "codex",
    assetRef: "codex",
    displayName: "Codex",
    description: "The original Codex companion.",
    spriteVersionNumber: 2,
    sheet: "codex-spritesheet-v6-BRBFriCM.webp",
  },
  {
    id: "dewey",
    assetRef: "dewey",
    displayName: "Dewey",
    description: "A calm companion for focused workspace days",
    spriteVersionNumber: 2,
    sheet: "dewey-spritesheet-v5-D1KFAW8x.webp",
  },
  {
    id: "fireball",
    assetRef: "fireball",
    displayName: "Fireball",
    description: "Hot path energy for fast iteration.",
    spriteVersionNumber: 2,
    sheet: "fireball-spritesheet-v5-CcKkFG0_.webp",
  },
  {
    id: "hoots",
    assetRef: "hoots",
    displayName: "Hoots",
    description: "A sharp-eyed owl for polished work in a blink.",
    spriteVersionNumber: 2,
    sheet: "hoots-spritesheet-v8-hys0ZOs6.webp",
  },
  {
    id: "rocky",
    assetRef: "rocky",
    displayName: "Rocky",
    description: "A steady rock when the diff gets large.",
    spriteVersionNumber: 2,
    sheet: "rocky-spritesheet-v5-CXtdFM3V.webp",
  },
  {
    id: "seedy",
    assetRef: "seedy",
    displayName: "Seedy",
    description: "Small green shoots for new ideas.",
    spriteVersionNumber: 2,
    sheet: "seedy-spritesheet-v10-A9vkGoq7.webp",
  },
  {
    id: "stacky",
    assetRef: "stacky",
    displayName: "Stacky",
    description: "A balanced stack for deep work.",
    spriteVersionNumber: 2,
    sheet: "stacky-spritesheet-v6-Y0DWcgq_.webp",
  },
  {
    id: "bsod",
    assetRef: "bsod",
    displayName: "BSOD",
    description: "A tiny blue-screen gremlin.",
    spriteVersionNumber: 2,
    sheet: "bsod-spritesheet-v5-DMVBNs4E.webp",
  },
  {
    id: "null-signal",
    assetRef: "null-signal",
    displayName: "Null Signal",
    description: "Quiet signal from the void.",
    spriteVersionNumber: 2,
    sheet: "null-signal-spritesheet-v7-B59v4kgD.webp",
  },
];

/** assetRef → served spritesheet URL (official assetMap). */
export const PET_ASSET_MAP = OFFICIAL_PETS.reduce((map, pet) => {
  map[pet.assetRef] = `/assets/pets/${pet.sheet}`;
  return map;
}, {});

/** id → served spritesheet URL, for both built-in and custom pets. */
export function petSheetUrl(pet) {
  if (!pet) return "";
  // Explicit thumb/url wins (custom pets carry their own artwork).
  const explicit = pet.thumb || pet.spritesheetUrl || "";
  if (explicit) {
    if (/^https?:\/\//i.test(explicit) || explicit.startsWith("data:")) return explicit;
    return "/" + String(explicit).replace(/^\/+/, "");
  }
  if (pet.assetRef && PET_ASSET_MAP[pet.assetRef]) return PET_ASSET_MAP[pet.assetRef];
  if (pet.id && PET_ASSET_MAP[pet.id]) return PET_ASSET_MAP[pet.id];
  return "";
}

export function officialPet(id) {
  return OFFICIAL_PETS.find((p) => p.id === id) || null;
}

/** Official klo(): user-created pets use a `custom:` / `pet_` prefix. */
export function isCustomPetId(id) {
  return typeof id === "string" && (id.startsWith("custom:") || id.startsWith("pet_"));
}
