/**
 * Wails → Tauri bridge — drop-in replacement for `window.go.main.App`.
 *
 * Covers every method in Codex-Nex App.d.ts (156 methods) plus two extras
 * (PickPetSpritesheet, OpenPetsFolder) observed in settings.js.
 *
 * Mapping strategy:
 *   1. Direct Tauri command (local shell / engine forwarder)
 *   2. rpc_raw fallback for engine methods without a dedicated command
 *   3. Structured error stub for Go-only features (browser, LSP, snapshots, …)
 *
 * GetState is a JS-side aggregator: merges local shell state + best-effort
 * engine list_sessions / list_providers / list_mcp_servers.
 *
 * Usage:
 *   import { api, installBridge, onCodexEvent } from "./bridge.js";
 *   installBridge();  // before any goAPI() use
 */

// ── Tauri invoke helper ──

const isTauri = () =>
  typeof window !== "undefined" &&
  (window.__TAURI_INTERNALS__ || window.__TAURI__ || window.tauri);

function getTauriInvoke() {
  const tauri = window.__TAURI__ || window.tauri;
  return (
    tauri?.core?.invoke ||
    tauri?.tauri?.invoke ||
    window.__TAURI_INTERNALS__?.invoke ||
    null
  );
}

async function invoke(cmd, args = {}) {
  const fn = getTauriInvoke();
  if (typeof fn !== "function") {
    throw new Error(`Tauri invoke not available (cmd=${cmd})`);
  }
  return fn(cmd, args);
}

/** Fail-soft invoke: returns { ok, data } instead of throwing. */
async function tryInvoke(cmd, args = {}) {
  try {
    const data = await invoke(cmd, args);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

// ── Event helpers ──

function getTauriListen() {
  const tauri = window.__TAURI__ || window.tauri;
  return tauri?.event?.listen || tauri?.tauri?.listen || null;
}

/** Open a file/dir dialog via tauri-plugin-dialog (raw invoke, no npm JS API). */
async function dialogOpen(options = {}) {
  const r = await tryInvoke("plugin:dialog|open", { options });
  if (!r.ok) {
    console.warn("[bridge] dialog open failed:", r.error);
    return null;
  }
  return r.data ?? null;
}

/** Open a URL/path with the OS default handler via tauri-plugin-shell. */
async function shellOpen(path) {
  if (!path) return false;
  const r = await tryInvoke("plugin:shell|open", { path: String(path) });
  if (!r.ok) console.warn("[bridge] shell open failed:", r.error);
  return r.ok;
}

/** Subscribe to a Tauri event. Returns unlisten function. */
export function onCodexEvent(name, handler) {
  const listenFn = getTauriListen();
  if (typeof listenFn !== "function") {
    console.warn("[bridge] Tauri listen not available for", name);
    return () => {};
  }
  // Tauri plugin:event names allow only [A-Za-z0-9-/:_]; dots and invalid chars are rejected
  // with "invalid args 'event' for command 'listen'". The Rust emitter
  // (events.rs) uses `-` as separator, so sanitize here to match it.
  const channel = String(name).replace(/[^A-Za-z0-9-/:_]/g, "-");
  let unlisten = null;
  listenFn(channel, (e) => handler(e?.payload ?? e)).then((fn) => {
    unlisten = fn;
  }).catch((err) => {
    console.warn("[bridge] listen failed for", channel, err);
  });
  return () => {
    if (typeof unlisten === "function") unlisten();
  };
}

// ── Structured error stub ──

function notImplemented(method, extra = {}) {
  return Promise.resolve({
    __unimplemented: true,
    method,
    reason: "no Tauri command; feature lives in Go backend or needs port",
    ...extra,
  });
}

function notImplementedList(method) {
  return Promise.resolve([]);
}

function notImplementedVoid(method) {
  return Promise.resolve(undefined);
}

// ── Engine helpers ──

/**
 * Extract a normalized session list from engine thread/list response.
 *
 * Official app-server v0.154.0 `thread/list` returns
 *   `{ data: Thread[], nextCursor, backwardsCursor }`.
 * Also accepts legacy `{ threads: [...] }`, `{ items: [...] }`, or a bare array.
 */
function extractSessions(resp) {
  if (!resp) return [];
  if (Array.isArray(resp)) return resp;
  // Official v0.154.0
  if (Array.isArray(resp.data)) return resp.data;
  if (Array.isArray(resp.threads)) return resp.threads;
  if (Array.isArray(resp.items)) return resp.items;
  if (resp.threads && Array.isArray(resp.threads.threads)) return resp.threads.threads;
  return [];
}

/**
 * Providers: engine list_providers normalizes config model_providers
 * (object map or array) into `{ providers: [...] }`.
 */
function extractProviders(resp) {
  if (!resp) return [];
  if (Array.isArray(resp)) return resp;
  if (Array.isArray(resp.providers)) return resp.providers;
  if (Array.isArray(resp.items)) return resp.items;
  // config/read raw shape
  const cfg = resp.config || resp.raw?.config;
  if (cfg && cfg.model_providers && typeof cfg.model_providers === "object") {
    return Object.entries(cfg.model_providers).map(([id, v]) => ({
      id,
      ...(typeof v === "object" && v !== null ? v : {}),
    }));
  }
  return [];
}

/**
 * MCP servers: official `mcpServerStatus/list` returns `{ data: [...] }`.
 * Engine list_mcp_servers normalizes to `{ servers: [...] }`.
 */
function extractMcpServers(resp) {
  if (!resp) return [];
  if (Array.isArray(resp)) return resp;
  if (Array.isArray(resp.servers)) return resp.servers;
  if (Array.isArray(resp.mcpServers)) return resp.mcpServers;
  if (Array.isArray(resp.data)) return resp.data;
  return [];
}

// ── Local scheduled / PR store (fail-soft; engine has no dedicated API) ──

const LS_SCHEDULED_KEY = "codex.scheduledTasks";
const LS_PRS_KEY = "codex.pullRequests";

/** Read a JSON array from localStorage; returns fallback on miss/error. */
function readLocalArray(key, fallback = []) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

/** Write a JSON array to localStorage; returns success flag. */
function writeLocalArray(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(Array.isArray(value) ? value : []));
    return true;
  } catch {
    return false;
  }
}

