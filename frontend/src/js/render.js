// Message / process-line / diff / plan / live-turn rendering.
// Official-style: narrative text + compact process summaries; heavy detail on expand / review panel.

import { t, currentLang } from "./i18n.js";

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
}

function truncate(s, n = 4000) {
  s = String(s ?? "");
  if (s.length <= n) return s;
  return s.slice(0, n) + "\n…[truncated]";
}

/**
 * Official UIA duration style (T29/T31):
 *   46秒 / 1分25秒  (elapsed)
 *   用时 footer uses 分钟: 2分钟 6秒
 */
function formatDuration(ms, style = "elapsed") {
  if (!ms || ms < 0) return "";
  const lang = currentLang();
  const isZh = lang.startsWith("zh");
  if (ms < 1000) return isZh ? `${ms}ms` : `${ms}ms`;
  const totalSec = ms / 1000;
  if (totalSec < 60) {
    const s = totalSec < 10 ? totalSec.toFixed(1) : String(Math.floor(totalSec));
    return isZh ? `${s}秒` : `${s}s`;
  }
  const m = Math.floor(totalSec / 60);
  const s = Math.floor(totalSec % 60);
  if (!isZh) return `${m}m ${s}s`;
  // elapsed: 1分25秒 · footer/usedTime: 2分钟 6秒 (official copies)
  if (style === "used") return s ? `${m}分钟 ${s}秒` : `${m}分钟`;
  return s ? `${m}分${s}秒` : `${m}分`;
}

function prettyJSON(raw) {
  if (!raw) return "";
  try { return JSON.stringify(JSON.parse(raw), null, 2); } catch { return String(raw); }
}

function prettyResult(raw) {
  if (!raw) return "";
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj.output === "string") return obj.output;
    if (obj && typeof obj === "object") return JSON.stringify(obj, null, 2);
  } catch { /* fallthrough */ }
  return String(raw);
}

/** Classify tool for official-style summary copy. */
export function classifyTool(name = "") {
  const n = String(name).toLowerCase();
  if (/write|create|apply_patch|edit|str_replace|patch/.test(n)) return "write";
  if (/shell|bash|powershell|cmd|exec|terminal|run/.test(n)) return "shell";
  if (/grep|search|rg|find|glob/.test(n)) return "search";
  if (/read|list|cat|ls|view/.test(n)) return "read";
  if (/browser|navigate|click|screenshot|cdp/.test(n)) return "browser";
  if (/mcp__/.test(n)) return "mcp";
  return "other";
}

/** Split path into muted dir + emphasized basename for process rows. */
function formatPathLabel(path) {
  const raw = String(path || "").replace(/\\/g, "/");
  if (!raw) return "";
  const i = raw.lastIndexOf("/");
  if (i < 0) return `<span class="proc-file">${escapeHtml(raw)}</span>`;
  return `<span class="proc-path">${escapeHtml(raw.slice(0, i + 1))}</span><span class="proc-file">${escapeHtml(raw.slice(i + 1))}</span>`;
}

function formatProcessLabel(prefix, pathOrName, opts = {}) {
  if (opts.pathLike && pathOrName) {
    return `${escapeHtml(prefix)} ${formatPathLabel(pathOrName)}`;
  }
  return escapeHtml(pathOrName ? `${prefix} ${pathOrName}` : prefix);
}

/** One-line official-style process summary. */
export function processSummaryText(tools) {
  const list = tools || [];
  if (!list.length) return "";
  const running = list.filter((t) => t.status === "running" || t.status === "waiting_approval");
  if (running.length) {
    const r = running[running.length - 1];
    const cmd = shellSnippet(r) || r.tool || "tool";
    if (r.status === "waiting_approval") return t("process.waitingApproval", `Waiting for approval · ${cmd}`, { name: cmd });
    return t("process.running", `Running ${cmd}`, { name: cmd });
  }
  const shells = list.filter((t) => classifyTool(t.tool) === "shell" && t.status === "done");
  const writes = list.filter((t) => classifyTool(t.tool) === "write" && (t.status === "done" || t.status === "approved"));
  const reads = list.filter((t) => classifyTool(t.tool) === "read" && t.status === "done");
  const searches = list.filter((t) => classifyTool(t.tool) === "search" && t.status === "done");
  const others = list.filter((t) => !["shell", "write", "read", "search"].includes(classifyTool(t.tool)) && t.status === "done");

  // Prefer the most specific group for a collapsed line (official groups by kind)
  if (writes.length && writes.length >= shells.length && writes.length >= reads.length && writes.length >= searches.length) {
    return t("process.createdFiles", `Created ${writes.length} files`, { n: writes.length });
  }
  if (shells.length) {
    return t("process.ranCommands", `Ran ${shells.length} commands`, { n: shells.length });
  }
  if (searches.length && searches.length >= reads.length) {
    return t("process.searchedN", `Searched ${searches.length} times`, { n: searches.length });
  }
  if (reads.length) {
    return t("process.readFiles", `Read ${reads.length} files`, { n: reads.length });
  }
  if (others.length) {
    return t("process.ranTools", `Ran ${others.length} tools`, { n: others.length });
  }
  const last = list[list.length - 1];
  return last?.tool || "tool";
}

