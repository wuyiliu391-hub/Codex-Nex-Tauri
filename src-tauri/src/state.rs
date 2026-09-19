//! Local desktop shell state (UI-only): settings, preferences, pets, calendar,
//! connectors, scheduled tasks and provider credentials.
//!
//! Agent/session state does NOT live here — it is owned by the in-process
//! kernel (`crate::kernel::session::SessionManager`). This file is the L1
//! "local capabilities" store from `docs/ARCHITECTURE.md`.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

/// Environment variable name that would carry a provider's API key to a child
/// process.
///
/// Kept for the future HTTP provider: a subprocess-based transport would inject
/// the key as this env var, so the secret never lands in a plaintext
/// `config.toml`. The in-process kernel does not spawn anything, so today this
/// is only used by the shell's provider bookkeeping.
pub fn provider_env_key(provider_id: &str) -> String {
    let sanitized: String = provider_id
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() {
                c.to_ascii_uppercase()
            } else {
                '_'
            }
        })
        .collect();
    format!("CODEX_PROVIDER_{sanitized}_API_KEY")
}

#[derive(Debug, Default, Serialize, Deserialize, Clone)]
pub struct Settings {
    #[serde(default)]
    pub theme: String,
    #[serde(default)]
    pub language: String,
    #[serde(default)]
    pub active_provider_id: String,
    #[serde(default)]
    pub active_model: String,
    #[serde(default)]
    pub terminal_shell: String,
    #[serde(default)]
    pub approval_policy: String,
    #[serde(default)]
    pub sandbox: String,
    /// Every other settings key the UI writes.
    ///
    /// `flatten` is load-bearing, exactly as in [`Preferences`]: the frontend
    /// sends one flat object carrying both the fields above (in snake_case) and
    /// the UI-only ones (`sidebarCollapsed`, `activeProjectPath`, `fullAccess`,
    /// `webSearch`, `outputVerbosity`, `reasoningSummary`,
    /// `modelReasoningEffort`, …). Without this, serde ignores unknown keys and
    /// `save_settings` replaces the whole struct — so every one of those
    /// settings was silently dropped on every save, and `get_settings` handed
    /// the UI back an object missing them.
    ///
    /// Snake_case stays canonical for the named fields so existing
    /// `shell-state.json` files keep loading; `#[serde(alias)]` is deliberately
    /// *not* used, because `save_settings` sends both spellings of the same key
    /// and serde rejects a duplicate field when an alias is present.
    /// [`Settings::normalise_keys`] drops the redundant camelCase copies.
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

impl Settings {
    /// Drop the camelCase aliases `save_settings` sends alongside the
    /// snake_case fields, and collapse the two spellings of the project path.
    ///
    /// `appStore.saveSettings` builds `{ ...camelCaseState, active_model, … }`
    /// so that a frontend reader and the Rust struct each find their own
    /// spelling. The snake_case copies land in the named fields and the
    /// camelCase ones in `extra`; keeping both would grow the file on every
    /// save and leave two sources of truth for the same setting.
    pub fn normalise_keys(&mut self) {
        for alias in [
            "activeModel",
            "activeProviderId",
            "approvalPolicy",
            "terminalShell",
        ] {
            self.extra.remove(alias);
        }
        // The project path is UI state with no named field, so it lives in
        // `extra`; the frontend reads camelCase first, so keep that spelling.
        if let Some(value) = self.extra.remove("active_project_path") {
            self.extra
                .entry("activeProjectPath".to_string())
                .or_insert(value);
        }
    }
}

#[derive(Debug, Default, Serialize, Deserialize, Clone)]
pub struct Preferences {
    #[serde(default)]
    pub pets_enabled: bool,
    #[serde(default)]
    pub reduced_motion: bool,
    #[serde(default)]
    pub compact_mode: bool,
    /// Every other preference section (appearance, voice, browser, git, …).
    ///
    /// `flatten` is load-bearing: the frontend stores preferences as top-level
    /// section objects and without this the whole map would be dropped on
    /// deserialize, so nothing a settings page wrote would survive a restart.
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

#[derive(Debug, Default, Serialize, Deserialize, Clone)]
pub struct Pet {
    pub id: String,
    pub name: String,
    pub kind: String,
    #[serde(default)]
    pub sprite: String,
    #[serde(default)]
    pub mood: String,
    #[serde(default)]
    pub custom: bool,
}

#[derive(Debug, Default, Serialize, Deserialize, Clone)]
pub struct CalendarEvent {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub starts_at: String,
    #[serde(default)]
    pub ends_at: String,
    #[serde(default)]
    pub notes: String,
}

#[derive(Debug, Default, Serialize, Deserialize, Clone)]
pub struct CinemaTimeline {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub clips: Vec<serde_json::Value>,
}

#[derive(Debug, Default, Serialize, Deserialize, Clone)]
pub struct CinemaJob {
    pub id: String,
    pub timeline_id: String,
    pub status: String,
    #[serde(default)]
    pub progress: f32,
}

#[derive(Debug, Default, Serialize, Deserialize, Clone)]
pub struct Connector {
    pub id: String,
    pub name: String,
    pub kind: String,
    #[serde(default)]
    pub config: serde_json::Value,
}

#[derive(Debug, Default, Serialize, Deserialize, Clone)]
pub struct Shortcut {
    pub id: String,
    pub keys: String,
    pub action: String,
}

#[derive(Debug, Default, Serialize, Deserialize, Clone)]
pub struct ScheduledTask {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub desc: String,
    #[serde(default)]
    pub icon: String,
    #[serde(default)]
    pub cron: String,
    #[serde(default)]
    pub status: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct StateSnapshot {
    pub settings: Settings,
    pub preferences: Preferences,
    pub pets: Vec<Pet>,
    pub calendar: Vec<CalendarEvent>,
    pub cinema_timelines: Vec<CinemaTimeline>,
    pub cinema_jobs: Vec<CinemaJob>,
    pub connectors: Vec<Connector>,
    pub shortcuts: Vec<Shortcut>,
}

pub struct AppState {
    pub data_dir: PathBuf,
    pub inner: Mutex<InnerState>,
}

#[derive(Default)]
pub struct InnerState {
    pub settings: Settings,
    pub preferences: Preferences,
    pub pets: Vec<Pet>,
    pub calendar: Vec<CalendarEvent>,
    pub cinema_timelines: Vec<CinemaTimeline>,
    pub cinema_jobs: Vec<CinemaJob>,
    pub connectors: Vec<Connector>,
    pub shortcuts: Vec<Shortcut>,
    pub scheduled_tasks: Vec<ScheduledTask>,
    pub pull_requests: Vec<serde_json::Value>,
    /// providerId -> API key. Injected into the sidecar environment as the
    /// provider's `env_key` at spawn time (see [`provider_env_key`]).
    pub provider_secrets: HashMap<String, String>,
    /// providerId -> protocol (e.g. "openai_chat", "anthropic", "ollama", "openai_responses").
    pub provider_protocols: HashMap<String, String>,
    /// providerId -> real upstream base_url when routed through adapter.
    pub provider_endpoints: HashMap<String, String>,
}

impl AppState {
    pub fn load_or_default(app: &tauri::AppHandle) -> tauri::Result<Self> {
        let data_dir = dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("CodexDesktop");
        std::fs::create_dir_all(&data_dir).ok();
        let path = data_dir.join("shell-state.json");
        let mut inner = InnerState::default();
        if let Ok(raw) = std::fs::read_to_string(&path) {
            if let Ok(v) = serde_json::from_str::<ShellStateFile>(&raw) {
                inner = v.into_inner();
            }
        }
        if inner.settings.theme.is_empty() {
            inner.settings.theme = "light".into();
        }
        if inner.settings.language.is_empty() {
            inner.settings.language = "zh-CN".into();
        }
        // Sidebar suggestions (docs/uia/shots-t41/).
        if inner.scheduled_tasks.is_empty() {
            inner.scheduled_tasks = default_scheduled_tasks();
        }
        let _ = app; // reserved for path overrides
        Ok(Self {
            data_dir,
            inner: Mutex::new(inner),
        })
    }

