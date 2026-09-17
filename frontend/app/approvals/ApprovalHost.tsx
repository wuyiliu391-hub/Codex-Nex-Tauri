/**
 * Renders every outstanding server→client request.
 *
 * Dispatch is by protocol method, using the generated SERVER_REQUEST_METHODS
 * vocabulary. A request type with no renderer is surfaced as an explicit
 * "unhandled" row rather than dropped — the turn stays blocked until the server
 * gets an answer, so silence would look like a hang. Unhandled rows get a real
 * decline path so the turn can always be released.
 */

import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { t } from "../../src/js/i18n.js";
import { useTurnState } from "@/state/hooks";
import { removePendingRequest } from "@/state/turnStore";
import type { PendingRequest } from "@/state/types";
import { ApprovalCard } from "./ApprovalCard";
import { UserInputCard } from "./UserInputCard";

const APPROVAL_METHODS = new Set<string>([
  "item/commandExecution/requestApproval",
  "item/fileChange/requestApproval",
  "item/permissions/requestApproval",
]);

const USER_INPUT_METHODS = new Set<string>([
  "item/tool/requestUserInput",
  "mcpServer/elicitation/request",
]);

function UnhandledRequestCard({ request }: { request: PendingRequest }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  async function decline(): Promise<void> {
    setBusy(true);
    setFailed(null);
    try {
      await invoke("respond_server_request", {
        requestId: request.id,
        result: { decision: "decline" },
      });
      removePendingRequest(request.id);
    } catch (err) {
      setFailed(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <section className="approval-card is-unhandled" data-request-id={String(request.id)}>
      <header className="approval-card-head">
        <h3 className="approval-card-title">Unhandled request</h3>
        <code className="approval-card-method">{request.method}</code>
      </header>
      <pre className="approval-card-command">
        {JSON.stringify(request.params, null, 2)}
      </pre>
      <div className="approval-card-actions">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy}
          onClick={() => void decline()}
        >
          {String(t("approvalRequestCard.deny", "Decline"))}
        </button>
      </div>
      {failed ? <div className="approval-card-error">Respond failed: {failed}</div> : null}
    </section>
  );
}

export function ApprovalHost() {
  const { pendingRequests } = useTurnState();
  if (!pendingRequests.length) return null;

  return (
    <div className="approval-host" role="region" aria-label="Pending requests">
      {pendingRequests.map((request) => {
        const key = String(request.id);
        if (APPROVAL_METHODS.has(request.method)) {
          return <ApprovalCard key={key} request={request} />;
        }
        if (USER_INPUT_METHODS.has(request.method)) {
          return <UserInputCard key={key} request={request} />;
        }
        return <UnhandledRequestCard key={key} request={request} />;
      })}
    </div>
  );
}
