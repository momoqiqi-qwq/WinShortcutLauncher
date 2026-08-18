mod background_media;
mod commands;
mod edge_dock;
mod edge_dock_native;
mod icon;
mod legacy_import;
mod transfer_station;
mod window_persistence;

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;

use tauri::{
  menu::{Menu, MenuItem},
  tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
  Emitter, Manager, PhysicalPosition, PhysicalSize, RunEvent, WindowEvent,
};

static CLOSE_TO_TRAY: AtomicBool = AtomicBool::new(true);
static MAIN_HIDDEN_TO_TRAY: AtomicBool = AtomicBool::new(false);
static TRAY_RESTORE_GENERATION: AtomicU64 = AtomicU64::new(0);

const TRAY_MIN_WINDOW_WIDTH: u32 = 900;
const TRAY_MIN_WINDOW_HEIGHT: u32 = 640;
const TRAY_DEFAULT_WINDOW_WIDTH: u32 = 1180;
const TRAY_DEFAULT_WINDOW_HEIGHT: u32 = 880;

#[derive(Clone, Copy, Debug)]
struct TrayWindowState {
  width: u32,
  height: u32,
  x: i32,
  y: i32,
  maximized: bool,
}

static TRAY_WINDOW_STATE: Mutex<Option<TrayWindowState>> = Mutex::new(None);

fn tray_state_has_safe_size(state: &TrayWindowState) -> bool {
  state.width >= TRAY_MIN_WINDOW_WIDTH
    && state.height >= TRAY_MIN_WINDOW_HEIGHT
    && state.width <= 10000
    && state.height <= 10000
}

fn tray_state_intersects_monitor(window: &tauri::WebviewWindow, state: &TrayWindowState) -> bool {
  let Ok(monitors) = window.available_monitors() else { return false; };
  monitors.iter().any(|monitor| {
    let position = monitor.position();
    let size = monitor.size();
    let left = position.x;
    let top = position.y;
    let right = left + size.width as i32;
    let bottom = top + size.height as i32;
    let state_right = state.x.saturating_add(state.width as i32);
    let state_bottom = state.y.saturating_add(state.height as i32);
    state.x < right && state_right > left && state.y < bottom && state_bottom > top
  })
}

fn remember_main_window_before_tray(window: &tauri::WebviewWindow) {
  // Never overwrite the last known-good snapshot with geometry from an already-hidden window.
  if MAIN_HIDDEN_TO_TRAY.load(Ordering::SeqCst) || !window.is_visible().unwrap_or(false) {
    return;
  }

  let Ok(size) = window.inner_size() else { return; };
  let Ok(position) = window.outer_position() else { return; };
  let candidate = TrayWindowState {
    width: size.width,
    height: size.height,
    x: position.x,
    y: position.y,
    maximized: window.is_maximized().unwrap_or(false),
  };

  // v111 accepted 200x160 here. A transient compact/animation rect could therefore become the
  // permanent tray restore size. The app itself requires 900x640, so only remember safe geometry.
  if !tray_state_has_safe_size(&candidate) || !tray_state_intersects_monitor(window, &candidate) {
    return;
  }

  if let Ok(mut state) = TRAY_WINDOW_STATE.lock() {
    *state = Some(candidate);
  }
}

fn apply_tray_window_state(window: &tauri::WebviewWindow, state: TrayWindowState) {
  let _ = window.unminimize();
  let _ = window.unmaximize();

  let safe_state = tray_state_has_safe_size(&state);
  if safe_state {
    let _ = window.set_size(PhysicalSize::new(state.width, state.height));
    if tray_state_intersects_monitor(window, &state) {
      let _ = window.set_position(PhysicalPosition::new(state.x, state.y));
    } else {
      let _ = window.center();
    }
  } else {
    let _ = window.set_size(PhysicalSize::new(
      TRAY_DEFAULT_WINDOW_WIDTH,
      TRAY_DEFAULT_WINDOW_HEIGHT,
    ));
    let _ = window.center();
  }

  let _ = window.show();
  if state.maximized && safe_state {
    let _ = window.maximize();
  }
}

fn fallback_tray_window_state(window: &tauri::WebviewWindow) -> TrayWindowState {
  let position = window.outer_position().unwrap_or(PhysicalPosition::new(0, 0));
  TrayWindowState {
    width: TRAY_DEFAULT_WINDOW_WIDTH,
    height: TRAY_DEFAULT_WINDOW_HEIGHT,
    x: position.x,
    y: position.y,
    maximized: false,
  }
}

fn restore_main_window_from_tray(window: &tauri::WebviewWindow) -> TrayWindowState {
  let state = TRAY_WINDOW_STATE
    .lock()
    .ok()
    .and_then(|state| *state)
    .filter(tray_state_has_safe_size)
    .unwrap_or_else(|| fallback_tray_window_state(window));
  apply_tray_window_state(window, state);
  state
}

