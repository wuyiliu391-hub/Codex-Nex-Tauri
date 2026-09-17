// Official Codex pet spritesheet player.
//
// All sheet geometry, animation timing and the pet catalog live in
// ./pets-data.js, transcribed from the shipped Codex webview bundle. This file
// only drives the DOM: frame stepping, directional look, hover reactions and
// agent-driven moods.

import {
  PET_SHEETS,
  PET_COLUMNS,
  DEFAULT_SPRITE_VERSION,
  buildPetSequence,
  frameToBackgroundPosition,
  lookFrameFromPointer,
  spriteRowCount,
  petSheetUrl,
  OFFICIAL_PETS,
} from "./pets-data.js";

const CELL_W = PET_SHEETS[DEFAULT_SPRITE_VERSION].cellWidth;
const CELL_H = PET_SHEETS[DEFAULT_SPRITE_VERSION].cellHeight;

/** How long a directional look frame is held after the last pointer move. */
const LOOK_HOLD_MS = 1400;

let overlayEl = null;
let animTimer = null;
let lookTimer = null;
let frameIndex = 0;
let currentSeq = null;
let currentState = "idle";
let drag = null;
let reducedMotion = false;

// Sprite sheet geometry of the currently displayed pet.
let rowCount = PET_SHEETS[DEFAULT_SPRITE_VERSION].rows;
let spriteVersion = DEFAULT_SPRITE_VERSION;

// Interaction state.
let lookActive = false;
let hoverJump = true;
let lastStore = null;

function clearAnim() {
  if (animTimer != null) {
    clearTimeout(animTimer);
    animTimer = null;
  }
}

function clearLookTimer() {
  if (lookTimer != null) {
    clearTimeout(lookTimer);
    lookTimer = null;
  }
}

function applyFrame(frame) {
  if (!overlayEl || !frame) return;
  overlayEl.style.backgroundPosition = frameToBackgroundPosition(frame, rowCount);
}

function tick() {
  if (!currentSeq || !overlayEl) return;
  const frames = currentSeq.frames;
  if (!frames.length) return;
  applyFrame(frames[frameIndex]);
  if (frames.length === 1) return;
  const delay = frames[frameIndex].frameDurationMs || 200;
  animTimer = setTimeout(() => {
    let next = frameIndex + 1;
    if (next >= frames.length) {
      if (currentSeq.loopStartIndex != null) {
        next = currentSeq.loopStartIndex;
      } else {
        animTimer = null;
        return;
      }
    }
    if (currentSeq.loopStartIndex > 0 && next === currentSeq.loopStartIndex) {
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
  clearLookTimer();
  lookActive = false;
  currentSeq = buildPetSequence(currentState, reducedMotion);
  frameIndex = 0;
  tick();
}

/** Hold a single directional frame while the pointer is near the pet. */
function setLookFrame(frame) {
  if (!overlayEl || !frame) return;
  lookActive = true;
  clearAnim();
  applyFrame(frame);
}

/** Drop the directional hold and resume the ambient animation. */
function releaseLook() {
  clearLookTimer();
  if (!lookActive) return;
  lookActive = false;
  currentState = "";
  setState("idle");
}

function handlePointerMove(e) {
  if (!overlayEl || drag) return;
  if (spriteVersion !== 2) return; // v1 sheets have no directional rows
  const rect = overlayEl.getBoundingClientRect();
  const frame = lookFrameFromPointer(rect, { x: e.clientX, y: e.clientY }, spriteVersion);
  if (frame) setLookFrame(frame);
  clearLookTimer();
  lookTimer = setTimeout(releaseLook, LOOK_HOLD_MS);
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
    overlayEl.classList.add("is-dragging");
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
    overlayEl.classList.remove("is-dragging");
  });
  // Official respondToHover behaviour: the pet hops when the pointer lands on it.
  overlayEl.addEventListener("pointerenter", () => {
    if (hoverJump && !drag) setState("jumping");
  });
  overlayEl.addEventListener("dblclick", () => {
    setState("jumping");
  });

  document.addEventListener("pointermove", handlePointerMove, { passive: true });
  document.addEventListener("pointerleave", releaseLook);
  window.addEventListener("blur", releaseLook);

  return overlayEl;
}

function hideOverlay() {
  clearAnim();
  clearLookTimer();
  lookActive = false;
  overlayEl?.remove();
  overlayEl = null;
  currentSeq = null;
  currentState = "idle";
}

/** Resolve the active pet record from engine data, falling back to the catalog. */
function resolvePet(store, selectedId) {
  const enginePets = Array.isArray(store?.pets) ? store.pets : [];
  const pool = enginePets.length ? enginePets : OFFICIAL_PETS;
  return pool.find((p) => p.id === selectedId) || pool[0] || null;
}

export function setPetRuntimeState(state) {
  if (!overlayEl) return;
  setState(state);
}

export function renderPetOverlay(store) {
  lastStore = store;
  const prefs = store?.preferences?.pets || {};
  // settings.js writes `active`; older shells wrote `selected`. Accept both.
  const selectedId = prefs.active || prefs.selected || "";
  const asleep = !!prefs.asleep;

  if (!selectedId || asleep) {
    hideOverlay();
    return;
  }

  const pet = resolvePet(store, selectedId);
  const url = petSheetUrl(pet);
  if (!url) {
    hideOverlay();
    return;
  }

  spriteVersion = pet?.spriteVersionNumber ?? DEFAULT_SPRITE_VERSION;
  rowCount = spriteRowCount(spriteVersion);

  const nextReducedMotion = !!store?.preferences?.appearance?.reduceMotion;
  const motionChanged = reducedMotion !== nextReducedMotion;
  reducedMotion = nextReducedMotion;

  const el = ensureOverlay();
  // Official slider 80–224; default ~100.
  const size = Math.max(80, Math.min(224, Number(prefs.size) || 100));
  const height = size;
  const width = Math.round((size * CELL_W) / CELL_H);
  const prevSheet = el.dataset.sheet || "";
  const sheetChanged = prevSheet !== url;

  el.style.width = width + "px";
  el.style.height = height + "px";
  // Force an image swap even when the browser would reuse the cached property.
  if (sheetChanged) el.style.backgroundImage = "";
  el.style.backgroundImage = `url("${url}")`;
  el.style.backgroundRepeat = "no-repeat";
  el.style.backgroundSize = `${PET_COLUMNS * 100}% ${rowCount * 100}%`;
  el.style.imageRendering = "pixelated";
  const name = pet?.displayName || pet?.name || "Pet";
  el.title = name;
  el.setAttribute("aria-label", name);
  el.dataset.petId = pet?.id || "";
  el.dataset.spriteVersion = String(spriteVersion);
  el.hidden = false;
  el.style.display = "";

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

// ── Shell events ─────────────────────────────────────────────────────

// Wake + show the pet from the settings page.
document.addEventListener("codex:show-pet", () => {
  const store = lastStore;
  if (!store) return;
  const pets = store.preferences?.pets || {};
  const id = pets.active || pets.selected || OFFICIAL_PETS[0].id;
  store.preferences.pets = { ...pets, active: id, selected: id, asleep: false };
  renderPetOverlay(store);
});

// Preview a single official animation from the settings page action grid.
document.addEventListener("codex:pet-action", (e) => {
  const action = e?.detail;
  if (!action) return;
  if (!overlayEl && lastStore) renderPetOverlay(lastStore);
  if (!overlayEl) return;
  currentState = ""; // force the sequence to restart even if it is the same action
  setState(action);
});
