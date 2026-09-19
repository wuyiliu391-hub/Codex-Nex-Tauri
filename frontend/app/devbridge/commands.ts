/**
 * Browser-dev command router — replays the exact Tauri shell surface
 * (src-tauri/src/commands/*, registered in lib.rs) without Rust:
 *
 *   engine forwarders   → rpcClient (live codex-app-server over the vite WS
 *                         proxy), with the same response normalizations the
 *                         Rust commands perform (thread flattening, {data}
 *                         unwrapping, {providers|servers|skills|plugins}
 *                         envelopes, base64 exec writes, …)
 *   local store         → shellState (localStorage mirror of shell-state.json)
 *   fs                  → in-memory virtual FS (write → read round-trips;
 *                         list returns the synthetic tree)
 *   plugin market       → honest rejection (git clone cannot run here)
 *   plugin:* raw invokes → browser fallbacks (shell|open → window.open,
 *                         dialog → cancel, window controls → no-op)
 *
 * Everything this mode cannot do reports an error instead of faking success —
 * the same discipline the Rust shell applies (see docs/ARCHITECTURE.md).
 */

import {
  engineConnected,
  engineInitializeMeta,
  rpcRequest,
  rpcRespond,
} from "./rpcClient";
import {
  loadShellState,
  providerEnvKey,
  saveShellState,
  uuidish,
  type ShellStateFile,
} from "./shellState";

type Args = Record<string, unknown>;

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const bool = (v: unknown): boolean => v === true;
const rec = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};

/** Tauri maps camelCase JS args onto snake_case Rust params; accept both. */
function arg(a: Args, camel: string, snake = camel): unknown {
  return a[camel] ?? a[snake];
}

// ── in-memory FS (browser dev only) ─────────────────────────────────────
const virtualFiles = new Map<string, string>();

function vpath(cwd: string, rel: string): string {
  const clean = rel.replace(/\\/g, "/").replace(/^\/+/, "");
  if (clean.split("/").includes("..")) throw new Error("path traversal rejected");
  return `${cwd.replace(/[\\/]+$/, "")}/${clean}`;
}

// ── engine forwarders (commands/engine.rs) ──────────────────────────────

async function flattenThreadStart(v: unknown): Promise<unknown> {
  const obj = rec(v);
  const thread = obj["thread"];
  if (thread && typeof thread === "object") {
    return { ...(thread as Args), threadStart: obj };
  }
  return v;
}

