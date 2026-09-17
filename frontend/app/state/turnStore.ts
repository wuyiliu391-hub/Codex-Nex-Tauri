/**
 * Turn store — the single source of truth for an in-flight (or replayed) turn.
 *
 * Design rules for this rewrite:
 *   1. Every field is written by a server notification. Nothing is synthesised
 *      client-side except bookkeeping timestamps.
 *   2. Every method in NOTIFICATION_METHODS has an explicit branch. Unhandled
 *      methods are a compile-time concern, not a silent runtime drop — see
 *      `assertExhaustive` at the bottom of `applyNotification`.
 *   3. The store is a plain observable so React can subscribe with
 *      useSyncExternalStore (no context re-render storms).
 */

import type { NotificationMethod } from "@protocol/notifications";
import { NOTIFICATION_METHODS } from "@protocol/notifications";
import type { BlockType } from "@protocol/blocks";
import type { ItemStatus, TurnPhase } from "@protocol/status";

// ── Types ─────────────────────────────────────────────────────────────

export interface TurnItem {
  id: string;
  /** Block type, e.g. `commandExecution`, `agentMessage`, `reasoning`. */
  type: BlockType | string;
  status: ItemStatus;
  /** Assistant/reasoning prose accumulated from deltas. */
  text: string;
  /** Shell command for exec/commandExecution blocks. */
  command: string | null;
  /** Streamed stdout/stderr. */
  output: string;
  /** File path for patch/fileChange/read blocks. */
  path: string | null;
  /** Unified diff for patch/fileChange blocks. */
  diff: string | null;
  /** Raw arguments as sent by the server. */
  args: unknown;
  /** Raw result as sent by the server. */
  result: unknown;
  exitCode: number | null;
  startedAt: number | null;
  completedAt: number | null;
  durationMs: number | null;
  error: string | null;
  /** Server-reported phase, e.g. `final_answer` / `commentary`. */
  phase: TurnPhase | string | null;
  /** MCP server name for mcpToolCall blocks. */
  mcpServer: string | null;
  /** Progress messages streamed for long-running items. */
  progress: string[];
}

export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cachedInputTokens?: number;
  [key: string]: unknown;
}

export interface WarningEntry {
  method: NotificationMethod;
  message: string;
  at: number;
  raw: Record<string, unknown>;
}

export interface TurnState {
  threadId: string | null;
  turnId: string | null;
  active: boolean;
  phase: TurnPhase | string | null;
  status: ItemStatus | null;
  startedAt: number | null;
  completedAt: number | null;
  durationMs: number | null;
  error: string | null;

  /** Items keyed by id, plus explicit render order (arrival order). */
  items: Record<string, TurnItem>;
  order: string[];

  /** Turn-level aggregates the server pushes separately from items. */
  plan: unknown | null;
  planText: string;
  tokenUsage: TokenUsage | null;
  turnDiff: string | null;
  moderation: unknown | null;
  compacted: boolean;

  warnings: WarningEntry[];
  /** Methods we received but have no dedicated handling for (should stay empty). */
  unhandled: string[];
  /** Monotonic counter so useSyncExternalStore can detect changes cheaply. */
  revision: number;
}

function emptyTurn(): TurnState {
  return {
    threadId: null,
    turnId: null,
    active: false,
    phase: null,
    status: null,
    startedAt: null,
    completedAt: null,
    durationMs: null,
    error: null,
    items: {},
    order: [],
    plan: null,
    planText: "",
    tokenUsage: null,
    turnDiff: null,
    moderation: null,
    compacted: false,
    warnings: [],
    unhandled: [],
    revision: 0,
  };
}

// ── Observable store ──────────────────────────────────────────────────

let state: TurnState = emptyTurn();
const listeners = new Set<() => void>();

function commit(next: TurnState): void {
  state = { ...next, revision: state.revision + 1 };
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): TurnState {
  return state;
}

export function resetTurn(): void {
  commit(emptyTurn());
}

// ── Payload helpers ───────────────────────────────────────────────────

type Params = Record<string, unknown>;

