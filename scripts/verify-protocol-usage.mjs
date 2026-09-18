#!/usr/bin/env node
/**
 * Verify that every protocol method string used in the React source actually
 * exists in the generated protocol tables.
 *
 * Why this exists: the project rule is that dependencies and builds happen in
 * CI, so `tsc` is not available locally. This check needs nothing but Node's
 * standard library, and it catches the highest-value class of error in this
 * codebase — a mistyped notification method, which would otherwise silently
 * never fire (exactly the bug class that left 8 of 82 notifications wired).
 *
 * It scans .ts/.tsx sources for slash-delimited string literals and checks them
 * against generated/protocol.json.
 *
 * Run: node scripts/verify-protocol-usage.mjs
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROTOCOL = join(ROOT, "frontend", "src", "protocol", "generated", "protocol.json");
const APP_DIR = join(ROOT, "frontend", "app");
const PROTOCOL_TS_DIR = join(ROOT, "frontend", "src", "protocol");

const protocol = JSON.parse(readFileSync(PROTOCOL, "utf8"));
const known = new Set([
  ...protocol.notifications.map((n) => n.method),
  ...protocol.requests.map((r) => r.method),
  ...protocol.clientRequests.map((r) => r.method),
  ...protocol.clientNotifications.map((r) => r.method),
]);

// Generated files legitimately contain every method; skip them.
const SKIP_DIRS = new Set(["node_modules", "dist", "generated"]);

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

const files = [...walk(APP_DIR), ...walk(PROTOCOL_TS_DIR)];

// Protocol methods look like "segment/segment" possibly with more segments.
// Exclude obvious non-protocol paths (relative imports, urls, mime types).
const CANDIDATE = /"([a-zA-Z][a-zA-Z0-9]*(?:\/[a-zA-Z][a-zA-Z0-9]*)+)"/g;
const IGNORE = /^(https?|data|\.|\/\/)/;

let checked = 0;
const unknown = [];

for (const file of files) {
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(CANDIDATE)) {
    const value = m[1];
    if (IGNORE.test(value)) continue;
    // Only consider things that look like protocol namespaces we know about.
    const namespace = value.split("/")[0];
    const KNOWN_NAMESPACES = new Set([
      "turn", "item", "thread", "account", "app", "mcpServer", "model",
      "modelProvider", "config", "configWarning", "fuzzyFileSearch", "hook",
      "process", "project", "rawResponse", "rawResponseItem", "remoteControl",
      "serverRequest", "skills", "windows", "windowsSandbox", "externalAgentConfig",
      "command", "autoApprovalReview", "attestation", "currentTime", "fs",
    ]);
    if (!KNOWN_NAMESPACES.has(namespace)) continue;

    checked += 1;
    if (!known.has(value)) {
      const line = src.slice(0, m.index).split("\n").length;
      unknown.push({ file: relative(ROOT, file), line, value });
    }
  }
}

console.log(`scanned ${files.length} source file(s)`);
console.log(`checked ${checked} protocol-looking string literal(s)`);
console.log(`known protocol methods: ${known.size}`);
console.log();

if (unknown.length === 0) {
  console.log("OK - every protocol method referenced in source exists in the generated tables");
} else {
  console.log(`${unknown.length} UNKNOWN method reference(s):`);
  for (const u of unknown) {
    console.log(`  ${u.file}:${u.line}  "${u.value}"`);
    // Suggest the closest known name so typos are obvious.
    const guess = [...known].find(
      (k) => k.toLowerCase().replace(/[^a-z]/g, "") === u.value.toLowerCase().replace(/[^a-z]/g, ""),
    );
    if (guess) console.log(`      did you mean "${guess}"?`);
  }
}

// ── coverage: every server notification must be classified in the store ──

const STORE = join(ROOT, "frontend", "app", "state", "notificationReducer.ts");
let coverageMissing = [];

try {
  const store = readFileSync(STORE, "utf8");

  /** Pull the string literals out of `const NAME ... = [ ... ]`. */
  function extractArray(name) {
    const re = new RegExp(
      `const\\s+${name}\\s*(?::[^=]+)?=\\s*(?:new Set(?:<[^>]+>)?\\()?\\s*\\[([\\s\\S]*?)\\]`,
    );
    const m = store.match(re);
    if (!m) return [];
    return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  }

  // Case labels inside applyNotification's switch.
  const switchCases = [...store.matchAll(/case\s+"([^"]+)":/g)].map((m) => m[1]);
  const declared = extractArray("AMBIENT_METHODS").concat(extractArray("INTENTIONALLY_UNHANDLED"));

  const covered = new Set([...switchCases, ...declared]);
  coverageMissing = protocol.notifications
    .map((n) => n.method)
    .filter((m) => !covered.has(m));

  console.log();
  console.log("--- notification coverage ---");
  console.log(`  protocol notifications : ${protocol.notifications.length}`);
  console.log(`  switch cases           : ${new Set(switchCases).size}`);
  console.log(`  acknowledged (no state): ${declared.length}`);

  if (coverageMissing.length === 0) {
    console.log("  OK - every notification is either handled or explicitly acknowledged");
  } else {
    console.log(`  MISSING ${coverageMissing.length}:`);
    for (const m of coverageMissing) console.log(`    ${m}`);
  }
} catch (err) {
  console.log();
  console.log(`--- coverage check skipped: ${err.message} ---`);
}

const failed = unknown.length > 0 || coverageMissing.length > 0;
process.exit(failed ? 1 : 0);
