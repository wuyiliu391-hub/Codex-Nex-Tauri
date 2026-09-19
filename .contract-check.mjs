// Throwaway contract check for the kernel <-> frontend changes made in this
// batch. Verifies the field names each side reads/writes actually line up, by
// extracting them from both source trees.
//
// Usage: node .contract-check.mjs
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(p, "utf8");
let fail = 0;
const check = (name, ok, detail = "") => {
  if (ok) {
    console.log(`ok    ${name}`);
  } else {
    fail++;
    console.log(`FAIL  ${name}${detail ? `\n        ${detail}` : ""}`);
  }
};

// Flatten a source file so a multi-line literal can be searched as one line:
// strip block AND line comments, collapse whitespace, and remove the space a
// rustfmt line break leaves before a method call (`payload\n  .get(...)`).
const flat = (s) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s+\./g, ".");

const events = flat(read("src-tauri/src/kernel/events.rs"));
const provider = flat(read("src-tauri/src/kernel/provider.rs"));
const stateRs = flat(read("src-tauri/src/kernel/state.rs"));
const kernelCmd = flat(read("src-tauri/src/commands/kernel.rs"));
const kernelCfg = flat(read("src-tauri/src/commands/kernel_config.rs"));
const connectors = flat(read("src-tauri/src/commands/connectors.rs"));
const session = flat(read("src-tauri/src/kernel/session.rs"));
const settingsRs = flat(read("src-tauri/src/commands/settings.rs"));
const stateStore = flat(read("src-tauri/src/state.rs"));

const reducer = flat(read("frontend/app/state/notificationReducer.ts"));
const appStore = flat(read("frontend/app/state/appStore.ts"));
const turnStream = flat(read("frontend/app/views/TurnStream.tsx"));
const configTab = flat(read("frontend/app/views/settings/tabs/ConfigurationTab.tsx"));
const pluginsTab = flat(read("frontend/app/views/settings/tabs/PluginsTab.tsx"));
const accountTab = flat(read("frontend/app/views/settings/tabs/AccountTab.tsx"));
const generalTab = flat(read("frontend/app/views/settings/tabs/GeneralTab.tsx"));
const connTab = flat(read("frontend/app/views/settings/tabs/ConnectionsTab.tsx"));
const turnCss = flat(read("frontend/app/styles/turn.css"));

console.log("── token usage counters ──");
// The reducer reads these six keys; the emitter must produce all six (three
// mandatory, three optional-but-present-when-known).
for (const key of [
  "inputTokens",
  "outputTokens",
  "totalTokens",
  "cachedInputTokens",
  "reasoningOutputTokens",
  "modelContextWindow",
]) {
  check(
    `reducer reads ${key} and events.rs emits ${key}`,
    reducer.includes(`"${key}"`) && events.includes(`"${key}"`),
    `reducer:${reducer.includes(`"${key}"`)} events:${events.includes(`"${key}"`)}`,
  );
}
check(
  "ProviderChunk::Usage carries the three optional counters",
  provider.includes("cached_input_tokens: Option<u64>") &&
    provider.includes("reasoning_output_tokens: Option<u64>") &&
    provider.includes("model_context_window: Option<u64>"),
);
check(
  "state.rs destructures all six Usage fields",
  stateRs.includes("cached_input_tokens,") &&
    stateRs.includes("reasoning_output_tokens,") &&
    stateRs.includes("model_context_window,"),
);
check(
  "state.rs forwards all six to the emitter",
  /token_usage_updated\( &thread_id, &turn_id, u\.input_tokens, u\.output_tokens, u\.total_tokens, u\.cached_input_tokens, u\.reasoning_output_tokens, u\.model_context_window, \)/.test(
    stateRs,
  ),
);
check(
  "context badge gate is satisfied by a positive window",
  turnStream.length > 0 && read("frontend/app/views/Composer.tsx").includes("modelContextWindow > 0"),
);

console.log("\n── provider wire decoders ──");
check(
  "openai_chat passes cache/reasoning keys",
  /usage_chunk\( usage, "prompt_tokens", "completion_tokens", Some\("cached_tokens"\), Some\("reasoning_tokens"\), \)/.test(
    flat(read("src-tauri/src/kernel/http_provider.rs")),
  ),
);
check(
  "anthropic passes its own cache/thinking keys",
  flat(read("src-tauri/src/kernel/http_provider.rs")).includes(
    'Some("cache_read_input_tokens"), Some("thinking_tokens")',
  ),
);