/** Seed scheduled tasks matching state.js defaults (first paint parity). */
function seedScheduledTasks() {
  return [
    { id: "daily", title: "Daily brief", desc: "Get a summary of what happened yesterday and what is planned today.", icon: "daily", cron: "0 9 * * *", status: "enabled" },
    { id: "weekly", title: "Weekly review", desc: "Review open tasks, merged PRs, and blockers from the week.", icon: "weekly", cron: "0 10 * * 1", status: "enabled" },
    { id: "followup", title: "Follow-up monitor", desc: "Check in on tasks that have been waiting for a response.", icon: "followup", cron: "0 */4 * * *", status: "enabled" },
  ];
}

/** List scheduled tasks: engine raw if present, else localStorage, else seeds. */
async function listScheduledTasksLocal() {
  const r = await tryInvoke("list_scheduled_tasks");
  if (r.ok && Array.isArray(r.data)) return r.data;
  const saved = readLocalArray(LS_SCHEDULED_KEY, null);
  if (saved) return saved;
  const seeds = seedScheduledTasks();
  writeLocalArray(LS_SCHEDULED_KEY, seeds);
  return seeds;
}

/** Persist scheduled tasks (Rust command if present, else localStorage). */
async function saveScheduledTasksLocal(tasks) {
  const list = Array.isArray(tasks) ? tasks : [];
  const r = await tryInvoke("save_scheduled_tasks", { tasks: list });
  writeLocalArray(LS_SCHEDULED_KEY, list);
  return r.ok || true;
}

/** List pull requests: engine raw if present, else localStorage. */
async function listPullRequestsLocal() {
  const r = await tryInvoke("list_pull_requests");
  if (r.ok && Array.isArray(r.data)) return r.data;
  return readLocalArray(LS_PRS_KEY, []);
}

/** Persist pull requests (Rust command if present, else localStorage). */
async function savePullRequestsLocal(prs) {
  const list = Array.isArray(prs) ? prs : [];
  const r = await tryInvoke("save_pull_requests", { prs: list });
  writeLocalArray(LS_PRS_KEY, list);
  return r.ok || true;
}

// ── Composite GetState ──

/**
 * Merge local shell state + best-effort engine data into the shape
 * bootstrap.js refreshState() expects.
 *
 * Local (get_state) returns: settings, preferences, pets, calendar,
 *   cinema_timelines, cinema_jobs, connectors, shortcuts.
 *
 * Engine adds: sessions, providers, mcpServers, dependencies, hooks,
 *   projects, plugins, connections, scheduled, worktrees, notifications,
 *   memory, sitePermissions, archived.
 *
 * All engine calls fail soft → empty arrays when engine is offline.
 */