const engineCommands: Record<string, (a: Args) => Promise<unknown>> = {
  engine_status: async () => ({
    connected: engineConnected(),
    initialize: engineInitializeMeta(),
  }),

  new_session: async (a) => {
    const params: Args = {};
    const p = arg(a, "projectPath", "project_path");
    if (typeof p === "string" && p) params["cwd"] = p;
    return flattenThreadStart(await rpcRequest("thread/start", params));
  },

  list_sessions: async (a) =>
    rpcRequest("thread/list", { archived: bool(arg(a, "archived")) }),

  get_session: async (a) => {
    const v = rec(
      await rpcRequest("thread/read", { threadId: str(arg(a, "sessionId", "session_id")) }),
    );
    return v["thread"] ?? v;
  },

  delete_session: async (a) =>
    rpcRequest("thread/delete", { threadId: str(arg(a, "sessionId", "session_id")) }),
  archive_session: async (a) =>
    rpcRequest("thread/archive", { threadId: str(arg(a, "sessionId", "session_id")) }),
  unarchive_session: async (a) =>
    rpcRequest("thread/unarchive", { threadId: str(arg(a, "sessionId", "session_id")) }),

  send_message: async (a) => {
    const items: unknown[] = [{ type: "text", text: str(a["message"]) }];
    const att = a["attachments"];
    if (Array.isArray(att)) items.push(...att);
    return rpcRequest("turn/start", {
      threadId: str(arg(a, "sessionId", "session_id")),
      input: items,
    });
  },

  interrupt_session: async (a) =>
    rpcRequest("turn/interrupt", { threadId: str(arg(a, "sessionId", "session_id")) }),

  resolve_approval: async (a) => {
    const approved = bool(a["approved"]);
    const kind = str(a["kind"]);
    const sessionScope = bool(arg(a, "sessionScope", "session_scope"));
    const decision = approved
      ? sessionScope
        ? "acceptForSession"
        : "accept"
      : kind === "cancel"
        ? "cancel"
        : "decline";
    rpcRespond(a["requestId"] ?? a["request_id"], { decision });
    return null;
  },

  respond_server_request: async (a) => {
    rpcRespond(a["requestId"] ?? a["request_id"], a["result"]);
    return null;
  },

  list_providers: async () => {
    const v = rec(await rpcRequest("config/read", {}));
    const providers =
      rec(v["config"])["model_providers"] ?? v["modelProviders"] ?? {};
    let list: unknown[];
    if (Array.isArray(providers)) list = providers;
    else if (providers && typeof providers === "object") {
      list = Object.entries(providers as Record<string, unknown>).map(
        ([id, val]) => ({ id, ...rec(val) }),
      );
    } else list = [];
    return { providers: list, raw: v };
  },

  save_provider: async (a) => {
    const provider = rec(a["provider"]);
    const id = str(provider["id"]).trim();
    if (!id) throw new Error("provider id is required");
    const name = str(provider["name"]) || id;
    const baseUrl = str(provider["baseUrl"]).trim().replace(/\/+$/, "");
    const apiKey = str(provider["apiKey"]).trim();
    const envKey = providerEnvKey(id);

    const state = loadShellState();
    if (apiKey) {
      state.provider_secrets[id] = apiKey;
      saveShellState();
    }

    const edits: unknown[] = [
      { keyPath: `model_providers.${id}.name`, value: name, mergeStrategy: "replace" },
      { keyPath: `model_providers.${id}.base_url`, value: baseUrl, mergeStrategy: "replace" },
      { keyPath: `model_providers.${id}.wire_api`, value: "responses", mergeStrategy: "replace" },
      {
        keyPath: `model_providers.${id}.requires_openai_auth`,
        value: false,
        mergeStrategy: "replace",
      },
    ];
    if (apiKey) {
      edits.push({ keyPath: `model_providers.${id}.env_key`, value: envKey, mergeStrategy: "replace" });
    }
    const result = await rpcRequest("config/batchWrite", { edits, reloadUserConfig: true });
    return {
      ok: true,
      id,
      envKey,
      keyStored: !!apiKey,
      // Honest browser-mode note: the config write is real, but no process
      // env injection exists here — the key stays in this browser only.
      note: "browser-dev：config/batchWrite 真实写入 config.toml；API key 存于浏览器 localStorage，无法注入引擎进程环境，该 provider 的鉴权仅在桌面壳重启后生效。",
      result,
    };
  },

  probe_provider: async (a) => {
    const base = str(arg(a, "baseUrl", "base_url")).trim().replace(/\/+$/, "");
    const providerId = arg(a, "providerId", "provider_id");
    if (!base) return { ok: false, error: "Base URL 为空" };
    if (!/^https?:\/\//.test(base)) {
      return { ok: false, error: "Base URL 必须以 http:// 或 https:// 开头" };
    }
    const proto = str(a["protocol"]) || "openai_chat";
    const key = str(arg(a, "apiKey", "api_key")).trim();
    const model = str(a["model"]).trim();
    const candidates: [string, string][] =
      proto === "anthropic"
        ? [[`${base}/v1/models`, "anthropic"], [`${base}/models`, "anthropic"]]
        : proto === "ollama"
          ? [[`${base}/api/tags`, "ollama"], [`${base}/models`, "openai"]]
          : base.endsWith("/v1")
            ? [[`${base}/models`, "openai"]]
            : [[`${base}/models`, "openai"], [`${base}/v1/models`, "openai"]];

    let lastErr = "";
    for (const [url, style] of candidates) {
      const headers: Record<string, string> = {};
      if (key) {
        if (style === "anthropic") {
          headers["x-api-key"] = key;
          headers["anthropic-version"] = "2023-06-01";
        } else headers["authorization"] = `Bearer ${key}`;
      }
      try {
        const resp = await fetch(url, { headers });
        const body = await resp.text();
        if (!resp.ok) {
          lastErr = `${url} → HTTP ${resp.status} ${body.slice(0, 160)}`;
          continue;
        }
        const models = extractModelIds(body);
        return {
          ok: true,
          providerId,
          endpoint: url,
          status: resp.status,
          models,
          modelCount: models.length,
          modelFound: model ? models.some((m) => m.toLowerCase() === model.toLowerCase()) : null,
        };
      } catch (err) {
        // Browser CORS / network failure — reported honestly, like the Rust
        // client reports its connect errors.
        lastErr = `${url} → ${err instanceof Error ? err.message : String(err)}`;
      }
    }
    return { ok: false, providerId, error: lastErr };
  },

  list_mcp_servers: async () => {
    const v = rec(await rpcRequest("mcpServerStatus/list", {}));
    const servers = Array.isArray(v["data"]) ? v["data"] : Array.isArray(v["servers"]) ? v["servers"] : [];
    return { servers, raw: v };
  },

  save_mcp_server: async (a) => {
    const server = { ...rec(a["server"]) };
    const name = str(server["name"]) || "server";
    delete server["name"];
    return rpcRequest("config/batchWrite", {
      edits: [{ keyPath: `mcp_servers.${name}`, value: server, mergeStrategy: "replace" }],
      reloadUserConfig: true,
    });
  },

  test_mcp_connection: async () => {
    try {
      await rpcRequest("config/mcpServer/reload", {});
    } catch {
      /* reload best-effort, same as Rust */
    }
    return rpcRequest("mcpServerStatus/list", {});
  },

  set_mcp_server_enabled: async (a) => {
    const name = str(a["name"]);
    await rpcRequest("config/value/write", {
      keyPath: `mcp_servers.${name}.enabled`,
      value: bool(a["enabled"]),
      mergeStrategy: "replace",
    });
    return rpcRequest("config/mcpServer/reload", {});
  },

  list_skills: async () => {
    const v = rec(await rpcRequest("skills/list", {}));
    const skills = Array.isArray(v["skills"]) ? v["skills"] : Array.isArray(v["data"]) ? v["data"] : [];
    return { skills, raw: v };
  },
  reload_skills: async () => rpcRequest("skills/list", {}),

  list_plugins: async () => {
    const v = rec(await rpcRequest("plugin/list", {}));
    const plugins = Array.isArray(v["plugins"]) ? v["plugins"] : Array.isArray(v["data"]) ? v["data"] : [];
    return { plugins, raw: v };
  },
  set_plugin_enabled: async (a) => {
    const id = str(a["id"]);
    return bool(a["enabled"])
      ? rpcRequest("plugin/install", { id })
      : rpcRequest("plugin/uninstall", { id });
  },

  open_shell: async (a) => {
    const processId = str(arg(a, "sessionId", "session_id")) || uuidish();
    const shell =
      str(a["shell"]) || "powershell.exe";
    const params: Args = {
      command: [shell],
      processId,
      tty: true,
      streamStdin: true,
      streamStdoutStderr: true,
    };
    const cwd = str(a["cwd"]);
    if (cwd) params["cwd"] = cwd;
    try {
      const v = rec(await rpcRequest("command/exec", params));
      // Ensure the client-supplied processId is always visible to the UI.
      return { ...v, processId: v["processId"] ?? processId };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("timeout") || msg.includes("WouldBlock")) {
        return { processId, note: msg };
      }
      throw err;
    }
  },

  write_shell: async (a) => {
    const data = str(a["data"]);
    const b64 = btoa(unescape(encodeURIComponent(data)));
    return rpcRequest("command/exec/write", {
      processId: str(arg(a, "sessionId", "session_id")),
      deltaBase64: b64,
    });
  },

  read_shell: async () => ({
    note: "output streams via command/exec/outputDelta notifications",
    items: [],
  }),

  close_shell: async (a) => {
    const processId = str(arg(a, "sessionId", "session_id"));
    try {
      await rpcRequest("command/exec/write", { processId, closeStdin: true });
    } catch {
      /* best-effort, same as Rust */
    }
    return rpcRequest("command/exec/terminate", { processId });
  },

  git_status: async (a) => {
    const threadId = str(arg(a, "threadId", "thread_id"));
    if (threadId) {
      return rpcRequest("thread/shellCommand", {
        threadId,
        command: "git status --porcelain=v1 -b",
      });
    }
    return { branch: "", dirty: false, files: [], note: "pass thread_id to run git status via thread/shellCommand", cwd: str(a["cwd"]) };
  },

  get_runtime_events: async (a) =>
    rpcRequest("thread/timeline/list", { threadId: str(arg(a, "sessionId", "session_id")) }),

  list_agent_tools: async () => ({ tools: [] }),

  rpc_raw: async (a) => {
    const params = a["params"];
    return rpcRequest(
      str(a["method"]),
      params == null ? {} : (params as Record<string, unknown>),
    );
  },
};

