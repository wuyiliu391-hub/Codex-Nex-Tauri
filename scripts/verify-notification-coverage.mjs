// Assert every server notification has a handler in the React reducer.
//
// The original gap (8 of 82 notifications wired) happened because coverage was
// tracked by hand. This check makes it mechanical: add a method upstream,
// regenerate the protocol layer, and this fails until a handler exists.
//
// Run: node scripts/verify-notification-coverage.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const protocol = JSON.parse(
  readFileSync(join(root, "frontend/src/protocol/generated/protocol.json"), "utf8"),
);
const reducerSrc = readFileSync(
  join(root, "frontend/app/state/notificationReducer.ts"),
  "utf8",
);

const allMethods = protocol.notifications.map((n) => n.method);

// Handled explicitly via `case "...":` inside the method switch.
// Scope to the `switch (method)` block so status literals (e.g. case "done")
// from helper functions are not mistaken for protocol methods.
const switchIndex = reducerSrc.indexOf("switch (method)");
if (switchIndex < 0) {
  console.log("FAIL  could not locate `switch (method)` in the reducer");
  process.exit(1);
}
const switchBody = reducerSrc.slice(switchIndex);
const handled = new Set([...switchBody.matchAll(/case "([^"]+)":/g)].map((m) => m[1]));

// Handled as ambient (recorded, not rendered on the turn stream).
// Strip comments first — the list carries explanatory text in quotes.
const ambientBlock = reducerSrc.match(
  /const AMBIENT_METHODS = new Set<string>\(\[([\s\S]*?)\]\)/,
);
const ambientSource = (ambientBlock ? ambientBlock[1] : "").replace(/\/\/.*$/gm, "");
const ambient = new Set(
  [...ambientSource.matchAll(/"([^"]+)"/g)].map((m) => m[1]),
);

const missing = allMethods.filter((m) => !handled.has(m) && !ambient.has(m));
const handledCount = allMethods.filter((m) => handled.has(m)).length;
const ambientCount = allMethods.filter((m) => ambient.has(m)).length;

// Cases that do not correspond to a real protocol method (typos / stale names)
const unknownCases = [...handled].filter((m) => !allMethods.includes(m));
const staleAmbient = [...ambient].filter((m) => !allMethods.includes(m));

console.log(`protocol notifications : ${allMethods.length}`);
console.log(`explicit handlers      : ${handledCount}`);
console.log(`ambient handlers       : ${ambientCount}`);
console.log(`unhandled              : ${missing.length}`);

let failures = 0;

if (missing.length) {
  failures += missing.length;
  console.log("\nFAIL  notifications with no handler:");
  for (const m of missing) console.log(`   ${m}`);
}

if (unknownCases.length) {
  failures += unknownCases.length;
  console.log("\nFAIL  case labels that are not protocol methods:");
  for (const m of unknownCases) console.log(`   ${m}`);
}

if (staleAmbient.length) {
  failures += staleAmbient.length;
  console.log("\nFAIL  AMBIENT_METHODS entries that are not protocol methods:");
  for (const m of staleAmbient) console.log(`   ${m}`);
}

console.log(
  `\n${failures === 0 ? "ALL CHECKS PASSED — full notification coverage" : failures + " CHECK(S) FAILED"}`,
);
process.exit(failures === 0 ? 0 : 1);
