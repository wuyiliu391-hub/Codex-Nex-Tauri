/**
 * Turn stream view — the part of the React port that is already complete.
 *
 * Renders outstanding approvals first (they block the turn), then the item
 * stream through the block registry. Every value originates from a server
 * notification; there is no local simulation.
 */

import { useTurnItems, useTurnState } from "@/state/hooks";
import { Block } from "@/blocks/registry";
import { ApprovalHost } from "@/approvals/ApprovalHost";

export function TurnStream() {
  const turn = useTurnState();
  const items = useTurnItems();

  return (
    <div className="turn-stream-view">
      <ApprovalHost />

      {items.length === 0 ? (
        <p className="turn-stream-empty">
          No items yet. Items appear only when the server reports them.
        </p>
      ) : (
        <div className="turn-stream">
          {items.map((item) => (
            <Block key={item.id} item={item} />
          ))}
        </div>
      )}

      {turn.tokenUsage ? (
        <details className="turn-usage">
          <summary>Token usage</summary>
          <pre>{JSON.stringify(turn.tokenUsage, null, 2)}</pre>
        </details>
      ) : null}

      {turn.plan ? (
        <ol className="turn-plan">
          {turn.plan.map((step, i) => (
            <li key={i}>
              [{step.status}] {step.step}
            </li>
          ))}
        </ol>
      ) : null}

      {turn.warnings.length ? (
        <ul className="turn-warnings">
          {turn.warnings.map((w, i) => (
            <li key={i}>
              <code>{w.method}</code> — {w.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
