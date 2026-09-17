/**
 * Approval decision vocabulary.
 *
 * Mirrors the official Rust enums exactly:
 *   CommandExecutionApprovalDecision  (protocol/v2/item.rs)
 *   FileChangeApprovalDecision
 *
 * The server decides which options to offer per request — the approval params
 * carry `availableDecisions`, an ordered list. The UI renders exactly those,
 * so a decision we were not offered can never be sent.
 */

/** `CommandExecutionApprovalDecision`. */
export const COMMAND_DECISIONS = [
  "accept",
  "acceptForSession",
  "acceptWithExecpolicyAmendment",
  "applyNetworkPolicyAmendment",
  "decline",
  "cancel",
] as const;

/** `FileChangeApprovalDecision`. */
export const FILE_CHANGE_DECISIONS = ["accept", "acceptForSession", "decline", "cancel"] as const;

export type ApprovalDecision = (typeof COMMAND_DECISIONS)[number];

/**
 * Used only when the server omits `availableDecisions` (older builds). Kept
 * deliberately small: offering a decision the server cannot honour would hang
 * the turn.
 */
export const DEFAULT_DECISIONS: readonly ApprovalDecision[] = [
  "accept",
  "acceptForSession",
  "decline",
];

/** decision → official `approvalRequestCard.*` label key. */
export const DECISION_LABEL_KEY: Record<string, string> = {
  accept: "approvalRequestCard.allowOnce",
  acceptForSession: "approvalRequestCard.allowConversation",
  acceptWithExecpolicyAmendment: "approvalRequestCard.alwaysAllow",
  applyNetworkPolicyAmendment: "approvalRequestCard.alwaysAllow",
  decline: "approvalRequestCard.deny",
  cancel: "approvalRequestCard.cancelTurn",
};

/** Visual weight per decision. */
export const DECISION_TONE: Record<string, "primary" | "neutral" | "danger"> = {
  accept: "primary",
  acceptForSession: "neutral",
  acceptWithExecpolicyAmendment: "neutral",
  applyNetworkPolicyAmendment: "neutral",
  decline: "danger",
  cancel: "danger",
};

/** English fallbacks so the card renders even before i18n loads. */
export const DECISION_FALLBACK: Record<string, string> = {
  accept: "Allow once",
  acceptForSession: "Allow this conversation",
  acceptWithExecpolicyAmendment: "Always allow",
  applyNetworkPolicyAmendment: "Always allow",
  decline: "Deny",
  cancel: "Deny and stop",
};

function isDecision(value: unknown): value is ApprovalDecision {
  return typeof value === "string" && (COMMAND_DECISIONS as readonly string[]).includes(value);
}

/**
 * Read the ordered decision list the server offered.
 *
 * Falls back to DEFAULT_DECISIONS only when the field is absent, never when it
 * is present-but-empty (an empty list means the server offers no choice).
 */
export function decisionsFor(params: Record<string, unknown>): readonly ApprovalDecision[] {
  const raw = params["availableDecisions"] ?? params["available_decisions"];
  if (!Array.isArray(raw)) return DEFAULT_DECISIONS;
  const list = raw.filter(isDecision);
  return list.length ? list : DEFAULT_DECISIONS;
}

/**
 * Build the JSON-RPC result for a decision.
 *
 * Two decisions carry a payload the server supplied on the request; echoing it
 * back is what makes "always allow" actually persist a rule rather than just
 * approving once.
 */
export function decisionResult(
  decision: ApprovalDecision,
  params: Record<string, unknown>,
): Record<string, unknown> {
  if (decision === "acceptWithExecpolicyAmendment") {
    const amendment = params["proposedExecpolicyAmendment"] ?? params["proposed_execpolicy_amendment"];
    return { decision, execpolicyAmendment: amendment ?? null };
  }
  if (decision === "applyNetworkPolicyAmendment") {
    const amendments =
      params["proposedNetworkPolicyAmendments"] ?? params["proposed_network_policy_amendments"];
    const first = Array.isArray(amendments) ? amendments[0] : null;
    return { decision, networkPolicyAmendment: first ?? null };
  }
  return { decision };
}
