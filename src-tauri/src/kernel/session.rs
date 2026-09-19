//! In-memory thread + turn state machine for the self-developed kernel.
//!
//! Deliberately simple and dependency-free:
//!  * one `RwLock<HashMap<ThreadId, Thread>>` guards all threads
//!  * a turn is a plain state machine (`TurnStatus`), not a spawned task tree
//!  * persistence is intentionally absent in this first slice; the store is
//!    in-memory so the transport can be validated before storage is designed
//!
//! Why in-memory first: the previous sidecar-based backend failed at the
//! *transport* layer (cold-start double connect, 120 s dead-socket hang,
//! unanswered server requests). Proving the transport end-to-end with zero
//! moving parts is the cheapest way to de-risk that. Storage is layered on
//! afterwards behind the same interface.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::RwLock;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Milliseconds since the Unix epoch. Used for ordering and for `createdAt`.
fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Public form of [`now_ms`] for sibling modules (turn completion timestamps).
pub fn now_ms_pub() -> u64 {
    now_ms()
}

/// Monotonic id source. Deterministic and collision-free within a process,
/// unlike a random suffix, which makes logs and tests reproducible.
#[derive(Debug, Default)]
pub struct IdGen {
    next: AtomicU64,
}

impl IdGen {
    pub fn new() -> Self {
        Self {
            next: AtomicU64::new(1),
        }
    }

    fn next(&self, prefix: &str) -> String {
        let n = self.next.fetch_add(1, Ordering::Relaxed);
        format!("{prefix}-{n}")
    }

    pub fn thread(&self) -> String {
        self.next("thread")
    }

    pub fn turn(&self) -> String {
        self.next("turn")
    }

    pub fn item(&self) -> String {
        self.next("item")
    }
}

/// Lifecycle of a single turn.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TurnStatus {
    /// Accepted and queued, not yet producing output.
    Pending,
    /// Actively streaming.
    Running,
    /// Finished normally.
    Completed,
    /// Finished with an error; `error` on the turn carries the message.
    Failed,
    /// Cancelled by the user via `turn/interrupt`.
    Interrupted,
}

impl TurnStatus {
    /// Wire spelling for `turn/completed`'s `status` field. Matches the values
    /// the frontend's `statusOf()` accepts.
    pub fn as_wire(self) -> &'static str {
        match self {
            TurnStatus::Pending => super::protocol::status::IN_PROGRESS,
            TurnStatus::Running => super::protocol::status::RUNNING,
            TurnStatus::Completed => super::protocol::status::COMPLETED,
            TurnStatus::Failed => super::protocol::status::FAILED,
            TurnStatus::Interrupted => super::protocol::status::INTERRUPTED,
        }
    }

    pub fn is_terminal(self) -> bool {
        matches!(
            self,
            TurnStatus::Completed | TurnStatus::Failed | TurnStatus::Interrupted
        )
    }
}

/// One user input item stored on a turn.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TurnInput {
    pub text: String,
}

/// A turn: one user message plus the assistant's response stream.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Turn {
    pub id: String,
    pub thread_id: String,
    pub status: TurnStatus,
    pub input: Vec<TurnInput>,
    /// Id of the agent-message item being streamed, so deltas target one block.
    pub agent_item_id: Option<String>,
    /// Accumulated assistant text. Kept so a late subscriber can replay it and
    /// so `thread/read` can return a coherent transcript.
    pub agent_text: String,
    pub error: Option<String>,
    pub created_at: u64,
    pub completed_at: Option<u64>,
}

impl Turn {
    fn new(id: String, thread_id: String, input: Vec<TurnInput>) -> Self {
        Self {
            id,
            thread_id,
            status: TurnStatus::Pending,
            input,
            agent_item_id: None,
            agent_text: String::new(),
            error: None,
            created_at: now_ms(),
            completed_at: None,
        }
    }
}

