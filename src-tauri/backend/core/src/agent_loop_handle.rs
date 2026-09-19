//! Minimal handle type for AgentLoop that can be stored in Tauri state.
//!
//! Contains only an mpsc::Sender for command passing. Actual AgentLoop
//! runs as tokio task, not directly in Tauri AppState.

use std::sync::Arc;
use tokio::sync::mpsc;

/// Command type for frontend-to-agent communication
#[derive(Debug, Clone)]
pub enum AgentCommand {
    BeginTurn { thread_id: String },
    SendMessage { thread_id: String, text: String },
    InterruptTurn { thread_id: String },
    // Future commands will go here (e.g., PauseTurn, ResumeTurn)
}

/// Handle to agent loop for sending commands from Tauri commands
#[derive(Clone)]
pub struct AgentLoopHandle {
    sender: Arc<mpsc::Sender<AgentCommand>>,
}

impl AgentLoopHandle {
    /// Create new handle with command sender
    pub fn new(sender: mpsc::Sender<AgentCommand>) -> Self {
        Self { 
            sender: Arc::new(sender)
        }
    }

    /// Send begin turn command
    pub async fn begin_turn(&self, thread_id: String) -> Result<(), mpsc::error::SendError<AgentCommand>> {
        (*self.sender).send(AgentCommand::BeginTurn { thread_id }).await
    }

    /// Send message command  
    pub async fn send_message(
        &self,
        thread_id: String,
        text: String,
    ) -> Result<(), mpsc::error::SendError<AgentCommand>> {
        (*self.sender).send(AgentCommand::SendMessage { thread_id, text }).await
    }

    /// Interrupt current turn
    pub async fn interrupt_turn(&self, thread_id: String) -> Result<(), mpsc::error::SendError<AgentCommand>> {
        (*self.sender).send(AgentCommand::InterruptTurn { thread_id }).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_handle_creation() {
        let (tx, _rx) = mpsc::channel(10);
        let handle = AgentLoopHandle::new(tx);
        assert!(handle.begin_turn("test".to_string()).is_ok());
    }
}
