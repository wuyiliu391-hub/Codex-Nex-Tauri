/**
 * Browser-dev mirror of the Rust shell store (src-tauri/src/state.rs).
 *
 * Same file shape as shell-state.json (snake_case sections), persisted in
 * localStorage instead of %APPDATA%\CodexDesktop. Defaults are ported
 * verbatim: theme=light, language=zh-CN, and the three Chinese sample
 * scheduled tasks.
 */

const STORAGE_KEY = "codex-desktop-browser-dev:shell-state";

export interface ShellSettings {
  theme: string;
  language: string;
  active_provider_id: string;
  active_model: string;
  terminal_shell: string;
  approval_policy: string;
  sandbox: string;
  // The frontend dual-writes camelCase too; keep unknown keys round-tripping.
  [key: string]: unknown;
}

export interface ShellStateFile {
  settings: ShellSettings;
  preferences: Record<string, unknown>;
  pets: Record<string, unknown>[];
  calendar: Record<string, unknown>[];
  cinema_timelines: Record<string, unknown>[];
  cinema_jobs: Record<string, unknown>[];
  connectors: Record<string, unknown>[];
  shortcuts: Record<string, unknown>[];
  scheduled_tasks: Record<string, unknown>[];
  pull_requests: unknown[];
  provider_secrets: Record<string, string>;
}

function defaultSettings(): ShellSettings {
  return {
    theme: "light",
    language: "zh-CN",
    active_provider_id: "",
    active_model: "",
    terminal_shell: "",
    approval_policy: "",
    sandbox: "",
  };
}

/** state.rs::default_scheduled_tasks(), verbatim. */
function defaultScheduledTasks(): Record<string, unknown>[] {
  return [
    {
      id: "daily-brief",
      title: "每日简报",
      desc: "以日历、未读电子邮件和优先事项摘要开启每个工作日",
      icon: "daily",
      cron: "0 9 * * *",
      status: "enabled",
    },
    {
      id: "weekly-review",
      title: "每周回顾",
      desc: "每周五将你最近的工作整理成简明的状态更新",
      icon: "weekly",
      cron: "0 10 * * 1",
      status: "enabled",
    },
    {
      id: "followup",
      title: "跟进监控",
      desc: "查看最近的电子邮箱和日历活动，并标记需要你关注的事项",
      icon: "followup",
      cron: "0 */4 * * *",
      status: "enabled",
    },
  ];
}

function freshState(): ShellStateFile {
  return {
    settings: defaultSettings(),
    preferences: {},
    pets: [],
    calendar: [],
    cinema_timelines: [],
    cinema_jobs: [],
    connectors: [],
    shortcuts: [],
    scheduled_tasks: defaultScheduledTasks(),
    pull_requests: [],
    provider_secrets: {},
  };
}

let cache: ShellStateFile | null = null;

export function loadShellState(): ShellStateFile {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ShellStateFile>;
      cache = { ...freshState(), ...parsed };
      // Same empty-field backfills as AppState::load_or_default.
      if (!cache.settings?.theme) cache.settings.theme = "light";
      if (!cache.settings?.language) cache.settings.language = "zh-CN";
      if (!cache.scheduled_tasks?.length) cache.scheduled_tasks = defaultScheduledTasks();
      return cache;
    }
  } catch (err) {
    console.warn("[devbridge] shell state unreadable, starting fresh", err);
  }
  cache = freshState();
  saveShellState();
  return cache;
}

export function saveShellState(): void {
  if (!cache) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch (err) {
    console.error("[devbridge] shell state save failed", err);
  }
}

/** provider_env_key from state.rs: CODEX_PROVIDER_<UPPER_SNAKE>_API_KEY. */
export function providerEnvKey(providerId: string): string {
  const sanitized = providerId.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase();
  return `CODEX_PROVIDER_${sanitized}_API_KEY`;
}

export function uuidish(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
