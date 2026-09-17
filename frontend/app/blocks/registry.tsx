/**
 * Block renderer registry — emits the vanilla render.js DOM contract.
 *
 * home.css was written against:
 *   .thread
 *     > .message-row(.user) > .message-body > .message-part.part-text
 *     > .proc-line.is-*.kind-* > .proc-head + .proc-body
 *     > .diff-card > .diff-head + .diff-line
 *     > .plan-list > .plan-item > .step-status
 *
 * Earlier React ports invented .block / .block-prose / .block-tool wrappers
 * that no stylesheet targets, so the thread lost every visual rule. This file
 * deliberately restores the old class names and hierarchy. Dynamic class
 * strings are written as React conditionals, not post-mount classList writes.
 */

import { useState, type ComponentType, type ReactNode } from "react";
import type { TurnItem } from "@/state/turnStore";
import type { BlockType } from "@protocol/blocks";
import { t as tRaw } from "../../src/js/i18n.js";

/** i18n.js is untyped; wrap so vars are accepted without fighting TS. */
function t(key: string, fallback = "", vars?: Record<string, string | number>): string {
  return String(tRaw(key, fallback, (vars ?? null) as null));
}

export interface BlockProps {
  item: TurnItem;
}

// ── helpers (ported from render.js) ───────────────────────────────────

/** Official duration strings: 460ms / 3s / 1m 5s. */
function formatDuration(ms: number | null | undefined): string {
  if (!ms || ms < 0) return "";
  if (ms < 1000) return `${ms}ms`;
  const totalSec = ms / 1000;
  if (totalSec < 60) {
    const s = totalSec < 10 ? totalSec.toFixed(1) : String(Math.floor(totalSec));
    return `${s}s`;
  }
  const m = Math.floor(totalSec / 60);
  const s = Math.floor(totalSec % 60);
  return s ? `${m}m ${s}s` : `${m}m`;
}

function classifyTool(name = ""): string {
  const n = String(name).toLowerCase();
  if (/write|create|apply_patch|edit|str_replace|patch/.test(n)) return "write";
  if (/shell|bash|powershell|cmd|exec|terminal|run/.test(n)) return "shell";
  if (/grep|search|rg|find|glob/.test(n)) return "search";
  if (/read|list|cat|ls|view/.test(n)) return "read";
  if (/browser|navigate|click|screenshot|cdp/.test(n)) return "browser";
  if (/mcp__/.test(n)) return "mcp";
  return "other";
}

/** Map protocol status → the is-* token home.css uses on .proc-line. */
function procStatusClass(status: string): string {
  switch (status) {
    case "running":
    case "in_progress":
    case "inProgress":
      return "is-running";
    case "waiting_approval":
      return "is-waiting_approval";
    case "denied":
      return "is-denied";
    case "failed":
    case "error":
      return "is-error";
    case "interrupted":
      return "is-done";
    default:
      return "is-done";
  }
}

function prettyText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function toolLabel(item: TurnItem): string {
  const kind = classifyTool(item.tool ?? item.command ?? item.type);
  const status = procStatusClass(item.status);
  const name = item.command || item.tool || item.mcpServer || item.type;

  if (status === "is-running") {
    return kind === "shell"
      ? String(t("process.runningCmd", "Running {name}", { name }))
      : String(t("process.runningPrefix", "Running"));
  }
  if (status === "is-waiting_approval") {
    return String(t("process.needsApproval", "Needs approval"));
  }
  if (status === "is-denied") {
    return String(t("process.deniedPrefix", "Denied"));
  }
  if (status === "is-error") {
    return String(t("process.failedPrefix", "Failed"));
  }
  if (kind === "write") {
    return item.path
      ? String(t("process.wrotePrefix", "Wrote"))
      : String(t("process.wrote", "Wrote {name}", { name }));
  }
  if (kind === "shell") {
    return String(t("process.ranCmd", "Ran {name}", { name }));
  }
  if (kind === "search") {
    return String(t("process.searchedPrefix", "Searched"));
  }
  if (kind === "read") {
    return String(t("process.readPrefix", "Read"));
  }
  return name;
}

// ── prose ─────────────────────────────────────────────────────────────

