#!/usr/bin/env node
/**
 * Agent A verify: no invented #hex outside token definition files.
 * Allowed: tokens.css, official-tokens.css (variable definitions only).
 * Owned component/base CSS (reset.css, controls.css) must have zero #hex.
 */
const fs = require("fs");
const path = require("path");

const stylesDir = path.join(__dirname, "frontend", "src", "styles");
const HEX = /#[0-9a-fA-F]{3,8}\b/g;

const ownedNoHex = ["reset.css", "controls.css"];
const tokenDefs = ["tokens.css", "official-tokens.css"];
const allowHexInDefs = true;

let failed = false;

function listCss(dir) {
  return fs.readdirSync(dir).filter((f) => f.endsWith(".css")).sort();
}

function scanFile(name) {
  const p = path.join(stylesDir, name);
  const text = fs.readFileSync(p, "utf8");
  const lines = text.split(/\r?\n/);
  const hits = [];
  lines.forEach((line, i) => {
    HEX.lastIndex = 0;
    let m;
    while ((m = HEX.exec(line))) {
      hits.push({ line: i + 1, hex: m[0], text: line.trim() });
    }
  });
  return hits;
}

console.log("=== Agent A hex ownership verify ===");
console.log("stylesDir:", stylesDir);
console.log("");

// 1) owned no-hex files
for (const f of ownedNoHex) {
  const hits = scanFile(f);
  if (hits.length === 0) {
    console.log(`PASS  ${f}: 0 #hex literals`);
  } else {
    failed = true;
    console.log(`FAIL  ${f}: ${hits.length} #hex literals`);
    hits.forEach((h) => console.log(`      L${h.line}: ${h.hex}  |  ${h.text.slice(0, 100)}`));
  }
}

console.log("");

// 2) token definition files — report hex counts (allowed)
for (const f of tokenDefs) {
  const hits = scanFile(f);
  console.log(`INFO  ${f}: ${hits.length} #hex literals (allowed in token definitions)`);
  if (f === "official-tokens.css") {
    // Non --official-* property assignments with hex should be flagged
    const bad = hits.filter((h) => {
      const t = h.text;
      if (/^\s*--official-/.test(t)) return false;
      // comments mentioning hex are ok
      if (/^\s*(\/\*|\*|\/\/)/.test(t)) return false;
      return /--(?!official-)[\w-]+\s*:/.test(t) || /[^-]#[0-9a-fA-F]/.test(t);
    });
    // simpler: any hex line that is a custom property not named --official-*
    const propHex = [];
    const text = fs.readFileSync(path.join(stylesDir, f), "utf8");
    text.split(/\r?\n/).forEach((line, i) => {
      const m = line.match(/^\s*(--[\w-]+)\s*:/);
      if (m && HEX.test(line.replace(/\/\*[\s\S]*?\*\//g, ""))) {
        if (!m[1].startsWith("--official-")) {
          propHex.push({ line: i + 1, prop: m[1], text: line.trim() });
        }
      }
      HEX.lastIndex = 0;
    });
    if (propHex.length === 0) {
      console.log(`PASS  official-tokens.css: hex only on --official-* custom properties`);
    } else {
      // accent-ring etc are var() only — should pass
      failed = true;
      console.log(`FAIL  official-tokens.css: hex on non --official-* properties`);
      propHex.forEach((h) => console.log(`      L${h.line}: ${h.prop}  |  ${h.text.slice(0, 100)}`));
    }
  }
}

console.log("");

// 3) other css — informational (pre-existing; not Agent A ownership)
const others = listCss(stylesDir).filter(
  (f) => !ownedNoHex.includes(f) && !tokenDefs.includes(f)
);
for (const f of others) {
  const hits = scanFile(f);
  if (hits.length) {
    console.log(`INFO  ${f}: ${hits.length} #hex (pre-existing; not in Agent A scope)`);
  } else {
    console.log(`PASS  ${f}: 0 #hex literals`);
  }
}

console.log("");
console.log(failed ? "RESULT: FAIL" : "RESULT: PASS (Agent A ownership)");
process.exit(failed ? 1 : 0);
