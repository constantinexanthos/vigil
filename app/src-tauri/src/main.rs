// Prevents additional console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod store;

use std::sync::Mutex;

use commands::DbState;
use store::Store;
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager, WebviewUrl, WebviewWindowBuilder,
};

fn vigil_db_path() -> std::path::PathBuf {
    home::home_dir()
        .expect("cannot determine home directory")
        .join(".vigil")
        .join("vigil.db")
}

fn open_or_focus_panel(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    } else {
        let _ = WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
            .title("Vigil")
            .inner_size(420.0, 600.0)
            .resizable(false)
            .decorations(true)
            .build();
    }
}

fn main() {
    let db_path = vigil_db_path();
    let store: Option<Store> = if db_path.exists() {
        Store::open_readonly(&db_path).ok()
    } else {
        None
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage::<DbState>(Mutex::new(store))
        .invoke_handler(tauri::generate_handler![
            commands::get_active_agents,
            commands::get_recent_events,
            commands::get_collisions,
            commands::get_event_count,
            commands::get_agent_stats,
        ])
        .setup(|app| {
            let quit = MenuItem::with_id(app, "quit", "Quit Vigil", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&quit])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Vigil — Coding Agent Monitor")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_tray_icon_event({
                    let app_handle = app.handle().clone();
                    move |_tray, event| {
                        if let tauri::tray::TrayIconEvent::Click { button, .. } = event {
                            if button == tauri::tray::MouseButton::Left {
                                open_or_focus_panel(&app_handle);
                            }
                        }
                    }
                })
                .on_menu_event(|app, event| {
                    if event.id() == "quit" {
                        app.exit(0);
                    }
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Vigil");
}
