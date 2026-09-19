//! Tool registry for managing tool handlers.

use std::collections::HashMap;
use serde_json::Value;
use crate::tool_executor::{ToolExecutor, ToolCall};

/// Handler trait for tools
pub trait ToolHandler: Send + Sync {
    async fn call(&self, args: Value) -> Result<Value, String>;
}

/// Registry for managing tools
pub struct ToolRegistry {
    tools: HashMap<String, Box<dyn ToolHandler>>,
    executor: Option<Box<dyn ToolExecutor>>,
}

impl ToolRegistry {
    /// Create new empty registry
    pub fn new() -> Self {
        Self {
            tools: HashMap::new(),
            executor: None,
        }
    }

    /// Register a new tool handler
    pub fn register(&mut self, name: String, handler: Box<dyn ToolHandler>) {
        self.tools.insert(name, handler);
    }

    /// Set the default executor for built-in tools
    pub fn set_executor(&mut self, executor: Box<dyn ToolExecutor>) {
        self.executor = Some(executor);
    }

    /// Get a tool handler by name
    pub async fn get(&self, name: &str, args: Value) -> Result<Value, String> {
        if let Some(handler) = self.tools.get(name) {
            return handler.call(args).await;
        }

        // Try executor as fallback
        if let Some(ref executor) = self.executor {
            if let Ok(tool_call) = serde_json::from_value(serde_json::json!({
                "name": name,
                "arguments": args,
            })) {
                let result = executor.execute(tool_call).await?;
                return Ok(serde_json::to_value(result)?);
            }
        }

        Err(format!("Unknown tool: {}", name))
    }

    /// List all registered tool names
    pub fn list_names(&self) -> Vec<String> {
        let mut names = self.tools.keys().cloned().collect::<Vec<_>>();
        
        // Add executor tools if available
        if self.executor.is_some() {
            names.push("read_file".to_string());
            names.push("write_file".to_string());
            names.push("list_dir".to_string());
            names.push("run_shell".to_string());
        }
        
        names.sort();
        names
    }

    /// Create default registry with built-in tools
    pub fn default_registry() -> Self {
        let mut registry = Self::new();
        
        // Register built-in executor
        registry.set_executor(Box::new(crate::tool_executor::DefaultToolExecutor::new()));
        
        registry
    }
}

impl Default for ToolRegistry {
    fn default() -> Self { Self::new() }
}
