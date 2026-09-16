use crate::state::{AppState, CinemaJob, CinemaTimeline};
use tauri::State;

#[tauri::command]
pub fn list_cinema_timelines(state: State<'_, AppState>) -> Result<Vec<CinemaTimeline>, String> {
    Ok(state.inner.lock().map_err(|e| e.to_string())?.cinema_timelines.clone())
}

#[tauri::command]
pub fn list_cinema_jobs(state: State<'_, AppState>) -> Result<Vec<CinemaJob>, String> {
    Ok(state.inner.lock().map_err(|e| e.to_string())?.cinema_jobs.clone())
}

#[tauri::command]
pub fn save_cinema_timeline(state: State<'_, AppState>, timeline: CinemaTimeline) -> Result<(), String> {
    let mut inner = state.inner.lock().map_err(|e| e.to_string())?;
    if let Some(existing) = inner
        .cinema_timelines
        .iter_mut()
        .find(|t| t.id == timeline.id)
    {
        *existing = timeline;
    } else {
        inner.cinema_timelines.push(timeline);
    }
    drop(inner);
    state.save().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_cinema_timeline(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let mut inner = state.inner.lock().map_err(|e| e.to_string())?;
    inner.cinema_timelines.retain(|t| t.id != id);
    drop(inner);
    state.save().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn enqueue_cinema_render(state: State<'_, AppState>, timeline_id: String) -> Result<CinemaJob, String> {
    let job = CinemaJob {
        id: uuid::Uuid::new_v4().to_string(),
        timeline_id,
        status: "queued".into(),
        progress: 0.0,
    };
    {
        let mut inner = state.inner.lock().map_err(|e| e.to_string())?;
        inner.cinema_jobs.push(job.clone());
    }
    state.save().map_err(|e| e.to_string())?;
    // Real render pipeline was in internal/cinema — port as follow-up or shell out to ffmpeg.
    Ok(job)
}

#[tauri::command]
pub fn cancel_cinema_job(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let mut inner = state.inner.lock().map_err(|e| e.to_string())?;
    if let Some(job) = inner.cinema_jobs.iter_mut().find(|j| j.id == id) {
        job.status = "cancelled".into();
    }
    drop(inner);
    state.save().map_err(|e| e.to_string())
}
