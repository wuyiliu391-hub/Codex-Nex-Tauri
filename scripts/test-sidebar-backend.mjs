// Test verification for Sidebar and Menu commands mapping
import assert from "node:assert";
import { readFileSync } from "node:fs";

// 1. Verify Rust lib.rs registers delete_session
const libRs = readFileSync("src-tauri/src/lib.rs", "utf8");
assert.ok(libRs.includes("commands::engine::delete_session"), "lib.rs must register delete_session");
assert.ok(libRs.includes("commands::engine::save_provider"), "lib.rs must register save_provider");
assert.ok(libRs.includes("commands::settings::save_settings"), "lib.rs must register save_settings");

// 2. Verify menu.rs emits native 'menu' events
const menuRs = readFileSync("src-tauri/src/menu.rs", "utf8");
assert.ok(menuRs.includes("app.emit(\"menu\", id.to_string())"), "menu.rs must emit native menu events");

// 3. Verify AppShell listens to 'menu' event
const appShell = readFileSync("frontend/app/shell/AppShell.tsx", "utf8");
assert.ok(appShell.includes("listen<string>(\"menu\""), "AppShell must listen to menu event");

// 4. Verify Sidebar handles real session deletion and model setting
const sidebar = readFileSync("frontend/app/shell/Sidebar.tsx", "utf8");
assert.ok(sidebar.includes("invoke(\"delete_session\""), "Sidebar must invoke delete_session");
assert.ok(sidebar.includes("saveSettings({ activeModel: model })"), "Sidebar must sync activeModel");
assert.ok(sidebar.includes("saveSettings({ modelReasoningEffort: effort })"), "Sidebar must sync modelReasoningEffort");

console.log("ALL SIDEBAR AND MENU BACKEND MAPPINGS VERIFIED SUCCESSFULLY!");
