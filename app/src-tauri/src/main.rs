#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod store;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            commands::get_recent_events,
            commands::get_collisions,
            commands::get_agent_stats,
            commands::get_event_count,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
