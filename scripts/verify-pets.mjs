// Verify the official pet data wiring without a DOM.
// Run: node scratch/verify-pets.mjs

import { store } from "../frontend/src/js/state.js";
import {
  IDLE_LOOP_SCALE,
  PET_SHEETS,
  PET_ACTION_NAMES,
  OFFICIAL_PETS,
  PET_ASSET_MAP,
  buildPetSequence,
  lookFrameFromPointer,
  petSheetUrl,
  spriteRowCount,
} from "../frontend/src/js/pets-data.js";

let failures = 0;
function check(label, actual, expected) {
  const ok = String(actual) === String(expected);
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}: ${actual}${ok ? "" : `  (expected ${expected})`}`);
}

console.log("=== store.pets (defaultPets) ===");
check("pet count", store.pets.length, 9);
check("ids", store.pets.map((p) => p.id).join(","), OFFICIAL_PETS.map((p) => p.id).join(","));
check("first id", store.pets[0].id, "codex");
check("first name", store.pets[0].name, "Codex");
check("bsod name", store.pets.find((p) => p.id === "bsod").name, "BSOD");
check("null-signal id present", !!store.pets.find((p) => p.id === "null-signal"), true);
check("stacky id present", !!store.pets.find((p) => p.id === "stacky"), true);
check("fireball id present", !!store.pets.find((p) => p.id === "fireball"), true);
check("no legacy id 'fire'", !!store.pets.find((p) => p.id === "fire"), false);
check("no legacy id 'null'", !!store.pets.find((p) => p.id === "null"), false);
check("no legacy id 'stack'", !!store.pets.find((p) => p.id === "stack"), false);
check("no phantom 'mini'", !!store.pets.find((p) => p.id === "mini"), false);
check("thumb resolved", store.pets[0].thumb, "/assets/pets/codex-spritesheet-v6-BRBFriCM.webp");

console.log("\n=== sheet geometry (official) ===");
check("IDLE_LOOP_SCALE", IDLE_LOOP_SCALE, 6);
check("v1 rows", PET_SHEETS[1].rows, 9);
check("v2 rows", PET_SHEETS[2].rows, 11);
check("v2 frames/row", PET_SHEETS[2].requiredFramesByRow.join(","), "6,8,8,4,5,8,6,6,6,8,8");
check("rowCount(2)", spriteRowCount(2), 11);
check("rowCount(1)", spriteRowCount(1), 9);
check("all built-ins are v2", OFFICIAL_PETS.every((p) => p.spriteVersionNumber === 2), true);
check("assetMap size", Object.keys(PET_ASSET_MAP).length, 9);

console.log("\n=== actions (official Xlo) ===");
check("action count", PET_ACTION_NAMES.length, 8);
check("action names", PET_ACTION_NAMES.slice().sort().join(","), "failed,jumping,review,running,running-left,running-right,waiting,waving");

const waving = buildPetSequence("waving");
check("waving frames", waving.frames.length, 4 * 3 + 6);
check("waving loopStart", waving.loopStartIndex, 12);
const idle = buildPetSequence("idle");
check("idle frames", idle.frames.length, 6);
check("idle loopStart", idle.loopStartIndex, 0);
const rm = buildPetSequence("jumping", true);
check("reduced-motion frames", rm.frames.length, 1);
check("reduced-motion loopStart", rm.loopStartIndex, null);

console.log("\n=== directional look (rows 9-10, 16 directions) ===");
const rect = { left: 0, top: 0, width: 100, height: 100 };
const seenRows = new Set();
let outOfRange = 0;
for (let i = 0; i < 16; i++) {
  const deg = i * 22.5;
  const rad = (deg * Math.PI) / 180;
  const f = lookFrameFromPointer(rect, { x: 50 + Math.sin(rad) * 20, y: 50 - Math.cos(rad) * 20 }, 2);
  if (!f || f.rowIndex < 9 || f.rowIndex > 10 || f.columnIndex < 0 || f.columnIndex > 7) outOfRange += 1;
  else seenRows.add(f.rowIndex);
}
check("all 16 directions in rows 9-10", outOfRange, 0);
check("both directional rows used", [...seenRows].sort((a, b) => a - b).join(","), "9,10");
check("v1 has no look rows", lookFrameFromPointer(rect, { x: 90, y: 50 }, 1), null);
check("dead zone returns null", lookFrameFromPointer(rect, { x: 50, y: 50 }, 2), null);

console.log("\n=== url resolution ===");
check("built-in url", petSheetUrl(OFFICIAL_PETS[4]), "/assets/pets/rocky-spritesheet-v5-CXtdFM3V.webp");
check("custom thumb", petSheetUrl({ id: "custom:1", thumb: "assets/pets/custom-x.webp" }), "/assets/pets/custom-x.webp");
check("data url kept", petSheetUrl({ id: "custom:2", thumb: "data:image/webp;base64,AAA" }), "data:image/webp;base64,AAA");
check("unknown pet", petSheetUrl({ id: "nope" }), "");

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : failures + " CHECK(S) FAILED"}`);
process.exit(failures === 0 ? 0 : 1);