function extractModelIds(body: string): string[] {
  try {
    const value = JSON.parse(body) as Record<string, unknown> | unknown[];
    let arr: unknown[] | null = null;
    if (Array.isArray(value)) arr = value;
    else if (value && typeof value === "object") {
      const v = value as Record<string, unknown>;
      if (Array.isArray(v["data"])) arr = v["data"] as unknown[];
      else if (Array.isArray(v["models"])) arr = v["models"] as unknown[];
    }
    if (!arr) return [];
    return arr
      .map((m) => {
        const r = rec(m);
        const id = r["id"] ?? r["name"] ?? r["model"];
        return typeof id === "string" ? id : null;
      })
      .filter((x): x is string => !!x);
  } catch {
    return [];
  }
}

// ── local store (commands/settings.rs, pets.rs, calendar.rs, …) ─────────

function snapshot(s: ShellStateFile) {
  return {
    settings: s.settings,
    preferences: s.preferences,
    pets: s.pets,
    calendar: s.calendar,
    cinema_timelines: s.cinema_timelines,
    cinema_jobs: s.cinema_jobs,
    connectors: s.connectors,
    shortcuts: s.shortcuts,
  };
}

function upsert<T extends { id?: unknown }>(list: T[], item: T): void {
  const i = list.findIndex((x) => x.id === item.id);
  if (i >= 0) list[i] = item;
  else list.push(item);
}

