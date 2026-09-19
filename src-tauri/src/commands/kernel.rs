//! Tauri command layer for the self-developed kernel.
//!
//! This is the product API the React frontend already calls. Command names and
//! payload shapes are a **compatibility contract** taken from the actual call
//! sites, not invented here. Verified against:
//!
//! | command                | frontend call site                      | payload / expected return |
//! |------------------------|-----------------------------------------|---------------------------|
//! | `new_session`          | `Composer.tsx:736`                      | `{ projectPath }` -> `{ id }` (flat) |
//! | `send_message`         | `Composer.tsx:761`                      | `{ sessionId, message, attachments? }` |
//! | `interrupt_session`    | `Composer.tsx:689`                      | `{ sessionId }` |
//! | `get_session`          | `turnStore.ts:341`                      | `{ sessionId }` -> `{ preview?, title?, messages? }` |
//! | `get_runtime_events`   | `turnStore.ts:353`                      | `{ sessionId }` -> `{ data \| items }` |
//! | `list_sessions`        | `appStore.ts:382`                       | `{ archived }` -> `{ data }` |
//!
//! Two traps this file avoids:
//!  * `send_message` carries the text under **`message`**, not `text`. Accepting
//!    both keeps old callers working while matching today's frontend.
//!  * `new_session` must return a **flat** `{ id }`; `Composer.tsx:739` reads
//!    `created?.id` directly and silently aborts the send if it is missing.
//!
//! Every command returns `Result<T, String>`; the frontend surfaces a rejection
//! as a user-visible error, so we never return a fabricated success.

use std::sync::Arc;

use serde_json::{json, Value};
use tauri::{AppHandle, State};

use super::super::kernel::events::{self, KernelEvent};
use super::super::kernel::session::{SessionError, TurnStatus};
use super::super::kernel::state::KernelState;

/// Bridge kernel errors into the string form Tauri commands use.
fn err(e: SessionError) -> String {
    e.to_string()
}

/// Emitter bound to an `AppHandle` so `KernelState::spawn_turn` can be driven
/// from a command. `KernelState::spawn_turn` is generic over a closure, which
/// keeps the kernel testable without a Tauri runtime.
fn emitter(app: &AppHandle) -> impl Fn(KernelEvent) + Send + Sync + 'static {
    let handle = app.clone();
    move |ev: KernelEvent| ev.emit(&handle)
}

// ── engine status ───────────────────────────────────────────────────────────

/// `engine_status` — the frontend uses this to decide whether the engine is up.
///
/// Unlike the old sidecar shell (which reported `connected: false` forever when
/// the exe could not be resolved), this kernel has no external process to find,
/// so `connected` is always true. `placeholder` discloses whether real model
/// calls are happening — the UI must not imply a real answer when they are not.
///
/// The `initialize` block is a **compatibility contract** with three call sites:
/// `HomeView.tsx:169-174` stores it wholesale, `GeneralTab.tsx:104-105` reads
/// `initialize.codexHome` for the "default task folder" row, and
/// `ConfigurationTab.tsx:93-94` reads `initialize.version` for 当前版本. The
/// desktop command returned none of it, so that row showed 「—」 and the task
/// folder fell back to its stored override. `codexHome` is the shell's real
/// data directory — the place `shell-state.json` actually lives — not a path we
/// merely claim exists.
#[tauri::command]
pub fn engine_status(
    state: State<'_, Arc<KernelState>>,
    store: State<'_, crate::state::AppState>,
) -> Value {
    let c = state.counters();
    json!({
        "connected": true,
        "version": env!("CARGO_PKG_VERSION"),
        "provider": state.provider_name(),
        "placeholder": state.provider_is_placeholder(),
        "initialize": {
            "name": "codex-desktop-tauri",
            "title": "Codex Desktop (Tauri) — in-process kernel",
            "version": env!("CARGO_PKG_VERSION"),
            "codexHome": store.data_dir.to_string_lossy(),
            // This kernel speaks the same notification protocol but is not the
            // official app-server; the UI must not present it as such.
            "stub": false,
            "inProcess": true,
        },
        "counters": {
            "turnsStarted": c.turns_started,
            "turnsCompleted": c.turns_completed,
            "turnsFailed": c.turns_failed,
            "turnsInterrupted": c.turns_interrupted,
        },
    })
}

