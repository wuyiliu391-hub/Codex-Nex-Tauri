//! Turn manager with SQLite in-memory persistence.

use std::sync::Arc;
use sqlx::{Row, SqlitePool};
use tokio::sync::RwLock;
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::{DateTime, Utc};

use crate::models::{Turn, TurnItem, TurnStatus};

/// In-memory SQLite turn manager for persistence
pub struct TurnManager {
    pool: Arc<SqlitePool>,
    current_turns: RwLock<std::collections::HashMap<String, Turn>>,
}

#[derive(Debug, thiserror::Error)]
pub enum TurnError {
    #[error("Database error: {0}")]
    Database(String),
    
    #[error("Turn not found: {0}")]
    NotFound(String),
}

impl From<sqlx::Error> for TurnError {
    fn from(err: sqlx::Error) -> Self {
        TurnError::Database(format!("{:?}", err))
    }
}

impl TurnManager {
    /// Create new turn manager with in-memory SQLite database
    pub async fn new() -> Result<Self, TurnError> {
        let pool = SqlitePool::connect("sqlite::memory:").await?;
        
        // Initialize schema
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS turns (
                id TEXT PRIMARY KEY,
                thread_id TEXT NOT NULL,
                status TEXT NOT NULL CHECK(status IN ('New', 'Running', 'Paused', 'Completed', 'Interrupted', 'Failed')),
                started_at INTEGER NOT NULL,
                completed_at INTEGER
            );
            
            CREATE TABLE IF NOT EXISTS turn_items (
                id TEXT PRIMARY KEY,
                turn_id TEXT NOT NULL REFERENCES turns(id) ON DELETE CASCADE,
                item_type TEXT NOT NULL,
                payload BLOB NOT NULL,
                inserted_at INTEGER NOT NULL
            );
            
            CREATE INDEX IF NOT EXISTS idx_turn_items_turn_id ON turn_items(turn_id);
            "#
        ).execute(&pool).await?;
        
        Ok(Self {
            pool,
            current_turns: RwLock::new(std::collections::HashMap::new()),
        })
    }

    /// Begin a new turn and persist to database
    pub async fn begin_turn(&self, thread_id: &str) -> Result<String, TurnError> {
        let turn_id = Uuid::new_v4().to_string();
        let now = Utc::now().timestamp_millis();
        
        let turn = Turn {
            id: turn_id.clone(),
            thread_id: thread_id.to_string(),
            status: TurnStatus::Running,
            started_at: chrono::Duration::zero().into(),
            completed_at: None,
            items: vec![],
            token_usage: Default::default(),
        };
        
        // Insert into database
        sqlx::query(
            "INSERT INTO turns (id, thread_id, status, started_at) VALUES (?, ?, ?, ?)"
        )
        .bind(&turn_id)
        .bind(&thread_id)
        .bind("Running")
        .bind(now)
        .execute(&*self.pool)
        .await?;
        
        // Add to in-memory cache
        {
            let mut turns = self.current_turns.write().await;
            turns.insert(turn_id.clone(), turn.clone());
        }
        
        Ok(turn_id)
    }

    /// Append an item to a turn
    pub async fn append_item(&self, turn_id: &str, item: TurnItem) -> Result<(), TurnError> {
        let now = Utc::now().timestamp_millis();
        
        // Update in-memory cache
        {
            let mut turns = self.current_turns.write().await;
            if let Some(turn) = turns.get_mut(turn_id) {
                turn.append_item(item.clone());
            }
        }
        
        // Persist to database
        sqlx::query(
            "INSERT INTO turn_items (id, turn_id, item_type, payload, inserted_at) VALUES (?, ?, ?, ?, ?)"
        )
        .bind(&item.id)
        .bind(turn_id)
        .bind(&item.item_type)
        .bind(serde_json::to_vec(&item.payload)?)
        .bind(now)
        .execute(&*self.pool)
        .await?;
        
        Ok(())
    }

    /// Complete a turn with specified status
    pub async fn complete_turn(&self, turn_id: &str, status: TurnStatus) -> Result<(), TurnError> {
        let now = Utc::now().timestamp_millis();
        
        // Update in-memory cache
        {
            let mut turns = self.current_turns.write().await;
            if let Some(turn) = turns.get_mut(turn_id) {
                turn.transition_to(status.clone())?;
            }
        }
        
        // Update database
        let status_str = match status {
            TurnStatus::New => "New",
            TurnStatus::Running => "Running",
            TurnStatus::Paused => "Paused",
            TurnStatus::Completed => "Completed",
            TurnStatus::Interrupted => "Interrupted",
            TurnStatus::Failed(_) => "Failed",
        };
        
        sqlx::query(
            "UPDATE turns SET status = ?, completed_at = ? WHERE id = ?"
        )
        .bind(status_str)
        .bind(if matches!(status, TurnStatus::Completed | TurnStatus::Interrupted | TurnStatus::Failed(_)) {
            Some(now)
        } else {
            None
        })
        .bind(turn_id)
        .execute(&*self.pool)
        .await?;
        
        Ok(())
    }

    /// Get a turn by ID
    pub async fn get_turn(&self, turn_id: &str) -> Result<Turn, TurnError> {
        let turns = self.current_turns.read().await;
        
        if let Some(turn) = turns.get(turn_id) {
            return Ok(turn.clone());
        }
        
        Err(TurnError::NotFound(turn_id.to_string()))
    }

    /// Get all active turns
    pub async fn list_active_turns(&self) -> Vec<Turn> {
        self.current_turns.read().await.values().cloned().collect()
    }
}

impl Clone for TurnManager {
    fn clone(&self) -> Self {
        Self {
            pool: self.pool.clone(),
            current_turns: RwLock::new(self.current_turns.blocking_read().clone()),
        }
    }
}
