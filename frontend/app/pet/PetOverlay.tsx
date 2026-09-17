/**
 * Floating pet overlay. Replaces pet.js.
 *
 * All sheet geometry, animation timing and the pet catalog come from
 * src/js/pets-data.js, which is transcribed from the shipped Codex bundle — this
 * component only drives the frame clock, drag and directional look.
 *
 * Behaviour parity with the vanilla player:
 *   - idle blink loop (row 0), stretched by IDLE_LOOP_SCALE
 *   - one-shot actions play three times then fall into the idle loop
 *   - 16-direction look while the pointer moves (rows 9-10), released after a pause
 *   - hover triggers the jumping reaction
 *   - drag with pointer capture, clamped to the viewport
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_SPRITE_VERSION,
  OFFICIAL_PETS,
  PET_COLUMNS,
  buildPetSequence,
  frameToBackgroundPosition,
  lookFrameFromPointer,
  petSheetUrl,
  spriteRowCount,
} from "../../src/js/pets-data.js";

/** How long a directional look frame is held after the last pointer move. */
const LOOK_HOLD_MS = 1400;
/** Official size slider range. */
const MIN_SIZE = 80;
const MAX_SIZE = 224;

export interface PetPreferences {
  active?: string;
  selected?: string;
  asleep?: boolean;
  size?: number;
}

export interface PetOverlayProps {
  preferences: PetPreferences;
  reduceMotion?: boolean;
  /** Pets reported by the engine; falls back to the official catalog. */
  enginePets?: Array<Record<string, unknown>>;
  /** Force a one-shot action (used by the settings preview buttons). */
  action?: string | null;
}

function resolvePet(prefs: PetPreferences, enginePets: Array<Record<string, unknown>> | undefined) {
  const selectedId = prefs.active || prefs.selected || "";
  const pool = enginePets?.length ? enginePets : (OFFICIAL_PETS as unknown as Array<Record<string, unknown>>);
  return pool.find((p) => p["id"] === selectedId) ?? pool[0] ?? null;
}

export function PetOverlay({
  preferences,
  reduceMotion = false,
  enginePets,
  action = null,
}: PetOverlayProps) {
  const pet = useMemo(() => resolvePet(preferences, enginePets), [preferences, enginePets]);
  const url = pet ? petSheetUrl(pet) : "";
  const version = typeof pet?.["spriteVersionNumber"] === "number"
    ? (pet["spriteVersionNumber"] as number)
    : DEFAULT_SPRITE_VERSION;
  const rows = spriteRowCount(version);

  const [state, setState] = useState<string>("idle");
  const [frameIndex, setFrameIndex] = useState(0);
  const [lookFrame, setLookFrame] = useState<{ columnIndex: number; rowIndex: number } | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  const lookTimerRef = useRef<number | null>(null);
  const elRef = useRef<HTMLDivElement | null>(null);

  const sequence = useMemo(() => buildPetSequence(state, reduceMotion), [state, reduceMotion]);

  // Frame clock. Restarts whenever the sequence changes.
  useEffect(() => {
    setFrameIndex(0);
    if (sequence.frames.length <= 1) return;

    let cancelled = false;
    let timer: number | null = null;
    let index = 0;

    const step = (): void => {
      if (cancelled) return;
      const frame = sequence.frames[index];
      const delay = frame?.frameDurationMs || 200;
      timer = window.setTimeout(() => {
        if (cancelled) return;
        let next = index + 1;
        if (next >= sequence.frames.length) {
          if (sequence.loopStartIndex === null) return;
          next = sequence.loopStartIndex;
        }
        if (sequence.loopStartIndex !== null && sequence.loopStartIndex > 0 && next === sequence.loopStartIndex) {
          setState("idle");
        }
        index = next;
        setFrameIndex(next);
        step();
      }, delay);
    };

    step();
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [sequence]);

  // Settings can request a one-shot action preview.
  useEffect(() => {
    if (!action) return;
    setLookFrame(null);
    setState(action);
  }, [action]);

  // Directional look: hold a frame while the pointer moves, release after a pause.
  useEffect(() => {
    if (version !== 2) return;
    const onPointerMove = (e: PointerEvent): void => {
      const el = elRef.current;
      if (!el || dragRef.current) return;
      const rect = el.getBoundingClientRect();
      const frame = lookFrameFromPointer(rect, { x: e.clientX, y: e.clientY }, version);
      if (frame) setLookFrame(frame);
      if (lookTimerRef.current !== null) window.clearTimeout(lookTimerRef.current);
      lookTimerRef.current = window.setTimeout(() => setLookFrame(null), LOOK_HOLD_MS);
    };
    const onLeave = (): void => setLookFrame(null);
    document.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("blur", onLeave);
    return () => {
      document.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("blur", onLeave);
      if (lookTimerRef.current !== null) window.clearTimeout(lookTimerRef.current);
    };
  }, [version]);

  // Drag handling with viewport clamping.
  useEffect(() => {
    const onPointerMove = (e: PointerEvent): void => {
      const drag = dragRef.current;
      const el = elRef.current;
      if (!drag || !el) return;
      const left = Math.max(0, Math.min(window.innerWidth - el.offsetWidth, e.clientX - drag.dx));
      const top = Math.max(0, Math.min(window.innerHeight - el.offsetHeight, e.clientY - drag.dy));
      setPosition({ left, top });
    };
    const onPointerUp = (): void => {
      dragRef.current = null;
    };
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    return () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
    };
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const el = elRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    dragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    el.setPointerCapture(e.pointerId);
    setState("waving");
  }, []);

  if (!url) return null;
  if (preferences.asleep) return null;

  const size = Math.max(MIN_SIZE, Math.min(MAX_SIZE, Number(preferences.size) || 100));
  const height = size;
  const width = Math.round((size * 192) / 208);

  const activeFrame = lookFrame ?? sequence.frames[frameIndex] ?? sequence.frames[0];
  const name = typeof pet?.["displayName"] === "string"
    ? (pet["displayName"] as string)
    : typeof pet?.["name"] === "string"
      ? (pet["name"] as string)
      : "Pet";

  return (
    <div
      ref={elRef}
      className="codex-pet-overlay"
      role="img"
      aria-label={name}
      title={name}
      data-pet-id={String(pet?.["id"] ?? "")}
      data-pet-state={state}
      style={{
        width,
        height,
        ...(position ? { left: position.left, top: position.top, right: "auto", bottom: "auto" } : {}),
        backgroundImage: `url("${url}")`,
        backgroundRepeat: "no-repeat",
        backgroundSize: `${PET_COLUMNS * 100}% ${rows * 100}%`,
        backgroundPosition: frameToBackgroundPosition(activeFrame, rows),
        imageRendering: "pixelated",
      }}
      onPointerDown={onPointerDown}
      onPointerEnter={() => {
        if (!dragRef.current) setState("jumping");
      }}
      onDoubleClick={() => setState("jumping")}
    />
  );
}