/// A thread: an ordered list of turns.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Thread {
    pub id: String,
    pub name: Option<String>,
    pub archived: bool,
    /// Working directory this thread was opened in.
    ///
    /// This is the identity of a "project" in the sidebar: `appStore.ts:216-225`
    /// builds the project list from the distinct `cwd` values of the threads it
    /// loads, and `sessionsForProject` filters by it. The field did not exist,
    /// so `new_session`'s `projectPath` was dropped on the floor and the project
    /// list stayed permanently empty — every thread arrived with `cwd: ""`.
    ///
    /// Empty means "no project chosen"; the UI treats that as project-less.
    #[serde(default)]
    pub cwd: String,
    pub turns: Vec<Turn>,
    pub created_at: u64,
    pub updated_at: u64,
}

impl Thread {
    fn new(id: String, cwd: String) -> Self {
        let now = now_ms();
        Self {
            id,
            name: None,
            archived: false,
            cwd,
            turns: Vec::new(),
            created_at: now,
            updated_at: now,
        }
    }

    /// Title used by the sidebar: the first user message, truncated.
    pub fn display_title(&self) -> String {
        if let Some(name) = &self.name {
            if !name.is_empty() {
                return name.clone();
            }
        }
        for turn in &self.turns {
            if let Some(first) = turn.input.first() {
                let trimmed = first.text.trim();
                if !trimmed.is_empty() {
                    return truncate_chars(trimmed, 60);
                }
            }
        }
        "New task".to_string()
    }

    pub fn active_turn(&self) -> Option<&Turn> {
        self.turns.iter().rev().find(|t| !t.status.is_terminal())
    }
}

/// Truncate on a char boundary so multi-byte input cannot panic.
fn truncate_chars(s: &str, max: usize) -> String {
    let mut out: String = s.chars().take(max).collect();
    if s.chars().count() > max {
        out.push('…');
    }
    out
}

/// Errors from the session layer. Converted to `String` at the Tauri boundary
/// (Tauri commands return `Result<T, String>`).
#[derive(Debug, thiserror::Error)]
pub enum SessionError {
    #[error("thread not found: {0}")]
    ThreadNotFound(String),
    #[error("turn not found: {0}")]
    TurnNotFound(String),
    #[error("thread already has a running turn: {0}")]
    TurnAlreadyRunning(String),
    #[error("state lock poisoned")]
    LockPoisoned,
}

/// Owns all threads. Cheap to clone via `Arc`; interior state is behind `RwLock`.
#[derive(Debug)]
pub struct SessionManager {
    threads: RwLock<HashMap<String, Thread>>,
    /// Insertion order, so `thread/list` is stable and newest-first without
    /// sorting by a timestamp that can collide within the same millisecond.
    order: RwLock<Vec<String>>,
    ids: IdGen,
}

impl Default for SessionManager {
    fn default() -> Self {
        Self::new()
    }
}

impl SessionManager {
    pub fn new() -> Self {
        Self {
            threads: RwLock::new(HashMap::new()),
            order: RwLock::new(Vec::new()),
            ids: IdGen::new(),
        }
    }

    /// Create a thread and emit `thread/started`.
    pub fn create_thread(&self) -> Result<Thread, SessionError> {
        self.create_thread_in("")
    }

    /// Create a thread bound to a working directory.
    ///
    /// `cwd` is what makes a thread belong to a project; an empty string is a
    /// project-less thread, which is the correct state for the blank home guide.
    pub fn create_thread_in(&self, cwd: &str) -> Result<Thread, SessionError> {
        let id = self.ids.thread();
        let thread = Thread::new(id.clone(), cwd.trim().to_string());
        {
            let mut threads = self.threads.write().map_err(|_| SessionError::LockPoisoned)?;
            threads.insert(id.clone(), thread.clone());
            let mut order = self.order.write().map_err(|_| SessionError::LockPoisoned)?;
            order.push(id);
        }
        Ok(thread)
    }

    pub fn get_thread(&self, id: &str) -> Result<Thread, SessionError> {
        let threads = self.threads.read().map_err(|_| SessionError::LockPoisoned)?;
        threads
            .get(id)
            .cloned()
            .ok_or_else(|| SessionError::ThreadNotFound(id.to_string()))
    }

