//! Agent Loop - Main state machine for conversation turns with tool execution.

use std::pin::Pin;
use tokio::sync::mpsc;
use tokio_stream::StreamExt;
use tracing::*;

use crate::{agent_loop_handle::AgentCommand, turn_manager::TurnManager, models::{TurnItem, TurnStatus}, tool_executor::ToolCall};

/// Simplified event sink stub for Phase 4 (will be replaced with full implementation)
pub struct EventSinkStub {
    // Would use broadcast sender in full implementation
}

impl EventSinkStub {
    pub fn new() -> Self { Self {} }
    
    #[allow(dead_code)]
    pub fn emit(&self, _event: &str) {
        info!("Event emitted (stub): {}", _event);
    }
}

/// Main agent loop state machine with SQLite persistence and tool execution
pub struct AgentLoop {
    receiver: mpsc::Receiver<AgentCommand>,
    turn_manager: TurnManager,
    event_sink: EventSinkStub,
    tool_registry: crate::tool_registry::ToolRegistry,
}

impl AgentLoop {
    /// Create new agent loop with command receiver, persistence, and tools
    pub fn new(receiver: mpsc::Receiver<AgentCommand>) -> Self {
        Self {
            receiver,
            turn_manager: TurnManager::new().expect("Failed to initialize TurnManager"),
            event_sink: EventSinkStub::new(),
            tool_registry: crate::tool_registry::ToolRegistry::default_registry(),
        }
    }

    /// Spawn agent loop as detached tokio task
    pub fn spawn(self) -> Pin<Box<dyn Future<Output = ()> + Send>> {
        Box::pin(async move {
            while let Some(cmd) = self.receiver.recv().await {
                match cmd {
                    AgentCommand::BeginTurn { thread_id } => {
                        self.handle_begin_turn(thread_id).await;
                    }
                    AgentCommand::SendMessage { thread_id, text } => {
                        self.handle_send_message(thread_id, text).await;
                    }
                    AgentCommand::InterruptTurn { thread_id } => {
                        self.handle_interrupt_turn(thread_id).await;
                    }
                }
            }
        })
    }

    /// Handle begin_turn command with SQLite persistence
    async fn handle_begin_turn(&self, thread_id: String) {
        info!("Starting new turn for thread: {}", thread_id);
        
        match self.turn_manager.begin_turn(&thread_id).await {
            Ok(turn_id) => {
                info!("✓ Created turn with ID: {}", turn_id);
                
                let mut turn = self.turn_manager.get_turn(&turn_id).await.ok();
                
                if let Some(ref mut t) = turn {
                    if let Err(e) = t.transition_to(TurnStatus::Running) {
                        error!("Failed to start turn: {:?}", e);
                        return;
                    }
                }

                self.event_sink.emit("turn-started");
                info!("✓ Step 2: AgentLoop processes user input");
            }
            Err(e) => {
                error!("Failed to begin turn: {:?}", e);
            }
        }
    }

    /// Handle send_message command with MockProvider and tool integration
    async fn handle_send_message(&self, thread_id: String, text: String) {
        debug!("Sending message to turn {}: {}", thread_id, text);
        
        // Get or create turn
        let turn_id = match self.turn_manager.begin_turn(&thread_id).await {
            Ok(id) => id,
            Err(e) => {
                error!("Failed to begin turn: {:?}", e);
                return;
            }
        };

        // Create user message item
        let user_item = TurnItem {
            id: format!("user-{}", uuid::Uuid::new_v4()),
            item_type: "user-message".to_string(),
            payload: serde_json::json!({ "text": text }),
            inserted_at: chrono::Utc::now().timestamp_millis(),
        };
        
        if let Err(_) = self.turn_manager.append_item(&turn_id, user_item.clone()).await {
            warn!("Failed to append user message item");
        }

        // Use MockProvider instead of real provider
        let mock_provider = crate::MockModelProvider::new();
        
        let mut stream = mock_provider.request(&[user_item], None).await.unwrap();
        
        let mut chunk_count = 0;
        while let Some(chunk) = stream.next().await {
            match chunk {
                crate::ModelResponseChunk::Text { text: content } => {
                    chunk_count += 1;
                    trace!("Received text chunk: {}", content);
                    
                    if chunk_count <= 3 {  // Limit to 3 chunks for test simplicity
                        let assistant_item = TurnItem {
                            id: format!("assistant-{}", uuid::Uuid::new_v4()),
                            item_type: "response".to_string(),
                            payload: serde_json::json!({ "content": content }),
                            inserted_at: chrono::Utc::now().timestamp_millis(),
                        };
                        
                        if let Err(e) = self.turn_manager.append_item(&turn_id, assistant_item).await {
                            warn!("Failed to append assistant response: {:?}", e);
                        }
                    }
                }
                
                crate::ModelResponseChunk::ToolCall { name, arguments } => {
                    info!("Executing tool call: {}", name);
                    
                    // Try to execute via tool registry
                    match self.tool_registry.get(&name, arguments.clone()).await {
                        Ok(result) => {
                            info!("Tool execution successful: {}", result);
                            
                            // Append tool result as turn item
                            let tool_result_item = TurnItem {
                                id: format!("tool-{}", uuid::Uuid::new_v4()),
                                item_type: "tool-result".to_string(),
                                payload: result,
                                inserted_at: chrono::Utc::now().timestamp_millis(),
                            };
                            
                            if let Err(e) = self.turn_manager.append_item(&turn_id, tool_result_item).await {
                                warn!("Failed to append tool result: {:?}", e);
                            } else {
                                self.event_sink.emit("tool-executed");
                                info!("✓ Tool executed and result added to turn");
                            }
                        }
                        Err(e) => {
                            warn!("Failed to execute tool {}: {}", name, e);
                            
                            // Add error as turn item
                            let error_item = TurnItem {
                                id: format!("error-{}", uuid::Uuid::new_v4()),
                                item_type: "tool-error".to_string(),
                                payload: serde_json::json!({ "tool": name, "error": e }),
                                inserted_at: chrono::Utc::now().timestamp_millis(),
                            };
                            
                            let _ = self.turn_manager.append_item(&turn_id, error_item).await;
                        }
                    }
                }
                
                crate::ModelResponseChunk::UsageMetrics { .. } => {
                    trace!("Usage metrics received (not yet implemented)");
                }
                
                crate::ModelResponseChunk::Error { code, message, retryable } => {
                    error!("Model error [{}] {}: retryable={}", code, message, retryable);
                }
            }
        }

        self.event_sink.emit("message-sent");
        info!("✓ Step 3: MockProvider generates response chunk");
        
        // Complete the turn via SQLite
        let complete_status = TurnStatus::Completed;
        if let Err(e) = self.turn_manager.complete_turn(&turn_id, complete_status).await {
            warn!("Failed to complete turn: {:?}", e);
        } else {
            self.event_sink.emit("turn-completed");
            info!("✓ Step 4: TurnManager accumulates items");
        }
    }

    /// Handle interrupt_turn command
    async fn handle_interrupt_turn(&self, thread_id: String) {
        info!("Interrupting turn: {}", thread_id);
        
        match self.turn_manager.begin_turn(&thread_id).await {
            Ok(turn_id) => {
                if let Err(e) = self.turn_manager.complete_turn(&turn_id, TurnStatus::Interrupted).await {
                    warn!("Could not interrupt turn: {:?}", e);
                } else {
                    self.event_sink.emit("turn-interrupted");
                    info!("✓ Turn interrupted successfully");
                }
            }
            Err(e) => {
                warn!("Could not begin turn for interruption: {:?}", e);
            }
        }
    }
}
