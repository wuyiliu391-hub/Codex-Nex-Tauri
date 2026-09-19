/**
 * Browser-dev kernel stub — replays the kernel's command surface in TypeScript.
 *
 * ## Why this exists
 *
 * The desktop app runs the self-developed kernel in-process
 * (`src-tauri/src/kernel`). A browser has no Rust, so `npm run dev:browser`
 * cannot reach that kernel. This module stands in for it so the React UI can be
 * developed and visually checked without building the shell.
 *
 * ## What it is NOT
 *
 * It is **not** a second implementation of the kernel and **not** a live engine
 * connection. It is a deterministic stub:
 *
 *  * thread/turn state lives in a module-level map (per browser session)
 *  * `turn/start` produces a scripted echo response through the real event bus
 *  * anything it cannot faithfully simulate throws, so the UI shows a real
 *    error instead of a fake success
 *
 * Behaviour observed in browser mode says nothing about the real kernel. To
 * exercise the real kernel, run the desktop app or call `kernel_selftest`.
 *
 * The previous implementation opened a WebSocket to the official
 * `codex-app-server` on port 17457. That engine no longer exists, so the
 * transport was replaced with this local stub.
 */

import { bridgeEmit } from "./eventBus";
import { loadShellState, saveShellState, uuidish } from "./shellState";

export interface RpcError {
  code: number;
  message: string;
}

type Json = Record<string, unknown>;

const rec = (v: unknown): Json =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {};

// ── in-memory thread store (per browser session) ────────────────────────────

interface StubTurn {
  id: string;
  input: string[];
  agentText: string;
  status: string;
}

interface StubThread {
  id: string;
  title: string;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
  turns: StubTurn[];
}

const threads = new Map<string, StubThread>();

/** Mirrors `kernel::protocol::event_channel`: / and . both become -. */
const channel = (method: string): string =>
  `codex:${method.replace(/[/.]/g, "-")}`;

const emitNotification = (method: string, params: Json): void => {
  bridgeEmit(channel(method), params);
};

const now = (): number => Date.now();

const threadSummary = (t: StubThread): Json => ({
  id: t.id,
  title: t.title,
  archived: t.archived,
  createdAt: t.createdAt,
  updatedAt: t.updatedAt,
  turnCount: t.turns.length,
});

const transcript = (t: StubThread): Json[] => {
  const items: Json[] = [];
  for (const turn of t.turns) {
    for (const text of turn.input) {
      items.push({
        id: `${turn.id}-user`,
        itemType: "userMessage",
        status: "completed",
        text,
      });
    }
    if (turn.agentText) {
      items.push({
        id: `${turn.id}-agent`,
        itemType: "agentMessage",
        status: turn.status,
        text: turn.agentText,
      });
    }
  }
  return items;
};

// ── scripted turn playback ──────────────────────────────────────────────────

const timers = new Set<ReturnType<typeof setTimeout>>();

/** Split into word-ish pieces so delta accumulation is genuinely exercised. */
function chunkText(text: string): string[] {
  const out: string[] = [];
  let cur = "";
  for (const ch of text) {
    cur += ch;
    if (/\s/.test(ch)) {
      out.push(cur);
      cur = "";
    }
  }
  if (cur) out.push(cur);
  return out.length ? out : [text];
}

/**
 * Play a turn through the real event bus, mirroring the kernel's notification
 * order: turn/started → item/started → deltas → item/completed → tokenUsage →
 * warning (placeholder) → turn/completed.
 */
