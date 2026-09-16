// Native application menu (File / Edit / View / Help).
// Emits `menu` events to the frontend with the action id as payload.

use tauri::menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Emitter, Runtime};

/// Build the application menu matching the former DOM menu structure.
pub fn build_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    // File
    let file_new_window = MenuItem::with_id(app, "new-window", "New Window", true, None::<&str>)?;
    let file_new_task = MenuItem::with_id(app, "new-task", "New Task", true, Some("Ctrl+N"))?;
    let file_new_projectless =
        MenuItem::with_id(app, "new-projectless-task", "New Projectless Task", true, Some("Ctrl+Alt+O"))?;
    let file_open_folder = MenuItem::with_id(app, "open-folder", "Open Folder...", true, Some("Ctrl+O"))?;
    let file_close = MenuItem::with_id(app, "close", "Close Tab", true, Some("Ctrl+W"))?;
    let file_settings = MenuItem::with_id(app, "settings", "Settings...", true, Some("Ctrl+,"))?;
    let file_logout = MenuItem::with_id(app, "logout", "Log Out", true, None::<&str>)?;
    let file_exit = MenuItem::with_id(app, "exit", "Exit", true, Some("Ctrl+Q"))?;

    let file_menu = Submenu::with_items(
        app,
        "File",
        true,
        &[
            &file_new_window,
            &file_new_task,
            &file_new_projectless,
            &PredefinedMenuItem::separator(app)?,
            &file_open_folder,
            &PredefinedMenuItem::separator(app)?,
            &file_close,
            &PredefinedMenuItem::separator(app)?,
            &file_settings,
            &PredefinedMenuItem::separator(app)?,
            &file_logout,
            &file_exit,
        ],
    )?;

    // Edit
    let edit_undo = PredefinedMenuItem::undo(app, None)?;
    let edit_redo = PredefinedMenuItem::redo(app, None)?;
    let edit_cut = PredefinedMenuItem::cut(app, None)?;
    let edit_copy = PredefinedMenuItem::copy(app, None)?;
    let edit_paste = PredefinedMenuItem::paste(app, None)?;
    let edit_select_all = PredefinedMenuItem::select_all(app, None)?;

    let edit_menu = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &edit_undo,
            &edit_redo,
            &PredefinedMenuItem::separator(app)?,
            &edit_cut,
            &edit_copy,
            &edit_paste,
            &PredefinedMenuItem::separator(app)?,
            &edit_select_all,
        ],
    )?;

    // View
    let view_toggle_sidebar =
        MenuItem::with_id(app, "toggle-sidebar", "Toggle Sidebar", true, Some("Ctrl+B"))?;
    let view_toggle_bottom =
        MenuItem::with_id(app, "toggle-bottom-panel", "Toggle Bottom Panel", true, Some("Ctrl+J"))?;
    let view_open_terminal =
        MenuItem::with_id(app, "open-terminal", "Open Terminal", true, Some("Ctrl+`"))?;
    let view_find = MenuItem::with_id(app, "find", "Find", true, Some("Ctrl+F"))?;
    let view_zoom_in = MenuItem::with_id(app, "zoom-in", "Zoom In", true, Some("Ctrl+Shift+"))?;
    let view_zoom_out = MenuItem::with_id(app, "zoom-out", "Zoom Out", true, Some("Ctrl+-"))?;
    let view_actual_size = MenuItem::with_id(app, "actual-size", "Actual Size", true, Some("Ctrl+0"))?;
    let view_fullscreen =
        MenuItem::with_id(app, "toggle-fullscreen", "Toggle Fullscreen", true, Some("F11"))?;

    let view_menu = Submenu::with_items(
        app,
        "View",
        true,
        &[
            &view_toggle_sidebar,
            &view_toggle_bottom,
            &PredefinedMenuItem::separator(app)?,
            &view_open_terminal,
            &view_find,
            &PredefinedMenuItem::separator(app)?,
            &view_zoom_in,
            &view_zoom_out,
            &view_actual_size,
            &PredefinedMenuItem::separator(app)?,
            &view_fullscreen,
        ],
    )?;

    // Help
    let help_docs = MenuItem::with_id(app, "documentation", "Documentation", true, None::<&str>)?;
    let help_shortcuts = MenuItem::with_id(
        app,
        "keyboard-shortcuts",
        "Keyboard Shortcuts",
        true,
        Some("Ctrl+Shift+/"),
    )?;
    let help_about = MenuItem::with_id(app, "about", "About Codex", true, None::<&str>)?;

    let help_menu = Submenu::with_items(
        app,
        "Help",
        true,
        &[&help_docs, &help_shortcuts, &PredefinedMenuItem::separator(app)?, &help_about],
    )?;

    Menu::with_items(app, &[&file_menu, &edit_menu, &view_menu, &help_menu])
}

/// Handle native menu events: emit a `menu` event with the action id as payload.
pub fn on_menu_event<R: Runtime>(app: &AppHandle<R>, event: MenuEvent) {
    let id = event.id().0.as_str();
    let _ = app.emit("menu", id.to_string());
}
