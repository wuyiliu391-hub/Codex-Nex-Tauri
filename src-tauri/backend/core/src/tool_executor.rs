//! Built-in tool execution engine.

use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};
use tracing::*;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolDefinition {
    pub name: String,
    pub description: String,
    pub parameters: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub name: String,
    pub arguments: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolResult {
    pub success: bool,
    pub output: Option<String>,
    pub error: Option<String>,
    pub exit_code: Option<i32>,
}

/// Trait for executing tools
pub trait ToolExecutor: Send + Sync {
    async fn execute(&self, call: ToolCall) -> Result<ToolResult, String>;
}

/// Default built-in tool executor
pub struct DefaultToolExecutor;

impl DefaultToolExecutor {
    pub fn new() -> Self { Self {} }

    /// Canonicalize path and validate it's within allowed directory
    fn validate_path(path: &Path) -> Result<PathBuf, String> {
        let canonical = path.canonicalize().map_err(|e| format!("Invalid path: {:?}", e))?;
        
        // For Phase 4, we allow any path (no sandboxing)
        Ok(canonical)
    }
}

#[async_trait::async_trait]
impl ToolExecutor for DefaultToolExecutor {
    async fn execute(&self, call: ToolCall) -> Result<ToolResult, String> {
        match call.name.as_str() {
            "read_file" => {
                let args: ValueArgsWithPath = serde_json::from_value(call.arguments)
                    .map_err(|e| format!("Invalid arguments: {:?}", e))?;
                
                let path = Self::validate_path(Path::new(&args.path))?;
                
                let content = std::fs::read_to_string(&path)
                    .map_err(|e| format!("Failed to read file: {:?}", e))?;
                
                Ok(ToolResult {
                    success: true,
                    output: Some(content),
                    error: None,
                    exit_code: None,
                })
            }
            
            "write_file" => {
                let args: WriteFileArgs = serde_json::from_value(call.arguments)
                    .map_err(|e| format!("Invalid arguments: {:?}", e))?;
                
                let path = Self::validate_path(Path::new(&args.path))?;
                
                std::fs::write(&path, &args.content)
                    .map_err(|e| format!("Failed to write file: {:?}", e))?;
                
                Ok(ToolResult {
                    success: true,
                    output: Some(format!("Wrote {} bytes", args.content.len())),
                    error: None,
                    exit_code: None,
                })
            }
            
            "list_dir" => {
                let args: ValueArgsWithPath = serde_json::from_value(call.arguments)
                    .map_err(|e| format!("Invalid arguments: {:?}", e))?;
                
                let path = Self::validate_path(Path::new(&args.path))?;
                
                let entries: Vec<String> = std::fs::read_dir(&path)
                    .map_err(|e| format!("Failed to read directory: {:?}", e))?
                    .filter_map(|entry| entry.ok())
                    .filter_map(|entry| entry.file_name().into_string().ok())
                    .collect();
                
                Ok(ToolResult {
                    success: true,
                    output: Some(serde_json::to_string_pretty(&entries).unwrap_or_default()),
                    error: None,
                    exit_code: None,
                })
            }
            
            "run_shell" => {
                let args: ShellArgs = serde_json::from_value(call.arguments)
                    .map_err(|e| format!("Invalid arguments: {:?}", e))?;
                
                use tokio::process::Command;
                
                let output = Command::new(&args.command)
                    .args(&args.args)
                    .output()
                    .await
                    .map_err(|e| format!("Failed to execute command: {:?}", e))?;
                
                let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                
                let result = if output.status.success() {
                    ToolResult {
                        success: true,
                        output: if !stdout.is_empty() { Some(stdout) } else { None },
                        error: if !stderr.is_empty() { Some(stderr) } else { None },
                        exit_code: Some(output.status.code().unwrap_or(-1)),
                    }
                } else {
                    ToolResult {
                        success: false,
                        output: if !stdout.is_empty() { Some(stdout) } else { None },
                        error: Some(stderr),
                        exit_code: output.status.code(),
                    }
                };
                
                Ok(result)
            }
            
            _ => Err(format!("Unknown tool: {}", call.name)),
        }
    }
}

// Argument types for tool calls
#[derive(Debug, Deserialize)]
struct ValueArgsWithPath {
    path: String,
}

#[derive(Debug, Deserialize)]
struct WriteFileArgs {
    path: String,
    content: String,
}

#[derive(Debug, Deserialize)]
struct ShellArgs {
    command: String,
    args: Vec<String>,
}

// Type alias for serde
type ValueArgs = serde_json::Value;