    pub fn save(&self) -> anyhow::Result<()> {
        let inner = self.inner.lock().unwrap();
        let file = ShellStateFile::from_inner(&inner);
        let path = self.data_dir.join("shell-state.json");
        let tmp = self.data_dir.join("shell-state.json.tmp");
        std::fs::write(&tmp, serde_json::to_vec_pretty(&file)?)?;
        std::fs::rename(&tmp, path)?;
        Ok(())
    }

    pub fn snapshot(&self) -> StateSnapshot {
        let inner = self.inner.lock().unwrap();
        StateSnapshot {
            settings: inner.settings.clone(),
            preferences: inner.preferences.clone(),
            pets: inner.pets.clone(),
            calendar: inner.calendar.clone(),
            cinema_timelines: inner.cinema_timelines.clone(),
            cinema_jobs: inner.cinema_jobs.clone(),
            connectors: inner.connectors.clone(),
            shortcuts: inner.shortcuts.clone(),
        }
    }
}

#[derive(Serialize, Deserialize, Default)]
struct ShellStateFile {
    #[serde(default)]
    settings: Settings,
    #[serde(default)]
    preferences: Preferences,
    #[serde(default)]
    pets: Vec<Pet>,
    #[serde(default)]
    calendar: Vec<CalendarEvent>,
    #[serde(default)]
    cinema_timelines: Vec<CinemaTimeline>,
    #[serde(default)]
    cinema_jobs: Vec<CinemaJob>,
    #[serde(default)]
    connectors: Vec<Connector>,
    #[serde(default)]
    shortcuts: Vec<Shortcut>,
    #[serde(default)]
    scheduled_tasks: Vec<ScheduledTask>,
    #[serde(default)]
    pull_requests: Vec<serde_json::Value>,
    #[serde(default)]
    provider_secrets: HashMap<String, String>,
    #[serde(default)]
    provider_protocols: HashMap<String, String>,
    #[serde(default)]
    provider_endpoints: HashMap<String, String>,
}

impl ShellStateFile {
    fn from_inner(inner: &InnerState) -> Self {
        Self {
            settings: inner.settings.clone(),
            preferences: inner.preferences.clone(),
            pets: inner.pets.clone(),
            calendar: inner.calendar.clone(),
            cinema_timelines: inner.cinema_timelines.clone(),
            cinema_jobs: inner.cinema_jobs.clone(),
            connectors: inner.connectors.clone(),
            shortcuts: inner.shortcuts.clone(),
            scheduled_tasks: inner.scheduled_tasks.clone(),
            pull_requests: inner.pull_requests.clone(),
            provider_secrets: inner.provider_secrets.clone(),
            provider_protocols: inner.provider_protocols.clone(),
            provider_endpoints: inner.provider_endpoints.clone(),
        }
    }

