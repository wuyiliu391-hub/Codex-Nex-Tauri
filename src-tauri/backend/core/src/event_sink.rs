//! Event sink for broadcasting backend events to listeners.

use tokio::sync::broadcast;

/// Backend event types that can be broadcast
#[derive(Debug, Clone)]
pub enum BackendEvent {
    TurnStarted { turn_id: String },
    TurnCompleted { turn_id: String },
    ErrorOccurred { error: String },
    ToolCallRequested { tool_name: String },
}

/// Broadcast channel wrapper for event emission
pub struct EventSink {
    sender: broadcast::Sender<BackendEvent>,
}

impl EventSink {
    pub fn new(capacity: usize) -> Self {
        let (sender, _receiver) = broadcast::channel(capacity);
        Self { sender }
    }

    pub fn emit(&self, event: BackendEvent) -> Result<(), broadcast::error::SendError<BackendEvent>> {
        self.sender.send(event)
    }

    pub fn subscribe(&self) -> broadcast::Receiver<BackendEvent> {
        self.sender.subscribe()
    }
}