function shellSnippet(tool) {
  if (!tool) return "";
  const raw = tool.args || tool.summary || "";
  try {
    const o = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (o?.command) return String(o.command).slice(0, 80);
    if (o?.cmd) return String(o.cmd).slice(0, 80);
    if (Array.isArray(o?.command)) return o.command.join(" ").slice(0, 80);
  } catch { /* ignore */ }
  const s = String(raw).replace(/\s+/g, " ").trim();
  return s.slice(0, 80);
}

function pathFromTool(tool) {
  if (tool?.path) return tool.path;
  try {
    const o = JSON.parse(tool?.args || "{}");
    return o.path || o.file_path || o.file || o.filename || "";
  } catch {
    return "";
  }
}

/** Compact process row (default collapsed). Expand shows args/result. */
export function renderProcessLine(tool, opts = {}) {
  const kind = classifyTool(tool.tool);
  const status = tool.status || "done";
  const row = document.createElement("div");
  row.className = `proc-line is-${status} kind-${kind}`;
  if (tool.callId) row.dataset.callId = tool.callId;
  if (tool.approveId) {
    row.dataset.approveId = tool.approveId;
    row.setAttribute("data-approve-id", tool.approveId);
  }

  let labelHtml;
  if (status === "running") {
    // Official T29: 正在运行 <cmd>
    const name = shellSnippet(tool) || tool.tool;
    if (kind === "shell") {
      labelHtml = escapeHtml(t("process.runningCmd", "正在运行 {name}", { name }));
    } else {
      labelHtml = formatProcessLabel(t("process.runningPrefix", "Running"), name);
    }
  } else if (status === "waiting_approval") {
    labelHtml = formatProcessLabel(t("process.needsApproval", "Needs approval") + " ·", tool.tool);
  } else if (status === "denied") {
    labelHtml = formatProcessLabel(t("process.deniedPrefix", "Denied") + " ·", tool.tool);
  } else if (status === "error") {
    labelHtml = formatProcessLabel(t("process.failedPrefix", "Failed") + " ·", tool.tool);
  } else if (kind === "write") {
    const p = pathFromTool(tool);
    labelHtml = p
      ? formatProcessLabel(t("process.wrotePrefix", "Wrote"), p, { pathLike: true })
      : formatProcessLabel(t("process.wrote", `Wrote files · ${tool.tool}`, { name: tool.tool }));
  } else if (kind === "shell") {
    // Official three-state titles: 正在运行 → 已在 Ns 内运行 → 已运行
    const cmd = shellSnippet(tool) || tool.tool;
    if (tool.durationMs) {
      labelHtml = escapeHtml(t("process.ranIn", "已在 {time} 内运行 {name}", {
        time: formatDuration(tool.durationMs),
        name: cmd,
      }));
    } else {
      labelHtml = escapeHtml(t("process.ranCmd", "已运行 {name}", { name: cmd }));
    }
  } else if (kind === "search") {
    const p = pathFromTool(tool) || shellSnippet(tool);
    labelHtml = p
      ? formatProcessLabel(t("process.searchedPrefix", "Searched"), p, { pathLike: /[\\/]/.test(p) })
      : escapeHtml(t("process.searched", "Searched"));
  } else if (kind === "read") {
    const p = pathFromTool(tool);
    labelHtml = p
      ? formatProcessLabel(t("process.readPrefix", "Read"), p, { pathLike: true })
      : formatProcessLabel(t("process.read", `Read files · ${tool.tool}`, { name: tool.tool }));
  } else {
    labelHtml = escapeHtml(tool.tool || "tool");
  }

  const hasDetail = !!(tool.args || tool.result || tool.diff || status === "waiting_approval");
  const open = opts.forceOpen || status === "waiting_approval" || status === "error" || status === "denied";

  row.innerHTML = `
    <button type="button" class="proc-head" data-proc-toggle ${hasDetail ? "" : "disabled"}>
      <span class="proc-label">${labelHtml}</span>
      ${tool.durationMs ? `<span class="proc-dur">${escapeHtml(formatDuration(tool.durationMs))}</span>` : ""}
      ${hasDetail ? `<span class="proc-chevron${open ? " open" : ""}">▾</span>` : ""}
    </button>
    <div class="proc-body" ${open ? "" : "hidden"}></div>`;

  const body = row.querySelector(".proc-body");
  if (tool.summary) {
    const s = document.createElement("div");
    s.className = "proc-summary";
    s.textContent = tool.summary;
    body.appendChild(s);
  }
  // Official T29 expanded shell card: Shell + $ cmd + stdout block + 成功
  if (kind === "shell") {
    const cmd = shellSnippet(tool) || tool.tool;
    const shellBlock = document.createElement("div");
    shellBlock.className = "proc-section proc-shell-block";
    shellBlock.innerHTML = `
      <div class="proc-section-label">${escapeHtml(t("process.shell", "Shell"))}</div>
      <div class="proc-shell-cmd"><code>$ ${escapeHtml(cmd)}</code>
        <button type="button" class="proc-copy" data-copy-cmd aria-label="${escapeHtml(t("process.copyMessage", "复制消息"))}">⧉</button>
      </div>
      ${tool.result ? `<pre class="proc-pre proc-stdout">${escapeHtml(truncate(tool.result))}</pre>` : ""}
      ${status === "done" || status === "approved" ? `<div class="proc-success">${escapeHtml(t("process.success", "成功"))}</div>` : ""}`;
    shellBlock.querySelector("[data-copy-cmd]")?.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(String(cmd)); } catch { /* ignore */ }
    });
    body.appendChild(shellBlock);
  }
  if (tool.args && kind !== "shell") {
    const block = document.createElement("div");
    block.className = "proc-section";
    block.innerHTML = `<div class="proc-section-label">Input</div><pre class="proc-pre">${escapeHtml(truncate(typeof tool.args === "string" ? tool.args : prettyJSON(tool.args)))}</pre>`;
    body.appendChild(block);
  }
  if (tool.diff) body.appendChild(renderDiffCard(tool.path || pathFromTool(tool), tool.diff));
  if (tool.result && kind !== "shell") {
    const block = document.createElement("div");
    block.className = "proc-section";
    block.innerHTML = `<div class="proc-section-label">Output</div><pre class="proc-pre">${escapeHtml(truncate(tool.result))}</pre>`;
    body.appendChild(block);
  }
  if (status === "waiting_approval") {
    const bar = document.createElement("div");
    bar.className = "proc-approval";
    const p = tool.path || pathFromTool(tool);
    bar.innerHTML = `
      <div class="proc-approval-text">${escapeHtml(t("process.needsApproval", "Needs approval"))}${p ? " · " + escapeHtml(p) : ""}</div>
      <div class="proc-approval-actions">
        <button type="button" class="btn btn-secondary btn-sm" data-approve="0">${escapeHtml(t("action.deny", "Deny"))}</button>
        <button type="button" class="btn btn-primary btn-sm" data-approve="1">${escapeHtml(t("action.approve", "Approve"))}</button>
      </div>`;
    body.appendChild(bar);
  }

  row.querySelector("[data-proc-toggle]")?.addEventListener("click", () => {
    if (!hasDetail) return;
    const b = row.querySelector(".proc-body");
    const chev = row.querySelector(".proc-chevron");
    if (!b) return;
    b.hidden = !b.hidden;
    chev?.classList.toggle("open", !b.hidden);
  });

  return row;
}