    fn into_inner(self) -> InnerState {
        InnerState {
            settings: self.settings,
            preferences: self.preferences,
            pets: self.pets,
            calendar: self.calendar,
            cinema_timelines: self.cinema_timelines,
            cinema_jobs: self.cinema_jobs,
            connectors: self.connectors,
            shortcuts: self.shortcuts,
            scheduled_tasks: self.scheduled_tasks,
            pull_requests: self.pull_requests,
            provider_secrets: self.provider_secrets,
            provider_protocols: self.provider_protocols,
            provider_endpoints: self.provider_endpoints,
        }
    }
}

/// Official sidebar suggestions shown when no tasks are stored yet.
fn default_scheduled_tasks() -> Vec<ScheduledTask> {
    vec![
        ScheduledTask {
            id: "daily-brief".into(),
            title: "每日简报".into(),
            desc: "以日历、未读电子邮件和优先事项摘要开启每个工作日".into(),
            icon: "daily".into(),
            cron: "0 9 * * *".into(),
            status: "enabled".into(),
        },
        ScheduledTask {
            id: "weekly-review".into(),
            title: "每周回顾".into(),
            desc: "每周五将你最近的工作整理成简明的状态更新".into(),
            icon: "weekly".into(),
            cron: "0 10 * * 1".into(),
            status: "enabled".into(),
        },
        ScheduledTask {
            id: "followup".into(),
            title: "跟进监控".into(),
            desc: "查看最近的电子邮箱和日历活动，并标记需要你关注的事项".into(),
            icon: "followup".into(),
            cron: "0 */4 * * *".into(),
            status: "enabled".into(),
        },
    ]
}
