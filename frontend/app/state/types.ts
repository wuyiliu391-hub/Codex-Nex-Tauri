/**
 * Turn-stream data model.
 *
 * Shapes follow the official app-server payloads as observed in
 * `common.rs` / `conversation-blocks-*.js`. Items are keyed by id with a
 * separate `order` array so lookups stay O(1) while render order stays stable.
 */

import type { ItemStatus, TurnPhase } from "@protocol/status";

/** One renderable unit in the turn stream. */
export interface TurnItem {
  /** Server-assigned item id (stable across item/started → item/completed). */
  id: string;
  /** Official block tag, e.g. `agentMessage`, `commandExecution`, `reasoning`. */
  type: string;
  status: ItemStatus;

  /** Streamed prose (agentMessage / reasoning / realtime-transcript). */
  text?: string;
  /** Phase reported on agent messages: `commentary` | `final_answer`. */
  phase?: TurnPhase;

  // ── tool / command payloads ──
  command?: string;
  args?: unknown;
  result?: unknown;
  output?: string;
  /** Exit code for command executions. */
  exitCode?: number;
  path?: string;
  diff?: string;
  /** MCP server name for mcp-tool-call items. */
  mcpServer?: string;
  /** Tool name within the server. */
  tool?: string;
  /** Accumulated `item/mcpToolCall/progress` messages, in arrival order. */
  progress: string[];

  // ── timing (null rather than undefined: the UI distinguishes "not reported") ──
  startedAt: number | null;
  completedAt: number | null;
  durationMs: number | null;

  error?: string;
}

/** Token accounting from `thread/tokenUsage/updated`. */
export interface TokenUsage {
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
  reasoningOutputTokens?: number;
  totalTokens?: number;
  modelContextWindow?: number;
}

/** A step in the agent's plan (`turn/plan/updated`). */
export interface PlanStep {
  step: string;
  status: "pending" | "in_progress" | "completed";
}

/** A warning surfaced by the server (`warning`, `configWarning`, …). */
export interface ServerWarning {
  method: string;
  message: string;
  at: number;
}

/** A server→client request awaiting a reply (approval, user input, …). */
export interface PendingRequest {
  id: string | number;
  method: string;
  params: Record<string, unknown>;
  receivedAt: number;
}

/** Everything the UI needs to render the in-flight turn. */
export interface TurnState {
  sessionId: string | null;
  turnId: string | null;

  /** True between `turn/started` and `turn/completed`. */
  active: boolean;
  /** `idle` before any turn, otherwise the server-reported phase. */
  phase: TurnPhase | "idle";
  /** Set once `turn/completed` arrives. */
  turnStatus: ItemStatus | null;

  /** Items keyed by id, plus the arrival order for stable rendering. */
  items: Record<string, TurnItem>;
  order: string[];

  startedAt: number | null;
  completedAt: number | null;
  durationMs: number | null;

  error: string | null;

  /** Reconnect strip (`正在重新连接 N/5`). */
  reconnectAttempt: number;
  reconnectFrozen: boolean;

  tokenUsage: TokenUsage | null;
  plan: PlanStep[] | null;
  warnings: ServerWarning[];
  pendingRequests: PendingRequest[];
}

export function emptyTurn(): TurnState {
  return {
    sessionId: null,
    turnId: null,
    active: false,
    phase: "idle",
    turnStatus: null,
    items: {},
    order: [],
    startedAt: null,
    completedAt: null,
    durationMs: null,
    error: null,
    reconnectAttempt: 0,
    reconnectFrozen: false,
    tokenUsage: null,
    plan: null,
    warnings: [],
    pendingRequests: [],
  };
}

/** Build a fresh item with the required fields filled in. */
export function newItem(id: string, type: string, patch: Partial<TurnItem> = {}): TurnItem {
  return {
    id,
    type,
    status: "in_progress",
    progress: [],
    startedAt: null,
    completedAt: null,
    durationMs: null,
    ...patch,
  };
}