function playTurn(thread: StubThread, turn: StubTurn): void {
  const text = turn.input.join(" ");
  emitNotification("turn/started", { threadId: thread.id, turnId: turn.id });

  const itemId = `item-${turn.id}`;
  emitNotification("item/started", {
    threadId: thread.id,
    turnId: turn.id,
    item: { id: itemId, itemType: "agentMessage", status: "inProgress" },
  });

  const pieces = chunkText(text);
  let i = 0;
  const step = (): void => {
    if (turn.status === "interrupted") return;

    if (i < pieces.length) {
      const delta = pieces[i] ?? "";
      turn.agentText += delta;
      emitNotification("item/agentMessage/delta", {
        threadId: thread.id,
        turnId: turn.id,
        itemId,
        delta,
        phase: "commentary",
      });
      i += 1;
      const t = setTimeout(step, 18);
      timers.add(t);
      return;
    }

    turn.status = "completed";
    thread.updatedAt = now();
    emitNotification("item/agentMessage/delta", {
      threadId: thread.id,
      turnId: turn.id,
      itemId,
      delta: "",
      phase: "final_answer",
    });
    emitNotification("item/completed", {
      threadId: thread.id,
      turnId: turn.id,
      item: {
        id: itemId,
        itemType: "agentMessage",
        status: "completed",
        text: turn.agentText,
      },
    });
    emitNotification("thread/tokenUsage/updated", {
      threadId: thread.id,
      turnId: turn.id,
      usage: {
        inputTokens: Math.max(1, Math.ceil(text.length / 4)),
        outputTokens: Math.max(1, Math.ceil(text.length / 4)),
        totalTokens: Math.max(2, Math.ceil(text.length / 2)),
      },
    });
    // Honest disclosure, matching the desktop EchoProvider.
    emitNotification("warning", {
      threadId: thread.id,
      message:
        "Browser-dev stub reply — not a model. Run the desktop app to exercise the real kernel.",
    });
    emitNotification("turn/completed", {
      threadId: thread.id,
      turnId: turn.id,
      status: "completed",
    });
    emitNotification("thread/status/changed", {
      threadId: thread.id,
      status: "completed",
    });
  };
  const t = setTimeout(step, 10);
  timers.add(t);
}

// ── RPC dispatch ────────────────────────────────────────────────────────────

function notWired(method: string): never {
  throw new Error(
    `browser-dev stub: '${method}' is not simulated. Run the desktop app to use the real kernel.`,
  );
}

function requireThread(id: string): StubThread {
  const t = threads.get(id);
  if (!t) throw new Error(`thread not found: ${id}`);
  return t;
}

