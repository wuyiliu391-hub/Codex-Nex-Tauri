use crate::state::{AppState, CalendarEvent};
use tauri::State;

#[tauri::command]
pub fn list_calendar_events(state: State<'_, AppState>) -> Result<Vec<CalendarEvent>, String> {
    Ok(state
        .inner
        .lock()
        .map_err(|e| e.to_string())?
        .calendar
        .clone())
}

#[tauri::command]
pub fn save_calendar_event(state: State<'_, AppState>, event: CalendarEvent) -> Result<(), String> {
    let mut inner = state.inner.lock().map_err(|e| e.to_string())?;
    if let Some(existing) = inner.calendar.iter_mut().find(|e| e.id == event.id) {
        *existing = event;
    } else {
        inner.calendar.push(event);
    }
    drop(inner);
    state.save().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_calendar_event(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let mut inner = state.inner.lock().map_err(|e| e.to_string())?;
    inner.calendar.retain(|e| e.id != id);
    drop(inner);
    state.save().map_err(|e| e.to_string())
}