/** Group consecutive done tools of same kind into one summary line (official). */
export function renderGroupedProcess(tools, api) {
  const frag = document.createDocumentFragment();
  if (!tools?.length) return frag;

  let i = 0;
  while (i < tools.length) {
    const cur = tools[i];
    const kind = classifyTool(cur.tool);
    const active = cur.status === "running" || cur.status === "waiting_approval" || cur.status === "error" || cur.status === "denied";

    if (active) {
      const line = renderProcessLine(cur);
      wireApproval(line, cur, api);
      frag.appendChild(line);
      i += 1;
      continue;
    }

    // group consecutive done tools of same kind
    let j = i + 1;
    while (j < tools.length) {
      const n = tools[j];
      const nk = classifyTool(n.tool);
      const na = n.status === "running" || n.status === "waiting_approval" || n.status === "error" || n.status === "denied";
      if (na || nk !== kind) break;
      j += 1;
    }
    const group = tools.slice(i, j);
    if (group.length === 1) {
      frag.appendChild(renderProcessLine(group[0]));
    } else {
      frag.appendChild(renderProcessGroup(group, kind));
    }
    i = j;
  }
  return frag;
}

function renderProcessGroup(group, kind) {
  const wrap = document.createElement("div");
  wrap.className = `proc-line is-done kind-${kind} is-group`;
  let label;
  if (kind === "shell") label = t("process.ranCommands", `Ran ${group.length} commands`, { n: group.length });
  else if (kind === "write") label = t("process.createdFiles", `Created ${group.length} files`, { n: group.length });
  else if (kind === "read") label = t("process.readFiles", `Read ${group.length} files`, { n: group.length });
  else label = t("process.ranTools", `Ran ${group.length} tools`, { n: group.length });

  wrap.innerHTML = `
    <button type="button" class="proc-head" data-proc-toggle>
      <span class="proc-label">${escapeHtml(label)}</span>
      <span class="proc-chevron">▾</span>
    </button>
    <div class="proc-body" hidden></div>`;
  const body = wrap.querySelector(".proc-body");
  for (const t of group) {
    const sub = renderProcessLine(t, { forceOpen: false });
    sub.classList.add("proc-sub");
    body.appendChild(sub);
  }
  wrap.querySelector("[data-proc-toggle]")?.addEventListener("click", () => {
    const b = wrap.querySelector(":scope > .proc-body");
    const chev = wrap.querySelector(":scope > .proc-head .proc-chevron");
    if (!b) return;
    b.hidden = !b.hidden;
    chev?.classList.toggle("open", !b.hidden);
  });
  return wrap;
}