async function compositeGetState() {
  const local = await invoke("get_state");

  const [sessionsR, providersR, mcpR, skillsR, pluginsR, depsR, scheduledR, prsR] =
    await Promise.allSettled([
      invoke("list_sessions", { archived: false }),
      invoke("list_providers"),
      invoke("list_mcp_servers"),
      invoke("list_skills"),
      invoke("list_plugins"),
      invoke("check_dependencies"),
      listScheduledTasksLocal(),
      listPullRequestsLocal(),
    ]);

  const sessions = sessionsR.status === "fulfilled" ? extractSessions(sessionsR.value) : [];
  const providers = providersR.status === "fulfilled" ? extractProviders(providersR.value) : [];
  const mcpServers = mcpR.status === "fulfilled" ? extractMcpServers(mcpR.value) : [];
  const skills = skillsR.status === "fulfilled" ? (Array.isArray(skillsR.value) ? skillsR.value : skillsR.value?.skills || []) : [];
  const plugins = pluginsR.status === "fulfilled" ? (Array.isArray(pluginsR.value) ? pluginsR.value : pluginsR.value?.plugins || []) : [];
  const dependencies = depsR.status === "fulfilled" ? (Array.isArray(depsR.value) ? depsR.value : []) : [];
  const scheduled = scheduledR.status === "fulfilled" && Array.isArray(scheduledR.value) ? scheduledR.value : seedScheduledTasks();
  const pullRequests = prsR.status === "fulfilled" && Array.isArray(prsR.value) ? prsR.value : [];

  return {
    // local shell
    settings: local?.settings || {},
    preferences: local?.preferences || {},
    pets: local?.pets || [],
    calendar: local?.calendar || [],
    cinemaTimelines: local?.cinema_timelines || local?.cinemaTimelines || [],
    cinemaJobs: local?.cinema_jobs || local?.cinemaJobs || [],
    connectors: local?.connectors || [],
    shortcuts: local?.shortcuts || [],
    // engine-derived (fail-soft)
    sessions,
    providers,
    mcpServers,
    skills,
    plugins,
    dependencies,
    scheduled,
    pullRequests,
    // not yet ported — empty so UI degrades gracefully
    projects: [],
    connections: [],
    hooks: [],
    worktrees: [],
    notifications: [],
    memory: [],
    sitePermissions: [],
  };
}

// ── api object (all 156+ App methods) ──

