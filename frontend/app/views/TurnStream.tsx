/**
 * Turn stream view — live turn rendering on the official turn lifecycle.
 *
 * Header state machine (all three strings live in the i18n dictionary):
 *   send            → 「正在思考」  spinner row, timer starts at send time,
 *                     no agent content yet, anchored at the tail
 *   first content   → 「已处理 X 秒」 ticking once per second, anchored above
 *                     the first agent-content row of the CURRENT turn
 *   turn/completed  → 「用时 X 秒 ⌄」 static, chevron folds the turn body
 *                     (user bubbles stay visible)
 *
 * The stylesheets target the DOM contract:
 *   .thread > .message-row (.user / .turn-elapsed-row) > .message-body
 *   > .message-part.part-text
 * This component emits no wrapper elements of its own — earlier it wrapped
 * everything in .turn-stream-view / .turn-stream, which no stylesheet knew
 * about, so the thread lost all styling.
 *
 * Consecutive finished tools of the same kind are collapsed via
 * `groupProcessItems` (ProcGroup rows).
 */

import { useEffect, useState, type ReactNode } from "react";
import { useTurnItems, useTurnState } from "@/state/hooks";
import { Block, ProcGroup, groupProcessItems } from "@/blocks/registry";
import { ApprovalHost } from "@/approvals/ApprovalHost";
import { t as tRaw } from "../../src/js/i18n.js";

function t(key: string, fallback = "", vars?: Record<string, string | number>): string {
  return String(tRaw(key, fallback, (vars ?? null) as null));
}

/**
 * Elapsed-time formatting, integer seconds only.
 *
 * The live header counts up from zero, so the first thing a user reads is the
 * smallest number in the sequence. Sub-second precision ("460毫秒", "1.1秒")
 * made that first impression a fractional number that changes width as it
 * ticks; whole seconds keep the label a single stable glyph ("0秒" → "9秒").
 *
 *   0s–59s    → "0秒" … "27秒"   (whole seconds, no decimals)
 *   ≥60s      → "1分 5秒" / "2分"
 *
 * A sub-second turn still formats as "0秒" rather than an empty string: the
 * header only renders while a turn is live, so "" would blank the row.
 */