function wireApproval(line, tool, api) {
  line.querySelectorAll("[data-approve]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const ok = btn.dataset.approve === "1";
      const id = tool.approveId;
      if (!id) return;
      btn.disabled = true;
      api?.ResolveApproval?.(id, ok);
      tool.status = ok ? "running" : "denied";
      tool.approveId = "";
      const next = renderProcessLine(tool);
      line.replaceWith(next);
    });
  });
}

export function renderDiffCard(path, diff) {
  const card = document.createElement("div");
  card.className = "diff-card";
  const head = document.createElement("div");
  head.className = "diff-head";
  head.textContent = path || "diff";
  card.appendChild(head);
  const lines = String(diff || "").split("\n");
  const max = 200;
  const slice = lines.length > max ? lines.slice(0, max) : lines;
  for (const l of slice) {
    const line = document.createElement("div");
    line.className = "diff-line" + (l.startsWith("+") && !l.startsWith("+++") ? " add" : l.startsWith("-") && !l.startsWith("---") ? " del" : "");
    line.textContent = l;
    card.appendChild(line);
  }
  if (lines.length > max) {
    const more = document.createElement("div");
    more.className = "diff-line";
    more.textContent = `… ${lines.length - max} more lines`;
    card.appendChild(more);
  }
  return card;
}

function renderPlan(steps) {
  const list = document.createElement("ul");
  list.className = "plan-list";
  for (const s of steps || []) {
    const status = s.status || "pending";
    const li = document.createElement("li");
    li.className = "plan-step";
    const mark = status === "completed" || status === "done" ? "✓" : status === "in_progress" ? "●" : "○";
    li.innerHTML = `<span class="step-status ${escapeHtml(status)}">${mark}</span><span>${escapeHtml(s.step || s.title || "")}</span>`;
    list.appendChild(li);
  }
  return list;
}

// Collapse tool_call + tool_result (+ optional trailing diff) with same callId
function mergeToolParts(parts) {
  const out = [];
  const byCall = new Map();
  for (const p of parts) {
    if (p.type === "tool_call" && p.callId) {
      const merged = {
        type: "tool_process",
        tool: p.tool,
        callId: p.callId,
        args: p.args,
        status: p.status || "running",
      };
      byCall.set(p.callId, merged);
      out.push(merged);
      continue;
    }
    if (p.type === "tool_result" && p.callId && byCall.has(p.callId)) {
      const m = byCall.get(p.callId);
      m.status = p.status || "done";
      m.result = p.result;
      m.path = p.path || m.path;
      continue;
    }
    if (p.type === "diff") {
      const last = [...byCall.values()].pop();
      if (last && !last.diff) {
        last.diff = p.diff;
        last.path = p.path || last.path;
        continue;
      }
    }
    out.push(p);
  }
  return out;
}

