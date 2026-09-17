/**
 * Approval card — the official `approvalRequestCard` surface.
 *
 * The option set is NOT hard-coded: the request carries `availableDecisions`,
 * an ordered list chosen by the server, and we render exactly that. Two of the
 * decisions carry a payload the server supplied (`proposedExecpolicyAmendment`,
 * `proposedNetworkPolicyAmendments`) which must be echoed back — see
 * decisions.ts.
 *
 * Nothing here invents state. If no request arrives, no card renders.
 */

import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { t } from "../../src/js/i18n.js";
import { removePendingRequest } from "@/state/turnStore";
import {
  DECISION_FALLBACK,
  DECISION_LABEL_KEY,
  DECISION_TONE,
  decisionResult,
  decisionsFor,
  type ApprovalDecision,
} from "./decisions";
import type { PendingRequest } from "@/state/types";

function labelFor(decision: ApprovalDecision): string {
  const key = DECISION_LABEL_KEY[decision];
  const fallback = DECISION_FALLBACK[decision] ?? decision;
  return key ? String(t(key, fallback)) : fallback;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function ApprovalCard({ request }: { request: PendingRequest }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [showReason, setShowReason] = useState(false);

  const params = request.params;
  const decisions = decisionsFor(params);

  const command = asString(params["command"]);
  const cwd = asString(params["cwd"]);
  const reason = asString(params["reason"]);
  const itemId = asString(params["itemId"]);
  const changes = Array.isArray(params["changes"]) ? params["changes"] : null;

  async function respond(decision: ApprovalDecision): Promise<void> {
    setBusy(true);
    setFailed(null);
    try {
      await invoke("respond_server_request", {
        requestId: request.id,
        result: decisionResult(decision, params),
      });
      // Optimistic removal; the server also emits serverRequest/resolved, which
      // removes it again idempotently.
      removePendingRequest(request.id);
    } catch (err) {
      // The turn stays blocked until the server gets an answer, so surface the
      // failure instead of silently swallowing it.
      setFailed(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <section className="approval-card" data-request-id={String(request.id)} role="dialog" aria-modal="false">
      <header className="approval-card-head">
        <h3 className="approval-card-title">
          {String(t("approvalRequestCard.approvalOptions", "Approval options"))}
        </h3>
        <code className="approval-card-method">{request.method}</code>
      </header>

      {command ? (
        <div className="approval-card-section">
          <div className="approval-card-label">Shell</div>
          <pre className="approval-card-command">
            <code>$ {command}</code>
          </pre>
          {cwd ? <div className="approval-card-meta">{cwd}</div> : null}
        </div>
      ) : null}

      {changes ? (
        <div className="approval-card-section">
          <div className="approval-card-label">
            {changes.length} file{changes.length === 1 ? "" : "s"}
          </div>
        </div>
      ) : null}

      {reason ? (
        <div className="approval-card-section">
          <button
            type="button"
            className="approval-card-reason-toggle"
            onClick={() => setShowReason((v) => !v)}
            aria-expanded={showReason}
          >
            {String(t("approvalRequestCard.reasonLabel", "Reason"))}
          </button>
          {showReason ? <p className="approval-card-reason">{reason}</p> : null}
        </div>
      ) : null}

      {itemId ? <div className="approval-card-meta">item {itemId}</div> : null}

      <div className="approval-card-actions">
        {decisions.map((decision) => (
          <button
            key={decision}
            type="button"
            className={`approval-card-btn is-${DECISION_TONE[decision] ?? "neutral"}`}
            disabled={busy}
            onClick={() => void respond(decision)}
          >
            {labelFor(decision)}
          </button>
        ))}
      </div>

      {failed ? <div className="approval-card-error">Respond failed: {failed}</div> : null}
    </section>
  );
}
