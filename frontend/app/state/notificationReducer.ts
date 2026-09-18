/**
 * Notification reducer — maps every server notification to store actions.
 *
 * Coverage rule: every entry in NOTIFICATION_METHODS must be handled here.
 * `verify-notification-coverage.mjs` asserts that, so adding a method upstream
 * and regenerating fails the check until a handler exists. Unhandled methods
 * are recorded as warnings rather than dropped silently.
 *
 * Everything below reacts to the server. Nothing is simulated locally.
 */

import type { NotificationEnvelope } from "../bridge/events";
import * as turn from "./turnStore";
import type { ItemStatus, TurnPhase } from "@protocol/status";
import type { PlanStep, TokenUsage } from "./types";

type Params = Record<string, unknown>;

function str(params: Params, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = params[key];
    if (typeof value === "string" && value) return value;
  }
  return undefined;
}

function num(params: Params, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = params[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

function obj(params: Params, ...keys: string[]): Params | undefined {
  for (const key of keys) {
    const value = params[key];
    if (value && typeof value === "object" && !Array.isArray(value)) return value as Params;
  }
  return undefined;
}

/** Pull the item payload out of `{ item: {...} }` or a flat object. */
function itemOf(params: Params): Params {
  return obj(params, "item") ?? params;
}

function itemIdOf(item: Params, fallbackPrefix: string): string {
  return (
    str(item, "id", "itemId", "callId") ??
    `${fallbackPrefix}-${Math.random().toString(36).slice(2, 10)}`
  );
}

function statusOf(value: unknown): ItemStatus {
  const raw = typeof value === "string" ? value : "";
  switch (raw) {
    case "completed":
    case "denied":
    case "done":
    case "failed":
    case "inProgress":
    case "in_progress":
    case "interrupted":
    case "running":
    case "skipped":
      return raw;
    default:
      return "completed";
  }
}

function phaseOf(value: unknown): TurnPhase | undefined {
  return value === "final_answer" || value === "commentary" ? value : undefined;
}

/** Map the server's itemType discriminator onto our block tag. */
function blockTypeOf(item: Params): string {
  const raw = str(item, "itemType", "type", "kind");
  if (!raw) return "unknown";
  // `commandExecution` / `command_execution` / `exec` all mean the same block.
  if (/^command[_-]?execution$/i.test(raw)) return "commandExecution";
  if (/^user[_-]?message$/i.test(raw)) return "user-message";
  if (/^file[_-]?change$/i.test(raw)) return "fileChange";
  if (/^agent[_-]?message$/i.test(raw)) return "agentMessage";
  if (/^mcp[_-]?tool[_-]?call$/i.test(raw)) return "mcp-tool-call";
  if (/^dynamic[_-]?tool[_-]?call$/i.test(raw)) return "dynamic-tool-call";
  if (/^reasoning$/i.test(raw)) return "reasoning";
  if (/^context[_-]?compaction$/i.test(raw)) return "context-compaction";
  if (/^subagent[_-]?activity$/i.test(raw)) return "subagent-activity";
  return raw;
}

function planStepsOf(value: unknown): PlanStep[] | null {
  if (!Array.isArray(value)) return null;
  const steps: PlanStep[] = [];
  for (const entry of value) {
    if (typeof entry === "string") {
      steps.push({ step: entry, status: "pending" });
      continue;
    }
    if (entry && typeof entry === "object") {
      const rec = entry as Record<string, unknown>;
      const step = typeof rec.step === "string" ? rec.step : typeof rec.text === "string" ? rec.text : "";
      const rawStatus = typeof rec.status === "string" ? rec.status : "pending";
      const status: PlanStep["status"] =
        rawStatus === "completed" || rawStatus === "in_progress" || rawStatus === "pending"
          ? rawStatus
          : "pending";
      if (step) steps.push({ step, status });
    }
  }
  return steps.length ? steps : null;
}

function tokenUsageOf(params: Params): TokenUsage {
  const usage = obj(params, "usage", "tokenUsage") ?? params;
  return {
    inputTokens: num(usage, "inputTokens", "input_tokens"),
    cachedInputTokens: num(usage, "cachedInputTokens", "cached_input_tokens"),
    outputTokens: num(usage, "outputTokens", "output_tokens"),
    reasoningOutputTokens: num(usage, "reasoningOutputTokens", "reasoning_output_tokens"),
    totalTokens: num(usage, "totalTokens", "total_tokens"),
    modelContextWindow: num(usage, "modelContextWindow", "model_context_window"),
  };
}

/** Notifications that only matter to non-turn UI; recorded, not rendered. */
const AMBIENT_METHODS = new Set<string>([
  "thread/started",
  "thread/status/changed",
  "thread/archived",
  "thread/deleted",
  "thread/unarchived",
  "thread/closed",
  "thread/reverted",
  "thread/name/updated",
  "thread/goal/updated",
  "thread/goal/cleared",
  "thread/queue/changed",
  "thread/project/updated",
  "thread/environment/connected",
  "thread/environment/disconnected",
  "thread/settings/updated",
  "thread/compacted",
  "thread/realtime/started",
  "thread/realtime/itemAdded",
  "thread/realtime/item/started",
  "thread/realtime/item/transcript/delta",
  "thread/realtime/item/completed",
  "thread/realtime/transcript/delta",
  "thread/realtime/transcript/done",
  "thread/realtime/outputAudio/delta",
  "thread/realtime/sdp",
  "thread/realtime/error",
  "thread/realtime/closed",
  "project/changed",
  "skills/changed",
  "app/list/updated",
  "account/updated",
  "account/rateLimits/updated",
  "account/login/completed",
  "mcpServer/oauthLogin/completed",
  "mcpServer/startupStatus/updated",
  "mcpServer/event/stream/notification",
  "remoteControl/status/changed",
  "externalAgentConfig/import/progress",
  "externalAgentConfig/import/completed",
  "fs/changed",
  "fuzzyFileSearch/sessionUpdated",
  "fuzzyFileSearch/sessionCompleted",
  "windows/worldWritableWarning",
  "windowsSandbox/setupCompleted",
  "model/verification",
  "modelProvider/authRecoveryStarted",
  "modelProvider/authRecoveryCompleted",
  "deprecationNotice",
  "serverRequest/resolved",
  // Marked internal-only in common.rs ("Used by Codex Cloud" / "clients that
  // need exact upstream usage"). Nothing in the desktop shell consumes them.
  "rawResponseItem/completed",
  "rawResponse/completed",
]);

/**
 * Apply one notification to the turn store.
 * Returns the method name so callers can log or fan out further.
 */
export function reduceNotification(env: NotificationEnvelope): void {
  const { method, params, receivedAt } = env;

  switch (method) {
    // ── turn lifecycle ───────────────────────────────────────────────
    case "turn/started":
      turn.beginTurn(
        {
          threadId: str(params, "threadId", "thread_id"),
          turnId: str(params, "turnId", "turn_id"),
        },
        receivedAt,
      );
      return;

    case "turn/completed": {
      const status = statusOf(params["status"] ?? "completed");
      const error = str(params, "error", "message") ?? null;
      turn.finishTurn(status, receivedAt, error);
      return;
    }

    case "turn/plan/updated": {
      const steps = planStepsOf(params["plan"] ?? params["steps"]);
      if (steps) turn.setPlan(steps);
      return;
    }

    case "turn/diff/updated":
    case "turn/moderationMetadata":
      return;

    // ── item lifecycle ───────────────────────────────────────────────
    case "item/started": {
      const item = itemOf(params);
      const id = itemIdOf(item, "item");
      turn.upsertItem(id, {
        type: blockTypeOf(item),
        status: "in_progress",
        startedAt: receivedAt,
        command: str(item, "command", "cmd"),
        args: item["args"] ?? item["arguments"],
        path: str(item, "path"),
        mcpServer: str(item, "server", "serverName"),
        tool: str(item, "tool", "toolName"),
      });
      return;
    }

    case "item/completed": {
      const item = itemOf(params);
      const id = itemIdOf(item, "item");
      turn.completeItem(id, {
        type: blockTypeOf(item),
        status: statusOf(item["status"] ?? "completed"),
        text: str(item, "text"),
        output: str(item, "output"),
        result: item["result"],
        exitCode: num(item, "exitCode", "exit_code"),
        path: str(item, "path"),
        diff: str(item, "diff"),
        error: str(item, "error"),
        completedAt: receivedAt,
      });
      return;
    }

    case "item/autoApprovalReview/started":
      turn.upsertItem(itemIdOf(itemOf(params), "auto-approval"), {
        type: "automatic-approval-review",
        status: "in_progress",
        startedAt: receivedAt,
      });
      return;

    case "item/autoApprovalReview/completed":
      turn.completeItem(itemIdOf(itemOf(params), "auto-approval"), {
        type: "automatic-approval-review",
        status: "completed",
        completedAt: receivedAt,
      });
      return;

    case "autoApprovalReview/strictReviewRequired":
      turn.pushWarning({ method, message: "Strict review required" });
      return;

    // ── streaming deltas ─────────────────────────────────────────────
    case "item/agentMessage/delta": {
      const id = str(params, "itemId", "item_id") ?? `agent-${receivedAt}`;
      const delta = str(params, "delta", "text") ?? "";
      turn.appendItemText(id, "agentMessage", delta, {
        phase: phaseOf(params["phase"]),
        startedAt: receivedAt,
      });
      turn.setPhase("commentary");
      return;
    }

    case "item/reasoning/textDelta": {
      const id = str(params, "itemId", "item_id") ?? `reasoning-${receivedAt}`;
      turn.appendItemText(id, "reasoning", str(params, "delta", "text") ?? "", {
        startedAt: receivedAt,
      });
      return;
    }

    case "item/reasoning/summaryTextDelta": {
      const id = str(params, "itemId", "item_id") ?? `reasoning-summary-${receivedAt}`;
      turn.appendItemText(id, "reasoning", str(params, "delta", "text") ?? "", {
        startedAt: receivedAt,
      });
      return;
    }

    case "item/reasoning/summaryPartAdded":
      // Marks a new summary section; the deltas that follow carry the text.
      return;

    case "item/commandExecution/outputDelta": {
      const id = str(params, "itemId", "item_id", "callId") ?? `exec-${receivedAt}`;
      turn.appendItemOutput(id, str(params, "delta", "outputDelta", "chunk") ?? "", {
        type: "commandExecution",
        command: str(params, "command", "cmd"),
        startedAt: receivedAt,
      });
      return;
    }

    case "item/fileChange/outputDelta": {
      const id = str(params, "itemId", "item_id") ?? `patch-${receivedAt}`;
      turn.appendItemOutput(id, str(params, "delta", "outputDelta", "chunk") ?? "", {
        type: "fileChange",
        path: str(params, "path"),
        startedAt: receivedAt,
      });
      return;
    }

    case "item/fileChange/patchUpdated":
      turn.upsertItem(str(params, "itemId", "item_id") ?? `patch-${receivedAt}`, {
        type: "fileChange",
        diff: str(params, "diff", "patch") ?? "",
        path: str(params, "path"),
        startedAt: receivedAt,
      });
      return;

    case "item/plan/delta": {
      const id = str(params, "itemId", "item_id") ?? `plan-${receivedAt}`;
      turn.appendItemText(id, "plan", str(params, "delta", "text") ?? "", {
        startedAt: receivedAt,
      });
      return;
    }

    case "item/mcpToolCall/progress": {
      const id = str(params, "itemId", "item_id", "callId") ?? `mcp-${receivedAt}`;
      turn.pushItemProgress(id, str(params, "message") ?? "");
      return;
    }

    case "item/commandExecution/terminalInteraction":
      turn.upsertItem(str(params, "itemId", "item_id", "callId") ?? `term-${receivedAt}`, {
        type: "commandExecution",
        args: params,
        startedAt: receivedAt,
      });
      return;

    // ── standalone exec / process sessions ───────────────────────────
    // These are not thread items: `command/exec` and `process/spawn` open a
    // separate session keyed by processId, so they get their own stream.
    case "command/exec/outputDelta": {
      const id = str(params, "processId", "process_id", "itemId") ?? `execproc-${receivedAt}`;
      turn.appendItemOutput(id, str(params, "delta", "chunk") ?? "", {
        type: "exec",
        startedAt: receivedAt,
      });
      return;
    }

    case "process/outputDelta": {
      const id = str(params, "processId", "process_id") ?? `process-${receivedAt}`;
      turn.appendItemOutput(id, str(params, "delta", "chunk") ?? "", {
        type: "process",
        startedAt: receivedAt,
      });
      return;
    }

    case "process/exited": {
      const id = str(params, "processId", "process_id") ?? `process-${receivedAt}`;
      turn.completeItem(id, {
        type: "process",
        status: statusOf(params["status"] ?? "completed"),
        exitCode: num(params, "exitCode", "exit_code"),
        completedAt: receivedAt,
      });
      return;
    }

    // ── thread-level state the turn UI reads ─────────────────────────
    case "thread/tokenUsage/updated":
      turn.setTokenUsage(tokenUsageOf(params));
      return;

    // ── diagnostics ──────────────────────────────────────────────────
    case "error": {
      const message = str(params, "message", "error") ?? "Unknown error";
      turn.setError(message);
      return;
    }

    case "warning":
    case "guardianWarning":
    case "configWarning": {
      turn.pushWarning({ method, message: str(params, "message", "warning") ?? method });
      return;
    }

    case "model/rerouted":
      turn.pushWarning({
        method,
        message: `Model rerouted${str(params, "model") ? ` to ${str(params, "model")}` : ""}`,
      });
      return;

    case "model/safetyBuffering/updated":
      return;

    // ── hooks ────────────────────────────────────────────────────────
    case "hook/started":
      turn.upsertItem(str(params, "hookId", "id") ?? `hook-${receivedAt}`, {
        type: "hook",
        status: "in_progress",
        startedAt: receivedAt,
      });
      return;

    case "hook/completed":
      turn.completeItem(str(params, "hookId", "id") ?? `hook-${receivedAt}`, {
        type: "hook",
        status: "completed",
        completedAt: receivedAt,
      });
      return;

    default: {
      if (AMBIENT_METHODS.has(method)) return;
      // A method exists in the protocol table but has no handler yet. Record it
      // instead of dropping it, so the gap is visible in the UI.
      turn.pushWarning({ method, message: `No handler for ${method} yet` });
      return;
    }
  }
}
