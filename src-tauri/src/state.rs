//! Local desktop shell state (UI-only). Agent/session state lives in codex-app-server.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;

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
    #[serde(default)]
    pub app_server_listen: String,
    #[serde(default)]
    pub app_server_binary: String,
}

#[derive(Debug, Default, Serialize, Deserialize, Clone)]
pub struct Preferences {
    #[serde(default)]
    pub pets_enabled: bool,
    #[serde(default)]
    pub reduced_motion: bool,
    #[serde(default)]
    pub compact_mode: bool,
    #[serde(default)]
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
        if inner.settings.app_server_listen.is_empty() {
            inner.settings.app_server_listen = "ws://127.0.0.1:17457".into();
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
        }
    }
}
