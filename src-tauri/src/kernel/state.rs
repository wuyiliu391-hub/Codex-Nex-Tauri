//! Kernel state and turn execution.
//!
//! `KernelState` is what Tauri manages (`app.manage`). It owns the session
//! manager and the active provider, and it runs turns.
//!
//! ## Turn execution model
//!
//! A turn runs on a detached Tokio task so the command that started it returns
//! immediately (the UI stays responsive and can render the stream as it
//! arrives). Cancellation is cooperative via a `CancellationToken` stored per
//! turn, which is what makes `turn/interrupt` reliable — the previous backend
//! could not interrupt because its transport had no cancellation path.
//!
//! Concurrency rule: at most one running turn per thread, enforced by
//! `SessionManager::begin_turn`. This is what keeps deltas from interleaving
//! into a single agent block.

use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use tokio::sync::Mutex as AsyncMutex;
use tokio_util::sync::CancellationToken;

use super::events::{self, KernelEvent};
use super::provider::{ChatMessage, EchoProvider, ModelProvider, ProviderChunk};
use super::protocol::{item_types, status};
use super::session::{SessionError, SessionManager, TurnInput, TurnStatus};

/// How often the kernel emits a `commentary` delta before switching the agent
/// block to `final_answer`. Mirrors the two-phase behaviour the frontend
/// expects from `phaseOf()`.
const FINAL_ANSWER_ITEM_MARKER: &str = "final_answer";

/// Everything the kernel owns at runtime.
pub struct KernelState {
    pub sessions: Arc<SessionManager>,
    /// The active model backend.
    ///
    /// Behind an `RwLock` so the provider can be swapped at runtime: saving a
    /// provider in the UI must take effect without restarting the app. The lock
    /// is only held to clone the `Arc`, never across an `.await` on the stream,
    /// so a running turn keeps using the provider it started with.
    provider: RwLock<Arc<dyn ModelProvider>>,
    /// Cancellation handle per turn id, so `turn/interrupt` can stop a stream.
    running: AsyncMutex<HashMap<String, CancellationToken>>,
    /// Serialises provider calls. One model call at a time keeps local
    /// providers honest and makes ordering deterministic in tests.
    provider_gate: AsyncMutex<()>,
    /// Counts turns so tests can assert on emitted traffic.
    counters: RwLock<Counters>,
}

#[derive(Debug, Default, Clone, Copy)]
pub struct Counters {
    pub turns_started: u64,
    pub turns_completed: u64,
    pub turns_failed: u64,
    pub turns_interrupted: u64,
}

impl Default for KernelState {
    fn default() -> Self {
        Self::new()
    }
}

impl KernelState {
    pub fn new() -> Self {
        Self::with_provider(Arc::new(EchoProvider::new()))
    }

    pub fn with_provider(provider: Arc<dyn ModelProvider>) -> Self {
        Self {
            sessions: Arc::new(SessionManager::new()),
            provider: RwLock::new(provider),
            running: AsyncMutex::new(HashMap::new()),
            provider_gate: AsyncMutex::new(()),
            counters: RwLock::new(Counters::default()),
        }
    }

    /// Swap the active provider. Takes effect on the next turn.
    ///
    /// A turn already in flight keeps the provider it started with: `run_turn`
    /// clones the `Arc` once, so replacing the slot cannot pull the model out
    /// from under a running stream.
    pub fn set_provider(&self, provider: Arc<dyn ModelProvider>) {
        match self.provider.write() {
            Ok(mut slot) => *slot = provider,
            Err(poisoned) => {
                // A poisoned lock means a previous writer panicked. Recovering
                // is better than refusing to change providers forever.
                tracing::warn!("provider lock was poisoned; recovering");
                *poisoned.into_inner() = provider;
            }
        }
    }

    /// The provider in use right now.
    fn current_provider(&self) -> Arc<dyn ModelProvider> {
        match self.provider.read() {
            Ok(slot) => Arc::clone(&slot),
            Err(poisoned) => Arc::clone(&poisoned.into_inner()),
        }
    }