/** Streamed assistant / user prose as .message-row > .message-body > .part-text. */
function ProseBlock({ item, isUser = false }: BlockProps & { isUser?: boolean }) {
  const text = item.text ?? "";
  return (
    <div
      className={`message-row${isUser ? " user" : ""}`}
      data-message-id={item.id}
      data-block-type={item.type}
    >
      <div className="message-body">
        {item.durationMs ? (
          <div className="turn-head">
            <span className="turn-elapsed">
              {String(
                t("process.elapsed", "Processed {time}", {
                  time: formatDuration(item.durationMs),
                }),
              )}
            </span>
          </div>
        ) : null}
        <div className="message-part part-text">{text}</div>
      </div>
    </div>
  );
}

function UserProseBlock({ item }: BlockProps) {
  return <ProseBlock item={item} isUser />;
}

/** Reasoning streams — official client shows them collapsed inside the body. */
function ReasoningBlock({ item }: BlockProps) {
  return (
    <div className="message-row" data-block-type="reasoning" data-message-id={item.id}>
      <div className="message-body">
        <div className="message-part part-text" style={{ color: "var(--fg-muted, var(--fg-description))" }}>
          {item.text ?? ""}
        </div>
      </div>
    </div>
  );
}

// ── tools ─────────────────────────────────────────────────────────────

/**
 * Tool / command row — the unit home.css styles.
 * Expand/collapse is local React state; no post-mount classList writes.
 */
