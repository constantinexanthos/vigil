#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod store;

use tauri::{
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Build tray icon using the default app icon.
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Vigil")
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_active_agents,
            commands::get_recent_events,
            commands::get_collisions,
            commands::get_agent_stats,
            commands::get_event_count,
            commands::get_cost_summary,
            commands::get_commit_activity,
            commands::get_workspace_summary,
            commands::get_pull_requests,
            commands::get_live_summary,
            commands::get_hosts,
            commands::get_live_sessions,
            commands::get_summary,
            commands::refresh_summary,
            commands::detect_cli,
            commands::save_api_key,
            commands::has_api_key,
            commands::get_recent_turns,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
