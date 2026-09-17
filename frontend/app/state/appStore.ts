/**
 * Application store — sessions, projects, providers, settings.
 *
 * Everything here is fetched from the backend; nothing is seeded locally. The
 * project list is derived from session `cwd` values, because the official
 * app-server has no separate project concept (every thread just carries a cwd).
 *
 * Kept outside React and read through useSyncExternalStore so a refresh does
 * not require a provider.
 */

import { useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";

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
}

export interface AppState {
  sessions: SessionSummary[];
  projects: ProjectEntry[];
  providers: ProviderEntry[];
  activeSessionId: string | null;
  /** False until the first successful load; drives the empty state. */
  loaded: boolean;
  error: string | null;
}

function emptyState(): AppState {
  return {
    sessions: [],
    projects: [],
    providers: [],
    activeSessionId: null,
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
    const name = session.cwd.replace(/\\/g, "/").split("/").filter(Boolean).pop() || session.cwd;
    out.push({ id: session.cwd, name, path: session.cwd });
  }
  return out;
}

// ── actions ───────────────────────────────────────────────────────────

export function setActiveSession(id: string | null): void {
  commit({ ...state, activeSessionId: id });
}

/** Reload sessions / providers from the engine. Failures are surfaced, not hidden. */
export async function refreshAppState(): Promise<void> {
  try {
    const [sessionsRaw, providersRaw] = await Promise.all([
      invoke("list_sessions", { archived: false }),
      invoke("list_providers"),
    ]);
    const sessions = normaliseSessions(sessionsRaw);
    commit({
      ...state,
      sessions,
      projects: deriveProjects(sessions),
      providers: normaliseProviders(providersRaw),
      loaded: true,
      error: null,
    });
  } catch (err) {
    commit({
      ...state,
      loaded: true,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Sessions belonging to a project, most recent first. */
export function sessionsForProject(projectId: string): SessionSummary[] {
  return state.sessions
    .filter((s) => !s.archived && s.projectId === projectId)
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
}
