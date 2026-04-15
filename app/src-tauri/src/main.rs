#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod store;

use std::sync::Mutex;
use tauri::{
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            // Build tray icon.
            let tray = TrayIconBuilder::new()
                .icon(load_icon("icons/tray-gray.png").unwrap_or_else(|| {
                    app.default_window_icon().unwrap().clone()
                }))
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

            // Store tray handle for dynamic icon updates.
            app.manage(TrayState(Mutex::new(tray)));

            // Apply vibrancy to main window.
            if let Some(window) = app.get_webview_window("main") {
                #[cfg(target_os = "macos")]
                {
                    use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};
                    let _ = apply_vibrancy(&window, NSVisualEffectMaterial::HudWindow, None, None);
                }

                // Restore saved window position/size.
                restore_window_state(app, &window);

                // Hide instead of close.
                let win = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        save_window_state(&win);
                        let _ = win.hide();
                    }
                });
            }

            // Background tray icon updater — every 10 seconds.
            let app_handle = app.handle().clone();
            tokio::spawn(async move {
                let mut interval = tokio::time::interval(std::time::Duration::from_secs(10));
                loop {
                    interval.tick().await;
                    update_tray_icon(&app_handle);
                }
            });

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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

struct TrayState(Mutex<tauri::tray::TrayIcon>);

fn update_tray_icon(app: &tauri::AppHandle) {
    let store = match commands::try_open_store() {
        Some(s) => s,
        None => {
            set_tray_icon(app, "icons/tray-gray.png");
            return;
        }
    };

    let summary = match store.query_live_summary() {
        Ok(s) => s,
        Err(_) => {
            set_tray_icon(app, "icons/tray-gray.png");
            return;
        }
    };

    if summary.agents.is_empty() {
        set_tray_icon(app, "icons/tray-gray.png");
    } else if !summary.hotspots.is_empty()
        || summary.alerts.iter().any(|a| a.severity == "critical")
    {
        set_tray_icon(app, "icons/tray-red.png");
    } else if summary.alerts.iter().any(|a| a.severity == "warning") {
        set_tray_icon(app, "icons/tray-amber.png");
    } else {
        set_tray_icon(app, "icons/tray-green.png");
    }
}

fn load_icon(path: &str) -> Option<tauri::image::Image<'static>> {
    let bytes = std::fs::read(path).ok()?;
    // Decode PNG to raw RGBA
    let decoder = png::Decoder::new(std::io::Cursor::new(&bytes));
    let mut reader = decoder.read_info().ok()?;
    let mut buf = vec![0u8; reader.output_buffer_size()];
    let info = reader.next_frame(&mut buf).ok()?;
    buf.truncate(info.buffer_size());
    Some(tauri::image::Image::new_owned(buf, info.width, info.height))
}

fn set_tray_icon(app: &tauri::AppHandle, path: &str) {
    if let Some(state) = app.try_state::<TrayState>() {
        if let Ok(tray) = state.0.lock() {
            if let Some(icon) = load_icon(path) {
                let _ = tray.set_icon(Some(icon));
            }
        }
    }
}

fn save_window_state(window: &tauri::WebviewWindow) {
    if let (Ok(pos), Ok(size)) = (window.outer_position(), window.outer_size()) {
        let state = serde_json::json!({
            "x": pos.x,
            "y": pos.y,
            "width": size.width,
            "height": size.height,
        });
        let path = window
            .app_handle()
            .path()
            .app_data_dir()
            .unwrap_or_default()
            .join("window-state.json");
        let _ = std::fs::create_dir_all(path.parent().unwrap_or(&path));
        let _ = std::fs::write(&path, state.to_string());
    }
}

fn restore_window_state(app: &tauri::App, window: &tauri::WebviewWindow) {
    let path = app
        .path()
        .app_data_dir()
        .unwrap_or_default()
        .join("window-state.json");
    if let Ok(data) = std::fs::read_to_string(&path) {
        if let Ok(state) = serde_json::from_str::<serde_json::Value>(&data) {
            if let (Some(x), Some(y), Some(w), Some(h)) = (
                state["x"].as_i64(),
                state["y"].as_i64(),
                state["width"].as_f64(),
                state["height"].as_f64(),
            ) {
                let _ = window.set_position(tauri::Position::Physical(
                    tauri::PhysicalPosition::new(x as i32, y as i32),
                ));
                let _ = window.set_size(tauri::Size::Physical(
                    tauri::PhysicalSize::new(w as u32, h as u32),
                ));
            }
        }
    }
}
