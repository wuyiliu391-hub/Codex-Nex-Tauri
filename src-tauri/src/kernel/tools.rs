//! Tool execution pipeline for the self-developed kernel.
//!
//! This module provides the infrastructure for models to execute tools (commands,
//! file operations, etc.) via a request/approval workflow.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex as AsyncMutex;
use uuid::Uuid;

use super::events::KernelEvent;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PermissionLevel {
    ReadOnly,
    RequiresApproval,
    Conditional,
}

impl Default for PermissionLevel {
    fn default() -> Self {
        PermissionLevel::RequiresApproval
    }
}

pub struct SandboxEnv {
    pub root_path: PathBuf,
    pub allow_patterns: Vec<String>,
    pub deny_patterns: Vec<String>,
    pub allow_commands: Vec<String>,
    pub deny_commands: Vec<String>,
}

impl SandboxEnv {
    pub fn new(root: impl AsRef<Path>) -> Self {
        Self {
            root_path: root.as_ref().to_path_buf(),
            allow_patterns: vec![],
            deny_patterns: vec![
                ".**".to_string(),
                "*/node_modules/**".to_string(),
                "*/dist/**".to_string(),
            ],
            allow_commands: vec![],
            deny_commands: vec!["rm -rf".to_string(), "sudo".to_string()],
        }
    }

    pub fn is_path_allowed(&self, path: &Path) -> bool {
        if !path.starts_with(&self.root_path) {
            return false;
        }
        let rel = match path.strip_prefix(&self.root_path) {
            Ok(r) => r,
            Err(_) => return false,
        };
        for pattern in &self.deny_patterns {
            if glob_match(pattern, rel.to_string_lossy().as_ref()) {
                return false;
            }
        }
        true
    }

    pub fn is_command_allowed(&self, cmd: &str) -> bool {
        for denied in &self.deny_commands {
            if cmd.contains(denied) {
                return false;
            }
        }
        if self.allow_commands.is_empty() {
            return true;
        }
        self.allow_commands.iter().any(|a| cmd.contains(a))
    }
}

fn glob_match(pattern: &str, s: &str) -> bool {
    if pattern == "**" {
        return true;
    }
    if pattern.starts_with("**/") {
        let suffix = &pattern[3..];
        return s.ends_with(suffix) || s.contains(suffix);
    }
    if pattern.contains('*') {
        let parts: Vec<&str> = pattern.split('*').collect();
        if parts.len() == 2 {
            return s.starts_with(parts[0]) && s.ends_with(parts[1]);
        }
    }
    pattern == s
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tool {
    pub id: String,
    pub name: String,
    pub description: String,
    pub parameters: serde_json::Value,
    pub permission: PermissionLevel,
    pub path_pattern: Option<String>,
}

impl Tool {
    pub fn builder(name: &str) -> ToolBuilder {
        ToolBuilder {
            id: Uuid::new_v4().to_string(),
            name: name.into(),
            description: String::new(),
            parameters: serde_json::json!({}),
            permission: PermissionLevel::RequiresApproval,
            path_pattern: None,
        }
    }
}

pub struct ToolBuilder {
    id: String,
    name: String,
    description: String,
    parameters: serde_json::Value,
    permission: PermissionLevel,
    path_pattern: Option<String>,
}

impl ToolBuilder {
    pub fn description(mut self, desc: impl Into<String>) -> Self {
        self.description = desc.into();
        self
    }
    pub fn parameters(mut self, params: serde_json::Value) -> Self {
        self.parameters = params;
        self
    }
    pub fn permission(mut self, perm: PermissionLevel) -> Self {
        self.permission = perm;
        self
    }
    pub fn path_pattern(mut self, pattern: impl Into<String>) -> Self {
        self.path_pattern = Some(pattern.into());
        self
    }
    pub fn build(self) -> Tool {
        Tool {
            id: self.id,
            name: self.name,
            description: self.description,
            parameters: self.parameters,
            permission: self.permission,
            path_pattern: self.path_pattern,
        }
    }
}

pub struct ToolRegistry {
    tools: HashMap<String, Tool>,
    sandbox: Arc<AsyncMutex<SandboxEnv>>,
}

impl ToolRegistry {
    pub fn new(sandbox: SandboxEnv) -> Self {
        Self {
            tools: HashMap::new(),
            sandbox: Arc::new(AsyncMutex::new(sandbox)),
        }
    }

    pub fn register(&mut self, tool: Tool) {
        self.tools.insert(tool.name.clone(), tool);
    }

    pub fn get(&self, name: &str) -> Option<&Tool> {
        self.tools.get(name)
    }

    pub fn list_tools(&self) -> Vec<&Tool> {
        self.tools.values().collect()
    }

    pub async fn sandbox(&self) -> tokio::sync::MutexGuard<'_, SandboxEnv> {
        self.sandbox.lock().await
    }

    pub async fn set_sandbox(&self, env: SandboxEnv) {
        let mut guard = self.sandbox.lock().await;
        *guard = env;
    }

    pub fn register_builtins(&mut self) {
        self.register(
            Tool::builder("fs_read")
                .description("Read contents of a file within sandbox")
                .permission(PermissionLevel::ReadOnly)
                .parameters(serde_json::json!({
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "The file path to read" }
                    },
                    "required": ["path"]
                }))
                .build(),
        );
        self.register(
            Tool::builder("fs_write")
                .description("Write contents to a file within sandbox")
                .permission(PermissionLevel::RequiresApproval)
                .parameters(serde_json::json!({
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "The file path to write" },
                        "content": { "type": "string", "description": "The content to write" }
                    },
                    "required": ["path", "content"]
                }))
                .build(),
        );
        self.register(
            Tool::builder("shell_exec")
                .description("Execute a command line in sandbox")
                .permission(PermissionLevel::RequiresApproval)
                .parameters(serde_json::json!({
                    "type": "object",
                    "properties": {
                        "command": { "type": "string", "description": "The shell command to run" }
                    },
                    "required": ["command"]
                }))
                .build(),
        );
    }
}

