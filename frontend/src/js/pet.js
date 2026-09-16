// Official Codex pet spritesheet player.
// Sheet: 1536×2288, 8 cols × 11 rows, cell 192×208 (spriteVersion 2).
// background-size: 800% 1100%; position: col/7 * 100%  row/10 * 100%.

const COLS = 8;
const ROWS = 11; // built-in sheets are v2 (11 rows)
const ASPECT_W = 192;
const ASPECT_H = 208;

// Idle blink cycle (row 0) — official timings, then slowed for loop.
const IDLE_FRAMES = [
  { col: 0, ms: 280 },
  { col: 1, ms: 110 },
  { col: 2, ms: 110 },
  { col: 3, ms: 140 },
  { col: 4, ms: 140 },
  { col: 5, ms: 320 },
];
const IDLE_LOOP_SCALE = 2;

// row, frameCount, stepMs, lastMs
const ACTIONS = {
  "running-right": { row: 1, frames: 8, step: 120, last: 220 },
  "running-left": { row: 2, frames: 8, step: 120, last: 220 },
  waving: { row: 3, frames: 4, step: 140, last: 280 },
  jumping: { row: 4, frames: 5, step: 140, last: 280 },
  failed: { row: 5, frames: 8, step: 140, last: 240 },
  waiting: { row: 6, frames: 6, step: 150, last: 260 },
  running: { row: 7, frames: 6, step: 120, last: 220 },
  review: { row: 8, frames: 6, step: 150, last: 280 },
};

function pos(col, row) {
  return `${(col / (COLS - 1)) * 100}% ${(row / (ROWS - 1)) * 100}%`;
}

function actionFrames(def) {
  return Array.from({ length: def.frames }, (_, i) => ({
    col: i,
    row: def.row,
    ms: i === def.frames - 1 ? def.last : def.step,
  }));
}

function idleLoopFrames() {
  return IDLE_FRAMES.map((f) => ({
    col: f.col,
    row: 0,
    ms: f.ms * IDLE_LOOP_SCALE,
  }));
}

function buildSequence(state) {
  if (state === "idle" || !ACTIONS[state]) {
    return { frames: idleLoopFrames(), loopStart: 0 };
  }
  const once = actionFrames(ACTIONS[state]);
  // official: play action 3× then fall into idle loop
  const triple = [...once, ...once, ...once];
  const idle = idleLoopFrames();
  return { frames: [...triple, ...idle], loopStart: triple.length };
}

let overlayEl = null;
let animTimer = null;
let frameIndex = 0;
let currentSeq = null;
let currentState = "idle";
let drag = null;
let reducedMotion = false;

function clearAnim() {
  if (animTimer != null) {
    clearTimeout(animTimer);
    animTimer = null;
  }
}

function applyFrame(frame) {
  if (!overlayEl || !frame) return;
  overlayEl.style.backgroundPosition = pos(frame.col, frame.row);
}

function tick() {
  if (!currentSeq || !overlayEl) return;
  const frames = currentSeq.frames;
  if (!frames.length) return;
  applyFrame(frames[frameIndex]);
  if (frames.length === 1) return;
  const delay = frames[frameIndex].ms || 200;
  animTimer = setTimeout(() => {
    let next = frameIndex + 1;
    if (next >= frames.length) {
      if (currentSeq.loopStart != null) {
        next = currentSeq.loopStart;
      } else {
        animTimer = null;
        return;
      }
    }
    if (currentSeq.loopStart > 0 && next === currentSeq.loopStart) {
      currentState = "idle";
    }
    frameIndex = next;
    tick();
  }, delay);
}

function setState(state) {
  if (state === currentState && currentSeq) return;
  currentState = state || "idle";
  clearAnim();
  if (reducedMotion) {
    currentSeq = { frames: [{ col: 0, row: 0, ms: 0 }], loopStart: null };
    frameIndex = 0;
    applyFrame(currentSeq.frames[0]);
    return;
  }
  currentSeq = buildSequence(currentState);
  frameIndex = 0;
  tick();
}