fn schedule_tray_restore_guard(app: tauri::AppHandle, state: TrayWindowState, generation: u64) {
  std::thread::spawn(move || {
    // WebView2 / Windows can finish applying hidden-window style changes after show(). Reassert the
    // expected geometry twice, but cancel immediately if the user hides/restores again meanwhile.
    for delay_ms in [70_u64, 260_u64] {
      std::thread::sleep(std::time::Duration::from_millis(delay_ms));
      if MAIN_HIDDEN_TO_TRAY.load(Ordering::SeqCst)
        || TRAY_RESTORE_GENERATION.load(Ordering::SeqCst) != generation
      {
        return;
      }
      let Some(window) = app.get_webview_window("main") else { return; };
      if !window.is_visible().unwrap_or(false) {
        return;
      }
      if state.maximized {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.maximize();
      } else {
        apply_tray_window_state(&window, state);
      }
      #[cfg(target_os = "windows")]
      keep_main_out_of_taskbar();
    }
  });
}

#[tauri::command]
fn set_close_behavior(close_to_tray: bool) -> Result<(), String> {
  CLOSE_TO_TRAY.store(close_to_tray, Ordering::SeqCst);
  Ok(())
}

#[cfg(target_os = "windows")]
fn wide_null(s: &str) -> Vec<u16> {
  s.encode_utf16().chain(std::iter::once(0)).collect()
}

#[cfg(target_os = "windows")]
fn remove_dwm_ghost_line() {
  use std::ptr::null;
  use windows_sys::Win32::Graphics::Dwm::DwmExtendFrameIntoClientArea;
  use windows_sys::Win32::UI::Controls::MARGINS;
  use windows_sys::Win32::UI::WindowsAndMessaging::FindWindowW;

  // decorations:false 会去掉标题栏，但 DWM 有时仍会给透明窗口留 1px 隐形帧。
  // 把扩展 frame 的四边 margin 明确归零，可减少/消除透明窗口残线。
  let title = wide_null("Yue launcher");
  let hwnd = unsafe { FindWindowW(null(), title.as_ptr()) };
  if hwnd.is_null() {
    return;
  }

  let margins = MARGINS {
    cxLeftWidth: 0,
    cxRightWidth: 0,
    cyTopHeight: 0,
    cyBottomHeight: 0,
  };
  unsafe {
    let _ = DwmExtendFrameIntoClientArea(hwnd, &margins);
  }
}



#[cfg(target_os = "windows")]
fn keep_main_out_of_taskbar() {
  use std::ptr::{null, null_mut};
  use windows_sys::Win32::UI::WindowsAndMessaging::{
    FindWindowW, GetWindowLongW, SetWindowLongW, SetWindowPos, GWL_EXSTYLE, SWP_FRAMECHANGED,
    SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER, WS_EX_APPWINDOW, WS_EX_TOOLWINDOW,
  };
  let title = wide_null("Yue launcher");
  let hwnd = unsafe { FindWindowW(null(), title.as_ptr()) };
  if hwnd.is_null() {
    return;
  }
  unsafe {
    let style = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
    let next = (style | WS_EX_TOOLWINDOW) & !WS_EX_APPWINDOW;
    if next != style {
      SetWindowLongW(hwnd, GWL_EXSTYLE, next as i32);
    }
    // Keep the launcher tray-only: refresh the extended style so Windows drops any cached
    // taskbar button for this frameless window after hide/show cycles.
    SetWindowPos(
      hwnd,
      null_mut(),
      0,
      0,
      0,
      0,
      SWP_FRAMECHANGED | SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE,
    );
  }
}

fn show_main_window(app: &tauri::AppHandle) {
  let was_hidden_to_tray = MAIN_HIDDEN_TO_TRAY.swap(false, Ordering::SeqCst);
  let generation = TRAY_RESTORE_GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
  if was_hidden_to_tray {
    // Detach the native edge controller from its previous hidden/parked geometry first.
    // Otherwise a tray restore can race with an old edge restore rect and resize/reposition the window.
    edge_dock_native::prepare_tray_show(1600);
  }

  if let Some(strip) = app.get_webview_window("edge-strip") {
    let _ = strip.hide();
  }
  if let Some(window) = app.get_webview_window("main") {
    let restored_state = if was_hidden_to_tray {
      Some(restore_main_window_from_tray(&window))
    } else {
      let _ = window.unminimize();
      let _ = window.show();
      None
    };
    if let Some(icon) = app.default_window_icon() {
      let _ = window.set_icon(icon.clone());
    }
    #[cfg(target_os = "windows")]
    keep_main_out_of_taskbar();
    let _ = window.set_focus();
    if let Some(state) = restored_state {
      schedule_tray_restore_guard(app.clone(), state, generation);
    }
  }

  // Only ask the edge controller to reveal an edge-hidden window. A real tray restore already
  // owns geometry; emitting this at the same time was a second competing restore path in v111.
  if !was_hidden_to_tray {
    let _ = app.emit("edge-force-show", ());
  }

  #[cfg(target_os = "windows")]
  std::thread::spawn(|| {
    std::thread::sleep(std::time::Duration::from_millis(120));
    keep_main_out_of_taskbar();
  });
}

