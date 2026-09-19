pub mod app_state;
pub mod calendar;
pub mod cinema;
pub mod connectors;
pub mod fs;
pub mod kernel;
pub mod kernel_config;
pub mod market;
pub mod pets;
pub mod scheduled;
pub mod settings;

use serde_json::Value;
use tauri::ipc::{InvokeBody, Request};

/// Extract the JSON body of an `invoke` call.
///
/// Commands that hand-parse their arguments take `Request<'_>` rather than
/// `serde_json::Value`. The distinction is not cosmetic — it is the difference
/// between working and not being callable at all.
///
/// `#[tauri::command]` derives an argument's payload key from the **parameter
/// name** (`tauri-macros` `command/wrapper.rs::parse_arg`, camelCased), and
/// `CommandItem::deserialize_json` then does `v.get(key)`, failing with
/// `command <name> missing required key <key>` when it is absent
/// (`tauri` `ipc/command.rs`). `serde_json::Value` has no bespoke `CommandArg`
/// impl, so it goes through exactly that path — meaning a parameter named
/// `payload` demanded a top-level `"payload"` key that **no frontend call site
/// sends**. Thirteen commands, `send_message` among them, rejected every call
/// before their own parsing code ran.
///
/// `Request` has a dedicated `CommandArg` impl (`tauri` `ipc/mod.rs`) that
/// returns the body directly, so the parameter name is irrelevant and the
/// command sees the real payload.
pub(crate) fn body_value(request: &Request<'_>) -> Value {
    match request.body() {
        InvokeBody::Json(v) => v.clone(),
        // Tauri accepts non-JSON bodies too. An unparseable one becomes `Null`
        // so the caller's own "missing field" error is what the user sees,
        // rather than a deserialization failure raised here.
        InvokeBody::Raw(bytes) => serde_json::from_slice(bytes).unwrap_or(Value::Null),
    }
}