// ── threads ─────────────────────────────────────────────────────────────────

/// `new_session` — create a thread.
///
/// Returns a **flat** `{ id, ... }` because `Composer.tsx:739` reads
/// `created?.id`. A nested `{ session: { id } }` would silently break sending.
///
/// `projectPath` is a **compatibility contract** with `Composer.tsx:736-738`,
/// which sends the selected project's cwd (`projectCwd`) or `null`. The command
/// used to ignore it entirely, so every thread was project-less: the sidebar's
/// project list is derived from distinct thread `cwd` values
/// (`appStore.ts:216-225`) and therefore stayed permanently empty.
#[tauri::command]
pub fn new_session(
    app: AppHandle,
    state: State<'_, Arc<KernelState>>,
    project_path: Option<String>,
) -> Result<Value, String> {
    let cwd = project_path.unwrap_or_default();
    let thread = state.sessions.create_thread_in(&cwd).map_err(err)?;
    let title = thread.display_title();
    events::thread_started(&thread.id, &title).emit(&app);
    Ok(json!({
        "id": thread.id,
        "title": title,
        "name": title,
        "preview": title,
        "cwd": thread.cwd,
        "projectId": thread.cwd,
        "archived": thread.archived,
        "createdAt": thread.created_at,
        "updatedAt": thread.updated_at,
    }))
}

/// `list_sessions` — threads for the sidebar. The frontend reads `.data`.
///
/// Field names are a **compatibility contract** with `normaliseSessions`
/// (`appStore.ts:169-193`), which reads `id`, `name`, `cwd`, `projectId`,
/// `archived`, `updatedAt` and `preview`. Two of them were missing:
///
///  * `name` — only `title` was sent, so `session.title` and `session.preview`
///    were both `""` and `Sidebar.tsx:285` fell through to its 「New task」
///    default. Every row in the sidebar read "New task".
///  * `preview` — the same fallback chain uses it as the second choice.
///
/// `updatedAt` is Unix milliseconds (a number), matching `session.rs` and
/// `appStore.ts:188`. `ArchivedTab.tsx:42` used to accept only a string and so
/// never rendered its date column; it now parses both.
#[tauri::command]
pub fn list_sessions(
    state: State<'_, Arc<KernelState>>,
    archived: Option<bool>,
) -> Result<Value, String> {
    let threads = state.sessions.list_threads(archived).map_err(err)?;
    let data: Vec<Value> = threads
        .into_iter()
        .map(|t| {
            let title = t.display_title();
            json!({
                "id": t.id,
                "title": title,
                "name": title,
                "preview": title,
                "cwd": t.cwd,
                "projectId": t.cwd,
                "archived": t.archived,
                "createdAt": t.created_at,
                "updatedAt": t.updated_at,
                "turnCount": t.turns.len(),
            })
        })
        .collect();
    Ok(json!({ "data": data }))
}

/// `get_session` — one thread's metadata plus its transcript.
///
/// `turnStore.ts:341-344` reads `preview` / `title` / `name` and then
/// `messages`. All three name fields carry the same value so whichever the
/// loader prefers, it finds a title. `cwd` is included for the same reason as
/// in `list_sessions`.
#[tauri::command]
pub fn get_session(
    state: State<'_, Arc<KernelState>>,
    session_id: String,
) -> Result<Value, String> {
    let thread = state.sessions.get_thread(&session_id).map_err(err)?;
    let messages = state.sessions.transcript(&session_id).map_err(err)?;
    let title = thread.display_title();
    Ok(json!({
        "id": thread.id,
        "title": title,
        "name": title,
        "preview": title,
        "cwd": thread.cwd,
        "projectId": thread.cwd,
        "archived": thread.archived,
        "createdAt": thread.created_at,
        "updatedAt": thread.updated_at,
        "messages": messages,
    }))
}

#[tauri::command]
pub fn delete_session(
    app: AppHandle,
    state: State<'_, Arc<KernelState>>,
    session_id: String,
) -> Result<(), String> {
    state.sessions.delete_thread(&session_id).map_err(err)?;
    events::thread_deleted(&session_id).emit(&app);
    Ok(())
}