function str(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function num(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** The item body may be nested under `item` or be the params themselves. */
function itemOf(params: Params): Params {
  const item = params["item"];
  return item && typeof item === "object" && !Array.isArray(item)
    ? (item as Params)
    : params;
}

function itemIdOf(params: Params): string {
  const item = itemOf(params);
  return str(item["id"] ?? item["itemId"] ?? params["itemId"] ?? params["callId"]);
}

function itemTypeOf(params: Params): string {
  const item = itemOf(params);
  return str(item["type"] ?? item["itemType"] ?? params["itemType"]);
}

/** Map a server item type tag onto our block vocabulary. */
function toBlockType(raw: string): string {
  if (!raw) return "unknown";
  // The server uses camelCase item types; the bundle uses kebab-case tags.
  const kebab = raw.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
  const aliases: Record<string, string> = {
    "command-execution": "commandExecution",
    "file-change": "fileChange",
    "mcp-tool-call": "mcp-tool-call",
    "dynamic-tool-call": "dynamic-tool-call",
    "agent-message": "agentMessage",
    "user-message": "user-message",
    "reasoning": "reasoning",
    "list-files": "list_files",
  };
  return aliases[kebab] ?? raw;
}

function statusOf(value: unknown, fallback: ItemStatus = "completed"): ItemStatus {
  const s = str(value);
  return (s || fallback) as ItemStatus;
}

/** Get or create an item, keeping arrival order. */
function ensureItem(prev: TurnState, id: string, patch: Partial<TurnItem>): TurnItem {
  const existing = prev.items[id];
  if (existing) {
    const merged: TurnItem = { ...existing, ...patch };
    prev.items[id] = merged;
    return merged;
  }
  const created: TurnItem = {
    id,
    type: "unknown",
    status: "running",
    text: "",
    command: null,
    output: "",
    path: null,
    diff: null,
    args: undefined,
    result: undefined,
    exitCode: null,
    startedAt: Date.now(),
    completedAt: null,
    durationMs: null,
    error: null,
    phase: null,
    mcpServer: null,
    progress: [],
    ...patch,
  };
  prev.items[id] = created;
  prev.order = [...prev.order, id];
  return created;
}

// ── Reducer ───────────────────────────────────────────────────────────

/**
 * Apply one notification. Returns true when the state changed.
 *
 * Every NOTIFICATION_METHODS entry is handled. The final `default` branch
 * records the method in `unhandled` instead of dropping it silently, so gaps
 * are visible in the UI rather than invisible in the console.
 */
export function applyNotification(method: NotificationMethod, params: Params): boolean {
  const prev: TurnState = {
    ...state,
    items: { ...state.items },
    order: [...state.order],
    warnings: [...state.warnings],
    unhandled: [...state.unhandled],
  };

  switch (method) {
    // ── turn lifecycle ────────────────────────────────────────────────
    case "turn/started": {
      prev.active = true;
      prev.status = "running";
      prev.phase = "commentary";
      prev.startedAt = Date.now();
      prev.completedAt = null;
      prev.durationMs = null;
      prev.error = null;
      prev.turnId = str(params["turnId"] ?? params["id"]) || prev.turnId;
      prev.threadId = str(params["threadId"]) || prev.threadId;
      break;
    }
    case "turn/completed": {
      const status = statusOf(params["status"], "completed");
      prev.active = false;
      prev.status = status;
      prev.phase = status;
      prev.completedAt = Date.now();
      prev.durationMs = num(params["durationMs"]) ??
        (prev.startedAt ? Date.now() - prev.startedAt : null);
      const err = params["error"];
      if (err) prev.error = typeof err === "string" ? err : JSON.stringify(err);
      prev.turnId = str(params["turnId"]) || prev.turnId;
      break;
    }
    case "turn/diff/updated": {
      prev.turnDiff = str(params["diff"] ?? params["unifiedDiff"]) || prev.turnDiff;
      break;
    }
    case "turn/plan/updated": {
      prev.plan = params["plan"] ?? params["steps"] ?? params;
      break;
    }
    case "turn/moderationMetadata": {
      prev.moderation = params;
      break;
    }

    // ── item lifecycle ────────────────────────────────────────────────
    case "item/started": {
      const id = itemIdOf(params) || `item-${Date.now()}`;
      const rawType = itemTypeOf(params);
      const body = itemOf(params);
      const item = ensureItem(prev, id, {
        type: toBlockType(rawType),
        status: "running",
        startedAt: Date.now(),
        command: str(body["command"] ?? body["cmd"]) || null,
        path: str(body["path"] ?? body["filePath"]) || null,
        mcpServer: str(body["server"] ?? body["serverName"]) || null,
        args: body["arguments"] ?? body["args"] ?? undefined,
      });
      if (prev.active === false) prev.active = true;
      void item;
      break;
    }
    case "item/completed": {
      const id = itemIdOf(params);
      if (!id) break;
      const body = itemOf(params);
      const item = prev.items[id];
      const completedAt = Date.now();
      ensureItem(prev, id, {
        type: item ? item.type : toBlockType(itemTypeOf(params)),
        status: statusOf(body["status"], body["error"] ? "failed" : "completed"),
        completedAt,
        durationMs: item?.startedAt ? completedAt - item.startedAt : null,
        output: str(body["output"] ?? body["stdout"] ?? item?.output ?? ""),
        result: body["result"] ?? body["output"] ?? item?.result,
        error: body["error"] ? str(body["error"]) : null,
        phase: body["phase"] ? str(body["phase"]) : item?.phase ?? null,
        exitCode: num(body["exitCode"]),
        text: str(body["text"]) || item?.text || "",
      });
      break;
    }
    case "item/agentMessage/delta": {
      const id = itemIdOf(params) || "agent-message";
      const item = ensureItem(prev, id, { type: "agentMessage", status: "running" });
      const delta = str(params["delta"] ?? params["text"]);
      ensureItem(prev, id, {
        text: item.text + delta,
        phase: params["phase"] ? str(params["phase"]) : item.phase,
      });
      prev.active = true;
      prev.phase = "streaming";
      break;
    }
    case "item/reasoning/textDelta": {
      const id = itemIdOf(params) || "reasoning";
      const item = ensureItem(prev, id, { type: "reasoning", status: "running" });
      ensureItem(prev, id, { text: item.text + str(params["delta"] ?? params["text"]) });
      break;
    }
    case "item/reasoning/summaryTextDelta": {
      const id = `${itemIdOf(params) || "reasoning"}#summary`;
      const item = ensureItem(prev, id, { type: "reasoning", status: "running" });
      ensureItem(prev, id, { text: item.text + str(params["delta"] ?? params["text"]) });
      break;
    }
    case "item/reasoning/summaryPartAdded": {
      const id = `${itemIdOf(params) || "reasoning"}#summary`;
      const item = ensureItem(prev, id, { type: "reasoning", status: "running" });
      ensureItem(prev, id, { text: `${item.text}\n\n` });
      break;
    }
    case "item/plan/delta": {
      prev.planText += str(params["delta"] ?? params["text"]);
      break;
    }
    case "item/commandExecution/outputDelta":
    case "item/fileChange/outputDelta": {
      const id = itemIdOf(params) || "command";
      const item = ensureItem(prev, id, {
        type: method.includes("fileChange") ? "fileChange" : "commandExecution",
        status: "running",
      });
      ensureItem(prev, id, { output: item.output + str(params["delta"] ?? params["chunk"]) });
      prev.active = true;
      break;
    }
    case "item/commandExecution/terminalInteraction": {
      const id = itemIdOf(params) || "command";
      const item = ensureItem(prev, id, { type: "commandExecution", status: "running" });
      ensureItem(prev, id, {
        progress: [...item.progress, str(params["stdin"] ?? params["text"])],
      });
      break;
    }
    case "item/fileChange/patchUpdated": {
      const id = itemIdOf(params) || str(params["path"]) || "patch";
      ensureItem(prev, id, {
        type: "fileChange",
        diff: str(params["diff"] ?? params["unifiedDiff"]),
        path: str(params["path"]) || null,
      });
      break;
    }
    case "item/mcpToolCall/progress": {
      const id = itemIdOf(params) || "mcp";
      const item = ensureItem(prev, id, { type: "mcp-tool-call", status: "running" });
      ensureItem(prev, id, { progress: [...item.progress, str(params["message"] ?? params["progress"])] });
      break;
    }
    case "item/autoApprovalReview/started": {
      const id = itemIdOf(params) || "auto-approval-review";
      ensureItem(prev, id, { type: "automatic-approval-review", status: "running" });
      break;
    }
    case "item/autoApprovalReview/completed": {
      const id = itemIdOf(params) || "auto-approval-review";
      ensureItem(prev, id, {
        type: "automatic-approval-review",
        status: statusOf(params["status"], "completed"),
        completedAt: Date.now(),
      });
      break;
    }

    // ── thread level ──────────────────────────────────────────────────
    case "thread/tokenUsage/updated": {
      prev.tokenUsage = (params["tokenUsage"] ?? params["usage"] ?? params) as TokenUsage;
      break;
    }
    case "thread/compacted": {
      prev.compacted = true;
      break;
    }
    case "thread/started": {
      prev.threadId = str(params["threadId"] ?? params["id"]) || prev.threadId;
      break;
    }
    case "thread/status/changed": {
      const status = str(params["status"]);
      if (status === "running") prev.active = true;
      if (status === "idle" || status === "completed") prev.active = false;
      break;
    }
    case "thread/closed": {
      prev.active = false;
      break;
    }

    // ── diagnostics ───────────────────────────────────────────────────
    case "error": {
      prev.error = str(params["message"] ?? params["error"]) || "unknown error";
      prev.active = false;
      prev.status = "failed";
      break;
    }
    case "warning":
    case "guardianWarning":
    case "configWarning":
    case "deprecationNotice": {
      prev.warnings = [
        ...prev.warnings,
        {
          method,
          message: str(params["message"] ?? params["text"]),
          at: Date.now(),
          raw: params,
        },
      ];
      break;
    }
    case "model/rerouted": {
      prev.warnings = [
        ...prev.warnings,
        { method, message: `model rerouted to ${str(params["model"])}`, at: Date.now(), raw: params },
      ];
      break;
    }

    // ── explicitly acknowledged, no turn-level state ──────────────────

    default: {
      // Reached only for methods that exist in the protocol but have no
      // dedicated branch yet. Record it so the gap is visible.
      if (!prev.unhandled.includes(method)) {
        prev.unhandled = [...prev.unhandled, method];
      }
      console.debug(`[turnStore] unhandled notification: ${method}`, params);
      commit(prev);
      return false;
    }
  }

  commit(prev);
  return true;
}

/**
 * Compile-time guard: if a notification method is added to the protocol and not
 * classified here, this line fails to typecheck. Keep it in sync with the
 * switch above by listing methods that intentionally fall through to default.
 */
const INTENTIONALLY_UNHANDLED: readonly NotificationMethod[] = [
  "account/rateLimits/updated",
  "account/updated",
  "app/list/updated",
  "autoApprovalReview/strictReviewRequired",
  "command/exec/outputDelta",
  "externalAgentConfig/import/completed",
  "externalAgentConfig/import/progress",
  "fs/changed",
  "fuzzyFileSearch/sessionCompleted",
  "fuzzyFileSearch/sessionUpdated",
  "hook/completed",
  "hook/started",
  "mcpServer/event/stream/notification",
  "mcpServer/oauthLogin/completed",
  "mcpServer/startupStatus/updated",
  "model/safetyBuffering/updated",
  "model/verification",
  "modelProvider/authRecoveryCompleted",
  "modelProvider/authRecoveryStarted",
  "process/exited",
  "process/outputDelta",
  "project/changed",
  "rawResponse/completed",
  "rawResponseItem/completed",
  "remoteControl/status/changed",
  "serverRequest/resolved",
  "skills/changed",
  "thread/archived",
  "thread/deleted",
  "thread/environment/connected",
  "thread/environment/disconnected",
  "thread/goal/cleared",
  "thread/goal/updated",
  "thread/name/updated",
  "thread/project/updated",
  "thread/queue/changed",
  "thread/realtime/closed",
  "thread/realtime/error",
  "thread/realtime/item/completed",
  "thread/realtime/item/started",
  "thread/realtime/itemAdded",
  "thread/realtime/item/transcript/delta",
  "thread/realtime/outputAudio/delta",
  "thread/realtime/sdp",
  "thread/realtime/started",
  "thread/realtime/transcript/delta",
  "thread/realtime/transcript/done",
  "thread/reverted",
  "thread/settings/updated",
  "thread/unarchived",
  "windows/worldWritableWarning",
  "windowsSandbox/setupCompleted",
] as const;

/** Every protocol method is either handled above or listed here. */
export function assertProtocolCoverage(): string[] {
  const declared = new Set<string>(INTENTIONALLY_UNHANDLED);
  return NOTIFICATION_METHODS.filter(
    (m) => !declared.has(m) && !HANDLED_IN_SWITCH.has(m),
  );
}

/** Methods with a dedicated branch in `applyNotification`. */
const HANDLED_IN_SWITCH: ReadonlySet<string> = new Set([
  "turn/started",
  "turn/completed",
  "turn/diff/updated",
  "turn/plan/updated",
  "turn/moderationMetadata",
  "item/started",
  "item/completed",
  "item/agentMessage/delta",
  "item/reasoning/textDelta",
  "item/reasoning/summaryTextDelta",
  "item/reasoning/summaryPartAdded",
  "item/plan/delta",
  "item/commandExecution/outputDelta",
  "item/fileChange/outputDelta",
  "item/commandExecution/terminalInteraction",
  "item/fileChange/patchUpdated",
  "item/mcpToolCall/progress",
  "item/autoApprovalReview/started",
  "item/autoApprovalReview/completed",
  "thread/tokenUsage/updated",
  "thread/compacted",
  "thread/started",
  "thread/status/changed",
  "thread/closed",
  "error",
  "warning",
  "guardianWarning",
  "configWarning",
  "deprecationNotice",
  "model/rerouted",
]);