function ProcLine({
  item,
  kind,
  className = "",
  forceOpen = false,
}: BlockProps & { kind: string; className?: string; forceOpen?: boolean }) {
  const status = procStatusClass(item.status);
  const detail = [prettyText(item.args), item.output, item.diff, item.error, item.result]
    .filter(Boolean)
    .join("\n\n");
  const hasDetail = detail.length > 0 || status === "is-waiting_approval";
  const startsOpen =
    forceOpen || status === "is-waiting_approval" || status === "is-error" || status === "is-denied";
  const [open, setOpen] = useState(startsOpen);

  const label = toolLabel(item);
  const path = item.path ? String(item.path).replace(/\\/g, "/") : "";
  const base = path ? path.slice(path.lastIndexOf("/") + 1) : "";

  return (
    <div
      className={`proc-line ${status} kind-${kind}${className ? ` ${className}` : ""}`}
      data-call-id={item.command ?? item.tool ?? undefined}
      data-block-type={item.type}
    >
      <button
        type="button"
        className="proc-head"
        disabled={!hasDetail}
        onClick={() => hasDetail && setOpen((v) => !v)}
      >
        <span className="proc-label">
          {label}
          {base ? <span className="proc-file"> · {base}</span> : null}
        </span>
        {item.durationMs ? (
          <span className="proc-dur">{formatDuration(item.durationMs)}</span>
        ) : null}
        {hasDetail ? <span className={`proc-chevron${open ? " open" : ""}`}>▾</span> : null}
      </button>
      <div className="proc-body" hidden={!open}>
        {item.error ? <div className="proc-summary">{item.error}</div> : null}
        {detail ? <pre className="proc-pre">{detail}</pre> : null}
        {item.progress.length > 0 ? (
          <div className="proc-section">
            {item.progress.map((p, i) => (
              <div className="proc-summary" key={i}>
                {p}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ToolBlock({ item }: BlockProps) {
  const kind = classifyTool(item.tool ?? item.command ?? item.type);
  return <ProcLine item={item} kind={kind} />;
}

function McpBlock({ item }: BlockProps) {
  return <ProcLine item={item} kind="mcp" />;
}

// ── consecutive-done tool grouping (render.js renderGroupedProcess) ───

/** Item types that participate in consecutive-done grouping. */
const TOOL_TYPES = new Set<string>([
  "commandExecution",
  "exec",
  "mcp-tool-call",
  "mcpToolCall",
  "dynamic-tool-call",
  "dynamicToolCall",
  "search",
  "read",
  "list_files",
  "install",
  "plugin",
  "update",
  "delete",
  "add",
  "automatic-approval-review",
  "subagent-activity",
]);

/** Statuses that must stay on their own row — never folded into a group. */
function isActiveToolStatus(status: string): boolean {
  return (
    status === "running" ||
    status === "in_progress" ||
    status === "inProgress" ||
    status === "waiting_approval" ||
    status === "error" ||
    status === "failed" ||
    status === "denied"
  );
}

function isGroupableTool(item: TurnItem): boolean {
  return TOOL_TYPES.has(item.type);
}

export type StreamNode =
  | { kind: "item"; item: TurnItem }
  | { kind: "group"; groupKind: string; items: TurnItem[] };

/**
 * Walk the stream the way renderGroupedProcess did:
 *   - active / non-tool items pass through alone
 *   - consecutive done tools of the same kind collapse into one group
 *   - a run of length 1 stays a single proc-line
 */
export function groupProcessItems(items: TurnItem[]): StreamNode[] {
  const out: StreamNode[] = [];
  let i = 0;
  while (i < items.length) {
    const cur = items[i]!;
    const groupable = isGroupableTool(cur) && !isActiveToolStatus(cur.status);
    if (!groupable) {
      out.push({ kind: "item", item: cur });
      i += 1;
      continue;
    }

    const kind = classifyTool(cur.tool ?? cur.command ?? cur.type);
    let j = i + 1;
    while (j < items.length) {
      const next = items[j]!;
      if (!isGroupableTool(next) || isActiveToolStatus(next.status)) break;
      const nextKind = classifyTool(next.tool ?? next.command ?? next.type);
      if (nextKind !== kind) break;
      j += 1;
    }

    const run = items.slice(i, j);
    if (run.length === 1) {
      out.push({ kind: "item", item: run[0]! });
    } else {
      out.push({ kind: "group", groupKind: kind, items: run });
    }
    i = j;
  }
  return out;
}

function groupLabel(groupKind: string, n: number): string {
  if (groupKind === "shell") {
    return t("process.ranCommands", "Ran {n} commands", { n });
  }
  if (groupKind === "write") {
    return t("process.createdFiles", "Created {n} files", { n });
  }
  if (groupKind === "read") {
    return t("process.readFiles", "Read {n} files", { n });
  }
  return t("process.ranTools", "Ran {n} tools", { n });
}

/**
 * Collapsed batch of finished tools of one kind.
 * DOM: `.proc-line.is-done.kind-*.is-group > .proc-head + .proc-body > .proc-sub`
 */
export function ProcGroup({ kind, items }: { kind: string; items: TurnItem[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`proc-line is-done kind-${kind} is-group`} data-group-size={items.length}>
      <button type="button" className="proc-head" onClick={() => setOpen((v) => !v)}>
        <span className="proc-label">{groupLabel(kind, items.length)}</span>
        <span className={`proc-chevron${open ? " open" : ""}`}>▾</span>
      </button>
      <div className="proc-body" hidden={!open}>
        {items.map((item) => (
          <ProcLine key={item.id} item={item} kind={classifyTool(item.tool ?? item.command ?? item.type)} className="proc-sub" />
        ))}
      </div>
    </div>
  );
}

// ── diffs / plans / misc ──────────────────────────────────────────────

function DiffBlock({ item }: BlockProps) {
  const path = item.path ?? item.id;
  const raw = item.diff ?? item.output ?? "";
  const lines = String(raw).split("\n");
  const max = 200;
  const slice = lines.length > max ? lines.slice(0, max) : lines;
  return (
    <div className="diff-card" data-block-type={item.type}>
      <div className="diff-head">{path}</div>
      {slice.map((l, i) => {
        const isAdd = l.startsWith("+") && !l.startsWith("+++");
        const isDel = l.startsWith("-") && !l.startsWith("---");
        return (
          <div className={`diff-line${isAdd ? " add" : isDel ? " del" : ""}`} key={i}>
            {l}
          </div>
        );
      })}
      {lines.length > max ? (
        <div className="diff-line">… {lines.length - max} more lines</div>
      ) : null}
    </div>
  );
}

function PlanBlock({ item }: BlockProps) {
  const plan = item.result ?? item.args ?? item.text;
  let steps: Array<{ step?: string; title?: string; status?: string }> = [];
  if (Array.isArray(plan)) {
    steps = plan as typeof steps;
  } else if (typeof plan === "string") {
    steps = [{ step: plan, status: "pending" }];
  }
  return (
    <ul className="plan-list" data-block-type={item.type}>
      {steps.map((s, i) => {
        const status = s.status || "pending";
        const mark = status === "completed" || status === "done" ? "✓" : status === "in_progress" ? "●" : "○";
        return (
          <li className="plan-step" key={i}>
            <span className={`step-status ${status}`}>{mark}</span>
            <span>{s.step || s.title || ""}</span>
          </li>
        );
      })}
    </ul>
  );
}

function AttachmentBlock({ item }: BlockProps) {
  return (
    <div className="message-row" data-block-type={item.type}>
      <div className="message-body">
        <div className="message-part part-attachment">
          <div className="attach-chip">{item.path || item.text || "attachment"}</div>
        </div>
      </div>
    </div>
  );
}

function ImageBlock({ item }: BlockProps) {
  const src = typeof item.result === "string" ? item.result : null;
  return (
    <div className="message-row" data-block-type={item.type}>
      <div className="message-body">
        {src ? (
          <img src={src} alt="" className="attach-chip" style={{ maxWidth: "100%", height: "auto" }} />
        ) : (
          <div className="attach-chip">image</div>
        )}
      </div>
    </div>
  );
}

function ErrorBlock({ item }: BlockProps) {
  return (
    <div className="proc-line is-error kind-other" data-block-type={item.type}>
      <div className="proc-body" style={{ display: "block" }}>
        <pre className="proc-pre">{item.error ?? item.text ?? ""}</pre>
      </div>
    </div>
  );
}

function StructuralBlock({ item }: BlockProps) {
  if (!item.text) return null;
  return (
    <div className="message-row" data-block-type={item.type}>
      <div className="message-body">
        <div className="message-part part-text">{item.text}</div>
      </div>
    </div>
  );
}

function UnknownBlock({ item }: BlockProps) {
  const payload = prettyText(item.result ?? item.args ?? { type: item.type });
  return (
    <ProcLine
      item={{ ...item, output: payload, tool: item.type }}
      kind="other"
      forceOpen={false}
    />
  );
}

// ── The total map ─────────────────────────────────────────────────────

/**
 * `Record<BlockType, …>` is deliberate: a missing key is a compile error.
 */
export const BLOCK_RENDERERS: Record<BlockType, ComponentType<BlockProps>> = {
  // prose
  agentMessage: ProseBlock,
  "assistant-message": ProseBlock,
  "user-message": UserProseBlock,
  paragraph: ProseBlock,
  "realtime-transcript": ProseBlock,

  // reasoning
  reasoning: ReasoningBlock,

  // tool lifecycles
  commandExecution: ToolBlock,
  exec: ToolBlock,
  "mcp-tool-call": McpBlock,
  mcpToolCall: McpBlock,
  "dynamic-tool-call": McpBlock,
  dynamicToolCall: McpBlock,
  search: ToolBlock,
  read: ToolBlock,
  list_files: ToolBlock,
  install: ToolBlock,
  plugin: ToolBlock,
  update: ToolBlock,
  delete: ToolBlock,
  add: ToolBlock,

  // diffs
  patch: DiffBlock,
  fileChange: DiffBlock,
  file: DiffBlock,
  code: DiffBlock,
  codespan: DiffBlock,

  // plans
  plan: PlanBlock,
  "proposed-plan": PlanBlock,
  codexDirective: PlanBlock,

  // images / attachments
  imageGeneration: ImageBlock,
  "generated-image": ImageBlock,

  // approvals
  "automatic-approval-review": ToolBlock,

  // status / diagnostics
  error: ErrorBlock,
  "system-error": ErrorBlock,
  success: StructuralBlock,
  heartbeat: StructuralBlock,
  "worked-for": StructuralBlock,
  "context-compaction": StructuralBlock,
  "subagent-activity": ToolBlock,

  // structural / misc
  "google-drive": StructuralBlock,
  url: StructuralBlock,
  unknown: UnknownBlock,
};

/** Render one item using its registered renderer. */
export function Block({ item }: BlockProps) {
  const Renderer = BLOCK_RENDERERS[item.type as BlockType] ?? UnknownBlock;
  return <Renderer item={item} />;
}

/** Re-exported for callers that only need the attachment chip shell. */
export function MessageShell({ children, user }: { children: ReactNode; user?: boolean }) {
  return <div className={`message-row${user ? " user" : ""}`}>{children}</div>;
}