/** Aggregate file changes from message parts for footer + review panel. */
export function collectChanges(parts) {
  const map = new Map();
  for (const p of mergeToolParts(parts || [])) {
    if (p.type !== "tool_process" && p.type !== "diff") continue;
    const path = p.path || pathFromTool(p);
    if (!path && !p.diff) continue;
    const key = path || `change-${map.size}`;
    let add = 0;
    let del = 0;
    if (p.diff) {
      for (const line of String(p.diff).split("\n")) {
        if (line.startsWith("+") && !line.startsWith("+++")) add += 1;
        else if (line.startsWith("-") && !line.startsWith("---")) del += 1;
      }
    } else if (classifyTool(p.tool) === "write") {
      add = add || 1;
    }
    const prev = map.get(key) || { path: path || key, added: 0, removed: 0, diff: "", tool: p.tool };
    prev.added += add;
    prev.removed += del;
    if (p.diff) prev.diff = p.diff;
    map.set(key, prev);
  }
  return [...map.values()];
}

function renderChangeFooter(changes) {
  if (!changes.length) return null;
  const el = document.createElement("div");
  el.className = "turn-changes";
  let add = 0;
  let del = 0;
  for (const c of changes) {
    add += c.added || 0;
    del += c.removed || 0;
  }
  const n = changes.length;
  el.innerHTML = `
    <button type="button" class="turn-changes-btn" data-open-review>
      <span class="turn-changes-label">${escapeHtml(t("process.filesChanged", `${n} files changed`, { n }))}</span>
      <span class="turn-changes-stat"><span class="add">+${add}</span> <span class="del">−${del}</span></span>
    </button>
    <button type="button" class="turn-changes-follow" data-follow-up>${escapeHtml(t("process.requestChanges", "Request follow-up changes"))}</button>`;
  return el;
}

function renderPart(p, api) {
  const wrap = document.createElement("div");
  wrap.className = "message-part";
  switch (p.type) {
    case "text":
      wrap.classList.add("part-text");
      wrap.textContent = p.text || "";
      break;
    case "attachment": {
      wrap.classList.add("part-attachment");
      wrap.innerHTML = `<div class="attach-chip">📎 ${escapeHtml(p.path || p.text || "attachment")}</div>`;
      break;
    }
    case "tool_call":
    case "tool_result":
    case "tool_process": {
      const tool = {
        tool: p.tool,
        callId: p.callId,
        args: p.args ? prettyJSON(p.args) : "",
        status: p.status || (p.type === "tool_result" ? "done" : "running"),
        result: p.result ? prettyResult(p.result) : "",
        path: p.path,
        diff: p.diff,
        approveId: p.approveId,
        summary: p.summary,
        durationMs: p.durationMs,
      };
      const line = renderProcessLine(tool);
      wireApproval(line, tool, api);
      wrap.appendChild(line);
      break;
    }
    case "diff":
      wrap.appendChild(renderDiffCard(p.path, p.diff));
      break;
    case "plan":
      wrap.appendChild(renderPlan(p.steps || []));
      break;
    case "error":
      wrap.innerHTML = `<div class="proc-line is-error"><div class="proc-head"><span class="proc-label">${escapeHtml(p.text || "Error")}</span></div></div>`;
      break;
    default:
      wrap.textContent = p.text || "";
  }
  return wrap;
}

