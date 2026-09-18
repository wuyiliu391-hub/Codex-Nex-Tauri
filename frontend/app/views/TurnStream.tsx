/**
 * Turn stream view — live turn rendering on the official turn lifecycle.
 *
 * Header state machine (all three strings live in the i18n dictionary):
 *   send            → 「正在思考」  spinner row, timer starts at send time,
 *                     no agent content yet, anchored at the tail
 *   first content   → 「已处理 X 秒」 ticking ~4Hz, anchored above the first
 *                     agent-content row of the CURRENT turn
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

/** Official elapsed strings: 460毫秒 / 1.1秒 / 27秒 / 1分 5秒. */
function formatElapsed(ms: number | null | undefined): string {
  if (!ms || ms < 0) return "";
  if (ms < 1000) return `${ms}毫秒`;
  const totalSec = ms / 1000;
  if (totalSec < 60) {
    const s = totalSec < 10 ? totalSec.toFixed(1) : String(Math.floor(totalSec));
    return `${s}秒`;
  }
  const m = Math.floor(totalSec / 60);
  const s = Math.floor(totalSec % 60);
  return s ? `${m}分 ${s}秒` : `${m}分`;
}

/**
 * Re-render ~4Hz while the turn is live so 「已处理 X 秒」 ticks in real time.
 * Returns ms since turn start, or null when no turn is running.
 */
function useLiveElapsed(active: boolean, startedAt: number | null): number | null {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active || startedAt == null) return;
    const id = window.setInterval(() => setTick((v) => v + 1), 250);
    return () => window.clearInterval(id);
  }, [active, startedAt]);
  if (!active || startedAt == null) return null;
  return Math.max(0, Date.now() - startedAt);
}

type HeaderState = "thinking" | "live" | "done" | null;

export function TurnStream() {
  const turn = useTurnState();
  const items = useTurnItems();
  const nodes = groupProcessItems(items);
  const [collapsed, setCollapsed] = useState(false);
  const liveMs = useLiveElapsed(turn.active, turn.startedAt);

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
  const state: HeaderState = turn.active
    ? firstAgentIdx >= 0
      ? "live"
      : "thinking"
    : doneElapsed
      ? "done"
      : null;
  const headerText =
    state === "thinking"
      ? t("process.thinking", "Thinking…")
      : state === "live"
        ? t("process.elapsed", "Processed {time}", { time: formatElapsed(liveMs ?? 0) })
        : state === "done"
          ? t("process.usedTime", "Took {time}", { time: doneElapsed })
          : "";

  const visible = (idx: number): boolean => {
    if (!collapsed || firstAgentIdx < 0) return true;
    if (idx < firstAgentIdx) return true;
    const n = nodes[idx]!;
    return n.kind === "item" && n.item.type === "user-message";
  };

  // The header row renders OUTSIDE the fold — collapsing used to hide the
  // header along with its own toggle, leaving no way back.
  const headerRow = state ? (
    <div className="message-row turn-elapsed-row" key="turn-header">
      <button
        type="button"
        className={`turn-elapsed-head${state === "done" ? "" : " is-live"}`}
        aria-expanded={state === "done" ? !collapsed : undefined}
        aria-disabled={state === "done" ? undefined : true}
        onClick={() => {
          if (state === "done") setCollapsed((v) => !v);
        }}
      >
        {state === "thinking" ? <span className="turn-spinner" aria-hidden="true" /> : null}
        <span>{headerText}</span>
        {state === "done" ? (
          <svg className={collapsed ? "closed" : undefined} viewBox="0 0 10 6" aria-hidden="true">
            <path d="M1 1l4 4 4-4" />
          </svg>
        ) : null}
      </button>
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
