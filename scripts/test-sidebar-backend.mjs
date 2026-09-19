// Verify the shell↔frontend wiring that the sidebar and native menu rely on.
//
// This is a static wiring check (string presence in source), not a behavioural
// test: it catches the class of regression where a command is renamed on one
// side and the UI silently stops working. Behaviour is covered by the Rust
// kernel tests (`cargo test --lib`).
//
// Run: node scripts/test-sidebar-backend.mjs

import assert from "node:assert";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(p, "utf8");

// 1. lib.rs must register the commands the sidebar calls.
//    The kernel command layer owns session lifecycle; `commands::engine` was
//    removed with the sidecar, so these must point at `commands::kernel`.
const libRs = read("src-tauri/src/lib.rs");
for (const cmd of [
  "commands::kernel::delete_session",
  "commands::kernel::list_sessions",
  "commands::kernel::new_session",
  "commands::kernel_config::save_provider",
  "commands::settings::save_settings",
]) {
  assert.ok(libRs.includes(cmd), `lib.rs must register ${cmd}`);
}

// 2. The kernel must not have crept back into a sidecar shape.
assert.ok(
  !libRs.includes("EngineHandle"),
  "lib.rs must not reference EngineHandle (the kernel is in-process)",
);

// 3. menu.rs emits the native 'menu' event.
const menuRs = read("src-tauri/src/menu.rs");
assert.ok(
  menuRs.includes('app.emit("menu", id.to_string())'),
  "menu.rs must emit native menu events",
);

// 4. AppShell listens for it.
const appShell = read("frontend/app/shell/AppShell.tsx");
assert.ok(
  appShell.includes('listen<string>("menu"'),
  "AppShell must listen to the menu event",
);

// 5. Sidebar performs real session deletion and model sync.
const sidebar = read("frontend/app/shell/Sidebar.tsx");
assert.ok(
  sidebar.includes('invoke("delete_session"'),
  "Sidebar must invoke delete_session",
);
assert.ok(
  sidebar.includes("saveSettings({ activeModel: model })"),
  "Sidebar must sync activeModel",
);
assert.ok(
  sidebar.includes("saveSettings({ modelReasoningEffort: effort })"),
  "Sidebar must sync modelReasoningEffort",
);

console.log("sidebar/menu wiring verified");