/** History message — official narrative + compact process lines. */
export function renderMessage(msg, api) {
  const row = document.createElement("div");
  row.className = "message-row" + (msg.role === "user" ? " user" : "");
  if (msg.id) row.dataset.messageId = msg.id;
  const isUser = msg.role === "user";
  row.innerHTML = `<div class="message-body"></div>`;
  const body = row.querySelector(".message-body");

  // history turn header: real duration from backend (assistant only)
  if (!isUser && msg.durationMs) {
    const head = document.createElement("div");
    head.className = "turn-head";
    head.innerHTML = `<span class="turn-elapsed">${escapeHtml(t("process.elapsed", `Processed ${formatDuration(msg.durationMs)}`, { time: formatDuration(msg.durationMs) }))}</span>`;
    body.appendChild(head);
  }

  const parts = mergeToolParts(msg.parts || []);
  // Group consecutive tool_process parts for official summary style
  let i = 0;
  const toolsBuf = [];
  const flushTools = () => {
    if (!toolsBuf.length) return;
    body.appendChild(renderGroupedProcess(toolsBuf.splice(0), api));
  };
  while (i < parts.length) {
    const p = parts[i];
    if (p.type === "tool_process" || p.type === "tool_call" || p.type === "tool_result") {
      toolsBuf.push({
        tool: p.tool,
        callId: p.callId,
        args: p.args ? prettyJSON(p.args) : "",
        status: p.status || "done",
        result: p.result ? prettyResult(p.result) : "",
        path: p.path,
        diff: p.diff,
        approveId: p.approveId,
        durationMs: p.durationMs,
      });
      i += 1;
      continue;
    }
    flushTools();
    body.appendChild(renderPart(p, api));
    i += 1;
  }
  flushTools();

  if (!msg.parts?.length && msg.text) {
    const text = document.createElement("div");
    text.className = "message-part part-text";
    text.textContent = msg.text;
    body.appendChild(text);
  }

  if (!isUser) {
    const changes = collectChanges(msg.parts || []);
    const footer = renderChangeFooter(changes);
    if (footer) {
      body.appendChild(footer);
      footer.querySelector("[data-open-review]")?.addEventListener("click", () => {
        document.dispatchEvent(new CustomEvent("codex:open-review", { detail: { changes } }));
      });
      footer.querySelector("[data-follow-up]")?.addEventListener("click", () => {
        const input = document.getElementById("composer-input");
        if (input) {
          input.value = t("process.followUpPlaceholder", "Please adjust the changes: ");
          input.focus();
          input.dispatchEvent(new Event("input"));
        }
      });
    }
  }

  return row;
}

/** Todo progress header: "待办 · current task x/y" from live task_state events. */
function renderTodoHeader(tasks) {
  if (!Array.isArray(tasks) || !tasks.length) return null;
  const total = tasks.length;
  const done = tasks.filter((x) => {
    const s = String(x.status || x.state || "").toLowerCase();
    return s === "completed" || s === "done";
  }).length;
  const current = tasks.find((x) => {
    const s = String(x.status || x.state || "").toLowerCase();
    return s === "in_progress" || s === "running" || s === "pending";
  });
  const head = document.createElement("div");
  head.className = "turn-todo";
  const label = current?.content || current?.title || t("process.todoCurrent", "Current task");
  head.innerHTML = `<span class="todo-dot"></span><span class="todo-label">${escapeHtml(label)}</span><span class="todo-count">${done}/${total}</span>`;
  return head;
}

function phaseLabelLocal(phase) {
  switch (phase) {
    case "preparing": return t("process.preparing", "Preparing…");
    case "thinking": return t("process.thinking", "Thinking…");
    case "streaming": return t("process.writing", "Writing…");
    case "executing_tool": return t("process.runningTools", "Running tools…");
    case "waiting_approval": return t("process.waitingApprovalShort", "Waiting for approval…");
    case "failed": return t("process.failedShort", "Failed");
    case "cancelled": return t("process.cancelled", "Cancelled");
    case "completed": return t("process.done", "Done");
    default: return phase || t("process.working", "Working…");
  }
}