const storeCommands: Record<string, (a: Args) => Promise<unknown>> = {
  get_state: async () => snapshot(loadShellState()),
  check_dependencies: async () => [
    { name: "tauri-shell", ok: true, detail: "browser-dev bridge (vite --mode browser)" },
    {
      name: "codex-app-server",
      ok: engineConnected(),
      detail: engineConnected() ? "connected" : "not connected (start engine + keep vite proxy)",
    },
    { name: "ripgrep", ok: false, detail: "n/a in browser dev" },
  ],

  get_settings: async () => loadShellState().settings,
  save_settings: async (a) => {
    const s = loadShellState();
    // Merge over the stored object. The frontend dual-writes camelCase
    // mirrors alongside the snake_case Rust fields; both shapes persist and
    // the dual-shape readers pick what they need (same tolerance as the
    // desktop store, whose serde struct ignores the extra keys on read).
    s.settings = { ...s.settings, ...rec(a["settings"]) };
    saveShellState();
    return null;
  },
  get_preferences: async () => loadShellState().preferences,
  save_preferences: async (a) => {
    loadShellState().preferences = rec(a["preferences"]);
    saveShellState();
    return null;
  },
  list_shortcuts: async () => loadShellState().shortcuts,
  save_shortcuts: async (a) => {
    loadShellState().shortcuts = Array.isArray(a["shortcuts"]) ? (a["shortcuts"] as Args[]) : [];
    saveShellState();
    return null;
  },

  list_pets: async () => loadShellState().pets,
  save_pets: async (a) => {
    loadShellState().pets = Array.isArray(a["pets"]) ? (a["pets"] as Args[]) : [];
    saveShellState();
    return null;
  },
  wake_pet: async (a) => setPetMood(a, "happy"),
  tuck_pet: async (a) => setPetMood(a, "sleepy"),
  create_custom_pet: async (a) => {
    const s = loadShellState();
    const pet = {
      id: uuidish(),
      name: str(a["name"]),
      kind: str(a["kind"]),
      sprite: "",
      mood: "idle",
      custom: true,
    };
    s.pets.push(pet);
    saveShellState();
    return pet;
  },

  list_calendar_events: async () => loadShellState().calendar,
  save_calendar_event: async (a) => {
    const s = loadShellState();
    upsert(s.calendar, rec(a["event"]) as Args & { id: unknown });
    saveShellState();
    return null;
  },
  delete_calendar_event: async (a) => {
    const s = loadShellState();
    s.calendar = s.calendar.filter((e) => e["id"] !== a["id"]);
    saveShellState();
    return null;
  },

  list_cinema_timelines: async () => loadShellState().cinema_timelines,
  list_cinema_jobs: async () => loadShellState().cinema_jobs,
  save_cinema_timeline: async (a) => {
    const s = loadShellState();
    upsert(s.cinema_timelines, rec(a["timeline"]) as Args & { id: unknown });
    saveShellState();
    return null;
  },
  delete_cinema_timeline: async (a) => {
    const s = loadShellState();
    s.cinema_timelines = s.cinema_timelines.filter((t) => t["id"] !== a["id"]);
    saveShellState();
    return null;
  },
  enqueue_cinema_render: async (a) => {
    const s = loadShellState();
    const job = { id: uuidish(), timeline_id: str(arg(a, "timelineId", "timeline_id")), status: "queued", progress: 0 };
    s.cinema_jobs.push(job);
    saveShellState();
    return job;
  },
  cancel_cinema_job: async (a) => {
    const s = loadShellState();
    const job = s.cinema_jobs.find((j) => j["id"] === a["id"]);
    if (job) job["status"] = "cancelled";
    saveShellState();
    return null;
  },

  list_connectors: async () => loadShellState().connectors,
  save_connector: async (a) => {
    const s = loadShellState();
    upsert(s.connectors, rec(a["connector"]) as Args & { id: unknown });
    saveShellState();
    return null;
  },
  delete_connector: async (a) => {
    const s = loadShellState();
    s.connectors = s.connectors.filter((c) => c["id"] !== a["id"]);
    saveShellState();
    return null;
  },
  test_connector: async (a) => {
    const s = loadShellState();
    const c = s.connectors.find((x) => x["id"] === a["id"]);
    if (!c) throw new Error("connector not found");
    // Same stub contract as the Rust command (connectors.rs).
    return { ok: true, id: c["id"], kind: c["kind"], detail: "stub probe" };
  },

  list_files: async (a) => {
    const cwd = str(a["cwd"]);
    const dir = str(a["dir"]);
    const prefix = dir ? vpath(cwd, dir) + "/" : cwd.replace(/[\\/]+$/, "") + "/";
    const seen = new Set<string>();
    const entries: unknown[] = [];
    for (const key of virtualFiles.keys()) {
      if (!key.startsWith(prefix)) continue;
      const rest = key.slice(prefix.length);
      if (!rest) continue;
      const seg = rest.split("/")[0]!;
      const isDir = rest.includes("/");
      const id = `${prefix}${seg}`;
      if (seen.has(id)) continue;
      seen.add(id);
      entries.push({
        name: seg,
        path: isDir ? `${dir ? dir + "/" : ""}${seg}` : str(arg(a, "dir")).length ? `${dir}/${seg}` : seg,
        absPath: id,
        isDirectory: isDir,
        ext: isDir ? "" : (seg.split(".").pop() ?? "").toLowerCase(),
      });
    }
    entries.sort((x, y) => {
      const r = rec;
      const aDir = r(x)["isDirectory"] === true;
      const bDir = r(y)["isDirectory"] === true;
      if (aDir !== bDir) return aDir ? -1 : 1;
      return str(r(x)["name"]).toLowerCase().localeCompare(str(r(y)["name"]).toLowerCase());
    });
    return entries;
  },
  read_file: async (a) => {
    const key = vpath(str(a["cwd"]), str(a["path"]));
    const text = virtualFiles.get(key);
    if (text === undefined) throw new Error(`browser-dev virtual fs: no such file ${key}`);
    const lines = text.split("\n");
    const start = Math.min(Number(a["offset"] ?? 0), lines.length);
    const limit = a["limit"] != null ? Math.min(start + Number(a["limit"]), lines.length) : lines.length;
    return lines.slice(start, limit).join("\n");
  },
  write_file: async (a) => {
    virtualFiles.set(vpath(str(a["cwd"]), str(a["path"])), str(a["content"]));
    return null;
  },

  list_scheduled_tasks: async () => loadShellState().scheduled_tasks,
  save_scheduled_tasks: async (a) => {
    loadShellState().scheduled_tasks = Array.isArray(a["tasks"]) ? (a["tasks"] as Args[]) : [];
    saveShellState();
    return null;
  },
  run_scheduled_task: async (a) => {
    const s = loadShellState();
    const t = s.scheduled_tasks.find((x) => x["id"] === a["id"]);
    if (!t) throw new Error(`scheduled task not found: ${str(a["id"])}`);
    return { ok: true, id: t["id"], title: t["title"], note: "engine has no scheduler API; the run is handled locally" };
  },
  list_pull_requests: async () => loadShellState().pull_requests,
  save_pull_requests: async (a) => {
    loadShellState().pull_requests = Array.isArray(a["prs"]) ? a["prs"] : [];
    saveShellState();
    return null;
  },
};

