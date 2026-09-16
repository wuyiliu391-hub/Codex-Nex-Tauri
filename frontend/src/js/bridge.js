/**
 * Wails → Tauri bridge.
 *
 * Drop-in replacement for `window.go.main.App` used across Codex-Nex frontend.
 * Keeps the same camelCase method names the UI already calls.
 *
 * Usage:
 *   import { api, onCodexEvent } from "./bridge.js";
 *   const snap = await api.GetState();
 *   onCodexEvent("codex:turn.completed", (payload) => { ... });
 */

const isTauri = () =>
  typeof window !== "undefined" &&
  (window.__TAURI_INTERNALS__ || window.__TAURI__ || window.tauri);

async function invoke(cmd, args = {}) {
  if (!isTauri()) {
    throw new Error("Tauri runtime not available");
  }
  // Tauri v2 global API
  const tauri = window.__TAURI__ || window.tauri;
  const invokeFn =
    tauri?.core?.invoke ||
    tauri?.tauri?.invoke ||
    window.__TAURI_INTERNALS__?.invoke;
  if (typeof invokeFn !== "function") {
    throw new Error("Tauri invoke not found");
  }
  return invokeFn(cmd, args);
}

async function listen(event, handler) {
  const tauri = window.__TAURI__ || window.tauri;
  const listenFn = tauri?.event?.listen || tauri?.tauri?.listen;
  if (typeof listenFn !== "function") {
    console.warn("Tauri listen not available", event);
    return () => {};
  }
  return listenFn(event, (e) => handler(e?.payload ?? e));
}

/** Event subscription helper for agent/runtime events. */
export function onCodexEvent(name, handler) {
  let unlisten = null;
  listen(name, handler).then((fn) => {
    unlisten = fn;
  });
  return () => {
    if (typeof unlisten === "function") unlisten();
  };
}