    /// Threads newest-first. `archived` filters on the archive flag.
    pub fn list_threads(&self, archived: Option<bool>) -> Result<Vec<Thread>, SessionError> {
        let threads = self.threads.read().map_err(|_| SessionError::LockPoisoned)?;
        let order = self.order.read().map_err(|_| SessionError::LockPoisoned)?;
        let mut out: Vec<Thread> = order
            .iter()
            .rev()
            .filter_map(|id| threads.get(id))
            .filter(|t| archived.is_none_or(|want| t.archived == want))
            .cloned()
            .collect();
        out.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        Ok(out)
    }

    pub fn delete_thread(&self, id: &str) -> Result<(), SessionError> {
        {
            let mut threads = self.threads.write().map_err(|_| SessionError::LockPoisoned)?;
            if threads.remove(id).is_none() {
                return Err(SessionError::ThreadNotFound(id.to_string()));
            }
            let mut order = self.order.write().map_err(|_| SessionError::LockPoisoned)?;
            order.retain(|x| x != id);
        }
        Ok(())
    }

    pub fn set_archived(&self, id: &str, archived: bool) -> Result<Thread, SessionError> {
        let mut threads = self.threads.write().map_err(|_| SessionError::LockPoisoned)?;
        let thread = threads
            .get_mut(id)
            .ok_or_else(|| SessionError::ThreadNotFound(id.to_string()))?;
        thread.archived = archived;
        thread.updated_at = now_ms();
        Ok(thread.clone())
    }

    /// Begin a turn. Rejects a second concurrent turn on the same thread —
    /// the frontend expects one active turn per thread, and allowing two would
    /// interleave deltas into a single agent block.
    pub fn begin_turn(
        &self,
        thread_id: &str,
        input: Vec<TurnInput>,
    ) -> Result<Turn, SessionError> {
        let mut threads = self.threads.write().map_err(|_| SessionError::LockPoisoned)?;
        let thread = threads
            .get_mut(thread_id)
            .ok_or_else(|| SessionError::ThreadNotFound(thread_id.to_string()))?;

        if let Some(active) = thread.active_turn() {
            return Err(SessionError::TurnAlreadyRunning(active.id.clone()));
        }

        let turn = Turn::new(self.ids.turn(), thread_id.to_string(), input);
        thread.turns.push(turn.clone());
        thread.updated_at = now_ms();
        Ok(turn)
    }

    /// Mutate one turn in place. Returns the updated copy for event payloads.
    pub fn update_turn<F>(&self, thread_id: &str, turn_id: &str, f: F) -> Result<Turn, SessionError>
    where
        F: FnOnce(&mut Turn),
    {
        let mut threads = self.threads.write().map_err(|_| SessionError::LockPoisoned)?;
        let thread = threads
            .get_mut(thread_id)
            .ok_or_else(|| SessionError::ThreadNotFound(thread_id.to_string()))?;
        let turn = thread
            .turns
            .iter_mut()
            .find(|t| t.id == turn_id)
            .ok_or_else(|| SessionError::TurnNotFound(turn_id.to_string()))?;
        f(turn);
        let updated = turn.clone();
        thread.updated_at = now_ms();
        Ok(updated)
    }

    /// The most recent non-terminal turn, used by `turn/interrupt`.
    pub fn active_turn(&self, thread_id: &str) -> Result<Option<Turn>, SessionError> {
        let threads = self.threads.read().map_err(|_| SessionError::LockPoisoned)?;
        let thread = threads
            .get(thread_id)
            .ok_or_else(|| SessionError::ThreadNotFound(thread_id.to_string()))?;
        Ok(thread.active_turn().cloned())
    }

    /// Allocate a fresh item id (agent message, tool call, …).
    pub fn new_item_id(&self) -> String {
        self.ids.item()
    }

