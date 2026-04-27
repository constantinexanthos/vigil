#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod store;

use tauri::{
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

#[cfg(target_os = "macos")]
use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial, NSVisualEffectState};

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

            // Apply NSVisualEffectView vibrancy ("liquid glass") so the window
            // background blurs the desktop instead of showing as a flat slab.
            // The titlebar is already overlay-transparent in tauri.conf.json,
            // so the effect extends edge-to-edge under the traffic lights.
            #[cfg(target_os = "macos")]
            if let Some(main_window) = app.get_webview_window("main") {
                let _ = apply_vibrancy(
                    &main_window,
                    NSVisualEffectMaterial::HudWindow,
                    Some(NSVisualEffectState::Active),
                    Some(0.0),
                );
            }

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
            commands::get_review_signals,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
