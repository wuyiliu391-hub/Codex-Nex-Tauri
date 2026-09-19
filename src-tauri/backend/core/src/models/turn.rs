//! Turn data model for conversation sessions.
//!
//! Represents a single turn/session within the Codex agent system.

use serde::{Deserialize, Serialize};
use std::time::Instant;
use uuid::Uuid;

/// Current status of a turn in the agent lifecycle
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum TurnStatus {
    /// Turn has been created but not yet started processing
    New,
    /// Currently being processed by agent
    Running,
    /// Waiting for user/tool approval
    Paused,
    /// Successfully completed
    Completed,
    /// Interrupted by user action
    Interrupted,
    /// Failed with reason
    Failed(String),
}

impl TurnStatus {
    /// Check if transition from one state to another is valid
    pub fn can_transition(from: &TurnStatus, to: &TurnStatus) -> bool {
        match (from, to) {
            (TurnStatus::New, TurnStatus::Running) => true,
            (TurnStatus::Running, TurnStatus::Paused) => true,
            (TurnStatus::Paused, TurnStatus::Running) => true, // Resume from wait
            (TurnStatus::Running, TurnStatus::Completed) => true,
            (TurnStatus::Running, TurnStatus::Interrupted) => true,
            (TurnStatus::Running, TurnStatus::Failed(_)) => true,
            _ => false, // Invalid transitions blocked
        }
    }
}

/// Token usage statistics for a turn
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TokenUsage {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
}

/// Single item within a turn (message, tool call, etc.)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TurnItem {
    pub id: String,
    pub item_type: String,
    pub payload: serde_json::Value,
    pub inserted_at: i64,
}

/// Complete turn record
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Turn {
    pub id: Uuid,
    pub thread_id: String,
    pub status: TurnStatus,
    pub started_at: Instant,
    pub completed_at: Option<Instant>,
    pub items: Vec<TurnItem>,
    pub token_usage: TokenUsage,
}

impl Turn {
    /// Create a new turn with default values
    pub fn new(thread_id: String) -> Self {
        Self {
            id: Uuid::new_v4(),
            thread_id,
            status: TurnStatus::New,
            started_at: Instant::now(),
            completed_at: None,
            items: vec![],
            token_usage: TokenUsage::default(),
        }
    }

    /// Transition to a new status (validates transition rules)
    pub fn transition_to(&mut self, new_status: TurnStatus) -> Result<(), String> {
        if !TurnStatus::can_transition(&self.status, &new_status) {
            return Err(format!(
                "Invalid transition from {:?} to {:?}",
                self.status, new_status
            ));
        }
        
        if new_status == TurnStatus::Completed || new_status == TurnStatus::Interrupted {
            self.completed_at = Some(Instant::now());
        }
        
        self.status = new_status;
        Ok(())
    }

    /// Append an item to this turn
    pub fn append_item(&mut self, item: TurnItem) {
        self.items.push(item);
    }

    /// Get duration of this turn (or elapsed time if still running)
    pub fn duration(&self) -> std::time::Duration {
        match self.completed_at {
            Some(completed) => completed - self.started_at,
            None => self.started_at.elapsed(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_turn_creation() {
        let turn = Turn::new("test-thread".to_string());
        assert_eq!(turn.thread_id, "test-thread");
        assert_eq!(turn.status, TurnStatus::New);
        assert!(turn.id.is_nil());
    }

    #[test]
    fn test_valid_transitions() {
        assert!(TurnStatus::can_transition(&TurnStatus::New, &TurnStatus::Running));
        assert!(TurnStatus::can_transition(&TurnStatus::Running, &TurnStatus::Completed));
    }

    #[test]
    fn test_invalid_transition() {
        assert!(!TurnStatus::can_transition(&TurnStatus::Completed, &TurnStatus::Running));
    }
}