    /// Name of the active provider, for the status command and logs.
    pub fn provider_name(&self) -> &'static str {
        self.current_provider().name()
    }

    /// True when the active provider does not call a real model. Surfaced to the
    /// UI so a placeholder answer is never presented as a real completion.
    pub fn provider_is_placeholder(&self) -> bool {
        self.current_provider().is_placeholder()
    }

    pub fn counters(&self) -> Counters {
        self.counters.read().map(|c| *c).unwrap_or_default()
    }

    fn bump<F: FnOnce(&mut Counters)>(&self, f: F) {
        if let Ok(mut c) = self.counters.write() {
            f(&mut c);
        }
    }

    /// Run one turn to completion on a background task.
    ///
    /// Returns the turn id immediately; all output arrives as events. `emit`
    /// is called for every notification so the caller controls delivery
    /// (production passes a Tauri emitter, tests pass a collector).
    pub fn spawn_turn<E>(self: &Arc<Self>, thread_id: String, text: String, emit: E) -> Result<String, SessionError>
    where
        E: Fn(KernelEvent) + Send + Sync + 'static,
    {
        let input = vec![TurnInput { text: text.clone() }];
        let turn = self.sessions.begin_turn(&thread_id, input)?;
        let turn_id = turn.id.clone();

        let cancel = CancellationToken::new();
        {
            // `try_lock` is acceptable here: `spawn_turn` is only reached from
            // a synchronous command handler, and a contended lock would mean a
            // second turn is being registered concurrently — in which case the
            // session layer has already rejected it.
            if let Ok(mut running) = self.running.try_lock() {
                running.insert(turn_id.clone(), cancel.clone());
            }
        }

        self.bump(|c| c.turns_started += 1);

        let state = Arc::clone(self);
        let emit = Arc::new(emit);
        let tid = thread_id.clone();
        let tui = turn_id.clone();

        tauri::async_runtime::spawn(async move {
            state
                .run_turn(tid, tui, text, cancel, emit.as_ref())
                .await;
        });

        Ok(turn_id)
    }

    /// The actual turn body. Emits `turn/started`, streams deltas, then emits
    /// exactly one terminal event (`turn/completed`).
    async fn run_turn<E>(
        &self,
        thread_id: String,
        turn_id: String,
        text: String,
        cancel: CancellationToken,
        emit: &E,
    ) where
        E: Fn(KernelEvent) + Send + Sync,
    {
        // 1) mark running + announce
        let _ = self.sessions.update_turn(&thread_id, &turn_id, |t| {
            t.status = TurnStatus::Running;
        });
        emit(events::turn_started(&thread_id, &turn_id));
        emit(events::thread_status_changed(&thread_id, status::RUNNING));

        // 2) open the agent-message item that deltas will target
        let agent_item_id = self.sessions.new_item_id();
        let _ = self.sessions.update_turn(&thread_id, &turn_id, |t| {
            t.agent_item_id = Some(agent_item_id.clone());
        });
        emit(events::item_started(
            &thread_id,
            &turn_id,
            &agent_item_id,
            item_types::AGENT_MESSAGE,
        ));

        // 3) build the conversation handed to the provider
        let history = match self.sessions.get_thread(&thread_id) {
            Ok(thread) => {
                let mut msgs = Vec::new();
                for t in &thread.turns {
                    for input in &t.input {
                        msgs.push(ChatMessage::user(input.text.clone()));
                    }
                    if !t.agent_text.is_empty() {
                        msgs.push(ChatMessage::assistant(t.agent_text.clone()));
                    }
                }
                msgs
            }
            Err(err) => {
                self.fail_turn(&thread_id, &turn_id, &err.to_string(), emit);
                return;
            }
        };
        // The current turn's text is already in `history` via `begin_turn`.

        // 4) stream, collecting the answer. Deliberately holding the provider
        //    gate across the stream so two turns cannot interleave output.
        let _gate = self.provider_gate.lock().await;

        // Snapshot the provider for the whole turn. Swapping providers mid-turn
        // (the user saving settings while an answer streams) must not change
        // which backend this turn is talking to, and `is_placeholder` below has
        // to describe the provider that actually produced the text.
        let provider = self.current_provider();

        let thread_id_cb = thread_id.clone();
        let turn_id_cb = turn_id.clone();
        let item_cb = agent_item_id.clone();
        let mut accumulated = String::new();
        let mut cancelled = false;
        let mut usage: Option<(u64, u64, u64)> = None;
        let mut provider_error: Option<String> = None;

        {
            let mut on_chunk = |chunk: ProviderChunk| {
                match chunk {
                    ProviderChunk::Text { delta } => {
                        accumulated.push_str(&delta);
                        emit(events::agent_message_delta(
                            &thread_id_cb,
                            &turn_id_cb,
                            &item_cb,
                            &delta,
                            // Streaming phase; the closing delta is re-sent as
                            // final_answer below so the UI can settle the block.
                            "commentary",
                        ));
                    }
                    ProviderChunk::Reasoning { delta } => {
                        emit(events::reasoning_delta(
                            &thread_id_cb,
                            &turn_id_cb,
                            &format!("{item_cb}-reasoning"),
                            &delta,
                        ));
                    }
                    ProviderChunk::Usage {
                        input_tokens,
                        output_tokens,
                        total_tokens,
                    } => {
                        usage = Some((input_tokens, output_tokens, total_tokens));
                    }
                    ProviderChunk::Error { message, .. } => {
                        provider_error = Some(message);
                    }
                }
            };

            let result = tokio::select! {
                biased;
                _ = cancel.cancelled() => {
                    cancelled = true;
                    Ok(())
                }
                r = provider.stream(&history, &mut on_chunk) => r,
            };

            if let Err(err) = result {
                provider_error.get_or_insert_with(|| err.to_string());
            }
        }

        // 5) persist whatever we produced, so `thread/read` is coherent even
        //    for an interrupted or failed turn.
        let _ = self.sessions.update_turn(&thread_id, &turn_id, |t| {
            t.agent_text = accumulated.clone();
        });

        if cancelled {
            let _ = self.sessions.update_turn(&thread_id, &turn_id, |t| {
                t.status = TurnStatus::Interrupted;
                t.completed_at = Some(super::session::now_ms_pub());
            });
            self.bump(|c| c.turns_interrupted += 1);
            emit(events::item_completed(
                &thread_id,
                &turn_id,
                &agent_item_id,
                item_types::AGENT_MESSAGE,
                &accumulated,
            ));
            emit(events::turn_completed(
                &thread_id,
                &turn_id,
                status::INTERRUPTED,
                None,
            ));
            emit(events::thread_status_changed(&thread_id, status::INTERRUPTED));
            self.running.lock().await.remove(&turn_id);
            return;
        }

        if let Some(message) = provider_error {
            self.fail_turn(&thread_id, &turn_id, &message, emit);
            self.running.lock().await.remove(&turn_id);
            return;
        }

        // 6) settle the block as final_answer, then complete the turn
        if !accumulated.is_empty() {
            emit(events::agent_message_delta(
                &thread_id,
                &turn_id,
                &agent_item_id,
                "",
                FINAL_ANSWER_ITEM_MARKER,
            ));
        }
        emit(events::item_completed(
            &thread_id,
            &turn_id,
            &agent_item_id,
            item_types::AGENT_MESSAGE,
            &accumulated,
        ));

        if let Some((input_tokens, output_tokens, total_tokens)) = usage {
            emit(events::token_usage_updated(
                &thread_id,
                &turn_id,
                input_tokens,
                output_tokens,
                total_tokens,
            ));
        }

        // 7) a placeholder provider must say so — never present a non-model
        //    answer as a real completion. Checked against the snapshot, so the
        //    disclosure always describes the provider that produced the text.
        if provider.is_placeholder() {
            emit(events::warning(
                &thread_id,
                "This reply came from the built-in echo provider, not a model. \
                 Configure a provider to get real answers.",
            ));
        }

        let _ = self.sessions.update_turn(&thread_id, &turn_id, |t| {
            t.status = TurnStatus::Completed;
            t.completed_at = Some(super::session::now_ms_pub());
        });
        self.bump(|c| c.turns_completed += 1);
        emit(events::turn_completed(
            &thread_id,
            &turn_id,
            status::COMPLETED,
            None,
        ));
        emit(events::thread_status_changed(&thread_id, status::COMPLETED));
        self.running.lock().await.remove(&turn_id);
    }

    /// Single place that transitions a turn to `Failed`, so the terminal event
    /// is emitted exactly once with a consistent shape.
    fn fail_turn<E>(&self, thread_id: &str, turn_id: &str, message: &str, emit: &E)
    where
        E: Fn(KernelEvent) + Send + Sync,
    {
        let _ = self.sessions.update_turn(thread_id, turn_id, |t| {
            t.status = TurnStatus::Failed;
            t.error = Some(message.to_string());
            t.completed_at = Some(super::session::now_ms_pub());
        });
        self.bump(|c| c.turns_failed += 1);
        emit(events::error(Some(thread_id), message));
        emit(events::turn_completed(
            thread_id,
            turn_id,
            status::FAILED,
            Some(message),
        ));
        emit(events::thread_status_changed(thread_id, status::FAILED));
    }

    /// Cancel a running turn. Returns true when a turn was actually cancelled.
    pub async fn interrupt(&self, thread_id: &str, turn_id: Option<&str>) -> Result<bool, SessionError> {
        let target = match turn_id {
            Some(id) => Some(id.to_string()),
            None => self.sessions.active_turn(thread_id)?.map(|t| t.id),
        };
        let Some(target) = target else {
            return Ok(false);
        };

        let running = self.running.lock().await;
        match running.get(&target) {
            Some(token) => {
                token.cancel();
                Ok(true)
            }
            // No live task: the turn already finished (or never started).
            None => Ok(false),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    /// Collects events so turn execution can be asserted without a Tauri app.
    fn collector() -> (Arc<Mutex<Vec<KernelEvent>>>, impl Fn(KernelEvent) + Send + Sync + 'static) {
        let store = Arc::new(Mutex::new(Vec::new()));
        let sink = Arc::clone(&store);
        let emit = move |ev: KernelEvent| {
            if let Ok(mut v) = sink.lock() {
                v.push(ev);
            }
        };
        (store, emit)
    }

    fn rt() -> tokio::runtime::Runtime {
        tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .expect("runtime")
    }

    /// Wait until the turn reaches a terminal status, with a hard bound.
    async fn wait_terminal(state: &KernelState, thread_id: &str, turn_id: &str) {
        for _ in 0..400 {
            let t = state
                .sessions
                .get_thread(thread_id)
                .expect("thread")
                .turns
                .into_iter()
                .find(|t| t.id == turn_id)
                .expect("turn");
            if t.status.is_terminal() {
                return;
            }
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        }
        panic!("turn {turn_id} never reached a terminal status");
    }

    fn state_with_echo() -> Arc<KernelState> {
        Arc::new(KernelState::with_provider(Arc::new(EchoProvider::immediate())))
    }

    #[test]
    fn happy_path_emits_started_then_deltas_then_completed() {
        let rt = rt();
        rt.block_on(async {
            let state = state_with_echo();
            let thread = state.sessions.create_thread().expect("thread");
            let (store, emit) = collector();

            let turn_id = state
                .spawn_turn(thread.id.clone(), "hello kernel".into(), emit)
                .expect("spawn");

            wait_terminal(&state, &thread.id, &turn_id).await;

            let events = store.lock().expect("lock").clone();
            let methods: Vec<&str> = events.iter().map(|e| e.method).collect();

            assert_eq!(methods.first(), Some(&"turn/started"));
            assert_eq!(methods.last(), Some(&"thread/status/changed"));
            assert!(methods.contains(&"turn/completed"));
            assert!(methods.contains(&"item/agentMessage/delta"));

            // exactly one terminal turn event
            let completed = methods.iter().filter(|m| **m == "turn/completed").count();
            assert_eq!(completed, 1, "turn/completed must fire exactly once");
        });
    }

    #[test]
    fn deltas_reassemble_to_the_input() {
        let rt = rt();
        rt.block_on(async {
            let state = state_with_echo();
            let thread = state.sessions.create_thread().expect("thread");
            let (store, emit) = collector();
            let input = "alpha beta gamma";

            let turn_id = state
                .spawn_turn(thread.id.clone(), input.into(), emit)
                .expect("spawn");
            wait_terminal(&state, &thread.id, &turn_id).await;

            let events = store.lock().expect("lock").clone();
            let text: String = events
                .iter()
                .filter(|e| e.method == "item/agentMessage/delta")
                .filter_map(|e| e.params.get("delta").and_then(|v| v.as_str()))
                .collect();
            assert_eq!(text, input, "streamed deltas must reassemble to the input");
        });
    }

    #[test]
    fn turn_completes_with_completed_status_and_persists_text() {
        let rt = rt();
        rt.block_on(async {
            let state = state_with_echo();
            let thread = state.sessions.create_thread().expect("thread");
            let (store, emit) = collector();

            let turn_id = state
                .spawn_turn(thread.id.clone(), "persist me".into(), emit)
                .expect("spawn");
            wait_terminal(&state, &thread.id, &turn_id).await;

            let turn = state
                .sessions
                .get_thread(&thread.id)
                .expect("thread")
                .turns
                .into_iter()
                .find(|t| t.id == turn_id)
                .expect("turn");
            assert_eq!(turn.status, TurnStatus::Completed);
            assert_eq!(turn.agent_text, "persist me");
            assert!(turn.completed_at.is_some());

            let events = store.lock().expect("lock").clone();
            let done = events
                .iter()
                .find(|e| e.method == "turn/completed")
                .expect("turn/completed present");
            assert_eq!(done.params["status"], "completed");
        });
    }

    #[test]
    fn placeholder_provider_emits_an_honest_warning() {
        let rt = rt();
        rt.block_on(async {
            let state = state_with_echo();
            let thread = state.sessions.create_thread().expect("thread");
            let (store, emit) = collector();

            let turn_id = state
                .spawn_turn(thread.id.clone(), "hi".into(), emit)
                .expect("spawn");
            wait_terminal(&state, &thread.id, &turn_id).await;

            let events = store.lock().expect("lock").clone();
            let warned = events.iter().any(|e| e.method == "warning");
            assert!(warned, "a placeholder provider must disclose itself");
        });
    }

    #[test]
    fn second_turn_on_a_busy_thread_is_rejected() {
        let rt = rt();
        rt.block_on(async {
            let state = Arc::new(KernelState::with_provider(Arc::new(SlowProvider)));
            let thread = state.sessions.create_thread().expect("thread");
            let (_s1, e1) = collector();
            let (_s2, e2) = collector();

            state
                .spawn_turn(thread.id.clone(), "first".into(), e1)
                .expect("first spawn");

            // Give the first turn a moment to register as running.
            tokio::time::sleep(std::time::Duration::from_millis(30)).await;

            let second = state.spawn_turn(thread.id.clone(), "second".into(), e2);
            assert!(
                matches!(second, Err(SessionError::TurnAlreadyRunning(_))),
                "concurrent turn must be rejected, got {second:?}"
            );

            // Let the slow provider finish so the runtime shuts down cleanly.
            tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        });
    }

    #[test]
    fn interrupt_marks_the_turn_interrupted_and_emits_terminal_event() {
        let rt = rt();
        rt.block_on(async {
            let state = Arc::new(KernelState::with_provider(Arc::new(SlowProvider)));
            let thread = state.sessions.create_thread().expect("thread");
            let (store, emit) = collector();

            let turn_id = state
                .spawn_turn(thread.id.clone(), "long".into(), emit)
                .expect("spawn");
            tokio::time::sleep(std::time::Duration::from_millis(30)).await;

            let cancelled = state.interrupt(&thread.id, Some(&turn_id)).await.expect("interrupt");
            assert!(cancelled, "a running turn must be cancellable");

            wait_terminal(&state, &thread.id, &turn_id).await;

            let turn = state
                .sessions
                .get_thread(&thread.id)
                .expect("thread")
                .turns
                .into_iter()
                .find(|t| t.id == turn_id)
                .expect("turn");
            assert_eq!(turn.status, TurnStatus::Interrupted);

            let events = store.lock().expect("lock").clone();
            let done = events
                .iter()
                .find(|e| e.method == "turn/completed")
                .expect("terminal event");
            assert_eq!(done.params["status"], "interrupted");
        });
    }

    #[test]
    fn counters_track_turn_outcomes() {
        let rt = rt();
        rt.block_on(async {
            let state = state_with_echo();
            let thread = state.sessions.create_thread().expect("thread");
            let (_s, emit) = collector();
            let turn_id = state
                .spawn_turn(thread.id.clone(), "count me".into(), emit)
                .expect("spawn");
            wait_terminal(&state, &thread.id, &turn_id).await;
            let c = state.counters();
            assert_eq!(c.turns_started, 1);
            assert_eq!(c.turns_completed, 1);
            assert_eq!(c.turns_failed, 0);
        });
    }

    /// Provider that streams slowly so a turn stays cancellable.
    struct SlowProvider;

    #[async_trait::async_trait]
    impl ModelProvider for SlowProvider {
        fn name(&self) -> &'static str {
            "slow-test"
        }
        async fn stream(
            &self,
            _messages: &[ChatMessage],
            on_chunk: &mut (dyn FnMut(ProviderChunk) + Send),
        ) -> Result<(), super::super::provider::ProviderError> {
            for i in 0..100 {
                tokio::time::sleep(std::time::Duration::from_millis(20)).await;
                on_chunk(ProviderChunk::text(format!("chunk{i} ")));
            }
            Ok(())
        }
    }
}
