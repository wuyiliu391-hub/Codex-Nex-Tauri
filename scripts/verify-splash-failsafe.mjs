// Verify the plain-script splash fail-safe in frontend/src/index.html.
//
// The built app once span forever on the startup animation because bridge.js
// shipped a syntax error: the whole ES module graph was rejected, bootstrap.js
// never executed, and the 12s fallback declared *inside* it never registered.
// The fix is a plain (non-module) script in index.html that always runs.
//
// This test extracts that script and executes it against a fake DOM to prove
// it actually rescues the splash, in three scenarios:
//   1. module graph dead, nothing but the timeout fires
//   2. module fails to parse → window error event fires
//   3. both fire → reveal happens exactly once
//
// Run: node scripts/verify-splash-failsafe.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const INDEX = join(here, "..", "frontend", "src", "index.html");
const BOOTSTRAP = join(here, "..", "frontend", "src", "js", "bootstrap.js");
const html = readFileSync(INDEX, "utf8");

let failures = 0;
const fail = (m) => {
  failures += 1;
  console.log("FAIL  " + m);
};
const pass = (m) => console.log("PASS  " + m);

// ── locate the inline fail-safe ──────────────────────────────────────

const inlineScripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

if (inlineScripts.length === 0) {
  fail("no inline <script> found in index.html");
  process.exit(1);
}
const code = inlineScripts[0];

const inlinePos = html.indexOf(code);
const modulePos = html.indexOf('type="module"');
if (modulePos < 0) fail("no module script found in index.html");
else if (inlinePos > modulePos) fail("inline fail-safe is declared AFTER the module script — it would not run first");
else pass("inline fail-safe is declared before the module script");

if (/<div[^>]*id="startup-error"/.test(html)) pass("#startup-error container present in the DOM");
else fail("#startup-error container missing from the DOM");

// ── fake DOM ─────────────────────────────────────────────────────────

function classList() {
  const s = new Set();
  return {
    add: (...c) => c.forEach((x) => s.add(x)),
    remove: (...c) => c.forEach((x) => s.delete(x)),
    contains: (c) => s.has(c),
  };
}
function makeEl(id) {
  return {
    id,
    classList: classList(),
    parentNode: null,
    hidden: false,
    textContent: "",
    remove() {
      this.parentNode = null;
    },
  };
}

function runOnce(trigger) {
  const timers = [];
  const listeners = {};
  const win = {
    addEventListener(type, fn) {
      (listeners[type] ||= []).push(fn);
    },
  };
  const loader = makeEl("startup-loader");
  loader.parentNode = { children: [loader] };
  const errBox = makeEl("startup-error");
  errBox.hidden = true;
  const body = makeEl("body");
  body.classList.add("is-booting");
  const doc = {
    body,
    getElementById: (id) => (id === "startup-loader" ? loader : id === "startup-error" ? errBox : null),
  };
  const fakeSetTimeout = (fn, ms) => {
    timers.push({ fn, ms });
    return timers.length;
  };

  new Function("window", "document", "setTimeout", code)(win, doc, fakeSetTimeout);

  if (timers.length !== 1) fail(`expected exactly 1 timer registered, got ${timers.length}`);
  else if (timers[0].ms !== 15000) fail(`fail-safe delay is ${timers[0].ms}ms, expected 15000`);
  else pass("fail-safe timer registered at 15000ms");

  if (win.__codexSplashFailSafe === undefined) fail("window.__codexSplashFailSafe was not set");
  else pass("window.__codexSplashFailSafe exposed (so bootstrap.js can clear it)");

  if (typeof win.__codexRevealSplash !== "function") fail("window.__codexRevealSplash was not exposed");
  else pass("window.__codexRevealSplash exposed");

  trigger({ win, timers, listeners, loader, errBox, body, doc });

  return { loader, errBox, body, win };
}

// ── scenario 1: module graph completely dead ─────────────────────────

console.log("\n--- scenario 1: module graph dead, only the timeout fires ---");
{
  const r = runOnce(({ timers }) => timers[0].fn());
  if (r.loader.classList.contains("is-hidden")) pass("splash hidden after timeout");
  else fail("splash NOT hidden after timeout");
  if (!r.body.classList.contains("is-booting")) pass("is-booting removed after timeout");
  else fail("is-booting still present after timeout");
  if (r.win.__codexSplashRevealed) pass("reveal flag set");
  else fail("reveal flag not set");
  if (r.errBox.hidden) pass("no error text on a clean timeout");
  else fail("error box shown on a clean timeout");
}

// ── scenario 2: module fails to parse → error event ──────────────────

console.log("\n--- scenario 2: module fails to parse, error event fires ---");
{
  const r = runOnce(({ listeners }) => {
    const handlers = listeners["error"] || [];
    if (!handlers.length) {
      fail("no window error listener registered");
      return;
    }
    handlers[0]({ message: "Unexpected token '*'", filename: "bridge.js", lineno: 294 });
  });
  if (r.loader.classList.contains("is-hidden")) pass("splash hidden immediately on the error event");
  else fail("splash NOT hidden on the error event");
  if (!r.errBox.hidden && /Unexpected token/.test(r.errBox.textContent)) pass("the real error is surfaced to the user");
  else fail(`error text not surfaced (hidden=${r.errBox.hidden}, text=${JSON.stringify(r.errBox.textContent)})`);
  if (/bridge\.js:294/.test(r.errBox.textContent)) pass("error location included");
  else fail("error location missing");
}

// ── scenario 3: reveal is idempotent ─────────────────────────────────

console.log("\n--- scenario 3: reveal runs at most once ---");
{
  const r = runOnce(({ timers, listeners }) => {
    (listeners["error"] || [])[0]?.({ message: "boom" });
    timers[0].fn();
  });
  const expected = "The interface failed to start.\n\nboom";
  if (r.errBox.textContent === expected) pass("first reveal wins; the later timeout does not overwrite it");
  else fail(`unexpected final text: ${JSON.stringify(r.errBox.textContent)}`);
}

// ── integration: bootstrap.js must clear the fail-safe ───────────────

console.log("\n--- integration with bootstrap.js ---");
{
  const boot = readFileSync(BOOTSTRAP, "utf8");
  if (/clearTimeout\(window\.__codexSplashFailSafe\)/.test(boot)) {
    pass("bootstrap.js clears the fail-safe on a successful boot");
  } else {
    fail("bootstrap.js never clears window.__codexSplashFailSafe — a healthy boot would still trip the timeout");
  }
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : failures + " CHECK(S) FAILED"}`);
process.exit(failures === 0 ? 0 : 1);
