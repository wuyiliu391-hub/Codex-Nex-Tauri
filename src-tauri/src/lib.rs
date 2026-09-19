mod codex;
mod commands;
mod kernel;
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

            // Start protocol adapter for custom providers (Chat / Anthropic / Ollama -> Responses).
            let adapter =
                std::sync::Arc::new(codex::ProtocolAdapter::new(codex::DEFAULT_ADAPTER_PORT));
            let adapter_state = adapter.state();
            {
                if let Ok(inner) = state.inner.lock() {
                    for (id, target_url) in &inner.provider_endpoints {
                        let proto = inner
                            .provider_protocols
                            .get(id)
                            .cloned()
                            .unwrap_or_else(|| "openai_chat".into());
                        let key = inner.provider_secrets.get(id).cloned().unwrap_or_default();
                        adapter_state.set_route(codex::ProviderRoute {
                            id: id.clone(),
                            protocol: proto,
                            target_base_url: target_url.clone(),
                            api_key: key,
                            default_model: None,
                        });
                    }
                    if !inner.settings.active_provider_id.is_empty() {
                        adapter_state.set_active(&inner.settings.active_provider_id);
                    }
                }
            }
            app.manage(adapter_state);
            tauri::async_runtime::spawn(async move {
                if let Err(e) = adapter.spawn_server().await {
                    tracing::error!("Failed to start protocol adapter server: {}", e);
                }
            });

            app.manage(state);

            // ── self-developed kernel ────────────────────────────────────
            // Replaces the official codex-app-server sidecar. The kernel runs
            // in-process, so there is no binary to resolve, no WebSocket to
            // dial, no port to bind and no child process to supervise. The
            // whole class of failures the sidecar shell had (cold-start double
            // connect, 120 s dead-socket hang, unauthenticated loopback
            // listener, orphaned child on crash) is structurally absent.
            //
            // The provider starts as `EchoProvider`: a deterministic offline
            // backend that validates the transport end-to-end. It discloses
            // itself in the stream (`provider_is_placeholder`), so a
            // non-model answer is never presented as a real completion.
            let kernel = std::sync::Arc::new(kernel::KernelState::new());
            tracing::info!(
                provider = kernel.provider_name(),
                placeholder = kernel.provider_is_placeholder(),
                "self-developed kernel started"
            );
            app.manage(kernel);

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
            // kernel-backed engine surface
            commands::kernel::engine_status,
            commands::kernel::new_session,
            commands::kernel::list_sessions,
            commands::kernel::get_session,
            commands::kernel::delete_session,
            commands::kernel::archive_session,
            commands::kernel::unarchive_session,
            commands::kernel::send_message,
            commands::kernel::interrupt_session,
            commands::kernel::get_runtime_events,
            commands::kernel::kernel_selftest,
            // kernel config surface (providers / MCP / plugins / shell).
            // These used to forward to the sidecar over WebSocket; they now
            // operate on the shell store and report unimplemented capabilities
            // explicitly instead of fabricating success.
            commands::kernel_config::resolve_approval,
            commands::kernel_config::respond_server_request,
            commands::kernel_config::list_providers,
            commands::kernel_config::save_provider,
            commands::kernel_config::probe_provider,
            commands::kernel_config::list_mcp_servers,
            commands::kernel_config::save_mcp_server,
            commands::kernel_config::test_mcp_connection,
            commands::kernel_config::set_mcp_server_enabled,
            commands::kernel_config::list_skills,
            commands::kernel_config::reload_skills,
            commands::kernel_config::list_plugins,
            commands::kernel_config::set_plugin_enabled,
            commands::kernel_config::open_shell,
            commands::kernel_config::write_shell,
            commands::kernel_config::read_shell,
            commands::kernel_config::close_shell,
            commands::kernel_config::git_status,
            commands::kernel_config::list_agent_tools,
            commands::kernel_config::rpc_raw,
            commands::market::plugin_marketplaces,
            commands::market::plugin_marketplace_add,
            commands::market::plugin_marketplace_remove,
            commands::market::plugin_marketplace_plugins,
            commands::market::plugin_install,
            commands::market::plugin_add_local,
            commands::market::plugin_installed,
            commands::market::plugin_uninstall,
            commands::market::plugin_set_enabled,
            commands::market::plugin_skills,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // The kernel is in-process, so there is no child process to
                // stop: dropping the AppHandle tears it down with the app.
                // (The old sidecar shell had to shut the exe down here, and
                // orphaned it whenever the app was killed from Task Manager.)
                api.prevent_close();
                let _ = window.destroy();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Codex Tauri application");
}