#[tauri::command]
pub fn archive_session(
    app: AppHandle,
    state: State<'_, Arc<KernelState>>,
    session_id: String,
) -> Result<(), String> {
    state.sessions.set_archived(&session_id, true).map_err(err)?;
    events::thread_archived(&session_id).emit(&app);
    Ok(())
}

#[tauri::command]
pub fn unarchive_session(
    app: AppHandle,
    state: State<'_, Arc<KernelState>>,
    session_id: String,
) -> Result<(), String> {
    state.sessions.set_archived(&session_id, false).map_err(err)?;
    events::thread_unarchived(&session_id).emit(&app);
    Ok(())
}

// ── turns ───────────────────────────────────────────────────────────────────

/// `send_message` — start a turn on a thread.
///
/// The frontend sends `{ sessionId, message, attachments? }`. We also accept
/// `text` and `input` so older callers and tests keep working, but `message` is
/// the shape that matters today.
///
/// `send_message` — start a turn on a thread.
///
/// Payload shape is a **compatibility contract** taken from the call site
/// (`Composer.tsx:753-761`), which sends `{ sessionId, message, attachments? }`.
///
/// The parameter is `Request<'_>`, not `serde_json::Value`. Tauri keys a
/// hand-parsed argument by its **parameter name**, so a `payload: Value`
/// parameter required a top-level `"payload"` key that this call site does not
/// send — the command rejected with `missing required key payload` before the
/// parsing below ever ran. See `commands::body_value`.
///
/// Returns as soon as the turn is scheduled; all output arrives as `codex:*`
/// events. Returning early is what keeps the composer responsive while the
/// answer streams in.
#[tauri::command]
pub fn send_message(
    app: AppHandle,
    state: State<'_, Arc<KernelState>>,
    request: tauri::ipc::Request<'_>,
) -> Result<Value, String> {
    let payload = super::body_value(&request);

    let session_id = payload
        .get("sessionId")
        .or_else(|| payload.get("session_id"))
        .or_else(|| payload.get("threadId"))
        .and_then(Value::as_str)
        .ok_or_else(|| "send_message: missing sessionId".to_string())?
        .to_string();

    let text = extract_text(&payload)
        .ok_or_else(|| "send_message: missing message text".to_string())?;

    if text.trim().is_empty() {
        return Err("send_message: message text is empty".to_string());
    }

    let turn_id = state
        .spawn_turn(session_id.clone(), text, emitter(&app))
        .map_err(err)?;

    Ok(json!({ "threadId": session_id, "turnId": turn_id, "accepted": true }))
}

/// Pull the user's text out of every payload shape we accept.
///
/// Order matters: `message` is what the current frontend sends, so it is
/// checked first to avoid a stale `text` field shadowing it.
fn extract_text(payload: &Value) -> Option<String> {
    for key in ["message", "text"] {
        if let Some(s) = payload.get(key).and_then(Value::as_str) {
            return Some(s.to_string());
        }
    }
    let input = payload.get("input")?;
    if let Some(s) = input.as_str() {
        return Some(s.to_string());
    }
    let parts = input.as_array()?;
    let mut out = String::new();
    for part in parts {
        if let Some(s) = part.as_str() {
            out.push_str(s);
            continue;
        }
        if let Some(s) = part.get("text").and_then(Value::as_str) {
            out.push_str(s);
        }
    }
    if out.is_empty() {
        None
    } else {
        Some(out)
    }
}

/// `interrupt_session` — cancel the active turn on a thread.
///
/// `Composer.tsx:689` sends only `{ sessionId }`, so `turnId` is optional and
/// defaults to whatever turn is currently running on that thread.
#[tauri::command]
pub async fn interrupt_session(
    app: AppHandle,
    state: State<'_, Arc<KernelState>>,
    session_id: String,
    turn_id: Option<String>,
) -> Result<Value, String> {
    let cancelled = state
        .interrupt(&session_id, turn_id.as_deref())
        .await
        .map_err(err)?;

    if !cancelled {
        // No live task to cancel. Report it honestly instead of pretending a
        // cancellation happened, and warn so the UI can explain why nothing
        // appeared to change.
        events::warning(&session_id, "No running turn to interrupt.").emit(&app);
    }
    Ok(json!({ "cancelled": cancelled }))
}

