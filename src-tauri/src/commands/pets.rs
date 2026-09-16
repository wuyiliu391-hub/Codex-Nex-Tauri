use crate::state::{AppState, Pet};
use tauri::State;

#[tauri::command]
pub fn list_pets(state: State<'_, AppState>) -> Result<Vec<Pet>, String> {
    Ok(state.inner.lock().map_err(|e| e.to_string())?.pets.clone())
}

#[tauri::command]
pub fn save_pets(state: State<'_, AppState>, pets: Vec<Pet>) -> Result<(), String> {
    state.inner.lock().map_err(|e| e.to_string())?.pets = pets;
    state.save().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn wake_pet(state: State<'_, AppState>, id: String) -> Result<Pet, String> {
    let mut inner = state.inner.lock().map_err(|e| e.to_string())?;
    let pet = inner
        .pets
        .iter_mut()
        .find(|p| p.id == id)
        .ok_or_else(|| "pet not found".to_string())?;
    pet.mood = "happy".into();
    let out = pet.clone();
    drop(inner);
    state.save().map_err(|e| e.to_string())?;
    Ok(out)
}

#[tauri::command]
pub fn tuck_pet(state: State<'_, AppState>, id: String) -> Result<Pet, String> {
    let mut inner = state.inner.lock().map_err(|e| e.to_string())?;
    let pet = inner
        .pets
        .iter_mut()
        .find(|p| p.id == id)
        .ok_or_else(|| "pet not found".to_string())?;
    pet.mood = "sleepy".into();
    let out = pet.clone();
    drop(inner);
    state.save().map_err(|e| e.to_string())?;
    Ok(out)
}

#[tauri::command]
pub fn create_custom_pet(state: State<'_, AppState>, name: String, kind: String) -> Result<Pet, String> {
    let pet = Pet {
        id: uuid::Uuid::new_v4().to_string(),
        name,
        kind,
        sprite: String::new(),
        mood: "idle".into(),
        custom: true,
    };
    {
        let mut inner = state.inner.lock().map_err(|e| e.to_string())?;
        inner.pets.push(pet.clone());
    }
    state.save().map_err(|e| e.to_string())?;
    Ok(pet)
}