function resolvePetUrl(pet) {
  const thumb = pet?.thumb || "";
  if (!thumb) return "";
  if (/^https?:\/\//i.test(thumb) || thumb.startsWith("data:")) return thumb;
  // store paths: assets/pets/... → /assets/pets/...
  const clean = thumb.replace(/^\/+/, "");
  return "/" + clean;
}

function ensureOverlay() {
  if (overlayEl && document.body.contains(overlayEl)) return overlayEl;
  overlayEl = document.createElement("div");
  overlayEl.id = "codex-pet-overlay";
  overlayEl.className = "codex-pet-overlay";
  overlayEl.setAttribute("role", "img");
  overlayEl.setAttribute("aria-label", "Codex pet");
  document.body.appendChild(overlayEl);

  overlayEl.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    drag = {
      ox: e.clientX - overlayEl.offsetLeft,
      oy: e.clientY - overlayEl.offsetTop,
    };
    overlayEl.setPointerCapture(e.pointerId);
    setState("waving");
  });
  overlayEl.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const x = Math.max(0, Math.min(window.innerWidth - overlayEl.offsetWidth, e.clientX - drag.ox));
    const y = Math.max(0, Math.min(window.innerHeight - overlayEl.offsetHeight, e.clientY - drag.oy));
    overlayEl.style.left = x + "px";
    overlayEl.style.top = y + "px";
    overlayEl.style.right = "auto";
    overlayEl.style.bottom = "auto";
  });
  overlayEl.addEventListener("pointerup", () => {
    drag = null;
    // return to idle after wave finishes via sequence loop
  });
  overlayEl.addEventListener("dblclick", () => {
    setState("jumping");
  });

  return overlayEl;
}

export function setPetRuntimeState(state) {
  if (!overlayEl) return;
  setState(state);
}

export function renderPetOverlay(store) {
  const prefs = store.preferences?.pets || {};
  // no selection or tucked away
  if (!prefs.selected || prefs.asleep) {
    clearAnim();
    overlayEl?.remove();
    overlayEl = null;
    currentSeq = null;
    currentState = "idle";
    return;
  }

  const pet =
    (store.pets || []).find((p) => p.id === prefs.selected) ||
    (store.pets || [])[0];
  const url = resolvePetUrl(pet);
  if (!url) {
    clearAnim();
    overlayEl?.remove();
    overlayEl = null;
    return;
  }

  const nextReducedMotion = !!store.preferences?.appearance?.reduceMotion;
  const motionChanged = reducedMotion !== nextReducedMotion;
  reducedMotion = nextReducedMotion;

  const el = ensureOverlay();
  // official slider 80–224; default ~100
  const size = Math.max(80, Math.min(224, Number(prefs.size) || 100));
  const height = size;
  const width = Math.round((size * ASPECT_W) / ASPECT_H);
  const prevSheet = el.dataset.sheet || "";
  const sheetChanged = prevSheet !== url;

  el.style.width = width + "px";
  el.style.height = height + "px";
  // force image swap even if browser caches same property string
  if (sheetChanged) el.style.backgroundImage = "";
  el.style.backgroundImage = `url("${url}")`;
  el.style.backgroundRepeat = "no-repeat";
  el.style.backgroundSize = `${COLS * 100}% ${ROWS * 100}%`;
  el.style.imageRendering = "pixelated";
  el.title = pet?.name || "Pet";
  el.setAttribute("aria-label", pet?.name || "Codex pet");
  el.dataset.petId = pet?.id || "";

  if (!currentSeq || sheetChanged || motionChanged) {
    el.dataset.sheet = url;
    currentState = "";
    setState("idle");
  } else {
    applyFrame(currentSeq.frames[frameIndex] || currentSeq.frames[0]);
  }
}

// Hook agent activity → pet mood (optional, no-op if overlay gone)
export function petOnAgentPhase(phase) {
  if (!overlayEl) return;
  switch (phase) {
    case "executing_tool":
    case "running":
      setState("running");
      break;
    case "waiting_approval":
    case "waiting":
      setState("waiting");
      break;
    case "failed":
    case "error":
      setState("failed");
      break;
    case "completed":
    case "idle":
    case "streaming":
    case "thinking":
      setState("idle");
      break;
    default:
      break;
  }
}