async function setPetMood(a: Args, mood: string): Promise<unknown> {
  const s = loadShellState();
  const pet = s.pets.find((p) => p["id"] === a["id"]);
  if (!pet) throw new Error("pet not found");
  pet["mood"] = mood;
  saveShellState();
  return pet;
}

// ── plugin market: honest rejection (market.rs needs git + fs) ──────────
const marketUnavailable = async (a: Args): Promise<never> => {
  throw new Error(`plugin market is not available in browser-dev mode (command ${str(a["__cmd"] ?? "market.*")})`);
};

// ── raw plugin invokes ──────────────────────────────────────────────────
const pluginCommands: Record<string, (a: Args) => Promise<unknown>> = {
  "plugin:dialog|open": async (a) => {
    // Native pickers don't exist here. Cancel is the honest answer; the
    // callers (pickProjectDirectory / pickAttachmentFiles) treat null as
    // "user cancelled".
    console.warn("[devbridge] plugin:dialog|open → cancelled (browser dev)", a);
    return null;
  },
  "plugin:dialog|save": async () => null,
  "plugin:dialog|message": async () => true,
  "plugin:dialog|ask": async () => true,
  "plugin:dialog|confirm": async () => true,
  "plugin:shell|open": async (a) => {
    const path = str(a["path"]);
    if (/^https?:\/\//.test(path)) window.open(path, "_blank");
    else console.warn("[devbridge] plugin:shell|open ignored (non-URL path in browser dev):", path);
    return null;
  },
  "plugin:fs|read_text_file": async (a) => {
    const p = str(a["path"]);
    const text = virtualFiles.get(p) ?? [...virtualFiles.entries()].find(([k]) => k.endsWith(p))?.[1];
    if (text === undefined) throw new Error(`browser-dev virtual fs: no such file ${p}`);
    return text;
  },
  "plugin:window|minimize": async () => null,
  "plugin:window|toggle_maximize": async () => null,
  "plugin:window|maximize": async () => null,
  "plugin:window|unmaximize": async () => null,
  "plugin:window|close": async () => {
    console.warn("[devbridge] close requested in browser dev — window.close() is up to the tab");
    return null;
  },
  "plugin:window|is_maximized": async () => false,
  "plugin:window|start_dragging": async () => null,
};

// ── dispatcher ──────────────────────────────────────────────────────────

const marketNames = new Set([
  "plugin_marketplaces",
  "plugin_marketplace_add",
  "plugin_marketplace_remove",
  "plugin_marketplace_plugins",
  "plugin_install",
  "plugin_add_local",
  "plugin_installed",
  "plugin_uninstall",
  "plugin_set_enabled",
  "plugin_skills",
]);

export async function dispatchCommand(cmd: string, args: Args): Promise<unknown> {
  const handler =
    engineCommands[cmd] ??
    storeCommands[cmd] ??
    pluginCommands[cmd] ??
    (marketNames.has(cmd) ? marketUnavailable : undefined);
  if (!handler) {
    const msg = `browser-dev bridge: unknown command "${cmd}"`;
    console.error(msg);
    throw new Error(msg);
  }
  if (marketNames.has(cmd)) return handler({ ...args, __cmd: cmd });
  return handler(args);
}
