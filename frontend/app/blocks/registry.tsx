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

import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import type { TurnItem } from "@/state/turnStore";
import type { BlockType } from "@protocol/blocks";
import { t as tRaw } from "../../src/js/i18n.js";

/** i18n.js is untyped; wrap so vars are accepted without fighting TS. */
function t(key: string, fallback = "", vars?: Record<string, string | number>): string {
  return String(tRaw(key, fallback, (vars ?? null) as null));
}

export interface BlockProps {
  item: TurnItem;
  /** True on the final agent answer of a completed turn (summary block). */
  summary?: boolean;
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
function ProseBlock({ item, isUser = false, summary = false }: BlockProps & { isUser?: boolean }) {
  const text = item.text ?? "";
  return (
    <div
      className={`message-row${isUser ? " user" : ""}${summary && !isUser ? " is-summary" : ""}`}
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

/** Reasoning streams — the official client hides them in the thread. */
function ReasoningBlock() {
  return null;
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
  // Official auto-fold: when the tool finishes, collapse back to one row.
  // Fires only on the running→done transition, so a manual re-expand after
  // completion sticks.
  const finished = status !== "is-running" && status !== "is-waiting_approval";
  useEffect(() => {
    if (finished) setOpen(false);
  }, [finished]);

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
  if (item.type === "commandExecution" || item.type === "exec") {
    return <ShellCard item={item} />;
  }
  const kind = classifyTool(item.tool ?? item.command ?? item.type);
  return <ProcLine item={item} kind={kind} />;
}

// ── file operation markers ───────────────────────────────────────────

/** Compact official-style file row: blue action label + path + ± stats. */
type FileAction = "created" | "modified" | "deleted" | "read" | "viewed" | "searched";

const FILE_ACTION_LABEL: Record<FileAction, [string, string]> = {
  created: ["fileAction.created", "Added"],
  modified: ["fileAction.modified", "Modified"],
  deleted: ["fileAction.deleted", "Deleted"],
  read: ["fileAction.read", "Read"],
  viewed: ["fileAction.viewed", "Viewed"],
  searched: ["fileAction.searched", "Searched"],
};

/** Item types that render as file-op marker rows (also used by ProcGroup). */
export const FILE_OP_TYPES = new Set<string>(["fileChange", "patch", "read", "list_files", "search"]);

function fileOpInfo(item: TurnItem): { action: FileAction; added: number; removed: number } {
  if (item.type === "search") return { action: "searched", added: 0, removed: 0 };
  if (item.type === "read") return { action: "read", added: 0, removed: 0 };
  if (item.type === "list_files") return { action: "viewed", added: 0, removed: 0 };
  const diff = String(item.diff ?? item.output ?? "");
  let added = 0;
  let removed = 0;
  let created = false;
  let deleted = false;
  for (const line of diff.split("\n")) {
    if (line.startsWith("--- /dev/null")) created = true;
    else if (line.startsWith("+++ /dev/null")) deleted = true;
    else if (line.startsWith("+") && !line.startsWith("+++")) added += 1;
    else if (line.startsWith("-") && !line.startsWith("---")) removed += 1;
  }
  const action: FileAction = deleted ? "deleted" : created ? "created" : "modified";
  return { action, added, removed };
}

function FileOpIcon({ action }: { action: FileAction }) {
  if (action === "searched") {
    return (
      <svg viewBox="0 0 14 14" aria-hidden="true">
        <circle cx="6" cy="6" r="4.2" />
        <path d="m9.2 9.2 3 3" />
      </svg>
    );
  }
  if (action === "read" || action === "viewed") {
    return (
      <svg viewBox="0 0 14 14" aria-hidden="true">
        <path d="M1 7s2.2-3.6 6-3.6S13 7 13 7s-2.2 3.6-6 3.6S1 7 1 7Z" />
        <circle cx="7" cy="7" r="1.6" />
      </svg>
    );
  }
  // pencil — created / modified / deleted
  return (
    <svg viewBox="0 0 14 14" aria-hidden="true">
      <path d="M9.6 1.9 12.1 4.4 4.8 11.7l-3.2.6.6-3.2Z" />
      <path d="m8.2 3.3 2.5 2.5" />
    </svg>
  );
}

function FileOpBlock({ item }: BlockProps) {
  const { action, added, removed } = fileOpInfo(item);
  const [labelKey, labelFallback] = FILE_ACTION_LABEL[action];
  const diff = String(item.diff ?? "");
  const [open, setOpen] = useState(false);
  const running =
    item.status === "running" || item.status === "in_progress" || item.status === "inProgress";
  // Same auto-fold contract as the shell card: finished = collapsed row.
  useEffect(() => {
    if (!running) setOpen(false);
  }, [running]);
  const path = item.path ? String(item.path).replace(/\\/g, "/") : "";
  const base = path ? path.slice(path.lastIndexOf("/") + 1) : "";

  // Official panel rows: diff headers are replaced by the file bar; each
  // remaining line gets a line number (old-file position for deletions,
  // new-file position otherwise) and the +/- meaning is carried by the
  // row background — no literal +/- prefix in the code text.
  const rows: { no: number; kind: "add" | "del" | "ctx"; text: string }[] = [];
  if (open) {
    let oldNo = 0;
    let newNo = 0;
    for (const line of diff.split("\n")) {
      if (line.startsWith("--- ") || line.startsWith("+++ ") || line.startsWith("@@")) continue;
      if (line.startsWith("+")) {
        newNo += 1;
        rows.push({ no: newNo, kind: "add", text: line.slice(1) });
      } else if (line.startsWith("-")) {
        oldNo += 1;
        rows.push({ no: oldNo, kind: "del", text: line.slice(1) });
      } else {
        oldNo += 1;
        newNo += 1;
        rows.push({ no: newNo, kind: "ctx", text: line.startsWith(" ") ? line.slice(1) : line });
      }
    }
  }

  const copyDiff = (): void => {
    try {
      void navigator.clipboard?.writeText(diff).catch(() => {
        /* clipboard unavailable — silent is honest here */
      });
    } catch {
      /* no clipboard surface in this webview */
    }
  };

  return (
    <div className="message-row" data-block-type={item.type} data-message-id={item.id}>
      <button
        type="button"
        className={`file-op${diff ? " is-clickable" : ""}`}
        disabled={!diff}
        aria-expanded={open}
        onClick={() => diff && setOpen((v) => !v)}
      >
        <FileOpIcon action={action} />
        <span className="file-op-action">{t(labelKey, labelFallback)}</span>
        {!open && base ? <span className="file-op-path">{base}</span> : null}
        {!open && diff ? (
          <span className="file-op-stats">
            <span className="file-op-stat is-add">+{added}</span>
            <span className="file-op-stat is-del">-{removed}</span>
          </span>
        ) : null}
        {diff ? (
          <svg className={`cmd-chev${open ? "" : " closed"}`} viewBox="0 0 10 6" aria-hidden="true">
            <path d="M1 1l4 4 4-4" />
          </svg>
        ) : null}
      </button>
      {open ? (
        <div className="file-diff">
          <div className="file-diff-head">
            <span className="file-diff-name">{base || item.id}</span>
            <span className="file-diff-stats">
              <span className="is-add">+{added}</span>
              <span className="is-del">-{removed}</span>
            </span>
            <button type="button" className="file-diff-copy" aria-label="Copy diff" onClick={copyDiff}>
              <svg viewBox="0 0 14 14" aria-hidden="true">
                <rect x="4.5" y="4.5" width="8" height="8" rx="1.5" />
                <path d="M9.5 2.5h-6a1.5 1.5 0 0 0-1.5 1.5v6" />
              </svg>
            </button>
          </div>
          <div className="file-diff-body">
            {rows.map((r, i) => (
              <div className={`fdiff-line is-${r.kind}`} key={i}>
                <span className="fdiff-no">{r.no}</span>
                <span className="fdiff-text">{r.text === "" ? "\u00A0" : r.text}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Shell command card — official turn lifecycle:
 *   running  → head 「正在运行 <cmd>」 with the terminal glyph, panel open so
 *              output streams in line-by-line, view pinned to the newest line
 *   finished → head 「已运行 <cmd>」, panel collapsed by default; the chevron
 *              toggles the Shell execution panel
 *   failed / denied stay expanded — an error must never hide behind a fold.
 * A manual toggle wins over the automatic policy for the rest of the item's
 * lifetime (user intent beats lifecycle defaults).
 */
function ShellCard({ item }: BlockProps) {
  const cmd = item.command ?? item.tool ?? "";
  const output = item.output ?? "";
  const st = String(item.status);
  const running = st === "running" || st === "in_progress" || st === "inProgress";
  const failed = st === "failed" || st === "error";
  const denied = st === "denied";
  const [manual, setManual] = useState<boolean | null>(null);
  const open = manual ?? (running || failed || denied);
  // Official auto-fold at turn end: exiting the running state drops any
  // mid-run manual choice, so the card collapses to its single-line row.
  // A fresh click afterwards is a new manual choice and sticks.
  useEffect(() => {
    if (!running) setManual(null);
  }, [running]);

  const linesRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Pin the streaming panel to the tail while the command is running.
    if (running && open && linesRef.current) {
      linesRef.current.scrollTop = linesRef.current.scrollHeight;
    }
  }, [output, running, open]);

  const head = running
    ? String(t("process.runningCmd", "Running {name}", { name: cmd }))
    : failed
      ? `${String(t("process.failedPrefix", "Failed"))} ${cmd}`
      : denied
        ? `${String(t("process.deniedPrefix", "Denied"))} ${cmd}`
        : String(t("process.ranCmd", "Ran {name}", { name: cmd }));

  // One DOM row per log line; cap the tree with a tail window so long runs
  // (builds, dir listings) cannot blow up the thread.
  const lines = output ? output.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n") : [];
  const MAX_LINES = 400;
  const hiddenCount = Math.max(0, lines.length - MAX_LINES);
  const shown = hiddenCount > 0 ? lines.slice(hiddenCount) : lines;

  return (
    <div className="message-row" data-block-type="commandExecution" data-message-id={item.id}>
      <div
        className={`cmd-card${failed ? " is-error" : ""}${denied ? " is-denied" : ""}${running ? " is-running" : ""}`}
      >
        <button type="button" className="cmd-head" aria-expanded={open} onClick={() => setManual(!open)}>
          <svg className="cmd-term" viewBox="0 0 14 14" aria-hidden="true">
            <rect x="1" y="1.5" width="12" height="11" rx="2.5" />
            <path d="M3.8 5 6 7 3.8 9" />
            <path d="M7 9.3h3.4" />
          </svg>
          <span className="cmd-title">{head}</span>
          <svg className={`cmd-chev${open ? "" : " closed"}`} viewBox="0 0 10 6" aria-hidden="true">
            <path d="M1 1l4 4 4-4" />
          </svg>
        </button>
        {open ? (
          <div className="cmd-body">
            <div className="cmd-kind">{String(t("process.shell", "Shell"))}</div>
            <div className="cmd-lines" ref={linesRef}>
              <div className="cmd-line is-cmd">
                <span className="cmd-prompt">$ </span>
                {cmd}
              </div>
              {hiddenCount > 0 ? (
                <div className="cmd-line cmd-more">
                  {String(t("process.moreLines", "… {n} earlier lines hidden", { n: hiddenCount }))}
                </div>
              ) : null}
              {shown.map((l, i) => (
                <div className="cmd-line" key={i}>
                  {l === "" ? "\u00A0" : l}
                </div>
              ))}
              {running && shown.length === 0 ? (
                <div className="cmd-line cmd-wait">
                  {String(t("process.waitingOutput", "waiting for output…"))}
                </div>
              ) : null}
            </div>
            {!running ? (
              <div className="cmd-status">
                {failed || denied ? (
                  <span className="cmd-fail">✕ {String(t("process.failedPrefix", "Failed"))}</span>
                ) : (
                  <span className="cmd-ok">✓ {String(t("process.success", "Success"))}</span>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
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
        {items.map((item) =>
          item.type === "commandExecution" || item.type === "exec" ? (
            <ShellCard key={item.id} item={item} />
          ) : FILE_OP_TYPES.has(item.type) ? (
            <FileOpBlock key={item.id} item={item} />
          ) : (
            <ProcLine key={item.id} item={item} kind={classifyTool(item.tool ?? item.command ?? item.type)} className="proc-sub" />
          ),
        )}
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
  search: FileOpBlock,
  read: FileOpBlock,
  list_files: FileOpBlock,
  install: ToolBlock,
  plugin: ToolBlock,
  update: ToolBlock,
  delete: ToolBlock,
  add: ToolBlock,

  // diffs
  patch: FileOpBlock,
  fileChange: FileOpBlock,
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
/** Render one item using its registered renderer. */
export function Block({ item, summary }: BlockProps) {
  const Renderer = BLOCK_RENDERERS[item.type as BlockType] ?? UnknownBlock;
  return <Renderer item={item} summary={summary} />;
}

/** Re-exported for callers that only need the attachment chip shell. */
export function MessageShell({ children, user }: { children: ReactNode; user?: boolean }) {
  return <div className={`message-row${user ? " user" : ""}`}>{children}</div>;
}
