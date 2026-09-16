// Windows GUI entry. Subsystem is handled by tauri-build / cargo config in CI.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    codex_tauri_lib::run()
}
