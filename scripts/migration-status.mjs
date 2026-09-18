// Track the vanilla -> React migration.
//
// The migration is COMPLETE (2026-09-18): every vanilla UI module was ported
// to React and then deleted from frontend/src/js. This script now only tracks
// the handful of data/dictionary files React still imports as-is; it fails if
// one of them disappears or drifts from the expectations below.
//
// Run: node scripts/migration-status.mjs [--strict]

import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const vanillaDir = join(root, "frontend/src/js");

/**
 * status:
 *   "reused" — pure data/constants, imported as-is by React (no port needed)
 *
 * Historical note: the 14 vanilla UI modules (state-store, live-turn,
 * agent-events, bridge, bootstrap, render, home, settings, discovery, shell,
 * pet, modal, ui-controls, shortcuts, router) were fully ported to
 * frontend/app/** and deleted on 2026-09-18; they are intentionally absent
 * from this list.
 */
const MODULES = [
  { file: "i18n.js", status: "reused", note: "translation tables, imported by React" },
  { file: "i18n-pages.js", status: "reused", note: "page-level translation tables" },
  { file: "pets-data.js", status: "reused", note: "official pet catalog + animation data" },
  { file: "icons.js", status: "reused", note: "SVG path constants" },
  { file: "state.js", status: "reused", note: "default settings/preferences factories, imported by React stores" },
];

function countLines(file) {
  try {
    return readFileSync(file, "utf8").split("\n").length;
  } catch {
    return 0;
  }
}

function countMatches(file, pattern) {
  try {
    const src = readFileSync(file, "utf8");
    return (src.match(pattern) || []).length;
  } catch {
    return 0;
  }
}

let pendingLines = 0;
let pendingInner = 0;
let pendingListen = 0;
let pendingQSel = 0;
let portedLines = 0;
let reusedLines = 0;
const problems = [];

const rows = [];

for (const mod of MODULES) {
  const vanillaPath = join(vanillaDir, mod.file);
  if (!existsSync(vanillaPath)) {
    problems.push(`vanilla module missing: ${mod.file}`);
    continue;
  }

  const lines = countLines(vanillaPath);
  const inner = countMatches(vanillaPath, /\.innerHTML\s*=/g);
  const listen = countMatches(vanillaPath, /addEventListener\(/g);
  const qsel = countMatches(vanillaPath, /querySelector/g);

  // A "ported" claim must be backed by real files.
  if (mod.status === "ported") {
    for (const rel of mod.replaces ?? []) {
      const target = join(root, rel);
      const isDir = rel.endsWith("/");
      if (isDir ? !existsSync(target) : !existsSync(target)) {
        problems.push(`${mod.file}: replacement missing -> ${rel}`);
      }
    }
    portedLines += lines;
  } else if (mod.status === "reused") {
    reusedLines += lines;
  } else {
    pendingLines += lines;
    pendingInner += inner;
    pendingListen += listen;
    pendingQSel += qsel;
  }

  rows.push({
    module: mod.file,
    status: mod.status,
    lines,
    innerHTML: inner,
    listeners: listen,
    querySelector: qsel,
  });
}

const totalLines = rows.reduce((n, r) => n + r.lines, 0);
const portedCount = rows.filter((r) => r.status === "ported").length;
const reusedCount = rows.filter((r) => r.status === "reused").length;
const pendingCount = rows.filter((r) => r.status === "pending").length;

console.log("vanilla -> React migration status\n");
console.log("  module              status    lines  innerHTML  listeners  qSelector");
console.log("  ─────────────────────────────────────────────────────────────────────");
for (const r of rows) {
  console.log(
    `  ${r.module.padEnd(18)}  ${r.status.padEnd(8)}  ${String(r.lines).padStart(5)}  ` +
      `${String(r.innerHTML).padStart(9)}  ${String(r.listeners).padStart(9)}  ${String(r.querySelector).padStart(9)}`,
  );
}

console.log("\n  totals");
console.log(`    modules        : ${rows.length} (ported ${portedCount}, reused ${reusedCount}, pending ${pendingCount})`);
console.log(`    total lines    : ${totalLines}`);
console.log(`    ported lines   : ${portedLines}`);
console.log(`    reused lines   : ${reusedLines}  (data/constants — no port needed)`);
console.log(`    PENDING lines  : ${pendingLines}`);
console.log(`    PENDING innerHTML rebuilds : ${pendingInner}`);
console.log(`    PENDING manual listeners   : ${pendingListen}`);
console.log(`    PENDING querySelector      : ${pendingQSel}`);

if (problems.length) {
  console.log("\nFAIL  inconsistent migration claims:");
  for (const p of problems) console.log(`   ${p}`);
}

const done = pendingCount === 0 && problems.length === 0;
console.log(`\n${done ? "MIGRATION COMPLETE" : "MIGRATION IN PROGRESS"}`);

if (process.argv.includes("--strict") && !done) {
  process.exit(1);
}
process.exit(problems.length ? 1 : 0);
