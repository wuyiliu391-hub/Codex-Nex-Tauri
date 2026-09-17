import fs from "node:fs";
import path from "node:path";

const root = "scratch/official-schemas";

function extractMethods(file) {
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, "utf8");
  const methods = new Set();
  const reMethod = /method["']?\s*[:=]\s*["']([^"']+)["']/g;
  for (const m of text.matchAll(reMethod)) methods.add(m[1]);
  const reSlash =
    /["']((?:thread|turn|item|mcp|config|plugin|skill|account|app|fs|marketplace|permission|model|login|logout|auth|realtime|review|experimental|hook|project|command|process|guardian|external|feedback|remote|worktree|memory|goal|editor|file|network|sandbox|user|session|rollout)[A-Za-z0-9_./-]*\/[A-Za-z0-9_./-]+)["']/g;
  for (const m of text.matchAll(reSlash)) methods.add(m[1]);
  return [...methods];
}

const officialFiles = [
  path.join(root, "ClientRequest.ts"),
  path.join(root, "ClientRequest.json"),
  path.join(root, "ServerNotification.ts"),
  path.join(root, "ServerNotification.json"),
  path.join(root, "ServerRequest.ts"),
  path.join(root, "codex_app_server_protocol.v2.schemas.json"),
  path.join(root, "codex_app_server_protocol.schemas.json"),
  path.join(root, "v2", "index.ts"),
];

const official = new Set();
for (const f of officialFiles) {
  for (const m of extractMethods(f)) official.add(m);
}

const ours = new Set();
for (const f of [
  "frontend/src/protocol/notifications.ts",
  "frontend/src/protocol/requests.ts",
  "src-tauri/src/codex/protocol.rs",
]) {
  const src = fs.readFileSync(f, "utf8");
  const re = /["']([a-zA-Z][a-zA-Z0-9_]*(?:[/.][a-zA-Z0-9_-]+)+)["']/g;
  for (const m of src.matchAll(re)) ours.add(m[1]);
}

const norm = (s) => s.replaceAll("/", "-");
const oursSet = new Set(ours);
for (const o of ours) oursSet.add(norm(o));

const officialOnly = [...official].filter((m) => !oursSet.has(m) && !oursSet.has(norm(m))).sort();
const onlyOurs = [...ours].filter((m) => {
  for (const o of official) {
    if (o === m || norm(o) === m || norm(o) === norm(m)) return false;
  }
  return true;
}).sort();
const overlap = [...official]
  .filter((m) => oursSet.has(m) || oursSet.has(norm(m)))
  .sort();

const prefixCount = (list) => {
  const map = new Map();
  for (const m of list) {
    const p = m.split("/")[0] || m.split("-")[0];
    map.set(p, (map.get(p) || 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
};

const report = {
  generatedFrom: "codex-cli 0.154.0 app-server generate-ts/json-schema",
  schemaDir: root,
  officialCount: official.size,
  oursCount: ours.size,
  overlapCount: overlap.length,
  officialOnlyCount: officialOnly.length,
  oursOnlyCount: onlyOurs.length,
  officialOnlyByPrefix: prefixCount(officialOnly),
  officialOnly,
  oursOnly: onlyOurs,
  overlap,
};

fs.writeFileSync(path.join(root, "method-inventory.json"), JSON.stringify(report, null, 2));
fs.writeFileSync(
  path.join(root, "method-inventory.md"),
  [
    `# App-server method inventory (codex-cli 0.154.0)`,
    ``,
    `- Official schema methods: **${official.size}**`,
    `- Project protocol strings: **${ours.size}**`,
    `- Overlap: **${overlap.length}**`,
    `- Official-only (not in our lists): **${officialOnly.length}**`,
    `- Ours-only (not in official extract): **${onlyOurs.length}**`,
    ``,
    `## Official-only by prefix`,
    ``,
    ...prefixCount(officialOnly)
      .slice(0, 40)
      .map(([p, n]) => `- \`${p}\`: ${n}`),
    ``,
    `## Official-only methods (full)`,
    ``,
    ...officialOnly.map((m) => `- \`${m}\``),
    ``,
    `## Our-only strings (noise + shell notes)`,
    ``,
    ...onlyOurs.slice(0, 80).map((m) => `- \`${m}\``),
    ``,
  ].join("\n"),
);

console.log("official", official.size, "ours", ours.size, "overlap", overlap.length);
console.log("officialOnly", officialOnly.length, "oursOnly", onlyOurs.length);
console.log("top prefixes", prefixCount(officialOnly).slice(0, 20));
console.log("wrote", path.join(root, "method-inventory.json"));
console.log("sample official-only:\n" + officialOnly.slice(0, 40).join("\n"));