fn hide_main_window(app: &tauri::AppHandle) {
  if MAIN_HIDDEN_TO_TRAY.load(Ordering::SeqCst) {
    return;
  }
  TRAY_RESTORE_GENERATION.fetch_add(1, Ordering::SeqCst);
  if let Some(strip) = app.get_webview_window("edge-strip") {
    let _ = strip.hide();
  }
  if let Some(window) = app.get_webview_window("main") {
    remember_main_window_before_tray(&window);
    MAIN_HIDDEN_TO_TRAY.store(true, Ordering::SeqCst);
    edge_dock_native::set_tray_hidden(true);
    let _ = window.hide();
  }
}

#[tauri::command]
fn hide_main_window_to_tray(app: tauri::AppHandle) -> Result<(), String> {
  hide_main_window(&app);
  Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let app = tauri::Builder::default()
    .plugin(
      tauri_plugin_window_state::Builder::default()
        .with_filename(window_persistence::AUTO_STATE_FILENAME)
        .with_state_flags(tauri_plugin_window_state::StateFlags::empty())
        .with_filter(|label| label == "main")
        .skip_initial_state("main")
        .build(),
    )
    .plugin(tauri_plugin_dialog::init())
    .setup(|app| {
      window_persistence::initialize(app)?;

      let show_item = MenuItem::with_id(app, "show", "显示主窗口", true, None::<&str>)?;
      let hide_item = MenuItem::with_id(app, "hide", "隐藏到托盘", true, None::<&str>)?;
      let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
      let tray_menu = Menu::with_items(app, &[&show_item, &hide_item, &quit_item])?;

      let mut tray = TrayIconBuilder::new()
        .tooltip("Yue launcher")
        .menu(&tray_menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
          "show" => show_main_window(app),
          "hide" => hide_main_window(app),
          "quit" => app.exit(0),
          _ => {}
        })
        .on_tray_icon_event(|tray, event| match event {
          TrayIconEvent::Click {
            button: MouseButton::Left,
            button_state: MouseButtonState::Up,
            ..
          } => {
            show_main_window(tray.app_handle());
          }
          TrayIconEvent::DoubleClick { .. } => {
            show_main_window(tray.app_handle());
          }
          _ => {}
        });

      if let Some(icon) = app.default_window_icon() {
        if let Some(window) = app.get_webview_window("main") {
          let _ = window.set_icon(icon.clone());
        }
        tray = tray.icon(icon.clone());
      }

      #[cfg(target_os = "windows")]
      {
        remove_dwm_ghost_line();
        keep_main_out_of_taskbar();
        std::thread::spawn(|| {
          std::thread::sleep(std::time::Duration::from_millis(300));
          remove_dwm_ghost_line();
          keep_main_out_of_taskbar();
        });
      }

      tray.build(app)?;
      window_persistence::show_main_window_after_restore(app.handle());
      Ok(())
    })
    .on_window_event(|window, event| {
      if let WindowEvent::CloseRequested { api, .. } = event {
        if window.label() == "main" && CLOSE_TO_TRAY.load(Ordering::SeqCst) {
          api.prevent_close();
          hide_main_window(window.app_handle());
        } else if window.label() == "main" {
          window.app_handle().exit(0);
        } else {
          api.prevent_close();
          let _ = window.hide();
        }
      }
    })
    .invoke_handler(tauri::generate_handler![
      background_media::cache_background_media,
      background_media::inspect_background_media,
      commands::launch_item,
      commands::detect_foreground_browser,
      commands::scan_browsers,
      commands::test_browser_target,
      commands::open_file_location,
      commands::resolve_lnk,
      commands::save_config,
      commands::load_config,
      commands::get_file_info,
      commands::read_url_shortcut,
      commands::fetch_website_favicon,
      commands::test_favicon_sources,
      commands::fetch_website_title,
      commands::set_auto_start,
      commands::get_auto_start,
      commands::set_window_always_on_top,
      commands::open_windows_clipboard_history,
      icon::get_file_icon,
      icon::read_icon_as_data_url,
      legacy_import::import_legacy_db_config,
      transfer_station::copy_transfer_paths_to_folder,
      transfer_station::get_path_kind,
      edge_dock::edge_animate_window,
      edge_dock::edge_cancel_animation,
      edge_dock_native::edge_native_configure,
      edge_dock_native::edge_native_force_show,
      edge_dock_native::edge_native_suspend,
      set_close_behavior,
      hide_main_window_to_tray,
      window_persistence::get_window_persistence_settings,
      window_persistence::set_window_persistence_settings,
      window_persistence::save_manual_main_window_state,
      window_persistence::clear_manual_main_window_state,
      window_persistence::get_window_persistence_status
    ])
    .build(tauri::generate_context!())
    .expect("error while building tauri application");

  app.run(|app_handle, event| {
    if let RunEvent::Exit = event {
      window_persistence::save_automatic_state_on_exit(app_handle);
    }
  });
}
