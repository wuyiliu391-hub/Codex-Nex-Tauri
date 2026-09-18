// Dependency-free frontend checks.
//
// Local policy for this repo: dependencies and builds live in CI, so local work
// needs checks that run with nothing installed. Node 24 parses TypeScript
// natively, which covers .ts; .tsx needs JSX so it gets a structural check
// instead. Everything here is also run in CI before the real build.
//
// Run: node scripts/check-frontend.mjs

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const appDir = join(root, "frontend/app");

const failures = [];
const fail = (msg) => {
  failures.push(msg);
  console.log("FAIL  " + msg);
};
const pass = (msg) => console.log("PASS  " + msg);

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = walk(appDir);
const tsFiles = files.filter((f) => f.endsWith(".ts"));
const tsxFiles = files.filter((f) => f.endsWith(".tsx"));

// ── 1. TypeScript syntax ──────────────────────────────────────────────

let tsOk = 0;
for (const file of tsFiles) {
  try {
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
    tsOk += 1;
  } catch (err) {
    fail(`syntax error in ${file.replace(root + "\\", "")}\n${err.stderr?.toString() ?? err.message}`);
  }
}
if (tsOk === tsFiles.length) pass(`${tsOk} .ts file(s) parse`);

// ── 2. TSX structural check ───────────────────────────────────────────
// Strip comments and string/template literals, then require balanced
// brackets. Catches the common "forgot a closing brace" mistake.

function stripLiterals(src) {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const next = src[i + 1];
    if (c === "/" && next === "/") {
      while (i < n && src[i] !== "\n") i += 1;
      continue;
    }
    if (c === "/" && next === "*") {
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      i += 1;
      while (i < n) {
        if (src[i] === "\\") {
          i += 2;
          continue;
        }
        if (src[i] === quote) {
          i += 1;
          break;
        }
        i += 1;
      }
      out += '""';
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

for (const file of tsxFiles) {
  const stripped = stripLiterals(readFileSync(file, "utf8"));
  const pairs = [
    ["{", "}"],
    ["(", ")"],
    ["[", "]"],
  ];
  for (const [open, close] of pairs) {
    const opens = stripped.split(open).length - 1;
    const closes = stripped.split(close).length - 1;
    if (opens !== closes) {
      fail(`${file.replace(root + "\\", "")}: unbalanced ${open}${close} (${opens} open, ${closes} close)`);
    }
  }
}
if (tsxFiles.length) pass(`${tsxFiles.length} .tsx file(s) structurally balanced`);

// ── 3. Import resolution ──────────────────────────────────────────────

const ALIASES = {
  "@": join(root, "frontend/app"),
  "@protocol": join(root, "frontend/src/protocol"),
};

const IMPORT_RE = /from\s+["']([^"']+)["']/g;
let importChecked = 0;

for (const file of [...tsFiles, ...tsxFiles]) {
  const src = readFileSync(file, "utf8");
  for (const match of src.matchAll(IMPORT_RE)) {
    const rawSpec = match[1];
    // Vite import queries (?raw / ?url) are part of the specifier, not the
    // path — strip them before resolving against the filesystem.
    const spec = rawSpec.replace(/\?(raw|url|inline)$/, "");
    if (!spec.startsWith(".") && !spec.startsWith("@")) continue;
    importChecked += 1;

    let base = null;
    for (const [alias, target] of Object.entries(ALIASES)) {
      if (spec === alias || spec.startsWith(alias + "/")) {
        base = join(target, spec.slice(alias.length + 1));
        break;
      }
    }
    if (base === null && spec.startsWith(".")) base = resolve(dirname(file), spec);
    if (base === null) continue;

    const candidates = [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")];
    if (!candidates.some((c) => existsSync(c))) {
      fail(`${file.replace(root + "\\", "")}: unresolved import "${spec}"`);
    }
  }
}
pass(`${importChecked} import specifier(s) resolved`);

console.log(
  `\n${failures.length === 0 ? "ALL CHECKS PASSED" : failures.length + " CHECK(S) FAILED"}`,
);
process.exit(failures.length === 0 ? 0 : 1);
