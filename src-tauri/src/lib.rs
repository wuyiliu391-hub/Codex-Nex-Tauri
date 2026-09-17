mod codex;
mod commands;
mod menu;
mod state;

use tauri::Manager;

pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,codex_tauri=debug".into()),
        )
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .menu(|app| menu::build_menu(app))
        .on_menu_event(menu::on_menu_event)
        .setup(|app| {
            let handle = app.handle().clone();
            let state = state::AppState::load_or_default(&handle)?;
            app.manage(state);

            // Start official codex-app-server sidecar (WebSocket).
            let engine = codex::EngineHandle::start(app.handle())?;
            app.manage(engine);

            // Fan-out: sidecar notifications -> frontend events.
            codex::events::spawn_event_bridge(app.handle().clone());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // local
            commands::app_state::get_state,
            commands::app_state::check_dependencies,
            commands::settings::get_settings,
            commands::settings::save_settings,
            commands::settings::get_preferences,
            commands::settings::save_preferences,
            commands::settings::list_shortcuts,
            commands::settings::save_shortcuts,
            commands::pets::list_pets,
            commands::pets::save_pets,
            commands::pets::wake_pet,
            commands::pets::tuck_pet,
            commands::pets::create_custom_pet,
            commands::calendar::list_calendar_events,
            commands::calendar::save_calendar_event,
            commands::calendar::delete_calendar_event,
            commands::cinema::list_cinema_timelines,
            commands::cinema::list_cinema_jobs,
            commands::cinema::save_cinema_timeline,
            commands::cinema::delete_cinema_timeline,
            commands::cinema::enqueue_cinema_render,
            commands::cinema::cancel_cinema_job,
            commands::connectors::list_connectors,
            commands::connectors::save_connector,
            commands::connectors::delete_connector,
            commands::connectors::test_connector,
            commands::fs::list_files,
            commands::fs::read_file,
            commands::fs::write_file,
            commands::scheduled::list_scheduled_tasks,
            commands::scheduled::save_scheduled_tasks,
            commands::scheduled::run_scheduled_task,
            commands::scheduled::list_pull_requests,
            commands::scheduled::save_pull_requests,
            // engine forwarders
            commands::engine::engine_status,
            commands::engine::new_session,
            commands::engine::list_sessions,
            commands::engine::get_session,
            commands::engine::delete_session,
            commands::engine::archive_session,
            commands::engine::unarchive_session,
            commands::engine::send_message,
            commands::engine::interrupt_session,
            commands::engine::resolve_approval,
            commands::engine::list_providers,
            commands::engine::save_provider,
            commands::engine::probe_provider,
            commands::engine::list_mcp_servers,
            commands::engine::save_mcp_server,
            commands::engine::test_mcp_connection,
            commands::engine::set_mcp_server_enabled,
            commands::engine::list_skills,
            commands::engine::reload_skills,
            commands::engine::list_plugins,
            commands::engine::set_plugin_enabled,
            commands::engine::open_shell,
            commands::engine::write_shell,
            commands::engine::read_shell,
            commands::engine::close_shell,
            commands::engine::git_status,
            commands::engine::get_runtime_events,
            commands::engine::list_agent_tools,
            commands::engine::rpc_raw,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Gracefully stop sidecar before closing.
                if let Some(engine) = window.app_handle().try_state::<codex::EngineHandle>() {
                    engine.shutdown();
                }
                api.prevent_close();
                let _ = window.destroy();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Codex Tauri application");
}
