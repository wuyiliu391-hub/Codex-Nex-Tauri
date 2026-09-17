#!/usr/bin/env node
/**
 * Restore the EOL style of source files after an editor rewrites them.
 *
 * This repo has no .gitattributes, and the files are a mix of CRLF and LF
 * (bridge.js / settings.js are CRLF; most others are LF). Editors that
 * normalize line endings produce whole-file diffs, which makes review
 * impossible. Run this after editing to put the endings back.
 *
 * Usage:
 *   node scripts/normalize-eol.mjs crlf frontend/src/js/bridge.js
 *   node scripts/normalize-eol.mjs lf   frontend/src/js/pet.js
 *   node scripts/normalize-eol.mjs auto frontend/src/js/a.js frontend/src/js/b.js
 *
 * `auto` picks the dominant ending already present in each file.
 */

import { readFileSync, writeFileSync } from "node:fs";

const [mode, ...files] = process.argv.slice(2);

if (!["crlf", "lf", "auto"].includes(mode) || files.length === 0) {
  console.error("usage: normalize-eol.mjs <crlf|lf|auto> <file> [file...]");
  process.exit(1);
}

/** Count CRLF vs bare-LF occurrences. */
function endingsOf(text) {
  const crlf = (text.match(/\r\n/g) || []).length;
  const lf = (text.match(/\n/g) || []).length - crlf;
  return { crlf, lf };
}

let changed = 0;

for (const file of files) {
  let original;
  try {
    original = readFileSync(file, "utf8");
  } catch (e) {
    console.error(`skip (unreadable): ${file}`);
    continue;
  }

  let target = mode;
  if (target === "auto") {
    const { crlf, lf } = endingsOf(original);
    target = crlf > lf ? "crlf" : "lf";
  }
  const eol = target === "crlf" ? "\r\n" : "\n";

  const normalized = original
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n/g, eol);

  if (normalized === original) {
    console.log(`ok        ${target}  ${file}`);
    continue;
  }

  writeFileSync(file, normalized, "utf8");
  changed += 1;
  console.log(`rewrote   ${target}  ${file}`);
}

console.log(`\n${changed} file(s) rewritten.`);