async function dispatch(method: string, params: Json): Promise<unknown> {
  switch (method) {
    // ── threads ──────────────────────────────────────────────────────────
    case "thread/start": {
      const id = uuidish();
      const t: StubThread = {
        id,
        title: "New task",
        archived: false,
        createdAt: now(),
        updatedAt: now(),
        turns: [],
      };
      threads.set(id, t);
      emitNotification("thread/started", { threadId: id, title: t.title });
      return { thread: { id } };
    }

    case "thread/list": {
      const want = params["archived"];
      const data = [...threads.values()]
        .filter((t) => (typeof want === "boolean" ? t.archived === want : true))
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map(threadSummary);
      return { data };
    }

    case "thread/read": {
      const t = requireThread(String(params["threadId"] ?? ""));
      return { ...threadSummary(t), messages: transcript(t) };
    }

    case "thread/delete": {
      const id = String(params["threadId"] ?? "");
      requireThread(id);
      threads.delete(id);
      emitNotification("thread/deleted", { threadId: id });
      return null;
    }

    case "thread/archive":
    case "thread/unarchive": {
      const id = String(params["threadId"] ?? "");
      const t = requireThread(id);
      t.archived = method === "thread/archive";
      t.updatedAt = now();
      emitNotification(t.archived ? "thread/archived" : "thread/unarchived", {
        threadId: id,
      });
      return null;
    }

    case "thread/timeline/list": {
      const t = requireThread(String(params["threadId"] ?? ""));
      return { data: transcript(t) };
    }

    // ── turns ────────────────────────────────────────────────────────────
    case "turn/start": {
      const t = requireThread(String(params["threadId"] ?? ""));
      if (t.turns.some((x) => x.status === "running")) {
        throw new Error("thread already has a running turn");
      }
      const input = params["input"];
      const texts: string[] = [];
      if (Array.isArray(input)) {
        for (const part of input) {
          const text = rec(part)["text"];
          if (typeof text === "string" && text) texts.push(text);
        }
      }
      if (!texts.length) throw new Error("turn/start: no text input");

      const turn: StubTurn = {
        id: uuidish(),
        input: texts,
        agentText: "",
        status: "running",
      };
      t.turns.push(turn);
      if (t.title === "New task") t.title = (texts[0] ?? "").slice(0, 60);
      t.updatedAt = now();
      playTurn(t, turn);
      return { turnId: turn.id };
    }

    case "turn/interrupt": {
      const t = requireThread(String(params["threadId"] ?? ""));
      const active = [...t.turns].reverse().find((x) => x.status === "running");
      if (!active) return { cancelled: false };
      active.status = "interrupted";
      t.updatedAt = now();
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      emitNotification("turn/completed", {
        threadId: t.id,
        turnId: active.id,
        status: "interrupted",
      });
      return { cancelled: true };
    }

    // ── config ───────────────────────────────────────────────────────────
    case "config/read": {
      const state = loadShellState();
      // Browser mode has no engine config.toml, so provider endpoints recorded
      // by `config/batchWrite` live under `preferences.provider_endpoints`.
      const endpoints = rec(state.preferences["provider_endpoints"]);
      const providers: Json = {};
      for (const [id, base] of Object.entries(endpoints)) {
        providers[id] = { base_url: base };
      }
      return { config: { model_providers: providers } };
    }

    case "config/batchWrite": {
      // Record the intent locally so the UI round-trips. Nothing is written to
      // disk: there is no engine config.toml in a browser.
      const state = loadShellState();
      const endpoints = rec(state.preferences["provider_endpoints"]);
      const edits = params["edits"];
      if (Array.isArray(edits)) {
        for (const e of edits) {
          const keyPath = String(rec(e)["keyPath"] ?? "");
          const value = rec(e)["value"];
          const m = /^model_providers\.([^.]+)\.base_url$/.exec(keyPath);
          if (m && typeof value === "string" && m[1]) {
            endpoints[m[1]] = value;
          }
        }
        state.preferences["provider_endpoints"] = endpoints;
        saveShellState();
      }
      return {
        ok: true,
        note: "browser-dev: recorded locally, no config.toml exists here",
      };
    }

    case "config/value/write":
      return { ok: true };

    // ── everything else: honest refusal ──────────────────────────────────
    case "config/mcpServer/reload":
    case "mcpServerStatus/list":
    case "skills/list":
    case "plugin/list":
    case "plugin/install":
    case "plugin/uninstall":
    case "command/exec":
    case "command/exec/write":
    case "command/exec/terminate":
    case "thread/shellCommand":
      return notWired(method);

    default:
      return notWired(method);
  }
}

// ── public surface (unchanged from the old WS client) ───────────────────────

/** Browser mode always has a usable stub kernel. */
export function engineConnected(): boolean {
  return true;
}

export function engineInitializeMeta(): Record<string, unknown> | null {
  return {
    name: "codex-desktop-tauri",
    title: "Codex Desktop (Tauri) — browser-dev stub",
    stub: true,
  };
}

export async function rpcRequest(
  method: string,
  params: Json = {},
  _timeoutMs = 120_000,
): Promise<unknown> {
  return dispatch(method, params);
}

/**
 * Server-request replies. The stub raises no approvals, so a reply has nothing
 * to resolve — reporting that is better than pretending it worked.
 */
export function rpcRespond(id: unknown, _result: unknown, _error?: RpcError): void {
  console.warn(
    `[devbridge] rpcRespond(${String(id)}) ignored: the browser stub raises no server requests.`,
  );
}