// ── history / diagnostics ───────────────────────────────────────────────────

/// `get_runtime_events` — replay a thread's items after a view switch.
///
/// `turnStore.ts:354` accepts `data` or `items`, so both are provided. The item
/// shape matches the live notifications, so live and replayed paths converge on
/// the same rendering code.
#[tauri::command]
pub fn get_runtime_events(
    state: State<'_, Arc<KernelState>>,
    session_id: String,
) -> Result<Value, String> {
    let thread = state.sessions.get_thread(&session_id).map_err(err)?;
    let items = state.sessions.transcript(&session_id).map_err(err)?;
    let turns: Vec<Value> = thread
        .turns
        .iter()
        .map(|t| {
            json!({
                "id": t.id,
                "status": t.status.as_wire(),
                "createdAt": t.created_at,
                "completedAt": t.completed_at,
                "error": t.error,
            })
        })
        .collect();
    Ok(json!({ "data": items, "items": items, "turns": turns }))
}

/// `kernel_selftest` — deterministic end-to-end check with no UI involved.
///
/// Creates a thread, runs a turn, and reports exactly what was emitted. This is
/// how the kernel is verified after a change without launching the app: it
/// exercises the real session layer, the real provider and the real event
/// mapping, and asserts the streamed text reassembles to the input.
#[tauri::command]
pub async fn kernel_selftest(state: State<'_, Arc<KernelState>>) -> Result<Value, String> {
    let thread = state.sessions.create_thread().map_err(err)?;
    let probe = "kernel selftest";

    // Collect locally instead of emitting: the caller asserts on the list.
    let collected: Arc<std::sync::Mutex<Vec<KernelEvent>>> =
        Arc::new(std::sync::Mutex::new(Vec::new()));
    let sink = Arc::clone(&collected);

    let turn_id = state
        .spawn_turn(thread.id.clone(), probe.to_string(), move |ev| {
            if let Ok(mut v) = sink.lock() {
                v.push(ev);
            }
        })
        .map_err(err)?;

    // Bounded wait for a terminal status; never spin forever.
    let mut final_status = TurnStatus::Pending;
    for _ in 0..200 {
        let turn = state
            .sessions
            .get_thread(&thread.id)
            .map_err(err)?
            .turns
            .into_iter()
            .find(|t| t.id == turn_id);
        match turn {
            Some(t) if t.status.is_terminal() => {
                final_status = t.status;
                break;
            }
            _ => tokio::time::sleep(std::time::Duration::from_millis(15)).await,
        }
    }

    let events = collected.lock().map(|v| v.clone()).unwrap_or_default();
    let streamed: String = events
        .iter()
        .filter(|e| e.method == "item/agentMessage/delta")
        .filter_map(|e| e.params.get("delta").and_then(Value::as_str))
        .collect();

    Ok(json!({
        "threadId": thread.id,
        "turnId": turn_id,
        "finalStatus": final_status.as_wire(),
        "eventCount": events.len(),
        "methods": events.iter().map(|e| e.method).collect::<Vec<_>>(),
        "streamedText": streamed,
        "textMatchesInput": streamed == probe,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_text_prefers_message_over_text() {
        // The current frontend sends `message`; a stale `text` must not win.
        let p = json!({ "sessionId": "t", "message": "from-message", "text": "from-text" });
        assert_eq!(extract_text(&p).as_deref(), Some("from-message"));
    }

    #[test]
    fn extract_text_accepts_plain_text() {
        let p = json!({ "sessionId": "t", "text": "hi" });
        assert_eq!(extract_text(&p).as_deref(), Some("hi"));
    }

    #[test]
    fn extract_text_accepts_input_parts() {
        let p = json!({ "input": [{ "type": "text", "text": "a" }, { "text": "b" }] });
        assert_eq!(extract_text(&p).as_deref(), Some("ab"));
    }

    #[test]
    fn extract_text_accepts_bare_string_input() {
        let p = json!({ "input": "direct" });
        assert_eq!(extract_text(&p).as_deref(), Some("direct"));
    }

    #[test]
    fn extract_text_returns_none_when_absent() {
        let p = json!({ "sessionId": "t" });
        assert!(extract_text(&p).is_none());
    }
}
