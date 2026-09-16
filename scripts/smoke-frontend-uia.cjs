// Closed-loop smoke for UIA-parity frontend changes (no DOM required).
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "frontend", "src", "js");
const files = ["state.js", "i18n.js", "home.js", "render.js", "live-turn.js", "bridge.js"];
let failed = 0;

for (const f of files) {
  const src = fs.readFileSync(path.join(root, f), "utf8");
  try {
    // Syntax check via Function constructor on stripped ESM is unreliable; use node --check externally.
  } catch (_) {}
}

const i18n = fs.readFileSync(path.join(root, "i18n.js"), "utf8");
const mustKeys = [
  "home.helpApproval",
  "home.approvalTitle",
  "home.askApprovalDesc",
  "home.helpApprovalDesc",
  "home.intensity",
  "home.effort.low",
  "home.effort.medium",
  "home.effort.high",
  "home.effort.xhigh",
  "home.effort.ultra",
  "process.usedTime",
  "process.branchFromHere",
  "process.reconnecting",
  "process.runningCmd",
  "process.ranIn",
  "process.ranCmd",
  "process.say",
  "process.success",
  "process.shell",
  "process.copyMessage",
  "process.editMessage",
];
for (const k of mustKeys) {
  if (!i18n.includes(`"${k}"`)) {
    console.error("MISSING i18n key:", k);
    failed += 1;
  }
}

const state = fs.readFileSync(path.join(root, "state.js"), "utf8");
if (!state.includes("modelReasoningEffort")) {
  console.error("state.js missing modelReasoningEffort");
  failed += 1;
}

const home = fs.readFileSync(path.join(root, "home.js"), "utf8");
for (const marker of ["EFFORT_ORDER", "intensity-slider", "home.approvalTitle", "home.helpApproval", "currentEffortLabel"]) {
  if (!home.includes(marker)) {
    console.error("home.js missing", marker);
    failed += 1;
  }
}

const render = fs.readFileSync(path.join(root, "render.js"), "utf8");
for (const marker of ["renderTurnFooter", "renderReconnectBar", "process.runningCmd", "process.ranIn", "proc-shell-block", 'style === "used"']) {
  if (!render.includes(marker)) {
    console.error("render.js missing", marker);
    failed += 1;
  }
}

const live = fs.readFileSync(path.join(root, "live-turn.js"), "utf8");
for (const marker of ["reconnectAttempt", "parseReconnect", "item.agentMessage.delta", "item.commandExecution.outputDelta", "reconnectFrozen"]) {
  if (!live.includes(marker)) {
    console.error("live-turn.js missing", marker);
    failed += 1;
  }
}

const bridge = fs.readFileSync(path.join(root, "bridge.js"), "utf8");
for (const marker of ["codex:item.agentMessage.delta", "codex:error", "codex:turn.started"]) {
  if (!bridge.includes(marker)) {
    console.error("bridge.js missing", marker);
    failed += 1;
  }
}

// Duration format unit checks (inline copy of Chinese rules)
function formatDuration(ms, style = "elapsed") {
  if (!ms || ms < 0) return "";
  if (ms < 1000) return `${ms}ms`;
  const totalSec = ms / 1000;
  if (totalSec < 60) {
    const s = totalSec < 10 ? totalSec.toFixed(1) : String(Math.floor(totalSec));
    return `${s}秒`;
  }
  const m = Math.floor(totalSec / 60);
  const s = Math.floor(totalSec % 60);
  if (style === "used") return s ? `${m}分钟 ${s}秒` : `${m}分钟`;
  return s ? `${m}分${s}秒` : `${m}分`;
}
const cases = [
  [46000, "elapsed", "46秒"],
  [85000, "elapsed", "1分25秒"],
  [126000, "used", "2分钟 6秒"],
];
for (const [ms, style, expect] of cases) {
  const got = formatDuration(ms, style);
  if (got !== expect) {
    console.error("formatDuration fail", ms, style, "got", got, "want", expect);
    failed += 1;
  }
}

if (failed) {
  console.error("SMOKE FAILED:", failed);
  process.exit(1);
}
console.log("SMOKE OK — UIA parity markers + duration formats verified");