/** Live in-flight assistant row — narrative + compact process lines + timer. */
export function renderLiveTurn(turn, api) {
  const row = document.createElement("div");
  row.className = "message-row live-turn";
  row.id = "live-turn-row";
  row.dataset.sessionId = turn.sessionId || "";

  const body = document.createElement("div");
  body.className = "message-body";
  row.appendChild(body);

  // turn header: elapsed
  if (turn.startedAt || turn.phase) {
    const head = document.createElement("div");
    head.className = "turn-head";
    const elapsed = turn.startedAt ? formatDuration(Date.now() - turn.startedAt) : "";
    const phase = turn.phase && turn.active ? phaseLabelLocal(turn.phase) : "";
    head.innerHTML = `
      ${elapsed ? `<span class="turn-elapsed">${escapeHtml(t("process.elapsed", `Processed ${elapsed}`, { time: elapsed }))}</span>` : ""}
      ${phase && turn.phase !== "streaming" && turn.phase !== "executing_tool" ? `<span class="turn-phase-tag">${escapeHtml(phase)}</span>` : ""}`;
    if (elapsed || (phase && turn.phase !== "streaming")) body.appendChild(head);
  }

  // todo progress header (current task x/y)
  const todo = renderTodoHeader(turn.tasks);
  if (todo) body.appendChild(todo);

  // plan mode entry node
  if (turn.planMode) {
    const plan = document.createElement("div");
    plan.className = "proc-line is-plan";
    plan.innerHTML = `<div class="proc-head"><span class="proc-label">${escapeHtml(t("process.planMode", "Plan mode"))}</span></div>`;
    body.appendChild(plan);
  }

  // Interleave: if we have segment timeline use it; else text then tools (legacy)
  const segs = turn.segments;
  // Official T27: reconnect strip during error retry; frozen residue stays after recovery.
  if (turn.reconnectAttempt > 0 || turn.reconnectFrozen) {
    body.appendChild(renderReconnectBar(turn.reconnectAttempt || 0));
  }
  if (segs && segs.length) {
    for (const seg of segs) {
      if (seg.kind === "text" && seg.text) {
        const text = document.createElement("div");
        text.className = "message-part part-text live-stream";
        text.textContent = seg.text;
        body.appendChild(text);
      } else if (seg.kind === "tools" && seg.tools?.length) {
        const frag = renderGroupedProcess(seg.tools, api);
        body.appendChild(frag);
      }
    }
  } else {
    if (turn.streamingText) {
      const text = document.createElement("div");
      text.className = "message-part part-text live-stream";
      text.textContent = turn.streamingText;
      body.appendChild(text);
    }
    if (turn.tools?.length) {
      body.appendChild(renderGroupedProcess(turn.tools, api));
    }
  }

  // thinking indicator when idle of content
  const hasContent = !!(turn.streamingText || turn.tools?.length || (segs && segs.some((s) => (s.kind === "text" && s.text) || (s.kind === "tools" && s.tools?.length))));
  if (!hasContent && !turn.error && turn.active) {
    const thinking = document.createElement("div");
    thinking.className = "live-thinking";
    thinking.textContent = escapeHtml(t("process.thinking", "Thinking…"));
    body.appendChild(thinking);
  } else if (turn.active && turn.phase === "thinking" && hasContent) {
    const thinking = document.createElement("div");
    thinking.className = "live-thinking subtle";
    thinking.textContent = escapeHtml(t("process.thinking", "Thinking…"));
    body.appendChild(thinking);
  }

  if (turn.error) {
    const err = document.createElement("div");
    err.className = "proc-line is-error";
    err.innerHTML = `<div class="proc-head"><span class="proc-label">${escapeHtml(turn.error)}</span></div>`;
    body.appendChild(err);
  }

  // Official T29/T31 footer after turn ends (not while streaming).
  if (!turn.active && (turn.startedAt || turn.durationMs || turn.streamingText || segs?.length)) {
    const durationMs = turn.durationMs || (turn.startedAt ? Date.now() - turn.startedAt : 0);
    const fullText = turn.streamingText
      || (segs || []).filter((s) => s.kind === "text").map((s) => s.text).join("");
    body.appendChild(renderTurnFooter({ durationMs, text: fullText }));
  }

  // live change footer
  const changes = turn.changes || collectChangesFromTools(turn.tools || []);
  if (changes.length) {
    const footer = renderChangeFooter(changes);
    if (footer) {
      body.appendChild(footer);
      footer.querySelector("[data-open-review]")?.addEventListener("click", () => {
        document.dispatchEvent(new CustomEvent("codex:open-review", { detail: { changes } }));
      });
    }
  }

  return row;
}

function collectChangesFromTools(tools) {
  const fakeParts = tools.map((t) => ({
    type: "tool_process",
    tool: t.tool,
    path: t.path || pathFromTool(t),
    diff: t.diff,
    status: t.status,
  }));
  return collectChanges(fakeParts);
}

export function renderUserPreview(text, opts = {}) {
  const row = document.createElement("div");
  row.className = "message-row user live-user-preview";
  row.id = "live-user-preview";
  const time = opts.time || new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const sayLabel = t("process.say", "你说：");
  row.innerHTML = `<div class="message-body">
    <div class="user-meta">
      <span class="user-say">${escapeHtml(sayLabel)}</span>
      <span class="user-time">${escapeHtml(time)}</span>
      <button type="button" class="user-copy" data-copy-user aria-label="${escapeHtml(t("process.copyMessage", "复制消息"))}">${escapeHtml(t("process.copyMessage", "复制消息"))}</button>
      ${opts.editable ? `<button type="button" class="user-edit" data-edit-user aria-label="${escapeHtml(t("process.editMessage", "编辑消息"))}">${escapeHtml(t("process.editMessage", "编辑消息"))}</button>` : ""}
    </div>
    <div class="message-part part-text"></div>
  </div>`;
  row.querySelector(".part-text").textContent = text;
  row.querySelector("[data-copy-user]")?.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(String(text || "")); } catch { /* ignore */ }
  });
  row.querySelector("[data-edit-user]")?.addEventListener("click", () => {
    document.dispatchEvent(new CustomEvent("codex:edit-user-message", { detail: { text } }));
  });
  return row;
}

