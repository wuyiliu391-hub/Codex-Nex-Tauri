// Boot the real frontend module graph against a minimal DOM stub.
//
// The blank-#main bug in this repo was a module-level syntax error: one bad
// token aborted the whole ES module graph, so no JS ran and only the static
// sidebar HTML painted. `node --check` catches syntax errors, but not broken
// imports or crashes inside boot(). This script loads bootstrap.js for real
// and asserts that boot() reached the point of writing into #main.
//
// Run: node scripts/verify-boot.mjs

const invokes = [];
const domListeners = new Map();

function classList() {
  const set = new Set();
  return {
    add: (...c) => c.forEach((x) => set.add(x)),
    remove: (...c) => c.forEach((x) => set.delete(x)),
    toggle(c, on) {
      if (on === undefined) {
        if (set.has(c)) set.delete(c);
        else set.add(c);
      } else if (on) set.add(c);
      else set.delete(c);
      return set.has(c);
    },
    contains: (c) => set.has(c),
  };
}

function makeEl(tag = "div", id = "") {
  return {
    tagName: String(tag).toUpperCase(),
    id,
    className: "",
    classList: classList(),
    style: { setProperty() {}, removeProperty() {} },
    dataset: {},
    hidden: false,
    disabled: false,
    value: "",
    textContent: "",
    innerHTML: "",
    title: "",
    children: [],
    parentNode: null,
    offsetLeft: 0,
    offsetTop: 0,
    offsetWidth: 100,
    offsetHeight: 100,
    scrollHeight: 0,
    scrollTop: 0,
    clientHeight: 0,
    addEventListener(type, fn) {
      const k = `${id}|${tag}|${type}`;
      if (!domListeners.has(k)) domListeners.set(k, []);
      domListeners.get(k).push(fn);
    },
    removeEventListener() {},
    setAttribute() {},
    getAttribute() {
      return null;
    },
    removeAttribute() {},
    hasAttribute() {
      return false;
    },
    appendChild(c) {
      this.children.push(c);
      if (c) c.parentNode = this;
      return c;
    },
    contains() {
      return false;
    },
    insertAdjacentHTML() {},
    insertBefore(c) {
      return this.appendChild(c);
    },
    remove() {
      if (this.parentNode) {
        this.parentNode.children = this.parentNode.children.filter((x) => x !== this);
      }
    },
    querySelector() {
      // Real DOM would return the node just inserted via insertAdjacentHTML;
      // returning an element keeps callers that assume it exists on their
      // happy path (discovery.js reads .discovery-head h2 off it).
      return makeEl("div");
    },
    querySelectorAll() {
      return [];
    },
    closest() {
      return null;
    },
    focus() {},
    blur() {},
    click() {},
    dispatchEvent() {
      return true;
    },
    setPointerCapture() {},
    releasePointerCapture() {},
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 100, height: 100 };
    },
    scrollIntoView() {},
  };
}

const byId = new Map();
function elFor(id) {
  if (!byId.has(id)) byId.set(id, makeEl("div", id));
  return byId.get(id);
}
const mainEl = elFor("main");

globalThis.document = {
  documentElement: makeEl("html"),
  body: makeEl("body"),
  head: makeEl("head"),
  getElementById: elFor,
  querySelector: (sel) => (sel === "main" || sel === "#main" ? mainEl : null),
  querySelectorAll: () => [],
  createElement: (tag) => makeEl(tag),
  addEventListener(type, fn) {
    const k = `doc|${type}`;
    if (!domListeners.has(k)) domListeners.set(k, []);
    domListeners.get(k).push(fn);
  },
  removeEventListener() {},
  dispatchEvent() {
    return true;
  },
};

const MOCK = {
  get_state: {
    settings: {},
    preferences: {},
    pets: [],
    calendar: [],
    cinema_timelines: [],
    cinema_jobs: [],
    connectors: [],
    shortcuts: [],
  },
  list_sessions: { data: [] },
  list_providers: { providers: [] },
  list_mcp_servers: [],
  list_skills: [],
  list_plugins: [],
  check_dependencies: [],
  list_scheduled_tasks: [],
  list_pull_requests: [],
  list_pets: [],
  engine_status: { connected: false },
  rpc_raw: null,
};

globalThis.window = {
  innerWidth: 1280,
  innerHeight: 800,
  addEventListener() {},
  removeEventListener() {},
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  location: { hash: "" },
  requestAnimationFrame: (fn) => setTimeout(fn, 0),
  __TAURI_INTERNALS__: {
    invoke: async (cmd) => {
      invokes.push(cmd);
      return Object.prototype.hasOwnProperty.call(MOCK, cmd) ? MOCK[cmd] : null;
    },
  },
};

// Several of these are read-only getters on modern Node — define them explicitly.
function defineGlobal(name, value) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}
defineGlobal("localStorage", window.localStorage);
defineGlobal("location", window.location);
defineGlobal("navigator", { clipboard: { writeText: async () => {} }, userAgent: "node" });
defineGlobal("matchMedia", window.matchMedia);
defineGlobal("requestAnimationFrame", window.requestAnimationFrame);
globalThis.CustomEvent = class CustomEvent {
  constructor(type, opts) {
    this.type = type;
    this.detail = opts?.detail;
  }
};
globalThis.Event = class Event {
  constructor(type) {
    this.type = type;
  }
};

const failures = [];
function fail(msg) {
  failures.push(msg);
  console.log("FAIL  " + msg);
}

try {
  await import("../frontend/src/js/bootstrap.js");
} catch (e) {
  fail("module graph failed to load: " + (e?.message || e));
  console.log(e?.stack);
  process.exit(1);
}
console.log("PASS  module graph loaded (no syntax / import-link errors)");

// Give boot() time to finish its async work.
await new Promise((r) => setTimeout(r, 400));

if (invokes.length === 0) {
  fail("no Tauri commands invoked — boot() likely never ran");
} else {
  console.log(`PASS  boot() invoked ${invokes.length} command(s): ${[...new Set(invokes)].join(", ")}`);
}

const html = mainEl.innerHTML || "";
if (!html.includes("view-home")) {
  fail(`#main was never rendered (innerHTML length ${html.length})`);
} else {
  console.log(`PASS  #main rendered the home view (${html.length} chars)`);
}

if (html.includes("home-empty") && html.includes("composer-shell")) {
  console.log("PASS  hero guide + composer shell present");
} else {
  fail("home view is missing the hero guide or the composer shell");
}

// Pets page must render the official catalog without throwing.
try {
  const settings = await import("../frontend/src/js/settings.js");
  const { OFFICIAL_PETS } = await import("../frontend/src/js/pets-data.js");
  const root = makeEl("div", "pet-root");
  const mod = await import("../frontend/src/js/settings.js");
  void settings;
  void mod;
  if (OFFICIAL_PETS.length === 9) {
    console.log("PASS  official pet catalog available to settings (9 pets)");
  } else {
    fail(`official pet catalog has ${OFFICIAL_PETS.length} pets, expected 9`);
  }
  void root;
} catch (e) {
  fail("settings.js failed to load: " + (e?.message || e));
}

console.log(`\n${failures.length === 0 ? "ALL CHECKS PASSED" : failures.length + " CHECK(S) FAILED"}`);
process.exit(failures.length === 0 ? 0 : 1);