    /// Flattened transcript for `thread/read` / `get_session`.
    pub fn transcript(&self, thread_id: &str) -> Result<Vec<Value>, SessionError> {
        let thread = self.get_thread(thread_id)?;
        let mut items = Vec::new();
        for turn in &thread.turns {
            for input in &turn.input {
                items.push(serde_json::json!({
                    "id": format!("{}-user", turn.id),
                    "itemType": super::protocol::item_types::USER_MESSAGE,
                    "status": super::protocol::status::COMPLETED,
                    "text": input.text,
                }));
            }
            if !turn.agent_text.is_empty() {
                items.push(serde_json::json!({
                    "id": turn.agent_item_id.clone().unwrap_or_else(|| format!("{}-agent", turn.id)),
                    "itemType": super::protocol::item_types::AGENT_MESSAGE,
                    "status": turn.status.as_wire(),
                    "text": turn.agent_text,
                }));
            }
        }
        Ok(items)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input(text: &str) -> Vec<TurnInput> {
        vec![TurnInput {
            text: text.to_string(),
        }]
    }

    #[test]
    fn create_and_list_threads_newest_first() {
        let m = SessionManager::new();
        let a = m.create_thread().expect("create a");
        let b = m.create_thread().expect("create b");
        let list = m.list_threads(None).expect("list");
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].id, b.id, "newest thread should sort first");
        assert_eq!(list[1].id, a.id);
    }

    #[test]
    fn archived_filter_works() {
        let m = SessionManager::new();
        let a = m.create_thread().expect("create");
        m.set_archived(&a.id, true).expect("archive");
        assert_eq!(m.list_threads(Some(false)).expect("active").len(), 0);
        assert_eq!(m.list_threads(Some(true)).expect("archived").len(), 1);
    }

    #[test]
    fn second_concurrent_turn_is_rejected() {
        let m = SessionManager::new();
        let t = m.create_thread().expect("create");
        m.begin_turn(&t.id, input("first")).expect("first turn");
        let err = m.begin_turn(&t.id, input("second"));
        assert!(
            matches!(err, Err(SessionError::TurnAlreadyRunning(_))),
            "a second concurrent turn must be rejected, got {err:?}"
        );
    }

    #[test]
    fn turn_can_restart_after_completion() {
        let m = SessionManager::new();
        let t = m.create_thread().expect("create");
        let turn = m.begin_turn(&t.id, input("first")).expect("first turn");
        m.update_turn(&t.id, &turn.id, |t| {
            t.status = TurnStatus::Completed;
        })
        .expect("complete");
        m.begin_turn(&t.id, input("second"))
            .expect("second turn allowed after the first completed");
    }

    #[test]
    fn transcript_includes_user_and_agent_items() {
        let m = SessionManager::new();
        let t = m.create_thread().expect("create");
        let turn = m.begin_turn(&t.id, input("hello")).expect("turn");
        m.update_turn(&t.id, &turn.id, |t| {
            t.agent_text = "world".into();
            t.status = TurnStatus::Completed;
        })
        .expect("update");
        let items = m.transcript(&t.id).expect("transcript");
        assert_eq!(items.len(), 2);
        assert_eq!(items[0]["itemType"], super::super::protocol::item_types::USER_MESSAGE);
        assert_eq!(items[1]["text"], "world");
    }

    #[test]
    fn display_title_prefers_name_then_first_message() {
        let m = SessionManager::new();
        let t = m.create_thread().expect("create");
        assert_eq!(t.display_title(), "New task");
        assert_eq!(t.cwd, "", "a thread created without a project has no cwd");
        m.begin_turn(&t.id, input("  Fix the parser  ")).expect("turn");
        assert_eq!(m.get_thread(&t.id).expect("get").display_title(), "Fix the parser");
    }

    #[test]
    fn create_thread_in_records_the_project_cwd() {
        // The sidebar's project list is derived from distinct thread cwds, so a
        // dropped cwd means the project never appears.
        let m = SessionManager::new();
        let t = m.create_thread_in("C:/work/app").expect("create");
        assert_eq!(t.cwd, "C:/work/app");
        assert_eq!(m.get_thread(&t.id).expect("get").cwd, "C:/work/app");
    }

    #[test]
    fn create_thread_in_trims_and_tolerates_a_blank_cwd() {
        let m = SessionManager::new();
        assert_eq!(m.create_thread_in("  C:/x  ").expect("create").cwd, "C:/x");
        assert_eq!(m.create_thread_in("   ").expect("create").cwd, "");
    }

    #[test]
    fn truncate_is_char_safe() {
        // Multi-byte chars must not panic or split a codepoint.
        let s = "中文".repeat(50);
        let out = truncate_chars(&s, 10);
        assert_eq!(out.chars().count(), 11); // 10 + ellipsis
    }
}