fn builtin_fs_read(sandbox: &SandboxEnv, args: &serde_json::Value) -> Result<String, String> {
    let path_str = args["path"].as_str().ok_or("missing path")?;
    let path = Path::new(path_str);
    if !sandbox.is_path_allowed(path) {
        return Err(format!("Path not in sandbox: {}", path_str));
    }
    match std::fs::read_to_string(path) {
        Ok(content) => Ok(content),
        Err(e) => Err(format!("Read failed: {}", e)),
    }
}

fn builtin_fs_write(sandbox: &SandboxEnv, path: &str, content: &str) -> Result<(), String> {
    let path = Path::new(path);
    if !sandbox.is_path_allowed(path) {
        return Err(format!("Path not in sandbox: {}", path.display()));
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Create dir failed: {}", e))?;
    }
    std::fs::write(path, content).map_err(|e| format!("Write failed: {}", e))
}

fn builtin_shell_exec(sandbox: &SandboxEnv, cmd: &str) -> Result<(String, String), String> {
    if !sandbox.is_command_allowed(cmd) {
        return Err(format!("Command not allowed: {}", cmd));
    }
    let output = if cfg!(target_os = "windows") {
        std::process::Command::new("cmd")
            .arg("/c")
            .arg(cmd)
            .output()
    } else {
        std::process::Command::new("sh")
            .arg("-c")
            .arg(cmd)
            .output()
    }
    .map_err(|e| format!("Exec failed: {}", e))?;

    Ok((
        String::from_utf8_lossy(&output.stdout).to_string(),
        String::from_utf8_lossy(&output.stderr).to_string(),
    ))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PendingApproval {
    pub id: String,
    pub tool_name: String,
    pub args: serde_json::Value,
    pub project_root: PathBuf,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

impl PendingApproval {
    pub fn new(tool_name: String, args: serde_json::Value, project_root: PathBuf) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            tool_name,
            args,
            project_root,
            created_at: chrono::Utc::now(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct ApprovalResolution {
    pub approved: bool,
    pub result: Option<String>,
}

#[async_trait]
pub trait ToolExecutor: Send + Sync {
    async fn execute(
        &self,
        name: &str,
        args: &serde_json::Value,
        event_emit: &(dyn Fn(KernelEvent) + Send + Sync),
    ) -> Result<serde_json::Value, String>;

    async fn resolve_approval(
        &self,
        approval_id: &str,
        approved: bool,
        result: Option<String>,
    ) -> Result<bool, String>;
}

pub struct StdToolExecutor {
    registry: Arc<ToolRegistry>,
    approvals: AsyncMutex<HashMap<String, PendingApproval>>,
    waiters: AsyncMutex<HashMap<String, tokio::sync::oneshot::Sender<ApprovalResolution>>>,
}

impl StdToolExecutor {
    pub fn new(registry: ToolRegistry) -> Self {
        Self {
            registry: Arc::new(registry),
            approvals: AsyncMutex::new(HashMap::new()),
            waiters: AsyncMutex::new(HashMap::new()),
        }
    }

    pub fn registry(&self) -> &Arc<ToolRegistry> {
        &self.registry
    }

    pub async fn list_pending_approvals(&self) -> Vec<PendingApproval> {
        let guard = self.approvals.lock().await;
        guard.values().cloned().collect()
    }

    pub async fn has_pending_approval(&self, id: &str) -> bool {
        let guard = self.approvals.lock().await;
        guard.contains_key(id)
    }
}

impl Default for StdToolExecutor {
    fn default() -> Self {
        let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
        let mut registry = ToolRegistry::new(SandboxEnv::new(cwd));
        registry.register_builtins();
        Self::new(registry)
    }
}

#[async_trait]
impl ToolExecutor for StdToolExecutor {
    async fn execute(
        &self,
        name: &str,
        args: &serde_json::Value,
        event_emit: &(dyn Fn(KernelEvent) + Send + Sync),
    ) -> Result<serde_json::Value, String> {
        let tool = self
            .registry
            .get(name)
            .ok_or_else(|| format!("Unknown tool: {}", name))?
            .clone();

        match tool.permission {
            PermissionLevel::ReadOnly => {
                self.run_tool(&tool, args, event_emit).await
            }
            PermissionLevel::Conditional | PermissionLevel::RequiresApproval => {
                let approval = PendingApproval::new(
                    tool.name.clone(),
                    args.clone(),
                    PathBuf::from("."),
                );
                let approval_id = approval.id.clone();
                let (tx, rx) = tokio::sync::oneshot::channel();

                {
                    let mut approvals = self.approvals.lock().await;
                    approvals.insert(approval_id.clone(), approval.clone());
                    let mut waiters = self.waiters.lock().await;
                    waiters.insert(approval_id.clone(), tx);
                }

                let approval_type = match tool.name.as_str() {
                    "fs_write" => "fileChange",
                    _ => "commandExecution",
                };

                event_emit(KernelEvent::tool_approval_request(
                    approval_type.to_string(),
                    approval.tool_name.clone(),
                    approval.args.clone(),
                    approval.id.clone(),
                ));

                match tokio::time::timeout(tokio::time::Duration::from_secs(120), rx).await {
                    Ok(Ok(resolution)) => {
                        if resolution.approved {
                            self.run_tool(&tool, args, event_emit).await
                        } else {
                            Err(format!("Tool execution denied by user for {}", tool.name))
                        }
                    }
                    Ok(Err(_)) => {
                        let mut approvals = self.approvals.lock().await;
                        approvals.remove(&approval_id);
                        Err("Approval waiter dropped".to_string())
                    }
                    Err(_) => {
                        let mut approvals = self.approvals.lock().await;
                        approvals.remove(&approval_id);
                        let mut waiters = self.waiters.lock().await;
                        waiters.remove(&approval_id);
                        Err("Approval timeout".to_string())
                    }
                }
            }
        }
    }

    async fn resolve_approval(
        &self,
        approval_id: &str,
        approved: bool,
        result: Option<String>,
    ) -> Result<bool, String> {
        let mut approvals = self.approvals.lock().await;
        let _ = approvals.remove(approval_id);
        let mut waiters = self.waiters.lock().await;
        if let Some(tx) = waiters.remove(approval_id) {
            let _ = tx.send(ApprovalResolution { approved, result });
            Ok(true)
        } else {
            Ok(false)
        }
    }
}

impl StdToolExecutor {
    pub async fn run_tool(
        &self,
        tool: &Tool,
        args: &serde_json::Value,
        _event_emit: &(dyn Fn(KernelEvent) + Send + Sync),
    ) -> Result<serde_json::Value, String> {
        let sandbox = self.registry.sandbox().await;

        let result = match tool.name.as_str() {
            "fs_read" => {
                let content = builtin_fs_read(&sandbox, args)?;
                serde_json::json!({ "content": content })
            }
            "fs_write" => {
                let path = args["path"].as_str().ok_or("missing path")?;
                let content = args["content"].as_str().ok_or("missing content")?;
                builtin_fs_write(&sandbox, path, content)?;
                serde_json::json!({ "success": true })
            }
            "shell_exec" => {
                let cmd = args["command"]
                    .or_else(|| args["cmd"])
                    .and_then(|v| v.as_str())
                    .ok_or("missing command")?;
                let (stdout, stderr) = builtin_shell_exec(&sandbox, cmd)?;
                serde_json::json!({ "stdout": stdout, "stderr": stderr })
            }
            _ => return Err(format!("Unknown tool: {}", tool.name)),
        };

        Ok(result)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_tool_registry_and_sandbox() {
        let temp = std::env::temp_dir();
        let sandbox = SandboxEnv::new(&temp);
        let mut registry = ToolRegistry::new(sandbox);
        registry.register_builtins();

        assert!(registry.get("fs_read").is_some());
        assert!(registry.get("fs_write").is_some());
        assert!(registry.get("shell_exec").is_some());
    }

    #[tokio::test]
    async fn test_tool_executor_approval_flow() {
        let temp = std::env::temp_dir();
        let sandbox = SandboxEnv::new(&temp);
        let mut registry = ToolRegistry::new(sandbox);
        registry.register_builtins();
        let executor = Arc::new(StdToolExecutor::new(registry));

        let captured_id = Arc::new(tokio::sync::Mutex::new(None));
        let cap_clone = Arc::clone(&captured_id);

        let exec_clone = Arc::clone(&executor);
        let handle = tokio::spawn(async move {
            exec_clone
                .execute(
                    "shell_exec",
                    &serde_json::json!({ "command": "echo test" }),
                    &move |ev: KernelEvent| {
                        if let Some(id) = ev.params.get("id").and_then(|v| v.as_str()) {
                            let mut g = cap_clone.try_lock().unwrap();
                            *g = Some(id.to_string());
                        }
                    },
                )
                .await
        });

        tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
        let id_opt = { captured_id.lock().await.clone() };
        assert!(id_opt.is_some());
        let id = id_opt.unwrap();

        let resolved = executor
            .resolve_approval(&id, true, Some("accept".to_string()))
            .await
            .expect("resolve ok");
        assert!(resolved);

        let res = handle.await.unwrap();
        assert!(res.is_ok());
    }
}
