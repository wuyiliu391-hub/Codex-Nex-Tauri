/**
 * Application store — sessions, projects, providers, settings.
 *
 * Everything here is fetched from the backend; nothing is seeded locally. The
 * project list is derived from session `cwd` values, because the official
 * app-server has no separate project concept (every thread just carries a cwd).
 * Folders picked via the native dialog are kept as extra projects until a
 * session exists under them.
 *
 * Kept outside React and read through useSyncExternalStore so a refresh does
 * not require a provider.
 */

import { useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import { updateSettings as updateLegacySettings } from "../../src/js/state.js";
import { applyLanguage, detectSystemLanguage } from "../../src/js/i18n.js";

/**
 * Vanilla `t()` / `currentLang()` read `store.settings.language` from
 * state.js. React owns settings in this module — push language there whenever
 * settings land so prompt cards / chrome resolve real strings, not raw keys.
 */
function syncLegacyI18n(language: string | undefined): void {
  if (!language) return;
  updateLegacySettings({ language });
  applyLanguage();
}


export interface SessionSummary {
  id: string;
  title: string;
  cwd: string;
  projectId: string;
  archived: boolean;
  updatedAt: number | null;
  /** Preview text the server provides for the thread. */
  preview: string;
}

export interface ProjectEntry {
  /** cwd is the identity — it is what `thread/start` takes. */
  id: string;
  name: string;
  path: string;
}

export interface ProviderEntry {
  id: string;
  name: string;
  models: string[];
  hasApiKey: boolean;
  protocol?: string;
  baseUrl?: string;
}

export interface EngineStatus {
  connected: boolean;
  initialize: Record<string, unknown> | null;
}

/** Shell settings that the React layer reads. Mirrors the backend shell-state. */
export interface SettingsState {
  activeModel: string;
  activeProviderId: string;
  modelReasoningEffort: string;
  approvalPolicy: string;
  fullAccess: boolean;
  sidebarCollapsed: boolean;
  language: string;
  /** Configuration tab. Values are passed through to config.toml verbatim. */
  sandbox: string;
  webSearch: string;
  outputVerbosity: string;
  reasoningSummary: string;
  /** Last folder the user opened as a project (dialog picker). */
  activeProjectPath: string;
}

export function defaultSettings(): SettingsState {
  return {
    activeModel: "",
    activeProviderId: "",
    modelReasoningEffort: "xhigh",
    approvalPolicy: "ask",
    fullAccess: false,
    sidebarCollapsed: false,
    language: detectSystemLanguage(),
    sandbox: "workspace-write",
    webSearch: "cached",
    outputVerbosity: "medium",
    reasoningSummary: "auto",
    activeProjectPath: "",
  };
}

export interface AppState {
  sessions: SessionSummary[];
  projects: ProjectEntry[];
  providers: ProviderEntry[];
  settings: SettingsState;
  activeSessionId: string | null;
  /** Selected project cwd (ProjectEntry.id). */
  activeProjectId: string | null;
  /** Projects opened via dialog that may not own any session yet. */
  extraProjects: ProjectEntry[];
  /** Last engine_status payload; null until first probe. */
  engineStatus: EngineStatus | null;
  /** False until the first successful load; drives the empty state. */
  loaded: boolean;
  error: string | null;
}

function emptyState(): AppState {
  return {
    sessions: [],
    projects: [],
    providers: [],
    settings: defaultSettings(),
    activeSessionId: null,
    activeProjectId: null,
    extraProjects: [],
    engineStatus: null,
    loaded: false,
    error: null,
  };
}

let state: AppState = emptyState();
const listeners = new Set<() => void>();

function commit(next: AppState): void {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): AppState {
  return state;
}

export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function getAppState(): AppState {
  return state;
}

// ── normalisation ─────────────────────────────────────────────────────

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function projectNameFromPath(path: string): string {
  return path.replace(/\\/g, "/").split("/").filter(Boolean).pop() || path;
}

function normaliseSessions(raw: unknown): SessionSummary[] {
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray(asRecord(raw)["data"])
      ? (asRecord(raw)["data"] as unknown[])
      : [];
  const out: SessionSummary[] = [];
  for (const entry of list) {
    const rec = asRecord(entry);
    const id = typeof rec["id"] === "string" ? rec["id"] : null;
    if (!id) continue;
    const cwd = typeof rec["cwd"] === "string" ? rec["cwd"] : "";
    out.push({
      id,
      title: typeof rec["name"] === "string" ? rec["name"] : "",
      cwd,
      // The server's own projectId is usually empty; cwd is the real identity.
      projectId: typeof rec["projectId"] === "string" && rec["projectId"] ? rec["projectId"] : cwd,
      archived: rec["archived"] === true,
      updatedAt: typeof rec["updatedAt"] === "number" ? rec["updatedAt"] : null,
      preview: typeof rec["preview"] === "string" ? rec["preview"] : "",
    });
  }
  return out;
}

function normaliseProviders(raw: unknown): ProviderEntry[] {
  const rec = asRecord(raw);
  const list = Array.isArray(rec["providers"]) ? (rec["providers"] as unknown[]) : [];
  const out: ProviderEntry[] = [];
  for (const entry of list) {
    const p = asRecord(entry);
    const id = typeof p["id"] === "string" ? p["id"] : null;
    if (!id) continue;
    out.push({
      id,
      name: typeof p["name"] === "string" ? p["name"] : id,
      models: Array.isArray(p["models"]) ? (p["models"] as string[]).filter(Boolean) : [],
      hasApiKey: p["hasApiKey"] === true,
      protocol: typeof p["protocol"] === "string" ? p["protocol"] : undefined,
      baseUrl: typeof p["realBaseUrl"] === "string" ? p["realBaseUrl"] : typeof p["base_url"] === "string" ? p["base_url"] : undefined,
    });
  }
  return out;
}

/** Build the project list from distinct session cwd values. */
export function deriveProjects(sessions: SessionSummary[]): ProjectEntry[] {
  const seen = new Set<string>();
  const out: ProjectEntry[] = [];
  for (const session of sessions) {
    if (!session.cwd || seen.has(session.cwd)) continue;
    seen.add(session.cwd);
    out.push({ id: session.cwd, name: projectNameFromPath(session.cwd), path: session.cwd });
  }
  return out;
}

function mergeProjects(derived: ProjectEntry[], extra: ProjectEntry[]): ProjectEntry[] {
  const seen = new Set(derived.map((p) => p.id));
  const merged = derived.slice();
  for (const project of extra) {
    if (!project.id || seen.has(project.id)) continue;
    seen.add(project.id);
    merged.push(project);
  }
  return merged;
}

function resolveActiveProjectId(projects: ProjectEntry[], preferred: string | null): string | null {
  if (preferred && projects.some((p) => p.id === preferred)) return preferred;
  if (state.settings.activeProjectPath) {
    const match = projects.find((p) => p.id === state.settings.activeProjectPath);
    if (match) return match.id;
  }
  return projects[0]?.id ?? null;
}

// ── actions ───────────────────────────────────────────────────────────

export function setActiveSession(id: string | null): void {
  commit({ ...state, activeSessionId: id });
}

export function setActiveProject(id: string | null): void {
  const project = state.projects.find((p) => p.id === id);
  commit({
    ...state,
    activeProjectId: id,
    settings: {
      ...state.settings,
      activeProjectPath: project?.path ?? (id ?? ""),
    },
  });
  // Best-effort persist; engine config is not involved for project cwd.
  void invoke("save_settings", {
    settings: {
      ...state.settings,
      activeProjectPath: project?.path ?? (id ?? ""),
      active_provider_id: state.settings.activeProviderId,
      active_model: state.settings.activeModel,
      approval_policy: state.settings.approvalPolicy,
      sandbox: state.settings.sandbox,
      language: state.settings.language,
    },
  }).catch(() => {
    /* shell store is optional; UI state is already updated */
  });
}

/**
 * Native folder picker (tauri-plugin-dialog). Returns the chosen absolute path
 * or null when cancelled. Capabilities already allow dialog:allow-open.
 */
export async function pickProjectDirectory(): Promise<string | null> {
  try {
    const result = await invoke<string | string[] | null>("plugin:dialog|open", {
      options: { directory: true, multiple: false },
    });
    if (Array.isArray(result)) return result[0] ?? null;
    return typeof result === "string" && result ? result : null;
  } catch (err) {
    console.error("[appStore] project folder picker failed", err);
    return null;
  }
}

/** Native multi-file picker used by the composer attachment button. */
export async function pickAttachmentFiles(): Promise<string[]> {
  try {
    const result = await invoke<string | string[] | null>("plugin:dialog|open", {
      options: { multiple: true },
    });
    if (!result) return [];
    return Array.isArray(result) ? result.filter(Boolean) : [result];
  } catch (err) {
    console.error("[appStore] attachment picker failed", err);
    return [];
  }
}

/**
 * Open a folder as a project: dialog → store → select.
 * Persisted via save_settings.activeProjectPath; list is also kept in memory
 * so a project without sessions still appears in the sidebar.
 */
export async function openProjectPicker(): Promise<ProjectEntry | null> {
  const path = await pickProjectDirectory();
  if (!path) return null;
  return addProject(path);
}

/** Register a cwd as a project and select it. Does not start a session. */
export function addProject(path: string): ProjectEntry | null {
  const cwd = path.trim();
  if (!cwd) return null;
  const entry: ProjectEntry = {
    id: cwd,
    name: projectNameFromPath(cwd),
    path: cwd,
  };
  const extraProjects = state.extraProjects.some((p) => p.id === entry.id)
    ? state.extraProjects
    : [...state.extraProjects, entry];
  const projects = mergeProjects(deriveProjects(state.sessions), extraProjects);
  commit({
    ...state,
    extraProjects,
    projects,
    activeProjectId: entry.id,
    settings: { ...state.settings, activeProjectPath: cwd },
  });
  void invoke("save_settings", {
    settings: {
      ...state.settings,
      activeProjectPath: cwd,
      active_provider_id: state.settings.activeProviderId,
      active_model: state.settings.activeModel,
      approval_policy: state.settings.approvalPolicy,
      sandbox: state.settings.sandbox,
      language: state.settings.language,
    },
  }).catch(() => {});
  // Also keep a preferences copy so environments tab / restart can recover.
  void invoke("get_preferences")
    .then((raw) => {
      const prefs = asRecord(raw);
      const env = asRecord(prefs["environments"]);
      const existing = Array.isArray(env["projects"]) ? (env["projects"] as unknown[]) : [];
      const already = existing.some((p) => asRecord(p)["path"] === cwd || asRecord(p)["id"] === cwd);
      if (already) return;
      return invoke("save_preferences", {
        preferences: {
          ...prefs,
          environments: {
            ...env,
            projects: [...existing, { id: cwd, name: entry.name, path: cwd }],
          },
        },
      });
    })
    .catch(() => {});
  return entry;
}

export function setEngineStatus(status: EngineStatus | null): void {
  commit({ ...state, engineStatus: status });
}

/** Reload sessions / providers / settings from the engine. Failures are surfaced, not hidden. */
export async function refreshAppState(): Promise<void> {
  try {
    const [sessionsRaw, providersRaw, settingsRaw] = await Promise.all([
      invoke("list_sessions", { archived: false }),
      invoke("list_providers"),
      invoke("get_settings").catch(() => null),
    ]);
    const sessions = normaliseSessions(sessionsRaw);
    const derived = deriveProjects(sessions);
    const projects = mergeProjects(derived, state.extraProjects);
    const settings = { ...state.settings, ...normaliseSettings(settingsRaw) };
    commit({
      ...state,
      sessions,
      projects,
      providers: normaliseProviders(providersRaw),
      settings,
      activeProjectId: resolveActiveProjectId(projects, state.activeProjectId),
      loaded: true,
      error: null,
    });
    syncLegacyI18n(settings.language);
  } catch (err) {
    commit({
      ...state,
      loaded: true,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function normaliseSettings(raw: unknown): Partial<SettingsState> {
  const rec = asRecord(raw);
  const out: Partial<SettingsState> = {};
  // Accept both camelCase (frontend) and snake_case (Rust Settings struct).
  const pick = (camel: string, snake: string): unknown => rec[camel] ?? rec[snake];
  const activeModel = pick("activeModel", "active_model");
  if (typeof activeModel === "string") out.activeModel = activeModel;
  const activeProviderId = pick("activeProviderId", "active_provider_id");
  if (typeof activeProviderId === "string") out.activeProviderId = activeProviderId;
  const effort = pick("modelReasoningEffort", "model_reasoning_effort");
  if (typeof effort === "string") out.modelReasoningEffort = effort;
  const approval = pick("approvalPolicy", "approval_policy");
  if (typeof approval === "string") out.approvalPolicy = approval;
  if (typeof rec["fullAccess"] === "boolean") out.fullAccess = rec["fullAccess"];
  if (typeof rec["sidebarCollapsed"] === "boolean") out.sidebarCollapsed = rec["sidebarCollapsed"];
  if (typeof rec["language"] === "string") out.language = rec["language"];
  if (typeof rec["sandbox"] === "string") out.sandbox = rec["sandbox"];
  if (typeof rec["webSearch"] === "string") out.webSearch = rec["webSearch"];
  if (typeof rec["outputVerbosity"] === "string") out.outputVerbosity = rec["outputVerbosity"];
  if (typeof rec["reasoningSummary"] === "string") out.reasoningSummary = rec["reasoningSummary"];
  const projectPath = pick("activeProjectPath", "active_project_path");
  if (typeof projectPath === "string") out.activeProjectPath = projectPath;
  return out;
}

/**
 * Persist a settings patch.
 *
 * Two writes are needed:
 *   1. `save_settings` — the shell's own shell-state.json
 *   2. `config/batchWrite` — the engine's config.toml, for the keys the engine
 *      actually owns
 *
 * Official batchWrite shape is `{ edits: [{ keyPath, value, mergeStrategy }],
 * reloadUserConfig: true }` — NOT `{ writes }`.
 */
export async function saveSettings(patch: Partial<SettingsState>): Promise<void> {
  const next = { ...state.settings, ...patch };
  commit({ ...state, settings: next });
  syncLegacyI18n(next.language);

  try {
    // Dual-shape payload: camelCase for any frontend readers, snake_case for
    // the Rust Settings struct (serde field names). Unknown keys are ignored.
    await invoke("save_settings", {
      settings: {
        ...next,
        active_model: next.activeModel,
        active_provider_id: next.activeProviderId,
        approval_policy: next.approvalPolicy,
        active_project_path: next.activeProjectPath,
      },
    });
  } catch (err) {
    console.error("[appStore] saveSettings (shell) failed", err);
  }

  const edits: Array<{ keyPath: string; value: unknown; mergeStrategy: string }> = [];
  const push = (keyPath: string, value: unknown): void => {
    edits.push({ keyPath, value, mergeStrategy: "replace" });
  };

  if (patch.activeModel !== undefined && patch.activeModel) {
    push("model", patch.activeModel);
  }
  if (patch.activeProviderId !== undefined && patch.activeProviderId) {
    push("model_provider", patch.activeProviderId);
  }
  if (patch.modelReasoningEffort !== undefined) {
    push("model_reasoning_effort", patch.modelReasoningEffort);
  }
  if (patch.approvalPolicy !== undefined) {
    // Engine only knows on-request / never.
    const mapped = patch.approvalPolicy === "never" ? "never" : "on-request";
    push("approval_policy", mapped);
  }
  if (patch.sandbox !== undefined && patch.sandbox) {
    // ConfigurationTab writes sandbox values; engine key is sandbox_mode.
    push("sandbox_mode", patch.sandbox);
    push("sandbox", patch.sandbox);
  }
  if (patch.webSearch !== undefined && patch.webSearch) {
    push("web_search", patch.webSearch);
  }
  if (patch.outputVerbosity !== undefined && patch.outputVerbosity) {
    push("model_output_verbosity", patch.outputVerbosity);
  }
  if (patch.reasoningSummary !== undefined && patch.reasoningSummary) {
    push("model_reasoning_summary", patch.reasoningSummary);
  }
  if (!edits.length) return;

  try {
    await invoke("rpc_raw", {
      method: "config/batchWrite",
      params: { edits, reloadUserConfig: true },
    });
  } catch (err) {
    // The shell copy is already saved; the engine may simply be offline.
    console.warn("[appStore] engine config write failed (engine offline?)", err);
  }
}

/** Sessions belonging to a project, most recent first. */
export function sessionsForProject(projectId: string): SessionSummary[] {
  return state.sessions
    .filter((s) => !s.archived && s.projectId === projectId)
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
}