/** Map Codex-Nex camelCase methods → Tauri commands. */
export const api = {
  // --- local shell ---
  GetState: () => invoke("get_state"),
  CheckDependencies: () => invoke("check_dependencies"),
  GetSettings: () => invoke("get_settings"),
  SaveSettings: (settings) => invoke("save_settings", { settings }),
  GetPreferences: () => invoke("get_preferences"),
  SavePreferences: (preferences) => invoke("save_preferences", { preferences }),
  ListShortcuts: () => invoke("list_shortcuts"),
  SaveShortcuts: (shortcuts) => invoke("save_shortcuts", { shortcuts }),

  // pets
  ListPets: () => invoke("list_pets"),
  SavePets: (pets) => invoke("save_pets", { pets }),
  WakePet: (id) => invoke("wake_pet", { id }),
  TuckPet: (id) => invoke("tuck_pet", { id }),
  CreateCustomPet: (name, kind) => invoke("create_custom_pet", { name, kind }),

  // calendar
  ListCalendarEvents: () => invoke("list_calendar_events"),
  SaveCalendarEvent: (event) => invoke("save_calendar_event", { event }),
  DeleteCalendarEvent: (id) => invoke("delete_calendar_event", { id }),

  // cinema
  ListCinemaTimelines: () => invoke("list_cinema_timelines"),
  ListCinemaJobs: () => invoke("list_cinema_jobs"),
  SaveCinemaTimeline: (timeline) => invoke("save_cinema_timeline", { timeline }),
  DeleteCinemaTimeline: (id) => invoke("delete_cinema_timeline", { id }),
  EnqueueCinemaRender: (timelineId) =>
    invoke("enqueue_cinema_render", { timelineId }),
  CancelCinemaJob: (id) => invoke("cancel_cinema_job", { id }),

  // connectors
  ListConnectors: () => invoke("list_connectors"),
  SaveConnector: (connector) => invoke("save_connector", { connector }),
  DeleteConnector: (id) => invoke("delete_connector", { id }),
  TestConnector: (id) => invoke("test_connector", { id }),

  // files
  ListFiles: (cwd, dir = "") => invoke("list_files", { cwd, dir }),
  ReadFile: (cwd, path, offset, limit) =>
    invoke("read_file", { cwd, path, offset, limit }),
  WriteFile: (cwd, path, content) =>
    invoke("write_file", { cwd, path, content }),

  // --- engine (codex-app-server) ---
  EngineStatus: () => invoke("engine_status"),
  NewSession: (projectPath) => invoke("new_session", { projectPath }),
  ListSessions: (archived) => invoke("list_sessions", { archived }),
  GetSession: (sessionId) => invoke("get_session", { sessionId }),
  DeleteSession: (sessionId) => invoke("delete_session", { sessionId }),
  ArchiveSession: (sessionId) => invoke("archive_session", { sessionId }),
  UnarchiveSession: (sessionId) => invoke("unarchive_session", { sessionId }),
  SendMessage: (sessionId, message) =>
    invoke("send_message", { sessionId, message }),
  SendMessageWithAttachments: (sessionId, message, attachments) =>
    invoke("send_message", { sessionId, message, attachments }),
  InterruptSession: (sessionId) =>
    invoke("interrupt_session", { sessionId }),
  ResolveApproval: (requestId, approved, kind) =>
    invoke("resolve_approval", { requestId, approved, kind }),

  ListProviders: () => invoke("list_providers"),
  SaveProvider: (provider) => invoke("save_provider", { provider }),
  ProbeProvider: (providerId) => invoke("probe_provider", { providerId }),

  ListMCPServers: () => invoke("list_mcp_servers"),
  SaveMCPServer: (server) => invoke("save_mcp_server", { server }),
  TestMCPConnection: (server) => invoke("test_mcp_connection", { server }),
  SetMCPServerEnabled: (name, enabled) =>
    invoke("set_mcp_server_enabled", { name, enabled }),

  ListSkills: () => invoke("list_skills"),
  ReloadSkills: () => invoke("reload_skills"),
  ListPluginEntries: () => invoke("list_plugins"),
  SetPluginEnabled: (id, enabled) =>
    invoke("set_plugin_enabled", { id, enabled }),

  OpenShell: (sessionId, shell, cwd) =>
    invoke("open_shell", { sessionId, shell, cwd }),
  WriteShell: (sessionId, data) =>
    invoke("write_shell", { sessionId, data }),
  ReadShell: (sessionId) => invoke("read_shell", { sessionId }),
  CloseShell: (sessionId) => invoke("close_shell", { sessionId }),

  GitStatus: (cwd) => invoke("git_status", { cwd }),
  GetRuntimeEvents: (sessionId) =>
    invoke("get_runtime_events", { sessionId }),
  ListAgentTools: () => invoke("list_agent_tools"),

  /** Raw RPC for methods not yet mapped. */
  RpcRaw: (method, params) => invoke("rpc_raw", { method, params }),
};

/** Install compatibility shims so existing modules keep working. */
export function installBridge() {
  // Replace Wails global
  window.go = {
    main: {
      App: api,
    },
  };

  // Event shim: EventsOn/EventsOff used by some modules
  const subs = new Map();
  window.__codexEvents = {
    on(name, cb) {
      const un = onCodexEvent(name, cb);
      subs.set(name, un);
      return un;
    },
    off(name) {
      const un = subs.get(name);
      if (typeof un === "function") un();
      subs.delete(name);
    },
  };

  // Common agent event aliases (Wails names → Tauri names)
  const alias = [
    ["agent:runtime", "codex:agent.runtime"],
    ["agent:question", "codex:approval"],
    ["agent:plan-mode", "codex:plan-mode"],
  ];
  for (const [from, to] of alias) {
    onCodexEvent(to, (payload) => {
      window.dispatchEvent(new CustomEvent(from, { detail: payload }));
    });
  }
}

export default api;