/** Official T29 reconnect strip — freeze residue preserved when finished. */
export function renderReconnectBar(attempt) {
  const bar = document.createElement("div");
  bar.className = "reconnect-bar" + (attempt <= 0 ? " is-frozen" : "");
  const n = Math.max(0, Math.min(5, Number(attempt) || 0));
  bar.innerHTML = `<span class="reconnect-dot"></span><span>${escapeHtml(t("process.reconnecting", "正在重新连接 {n}/5", { n }))}</span>`;
  return bar;
}

/** Official turn footer: 用时 X + 复制 + 从这里创建聊天分支. */
export function renderTurnFooter(opts = {}) {
  const footer = document.createElement("div");
  footer.className = "turn-footer";
  const used = opts.durationMs ? formatDuration(opts.durationMs, "used") : "";
  const time = opts.time || new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  footer.innerHTML = `
    ${used ? `<span class="turn-used">${escapeHtml(t("process.usedTime", "用时 {time}", { time: used }))}</span>` : ""}
    <button type="button" class="turn-footer-btn" data-copy-turn>${escapeHtml(t("process.copyMessage", "复制消息"))}</button>
    <button type="button" class="turn-footer-btn" data-branch-turn>${escapeHtml(t("process.branchFromHere", "从这里创建聊天分支"))}</button>
    <span class="turn-time">${escapeHtml(time)}</span>`;
  footer.querySelector("[data-copy-turn]")?.addEventListener("click", async () => {
    const text = opts.text || "";
    try { await navigator.clipboard.writeText(String(text)); } catch { /* ignore */ }
  });
  footer.querySelector("[data-branch-turn]")?.addEventListener("click", () => {
    document.dispatchEvent(new CustomEvent("codex:branch-from-here", { detail: opts }));
  });
  return footer;
}

/** Right-side review panel content. */
export function renderReviewPanel(changes, opts = {}) {
  const root = document.createElement("div");
  root.className = "review-panel-inner";
  const list = changes || [];
  let add = 0;
  let del = 0;
  for (const c of list) {
    add += c.added || 0;
    del += c.removed || 0;
  }

  root.innerHTML = `
    <div class="review-panel-head">
      <div class="review-panel-title">
        <span>${escapeHtml(t("review.title", "Review"))}</span>
        <span class="review-stat"><span class="add">+${add}</span> <span class="del">−${del}</span></span>
      </div>
      <button type="button" class="review-close" data-close-review aria-label="Close">×</button>
    </div>
    <div class="review-file-tabs"></div>
    <div class="review-diff-body"></div>`;

  const tabs = root.querySelector(".review-file-tabs");
  const body = root.querySelector(".review-diff-body");
  let active = opts.activePath || list[0]?.path || "";

  function paint() {
    tabs.innerHTML = list.map((c) => {
      const name = (c.path || "").split(/[/\\]/).pop() || c.path;
      const sel = c.path === active ? " is-active" : "";
      return `<button type="button" class="review-tab${sel}" data-path="${escapeHtml(c.path)}">
        <span class="review-tab-name">${escapeHtml(name)}</span>
        <span class="review-tab-stat"><span class="add">+${c.added || 0}</span><span class="del">−${c.removed || 0}</span></span>
      </button>`;
    }).join("") || `<div class="review-empty">${escapeHtml(t("review.empty", "No file changes yet"))}</div>`;

    body.innerHTML = "";
    const cur = list.find((c) => c.path === active) || list[0];
    if (cur?.diff) {
      body.appendChild(renderDiffCard(cur.path, cur.diff));
    } else if (cur) {
      body.innerHTML = `<div class="review-empty">${escapeHtml(cur.path || "")}<br>${escapeHtml(t("review.noDiff", "No diff content for this file"))}</div>`;
    }

    tabs.querySelectorAll("[data-path]").forEach((btn) => {
      btn.addEventListener("click", () => {
        active = btn.dataset.path;
        paint();
      });
    });
  }
  paint();

  root.querySelector("[data-close-review]")?.addEventListener("click", () => {
    document.dispatchEvent(new CustomEvent("codex:close-review"));
  });

  return root;
}

// Back-compat alias used by older call sites
export function renderToolCard(t) {
  return renderProcessLine(t);
}
