/**
 * Renders every outstanding server→client request.
 *
 * Dispatch is by protocol method, using the generated SERVER_REQUEST_METHODS
 * vocabulary. A request type with no renderer is surfaced as an explicit
 * "unhandled" row rather than dropped — the turn stays blocked until the server
 * gets an answer, so silence would look like a hang.
 */

import { useTurnState } from "@/state/hooks";
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
        return (
          <section className="approval-card is-unhandled" key={key} data-request-id={key}>
            <header className="approval-card-head">
              <h3 className="approval-card-title">Unhandled request</h3>
              <code className="approval-card-method">{request.method}</code>
            </header>
            <pre className="approval-card-command">
              {JSON.stringify(request.params, null, 2)}
            </pre>
          </section>
        );
      })}
    </div>
  );
}