console.log("\n── engine_status initialize block ──");
for (const consumer of [
  ["ConfigurationTab", configTab, "version"],
  ["GeneralTab", generalTab, "codexHome"],
]) {
  const [name, src, field] = consumer;
  check(
    `${name} reads initialize.${field} and kernel.rs provides it`,
    src.includes(`initialize?.${field}`) && kernelCmd.includes(`"${field}"`),
  );
}

console.log("\n── provider list shape ──");
for (const key of ["hasApiKey", "realBaseUrl", "name", "models"]) {
  check(
    `appStore reads ${key}, list_providers emits it`,
    appStore.includes(`"${key}"`) && kernelCfg.includes(`"${key}"`),
  );
}
check(
  "AccountTab key badge reads hasApiKey",
  accountTab.includes("hasApiKey"),
);

console.log("\n── MCP servers ──");
check(
  "PluginsTab nests under `server` and save_mcp_server unwraps it",
  pluginsTab.includes("server: { name, transport, command, enabled: true }") &&
    kernelCfg.includes('payload.get("server").unwrap_or(&payload)'),
);
check(
  "asServers reads transport/command and list_mcp_servers emits both",
  pluginsTab.includes('s["transport"]') &&
    pluginsTab.includes('s["command"]') &&
    kernelCfg.includes('"transport": text("transport")') &&
    kernelCfg.includes('"command": text("command")'),
);
check(
  "test_mcp_connection resolves the name from the nested object",
  kernelCfg.includes('payload.get("server").and_then(|s| s.get("name")'),
);
console.log("\n── check_dependencies ──");
check(
  "ConfigurationTab reads detail, DependencyStatus sends detail",
  configTab.includes('rec["detail"] ?? rec["message"]') &&
    flat(read("src-tauri/src/commands/app_state.rs")).includes("pub detail: String"),
);

console.log("\n── plugin enable unification ──");
check(
  "both command names route through one function",
  kernelCfg.includes("super::market::set_installed_enabled(&state, &id, enabled)?") &&
    flat(read("src-tauri/src/commands/market.rs")).includes(
      "set_installed_enabled(&state, &id, enabled)",
    ),
);
check(
  "list_plugins reads the same record set as plugin_installed",
  kernelCfg.includes("super::market::installed_plugins(&state)") &&
    flat(read("src-tauri/src/commands/market.rs")).includes(
      'json!({ "plugins": installed_plugins(&state) })',
    ),
);

console.log("\n── connector probe honesty ──");
check(
  "test_connector never reports ok:true without a probe",
  !/"ok": true,\s*"id": connector\.id/.test(connectors) && connectors.includes('"ok": false'),
);

console.log("\n── thread cwd ──");
check(
  "new_session accepts project_path and stores it",
  kernelCmd.includes("project_path: Option<String>") &&
    kernelCmd.includes("create_thread_in(&cwd)"),
);
check(
  "list_sessions and get_session return cwd",
  (kernelCmd.match(/"cwd": t\.cwd/g) || []).length >= 1 &&
    kernelCmd.includes('"cwd": thread.cwd'),
);
check(
  "Thread struct has cwd",
  session.includes("pub cwd: String"),
);
check(
  "appStore derives projects from session cwd",
  appStore.includes("deriveProjects") && appStore.includes('rec["cwd"]'),
);

console.log("\n── settings flatten ──");
check(
  "Settings carries unknown keys through `flatten`",
  stateStore.includes("#[serde(flatten)] pub extra: serde_json::Map"),
);
check(
  "save_settings normalises the dual-shape payload",
  settingsRs.includes("settings.normalise_keys()"),
);

console.log("\n── failed-turn rendering ──");
check(
  "TurnStream reads turn.turnStatus and turn.error",
  turnStream.includes("turn.turnStatus") && turnStream.includes("turn.error"),
);
check(
  "turn.css styles the failure header and detail",
  turnCss.includes(".turn-elapsed-head.is-failed") && turnCss.includes(".turn-fail-detail"),
);

console.log("\n── elapsed timer ──");
// Only the code matters here; the doc comment above `formatSeconds` quotes the
// old "460毫秒" format as the reason it was removed.
const turnStreamCode = flat(
  read("frontend/app/views/TurnStream.tsx")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, ""),
);
check(
  "no fractional seconds or ms units in the formatter",
  !/毫|toFixed/.test(turnStreamCode),
  turnStreamCode.match(/.{0,40}(毫|toFixed).{0,40}/)?.[0] ?? "",
);
check(
  "tick interval matches the 1s display resolution",
  turnStreamCode.includes("window.setInterval(read, 1000)"),
);

console.log(fail ? `\n${fail} FAILURES` : "\nall checks pass");
process.exit(fail ? 1 : 0);