function formatSeconds(totalSec: number): string {
  const sec = Math.floor(Math.max(0, totalSec));
  if (sec < 60) return `${sec}秒`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m}分 ${s}秒` : `${m}分`;
}

function formatElapsed(ms: number | null | undefined): string {
  if (ms == null || ms < 0) return "";
  return formatSeconds(ms / 1000);
}

/**
 * Seconds elapsed since turn start, ticking once per second.
 *
 * Returns `null` when no turn is live. The interval matches the display
 * resolution exactly: a 250ms tick would re-render 4× per second to produce
 * the same integer, and would make the highlight animation restart mid-fade.
 *
 * The value lives in state and is written ONLY by the interval. Deriving it
 * from `Date.now()` during render would look equivalent but is not: every
 * streaming delta re-renders this component, each re-render would read a
 * slightly larger millisecond count, and any tick that crossed a second
 * boundary would change the header's React `key` — re-mounting the row and
 * restarting its highlight mid-fade. With a fast provider that happens many
 * times per second, so the label never gets to fade back and reads as
 * permanently highlighted. State keeps the key change at exactly 1 Hz.
 */
function useLiveSeconds(active: boolean, startedAt: number | null): number | null {
  const [sec, setSec] = useState(0);
  useEffect(() => {
    if (!active || startedAt == null) return;
    const read = () => setSec(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    read();
    const id = window.setInterval(read, 1000);
    return () => window.clearInterval(id);
  }, [active, startedAt]);
  if (!active || startedAt == null) return null;
  return sec;
}

type HeaderState = "thinking" | "live" | "done" | null;

export function TurnStream() {
  const turn = useTurnState();
  const items = useTurnItems();
  const nodes = groupProcessItems(items);
  const [collapsed, setCollapsed] = useState(false);
  const liveSec = useLiveSeconds(turn.active, turn.startedAt);

  // Anchor the header to the CURRENT turn only: the last user bubble is the
  // turn boundary, so a follow-up turn's header never floats into the middle
  // of the previous turn's answer.
  let boundary = -1;
  nodes.forEach((n, i) => {
    if (n.kind === "item" && n.item.type === "user-message") boundary = i;
  });
  const firstAgentIdx = nodes.findIndex(
    (n, i) =>
      i > boundary && (n.kind === "group" || (n.kind === "item" && n.item.type !== "user-message")),
  );

  // A fresh turn always starts unfolded; folding only exists for finished turns.
  useEffect(() => {
    if (turn.active) setCollapsed(false);
  }, [turn.active]);

  const doneElapsed = formatElapsed(turn.durationMs);
  // `active` with no `startedAt` cannot happen through the normal lifecycle —
  // both are written together by `beginTurn`/`beginUserTurn` — but if it ever
  // did, the header would read 「已处理 」 with no number. Fall back to the
  // thinking row, which needs no clock.
  const state: HeaderState = turn.active
    ? firstAgentIdx >= 0 && liveSec != null
      ? "live"
      : "thinking"
    : doneElapsed
      ? "done"
      : null;

  // A failed or interrupted turn used to render exactly like a successful one:
  // `turn.error` and `turn.turnStatus` were written by the reducer but read by
  // no component, and the header fell through to 「用时 X 秒」 for every
  // terminal state. The user saw a normal-looking answer with no indication the
  // model call had died. Surface it in the header label and as a detail row.
  const failed = !turn.active && (turn.turnStatus === "failed" || turn.turnStatus === "interrupted");
  const failureLabel = turn.turnStatus === "interrupted"
    ? t("process.cancelled", "Cancelled")
    : t("process.failedShort", "Failed");
  const headerText =
    state === "thinking"
      ? t("process.thinking", "Thinking…")
      : state === "live"
        ? t("process.elapsed", "Processed {time}", { time: formatSeconds(liveSec ?? 0) })
        : state === "done"
          ? failed
            ? `${failureLabel}${doneElapsed ? ` · ${t("process.usedTime", "Took {time}", { time: doneElapsed })}` : ""}`
            : t("process.usedTime", "Took {time}", { time: doneElapsed })
          : "";

  const visible = (idx: number): boolean => {
    if (!collapsed || firstAgentIdx < 0) return true;
    if (idx < firstAgentIdx) return true;
    const n = nodes[idx]!;
    return n.kind === "item" && n.item.type === "user-message";
  };

  // The header row renders OUTSIDE the fold — collapsing used to hide the
  // header along with its own toggle, leaving no way back.
  //
  // The live row carries `key={liveSec}` so React remounts it on every tick.
  // A CSS animation only plays on mount or when its `animation-name` changes,
  // so a plain re-render would leave the highlight stuck at its end state
  // after the first second. The key sits on the row, not on the label, because
  // the highlight spans the whole row (label, spinner and divider rule); the
  // row is not focusable while live (`aria-disabled`), so remounting it drops
  // no focus.
  const headerRow = state ? (
    <div className="message-row turn-elapsed-row" key={state === "live" ? `turn-header-${liveSec}` : "turn-header"}>
      <button
        type="button"
        className={`turn-elapsed-head${state === "done" ? "" : " is-live"}${
          state === "live" ? " is-ticking" : ""
        }${failed ? " is-failed" : ""}`}
        aria-expanded={state === "done" ? !collapsed : undefined}
        aria-disabled={state === "done" ? undefined : true}
        // Not focusable until the turn ends: the live row is remounted every
        // second to restart the highlight, and a keyboard user parked on it
        // would lose focus on each tick.
        tabIndex={state === "done" ? undefined : -1}
        onClick={() => {
          if (state === "done") setCollapsed((v) => !v);
        }}
      >
        {state === "thinking" ? <span className="turn-spinner" aria-hidden="true" /> : null}
        {failed ? <span className="turn-fail-glyph" aria-hidden="true">!</span> : null}
        <span className="turn-elapsed-text">{headerText}</span>
        {state === "done" ? (
          <svg className={collapsed ? "closed" : undefined} viewBox="0 0 10 6" aria-hidden="true">
            <path d="M1 1l4 4 4-4" />
          </svg>
        ) : null}
      </button>
      {/* The message itself, not just the status word: "Failed" alone leaves
          the user with no idea whether the key was rejected, the endpoint was
          unreachable, or the stream died mid-answer. */}
      {failed && turn.error ? (
        <div className="message-body">
          <div className="part-text turn-fail-detail" role="alert">
            {turn.error}
          </div>
        </div>
      ) : null}
    </div>
  ) : null;

  // thinking (and any header with no agent content to anchor to) sits at the
  // tail, right under the newest user bubble; live/done anchor above the
  // first agent content of this turn.
  const headerBeforeIdx = state === "thinking" || firstAgentIdx < 0 ? -1 : firstAgentIdx;

  // Official turn closure: the final agent answer sits below the (now
  // auto-collapsed) tool flow as the summary block. Server text only — we
  // mark the LAST agentMessage of the completed turn, never synthesize one.
  let summaryId: string | null = null;
  if (!turn.active && turn.turnStatus === "completed") {
    for (let i = nodes.length - 1; i > boundary; i--) {
      const n = nodes[i]!;
      if (n.kind === "item" && n.item.type === "agentMessage" && n.item.text) {
        summaryId = n.item.id;
        break;
      }
    }
  }

  const body: ReactNode[] = [];
  nodes.forEach((node, idx) => {
    if (headerRow && idx === headerBeforeIdx) body.push(headerRow);
    if (!visible(idx)) return;
    body.push(
      node.kind === "group" ? (
        <ProcGroup key={`group-${node.items[0]!.id}`} kind={node.groupKind} items={node.items} />
      ) : (
        <Block key={node.item.id} item={node.item} summary={node.item.id === summaryId} />
      ),
    );
  });
  if (headerRow && headerBeforeIdx < 0) {
    body.push(headerRow);
  }

  return (
    <>
      <ApprovalHost />
      {body}
      {turn.warnings.map((w, i) => (
        <div className="message-row" key={i}>
          <div className="message-body">
            <div className="part-text">
              <code>{w.method}</code> — {w.message}
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