export const api = {
  // ── Local shell: state / settings ──
  GetState: () => compositeGetState(),
  CheckDependencies: () => invoke("check_dependencies"),
  GetSettings: () => invoke("get_settings"),
  SaveSettings: (settings) => invoke("save_settings", { settings }),
  GetPreferences: () => invoke("get_preferences"),
  SavePreferences: (preferences) => invoke("save_preferences", { preferences }),
  ListShortcuts: () => invoke("list_shortcuts"),
  SaveShortcuts: (shortcuts) => invoke("save_shortcuts", { shortcuts }),
  ExportSettingsToFile: () => notImplementedVoid("ExportSettingsToFile"),
  ImportSettingsFromFile: () => notImplemented("ImportSettingsFromFile"),

  // ── Local shell: pets ──
  ListPets: () => invoke("list_pets"),
  SavePets: (pets) => invoke("save_pets", { pets }),
  WakePet: () => invoke("wake_pet"),
  TuckPet: () => invoke("tuck_pet"),
  CreateCustomPet: () => invoke("create_custom_pet"),
  PickPetSpritesheet: () => notImplemented("PickPetSpritesheet", { path: "" }),
  OpenPetsFolder: () => notImplementedVoid("OpenPetsFolder"),

  // ── Local shell: calendar ──
  ListCalendarEvents: (year, month) => invoke("list_calendar_events", { year, month }),
  SaveCalendarEvent: (event) => invoke("save_calendar_event", { event }),
  DeleteCalendarEvent: (id) => invoke("delete_calendar_event", { id }),

  // ── Local shell: cinema ──
  ListCinemaTimelines: () => invoke("list_cinema_timelines"),
  ListCinemaJobs: () => invoke("list_cinema_jobs"),
  SaveCinemaTimeline: (timeline) => invoke("save_cinema_timeline", { timeline }),
  DeleteCinemaTimeline: (id) => invoke("delete_cinema_timeline", { id }),
  EnqueueCinemaRender: (timelineId) => invoke("enqueue_cinema_render", { timelineId }),
  CancelCinemaJob: (id) => invoke("cancel_cinema_job", { id }),

  // ── Local shell: connectors ──
  ListConnectors: () => invoke("list_connectors"),
  SaveConnector: (connector) => invoke("save_connector", { connector }),
  DeleteConnector: (id) => invoke("delete_connector", { id }),
  TestConnector: (id) => invoke("test_connector", { id }),

  // ── Local shell: files ──
  ListFiles: (cwd, dir = "") => invoke("list_files", { cwd, dir }),
  ReadFile: (cwd, path, offset, limit) => invoke("read_file", { cwd, path, offset, limit }),
  WriteFile: (cwd, path, content) => invoke("write_file", { cwd, path, content }),
OpenPath: (path) => shellOpen(path),

  // ── Engine: sessions / threads ──
  EngineStatus: () => invoke("engine_status"),
  NewSession: (projectPath) => invoke("new_session", { projectPath }),
  ListSessions: () => invoke("list_sessions", { archived: false }),
  ListArchivedSessions: () => invoke("list_sessions", { archived: true }),
  GetSession: (sessionId) => invoke("get_session", { sessionId }),
  DeleteSession: (sessionId) => invoke("delete_session", { sessionId }),
  ArchiveSession: (sessionId) => invoke("archive_session", { sessionId }),
  UnarchiveSession: (sessionId) => invoke("unarchive_session", { sessionId }),
  DeleteArchivedSession: (sessionId) => invoke("delete_session", { sessionId }),
  DeleteArchivedSessions: async () => {
    // Delete all archived sessions one by one
    const listR = await tryInvoke("list_sessions", { archived: true });
    if (!listR.ok) return;
    const sessions = extractSessions(listR.data);
    for (const s of sessions) {
      if (s.archived || s.id) {
        await tryInvoke("delete_session", { sessionId: s.id || s.threadId });
      }
    }
  },
  CompactSession: (sessionId) => notImplemented("CompactSession", { sessionId }),
  SaveSession: (session) => notImplementedVoid("SaveSession"),
  SetActiveSession: (sessionId) => {
    // No-op on backend; UI state is managed client-side
    return Promise.resolve();
  },
  SetActiveProject: (projectId) => Promise.resolve(),
  IsRunning: async () => {
    const r = await tryInvoke("engine_status");
    return r.ok ? !!r.data?.connected : false;
  },
  IsSessionRunning: async (sessionId) => {
    // Check session runtime status via get_session
    const r = await tryInvoke("get_session", { sessionId });
    if (!r.ok) return false;
    const s = r.data;
    return s?.runtime?.status === "running" || s?.status === "running";
  },

  // ── Engine: turns / messages ──
  SendMessage: (sessionId, message) => invoke("send_message", { sessionId, message }),
  SendMessageWithAttachments: (sessionId, message, attachments) =>
    invoke("send_message", { sessionId, message, attachments }),
  RunCodexTurn: (sessionId, message) => invoke("send_message", { sessionId, message }),
  Interrupt: () => notImplementedVoid("Interrupt"),
  InterruptSession: (sessionId) => invoke("interrupt_session", { sessionId }),
  ResolveApproval: (requestId, approved, kind, sessionScope) =>
    invoke("resolve_approval", { requestId, approved, kind, sessionScope }),

  // ── Engine: providers / models ──
  ListProviders: () => invoke("list_providers"),
  SaveProvider: (provider) => invoke("save_provider", { provider }),
  DeleteProvider: (id) => notImplementedVoid("DeleteProvider"),
  ProbeProvider: (providerId, baseUrl, apiKey, model, wireApi, requiresOpenaiAuth, requiresAzure, requiresAws) =>
    invoke("probe_provider", { providerId }),
  DiscoverProviderModels: (providerId, baseUrl, apiKey) =>
    invoke("rpc_raw", { method: "model/list", params: { providerId } }),
  ListProviderCatalog: () => notImplementedList("ListProviderCatalog"),
  InstallProviderFromCatalog: (id) => notImplemented("InstallProviderFromCatalog"),
  NormalizeProviderURL: (url, kind) => Promise.resolve(url),

  // ── Engine: MCP ──
  ListMCPServers: () => invoke("list_mcp_servers"),
  SaveMCPServer: (server) => invoke("save_mcp_server", { server }),
  DeleteMCPServer: (name) => notImplementedVoid("DeleteMCPServer"),
  TestMCPConnection: (server) => invoke("test_mcp_connection", { server }),
  SetMCPServerEnabled: (nameOrEnabled, enabled) => {
    // Wails had SetMCPServerEnabled(bool); Tauri has (name, enabled)
    if (typeof nameOrEnabled === "boolean") {
      return notImplemented("SetMCPServerEnabled", { note: "pass name+enabled" });
    }
    return invoke("set_mcp_server_enabled", { name: nameOrEnabled, enabled });
  },
  GetMCPServerStatus: () => notImplemented("GetMCPServerStatus", { enabled: false, servers: [] }),
  RefreshMCPTools: (name) => notImplemented("RefreshMCPTools", { name }),

  // ── Engine: skills ──
  ListSkills: () => invoke("list_skills"),
  ReloadSkills: () => invoke("reload_skills"),
  GetSkillDetail: (id) => invoke("rpc_raw", { method: "skills/get", params: { id } }),
  SetSkillEnabled: (id, enabled) =>
    invoke("rpc_raw", { method: "skills/setEnabled", params: { id, enabled } }),

  // ── Engine: plugins ──
  ListPluginEntries: () => invoke("list_plugins"),
  ListPlugins: () => invoke("list_plugins"),
  SetPluginEnabled: (id, enabled) => invoke("set_plugin_enabled", { id, enabled }),
  ListPluginsCatalog: () => notImplementedList("ListPluginsCatalog"),
  InstallMarketplacePlugin: (id) => notImplemented("InstallMarketplacePlugin"),
  InstallPluginFromFolder: () => notImplemented("InstallPluginFromFolder"),
  InstallPluginFromURL: (url) => notImplemented("InstallPluginFromURL"),
  InstallPluginFromZip: () => notImplemented("InstallPluginFromZip"),
  UninstallPlugin: (id) => notImplementedVoid("UninstallPlugin"),
  SavePluginEntries: (entries) => notImplementedVoid("SavePluginEntries"),

  // ── Engine: shell ──
  OpenShell: (sessionId, shell, cwd) => invoke("open_shell", { sessionId, shell, cwd }),
  WriteShell: (sessionId, data) => invoke("write_shell", { sessionId, data }),
  ReadShell: (sessionId, timeoutMs) => invoke("read_shell", { sessionId }),
  CloseShell: (sessionId) => invoke("close_shell", { sessionId }),
  ResizeShell: (sessionId, cols, rows) => notImplementedVoid("ResizeShell"),

  // ── Engine: git ──
  GitStatus: (cwd) => invoke("git_status", { cwd }),
  GetGitStatus: () => notImplemented("GetGitStatus", { branch: "", dirty: false, files: [] }),
  GitBranchList: (cwd) => invoke("rpc_raw", { method: "git/branchList", params: { cwd } }),
  GitLog: (cwd, limit) => invoke("rpc_raw", { method: "git/log", params: { cwd, limit } }),
  CommentOnHunk: (cwd, path, comment) => notImplementedVoid("CommentOnHunk"),
  AcceptChanges: (sessionId, paths) => notImplementedVoid("AcceptChanges"),
  RejectChanges: (sessionId, paths) => notImplementedVoid("RejectChanges"),

  // ── Engine: runtime / tools ──
  GetRuntimeEvents: (sessionId) => invoke("get_runtime_events", { sessionId }),
  ListAgentTools: () => invoke("list_agent_tools"),

  // ── Projects / worktrees ──
  ListProjects: () => notImplementedList("ListProjects"),
  AddProject: (path) => notImplemented("AddProject", { path }),
  DeleteProject: (id) => notImplementedVoid("DeleteProject"),
PickProjectFolder: async () => {
    const path = await dialogOpen({ directory: true, multiple: false });
    if (!path) return null;
    const p = Array.isArray(path) ? path[0] : path;
    if (!p) return null;
    return { id: p, name: p.split(/[\\/]/).pop(), path: p };
  },
  SelectProjectDirectory: async () => {
    const path = await dialogOpen({ directory: true, multiple: false });
    return Array.isArray(path) ? path[0] || null : path;
  },
PickWorktreeRoot: async () => {
    const path = await dialogOpen({ directory: true, multiple: false });
    return Array.isArray(path) ? path[0] || null : path;
  },
  RefreshWorktrees: (root) => notImplementedList("RefreshWorktrees"),

  // ── Attachments / pickers ──
PickAttachmentFiles: async () => {
    const r = await dialogOpen({ multiple: true });
    if (!r) return [];
    return Array.isArray(r) ? r : [r];
  },
PickDownloadsFolder: async () => {
    const path = await dialogOpen({ directory: true, multiple: false });
    return Array.isArray(path) ? path[0] || null : path;
  },
PickAllowedApp: async () => {
    const path = await dialogOpen({ multiple: false, filters: [{ name: "Apps", extensions: ["exe", "lnk"] }] });
    return Array.isArray(path) ? path[0] || null : path;
  },

  // ── Agent event callbacks (Wails callback bridges) ──
  // In Tauri these are no-ops; events flow via window.runtime.EventsOn.
  // They exist so agent-events.js typeof checks pass.
  OnAgentEvent: (cb) => {
    // Register as a CustomEvent listener for agent:event
    const handler = (e) => cb(e.detail);
    window.addEventListener("agent:event", handler);
    return () => window.removeEventListener("agent:event", handler);
  },
  OnAgentRuntime: (cb) => {
    const handler = (e) => cb(e.detail);
    window.addEventListener("agent:runtime", handler);
    return () => window.removeEventListener("agent:runtime", handler);
  },
  OnAgentPlanMode: (cb) => {
    const handler = (e) => cb(e.detail);
    window.addEventListener("agent:plan_mode", handler);
    return () => window.removeEventListener("agent:plan_mode", handler);
  },
  OnAgentQuestion: (cb) => {
    const handler = (e) => cb(e.detail);
    window.addEventListener("agent:question", handler);
    return () => window.removeEventListener("agent:question", handler);
  },

  // ── Hooks / memory / scheduled / automations / PRs / notifications ──
  ListHooks: () => notImplementedList("ListHooks"),
  SaveHook: (hook) => notImplemented("SaveHook"),
  DeleteHook: (id) => notImplementedVoid("DeleteHook"),
  TestHook: (hook) => notImplemented("TestHook"),

  ListMemoryItems: () => notImplementedList("ListMemoryItems"),
  SaveMemoryItem: (item) => notImplemented("SaveMemoryItem"),
  DeleteMemoryItem: (id) => notImplementedVoid("DeleteMemoryItem"),

  ListScheduledTasks: () => listScheduledTasksLocal(),
  SaveScheduledTasks: (tasks) => saveScheduledTasksLocal(tasks),
  RunScheduledTask: async (id) => {
    // Engine has no run-scheduled API — fail-soft notify UI.
    const r = await tryInvoke("run_scheduled_task", { id });
    if (r.ok) return r.data;
    console.info("[bridge] RunScheduledTask local stub", id);
    document.dispatchEvent(new CustomEvent("codex:scheduled-run", { detail: { id } }));
    return { ok: true, id, stub: true };
  },
  RunScheduled: async (ctx, task) => {
    // Engine has no RunScheduled — persist + emit local run event.
    const id = task?.id || ctx?.taskId || "";
    const r = await tryInvoke("run_scheduled_task", { id });
    if (r.ok) return r.data;
    document.dispatchEvent(new CustomEvent("codex:scheduled-run", { detail: { id, ctx, task } }));
    return { ok: true, id, stub: true };
  },

  ListAutomations: () => notImplementedList("ListAutomations"),
  SaveAutomation: (def) => notImplemented("SaveAutomation"),
  DeleteAutomation: (id) => notImplementedVoid("DeleteAutomation"),
  RunAutomationNow: (id) => notImplemented("RunAutomationNow"),
  ListAutomationRuns: (id) => notImplementedList("ListAutomationRuns"),

  ListPullRequests: () => listPullRequestsLocal(),
  SavePullRequests: (prs) => savePullRequestsLocal(prs),

  ListNotifications: () => notImplementedList("ListNotifications"),
  SendTestNotification: () => notImplementedVoid("SendTestNotification"),

  ListConnections: () => notImplementedList("ListConnections"),
  SaveConnections: (conns) => notImplementedVoid("SaveConnections"),
  TestSSHConnection: (id) => notImplemented("TestSSHConnection"),

  // ── Dependency checks ──
  ListDependencyChecks: () => invoke("check_dependencies"),

  // ── Audio ──
  ListAudioInputDevices: () => notImplementedList("ListAudioInputDevices"),

  // ── Browser (Go-only managed browser) ──
  GetBrowserStatus: () => notImplemented("GetBrowserStatus", { running: false }),
  ListBrowserTargets: () => notImplementedList("ListBrowserTargets"),
  OpenManagedBrowser: (url) => notImplementedVoid("OpenManagedBrowser"),
  OpenManagedBrowserDebug: (url, port) => notImplementedVoid("OpenManagedBrowserDebug"),
  BrowserNavigate: (url) => notImplemented("BrowserNavigate"),
  BrowserEvaluate: (expr) => notImplemented("BrowserEvaluate"),
  BrowserScreenshot: () => notImplemented("BrowserScreenshot"),
  BrowserSnapshot: () => notImplemented("BrowserSnapshot"),
  BrowserVersion: () => notImplemented("BrowserVersion"),
  ClearBrowserData: () => notImplementedVoid("ClearBrowserData"),
  AddSitePermission: (origin, perm) => notImplemented("AddSitePermission"),
  RemoveSitePermission: (origin) => notImplemented("RemoveSitePermission"),

  // ── Computer use ──
  GetComputerUseStatus: () => notImplemented("GetComputerUseStatus", { enabled: false }),

  // ── Project environment ──
  GetProjectEnvironment: (path) => notImplemented("GetProjectEnvironment"),

  // ── Snapshots ──
  ListSnapshots: (sessionId) => notImplementedList("ListSnapshots"),
  CreateSnapshot: (sessionId, label) => notImplemented("CreateSnapshot"),
  DeleteSnapshot: (id) => notImplementedVoid("DeleteSnapshot"),
  RestoreSnapshot: (id) => notImplemented("RestoreSnapshot"),

  // ── LSP ──
  LSPStartServer: (config) => notImplementedVoid("LSPStartServer"),
  LSPStopServer: (id) => notImplementedVoid("LSPStopServer"),
  LSPCompletion: (id, path, src, line, col) => notImplementedList("LSPCompletion"),
  LSPDefinition: (id, path, src, line, col) => notImplementedList("LSPDefinition"),
  LSPDiagnosticsFor: (id, path, src) => notImplementedList("LSPDiagnosticsFor"),

  // ── Raw RPC escape hatch ──
  RpcRaw: (method, params) => invoke("rpc_raw", { method, params }),
};

