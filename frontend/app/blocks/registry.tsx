/**
 * Block renderer registry.
 *
 * The official turn stream branches on 41 item tags. `BLOCK_RENDERERS` is typed
 * as a total map over `BlockType`, so adding a tag upstream and regenerating
 * the protocol produces a type error until it is rendered — coverage cannot
 * drift the way it did when this was a hand-maintained 7-way switch.
 *
 * Every renderer reads only from `TurnItem`, which is populated exclusively by
 * server notifications. No renderer invents data.
 */

import type { ComponentType, ReactNode } from "react";
import type { TurnItem } from "@/state/turnStore";
import type { BlockType } from "@protocol/blocks";
import { ACTIVE_STATUSES } from "@protocol/status";

export interface BlockProps {
  item: TurnItem;
}

// ── Shared primitives ─────────────────────────────────────────────────

function BlockShell({
  item,
  kind,
  children,
}: {
  item: TurnItem;
  kind: string;
  children: ReactNode;
}) {
  const active = ACTIVE_STATUSES.includes(item.status);
  return (
    <div
      className={`block block-${kind} is-${item.status}${active ? " is-active" : ""}`}
      data-block-id={item.id}
      data-block-type={item.type}
      data-block-status={item.status}
    >
      {children}
    </div>
  );
}

/** Streamed assistant / user prose. */
function ProseBlock({ item }: BlockProps) {
  return (
    <BlockShell item={item} kind="prose">
      <div className="block-prose">{item.text}</div>
    </BlockShell>
  );
}

/** Reasoning streams — shown collapsed, as the official client does. */
function ReasoningBlock({ item }: BlockProps) {
  return (
    <BlockShell item={item} kind="reasoning">
      <details className="block-reasoning">
        <summary>Reasoning</summary>
        <pre>{item.text}</pre>
      </details>
    </BlockShell>
  );
}

/** A tool invocation with a lifecycle and expandable output. */
function ToolBlock({ item, kind = "tool" }: BlockProps & { kind?: string }) {
  const label = item.command ?? item.path ?? item.mcpServer ?? item.id;
  return (
    <BlockShell item={item} kind={kind}>
      <details className="block-tool">
        <summary>
          <code>{label}</code>
          {item.durationMs !== null && <span className="block-duration">{(item.durationMs / 1000).toFixed(1)}s</span>}
          <span className="block-status">{item.status}</span>
        </summary>
        {item.output && <pre className="block-output">{item.output}</pre>}
        {item.diff && <pre className="block-diff">{item.diff}</pre>}
        {item.progress.length > 0 && (
          <ul className="block-progress">
            {item.progress.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        )}
        {item.error && <div className="block-error">{item.error}</div>}
      </details>
    </BlockShell>
  );
}

/** Unified diff / patch blocks. */
function DiffBlock({ item }: BlockProps) {
  return (
    <BlockShell item={item} kind="diff">
      <div className="block-path">{item.path ?? item.id}</div>
      <pre className="block-diff">{item.diff ?? item.output}</pre>
    </BlockShell>
  );
}

/** Plan / proposed-plan. */
function PlanBlock({ item }: BlockProps) {
  const plan = item.result ?? item.args ?? item.text;
  return (
    <BlockShell item={item} kind="plan">
      <pre className="block-plan">{typeof plan === "string" ? plan : JSON.stringify(plan, null, 2)}</pre>
    </BlockShell>
  );
}

/** Generated images. */
function ImageBlock({ item }: BlockProps) {
  const src = typeof item.result === "string" ? item.result : null;
  return (
    <BlockShell item={item} kind="image">
      {src ? <img src={src} alt="" className="block-image" /> : <div className="block-placeholder">image</div>}
    </BlockShell>
  );
}

/** Errors surfaced as blocks (distinct from turn-level `error`). */
function ErrorBlock({ item }: BlockProps) {
  return (
    <BlockShell item={item} kind="error">
      <div className="block-error">{item.error ?? item.text}</div>
    </BlockShell>
  );
}

/** Structural / formatting tags that carry no payload of their own. */
function StructuralBlock({ item }: BlockProps) {
  return (
    <BlockShell item={item} kind="structural">
      {item.text ? <span>{item.text}</span> : null}
    </BlockShell>
  );
}

/** Anything the server sends that we have no visual for yet. */
function UnknownBlock({ item }: BlockProps) {
  return (
    <BlockShell item={item} kind="unknown">
      <details>
        <summary>
          <code>{item.type}</code> (unrendered)
        </summary>
        <pre>{JSON.stringify(item.result ?? item.args ?? {}, null, 2)}</pre>
      </details>
    </BlockShell>
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
  "user-message": ProseBlock,
  paragraph: ProseBlock,
  "realtime-transcript": ProseBlock,

  // reasoning
  reasoning: ReasoningBlock,

  // tool lifecycles
  commandExecution: ToolBlock,
  exec: ToolBlock,
  "mcp-tool-call": ToolBlock,
  mcpToolCall: ToolBlock,
  "dynamic-tool-call": ToolBlock,
  dynamicToolCall: ToolBlock,
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

  // images
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
