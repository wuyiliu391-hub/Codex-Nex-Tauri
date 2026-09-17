/**
 * Turn stream view — renders the live turn exactly as render.js did.
 *
 * The stylesheets target the vanilla DOM contract:
 *   .thread > .message-row (.user / .live-turn) > .message-body > .message-part.part-text
 * and the footers/heads render.js produced (.turn-head, .turn-elapsed,
 * .turn-footer, .turn-changes). This component deliberately emits no wrapper
 * elements of its own — earlier it wrapped everything in .turn-stream-view /
 * .turn-stream, which no stylesheet knew about, so the thread lost all styling.
 *
 * Consecutive finished tools of the same kind are collapsed the way
 * render.js `renderGroupedProcess` did, via `groupProcessItems`.
 */

import { useTurnItems, useTurnState } from "@/state/hooks";
import { Block, ProcGroup, groupProcessItems } from "@/blocks/registry";
import { ApprovalHost } from "@/approvals/ApprovalHost";

export function TurnStream() {
  const turn = useTurnState();
  const items = useTurnItems();
  const nodes = groupProcessItems(items);

  return (
    <>
      <ApprovalHost />

      {nodes.map((node) =>
        node.kind === "group" ? (
          <ProcGroup key={`group-${node.items[0]!.id}`} kind={node.groupKind} items={node.items} />
        ) : (
          <Block key={node.item.id} item={node.item} />
        ),
      )}

      {turn.tokenUsage ? (
        <div className="turn-todo">
          <span className="todo-label">Token usage</span>
          <span className="todo-count">
            {turn.tokenUsage.totalTokens ?? turn.tokenUsage.outputTokens ?? 0}
          </span>
        </div>
      ) : null}

      {turn.plan ? (
        <div className="turn-todo">
          <span className="todo-dot" aria-hidden="true" />
          <span className="todo-label">
            {turn.plan.filter((s) => s.status === "completed").length}/{turn.plan.length}
          </span>
          <span className="todo-count">
            {turn.plan.find((s) => s.status === "in_progress")?.step ?? ""}
          </span>
        </div>
      ) : null}

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