// ── installBridge ──

/**
 * Install Wails-compatible globals:
 *   window.go.main.App          → full api object
 *   window.runtime.EventsOn     → Tauri event shim
 *   window.runtime.EventsOnMultiple
 *   window.runtime.EventsOff
 *
 * Also wires codex:* Tauri events → agent:* CustomEvents for agent-events.js.
 */
export function installBridge() {
  // 1. window.go.main.App
  window.go = { main: { App: api } };

  // 2. window.runtime.EventsOn / EventsOnMultiple / EventsOff
  //    agent-events.js calls: window.runtime.EventsOnMultiple(name, cb, -1)
  const runtimeSubs = new Map(); // name -> [unlisten, ...]

  function eventsOn(name, cb) {
    const un = onCodexEvent(name, (payload) => cb(payload));
    if (!runtimeSubs.has(name)) runtimeSubs.set(name, []);
    runtimeSubs.get(name).push(un);
    return un;
  }

  function eventsOff(name) {
    const fns = runtimeSubs.get(name) || [];
    for (const fn of fns) {
      try { fn(); } catch { /* ignore */ }
    }
    runtimeSubs.delete(name);
  }

  // ── Tauri window helpers (frameless chrome) ──
  async function currentWindow() {
    const tauri = window.__TAURI__ || window.tauri;
    const windowMod = tauri?.window || tauri?.windowApi;
    if (windowMod?.getCurrentWindow) return windowMod.getCurrentWindow();
    if (windowMod?.getCurrent) return windowMod.getCurrent();
    // Fallback: invoke core window commands by label "main"
    return null;
  }

  async function windowCall(method, args = {}) {
    const w = await currentWindow();
    if (w && typeof w[method] === "function") {
      return w[method](args);
    }
    // core:window allowlist commands (Tauri 2)
    const label = "main";
    const cmdMap = {
      minimize: "plugin:window|minimize",
      maximize: "plugin:window|maximize",
      unmaximize: "plugin:window|unmaximize",
      toggleMaximize: "plugin:window|toggle_maximize",
      close: "plugin:window|close",
      setFullscreen: "plugin:window|set_fullscreen",
      startDragging: "plugin:window|start_dragging",
    };
    const cmd = cmdMap[method];
    if (!cmd) throw new Error(`unknown window method ${method}`);
    return invoke(cmd, { label, ...args });
  }

  window.runtime = {
    EventsOn: eventsOn,
    EventsOnMultiple: (name, cb, max) => eventsOn(name, cb),
    EventsOff: eventsOff,
    EventsEmit: (name, data) => {
      window.dispatchEvent(new CustomEvent(name, { detail: data }));
    },
    WindowMinimise: () => windowCall("minimize").catch((e) => console.warn("[bridge] min", e)),
    WindowMaximise: () => windowCall("maximize").catch((e) => console.warn("[bridge] max", e)),
    WindowUnmaximise: () => windowCall("unmaximize").catch((e) => console.warn("[bridge] unmax", e)),
    WindowToggleMaximise: () => windowCall("toggleMaximize").catch((e) => console.warn("[bridge] toggle", e)),
    WindowIsMaximised: async () => {
      try {
        const w = await currentWindow();
        if (w?.isMaximized) return await w.isMaximized();
        return await invoke("plugin:window|is_maximized", { label: "main" });
      } catch {
        return false;
      }
    },
    WindowSetFullscreen: (flag) => windowCall("setFullscreen", { fullscreen: !!flag }).catch(() => {}),
    WindowClose: () => windowCall("close").catch((e) => console.warn("[bridge] close", e)),
    BrowserOpenURL: (url) => shellOpen(url),
    Quit: () => windowCall("close").catch((e) => console.warn("[bridge] quit", e)),
  };

  // 3. Map codex:* Tauri events to to agent:* CustomEvents
  //    The Rust event bridge emits codex:heartbeat, codex:approval, etc.
  //    agent-events.js listens for agent:event, agent:runtime, agent:plan_mode, agent:question.

  // Primary agent event channel
  const codexToAgent = [
    // [tauri event name, agent CustomEvent name]
    ["codex:agent.event", "agent:event"],
    ["codex:agent.runtime", "agent:runtime"],
    ["codex:agent.plan_mode", "agent:plan_mode"],
    ["codex:agent.plan-mode", "agent:plan_mode"],
    ["codex:plan-mode", "agent:plan_mode"],
    ["codex:agent.question", "agent:question"],
    ["codex:approval", "agent:event"],        // approval arrives as agent:event type=approval
    ["codex:user-input", "agent:question"],
    ["codex:turn.completed", "agent:runtime"],
    ["codex:turn.failed", "agent:runtime"],
    ["codex:turn.cancelled", "agent:runtime"],
    ["codex:tool.started", "agent:runtime"],
    ["codex:tool.completed", "agent:runtime"],
    ["codex:turn.state_changed", "agent:runtime"],
    // Official app-server notification fan-out (method / → .)
    ["codex:item.agentMessage.delta", "agent:runtime"],
    ["codex:item.commandExecution.outputDelta", "agent:runtime"],
    ["codex:item.fileChange.outputDelta", "agent:runtime"],
    ["codex:item.started", "agent:runtime"],
    ["codex:item.completed", "agent:runtime"],
    ["codex:turn.started", "agent:runtime"],
    ["codex:turn.diff.updated", "agent:runtime"],
    ["codex:error", "agent:event"],
  ];

  for (const [tauriName, agentName] of codexToAgent) {
    onCodexEvent(tauriName, (payload) => {
      // Normalize payload shape for agent-events.js
      const detail = payload ?? {};
      // For turn.* / tool.* / item.* events, inject type field so applyRuntimeEvent can match
      if (
        tauriName.startsWith("codex:turn.") ||
        tauriName.startsWith("codex:tool.") ||
        tauriName.startsWith("codex:item.")
      ) {
        const type = tauriName.replace("codex:", "").replace(/\./g, ".");
        const enriched = typeof detail === "object" && detail !== null
          ? { ...detail, type: detail.type || type }
          : { type, payload: detail };
        window.dispatchEvent(new CustomEvent(agentName, { detail: enriched }));
      } else if (tauriName === "codex:error") {
        const msg = typeof detail === "object" && detail !== null
          ? (detail.message || detail.error || JSON.stringify(detail))
          : String(detail || "error");
        window.dispatchEvent(new CustomEvent("agent:event", { detail: { type: "error", error: msg } }));
      } else if (tauriName === "codex:approval") {
        // Wrap approval as agent:event with type=approval
        const enriched = typeof detail === "object" && detail !== null
          ? { ...detail, type: "approval" }
          : { type: "approval", payload: detail };
        window.dispatchEvent(new CustomEvent("agent:event", { detail: enriched }));
      } else if (tauriName === "codex:user-input") {
        window.dispatchEvent(new CustomEvent("agent:question", { detail }));
      } else {
        window.dispatchEvent(new CustomEvent(agentName, { detail }));
      }
    });
  }

  // Also subscribe to the generic codex:* notification fan-out.
  // The Rust side emits `codex:{method}` where method has / replaced by -
  // (dots are illegal in Tauri event names; onCodexEvent sanitizes aliases).
  onCodexEvent("codex:rpc-event", (payload) => {
    // Generic RPC event - dispatch as agent:runtime so live-turn can pick it up
    if (payload && typeof payload === "object") {
      window.dispatchEvent(new CustomEvent("agent:runtime", { detail: payload }));
    }
  });

  console.log("[bridge] installBridge complete - - window.go.main.App + window.runtime ready");
}

// ── Default export ──

export default api;
