mod commands;
mod edge_dock;
mod edge_dock_native;
mod icon;
mod legacy_import;
mod transfer_station;

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{
  menu::{Menu, MenuItem},
  tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
  Emitter, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};

static CLOSE_TO_TRAY: AtomicBool = AtomicBool::new(true);

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
fn keep_taskbar_visible_by_hwnd(hwnd: isize) {
  use windows_sys::Win32::UI::WindowsAndMessaging::{GetWindowLongW, SetWindowLongW, GWL_EXSTYLE, WS_EX_APPWINDOW, WS_EX_TOOLWINDOW};
  if hwnd == 0 {
    return;
  }
  unsafe {
    let style = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
    let next = (style | WS_EX_APPWINDOW) & !WS_EX_TOOLWINDOW;
    if next != style {
      SetWindowLongW(hwnd, GWL_EXSTYLE, next as i32);
    }
  }
}

#[cfg(target_os = "windows")]
fn move_hwnd_back_to_screen(hwnd: isize) {
  use windows_sys::Win32::Foundation::RECT;
  use windows_sys::Win32::Graphics::Gdi::{GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST};
  use windows_sys::Win32::UI::WindowsAndMessaging::{GetWindowRect, SetWindowPos, HWND_TOP, SWP_NOOWNERZORDER, SWP_SHOWWINDOW};

  if hwnd == 0 {
    return;
  }

  let mut rect = RECT { left: 0, top: 0, right: 0, bottom: 0 };
  if unsafe { GetWindowRect(hwnd, &mut rect) } == 0 {
    return;
  }

  let width = (rect.right - rect.left).max(520);
  let height = (rect.bottom - rect.top).max(360);
  let monitor = unsafe { MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST) };
  if monitor == 0 {
    return;
  }

  let mut info = MONITORINFO {
    cbSize: std::mem::size_of::<MONITORINFO>() as u32,
    rcMonitor: RECT { left: 0, top: 0, right: 0, bottom: 0 },
    rcWork: RECT { left: 0, top: 0, right: 0, bottom: 0 },
    dwFlags: 0,
  };
  if unsafe { GetMonitorInfoW(monitor, &mut info) } == 0 {
    return;
  }

  let work = info.rcWork;
  let visible = rect.right > work.left + 48
    && rect.left < work.right - 48
    && rect.bottom > work.top + 48
    && rect.top < work.bottom - 48
    && width > 120
    && height > 100;

  if !visible {
    let target_width = width.min((work.right - work.left).max(520));
    let target_height = height.min((work.bottom - work.top).max(360));
    let x = work.left + ((work.right - work.left - target_width) / 2).max(0);
    let y = work.top + ((work.bottom - work.top - target_height) / 2).max(0);
    unsafe {
      SetWindowPos(hwnd, HWND_TOP, x, y, target_width, target_height, SWP_SHOWWINDOW | SWP_NOOWNERZORDER);
    }
  }
}

#[cfg(target_os = "windows")]
fn wake_existing_window() {
  use std::ptr::null;
  use windows_sys::Win32::UI::WindowsAndMessaging::{FindWindowW, SetForegroundWindow, ShowWindow, SW_RESTORE, SW_SHOW};
  let title = wide_null("Yue Launcher");
  let hwnd = unsafe { FindWindowW(null(), title.as_ptr()) };
  if hwnd == 0 {
    return;
  }
  keep_taskbar_visible_by_hwnd(hwnd);
  unsafe {
    ShowWindow(hwnd, SW_SHOW);
    ShowWindow(hwnd, SW_RESTORE);
  }
  move_hwnd_back_to_screen(hwnd);
  unsafe {
    SetForegroundWindow(hwnd);
  }
}

#[cfg(target_os = "windows")]
fn acquire_single_instance_or_wake() -> Option<isize> {
  use std::ptr::null_mut;
  use windows_sys::Win32::Foundation::{CloseHandle, GetLastError, ERROR_ALREADY_EXISTS};
  use windows_sys::Win32::System::Threading::CreateMutexW;

  let name = wide_null("Global\\YueLauncherLucySingleInstance");
  let mutex = unsafe { CreateMutexW(null_mut(), 1, name.as_ptr()) };
  if mutex == 0 {
    return Some(0);
  }
  let already_exists = unsafe { GetLastError() } == ERROR_ALREADY_EXISTS;
  if already_exists {
    wake_existing_window();
    unsafe { CloseHandle(mutex); }
    None
  } else {
    Some(mutex as isize)
  }
}

#[cfg(not(target_os = "windows"))]
fn acquire_single_instance_or_wake() -> Option<()> {
  Some(())
}

#[cfg(target_os = "windows")]
fn remove_dwm_ghost_line() {
  use std::ptr::null;
  use windows_sys::Win32::Graphics::Dwm::{DwmExtendFrameIntoClientArea, MARGINS};
  use windows_sys::Win32::UI::WindowsAndMessaging::FindWindowW;

  // decorations:false 会去掉标题栏，但 DWM 有时仍会给透明窗口留 1px 隐形帧。
  // 把扩展 frame 的四边 margin 明确归零，可减少/消除透明窗口残线。
  let title = wide_null("Yue Launcher");
  let hwnd = unsafe { FindWindowW(null(), title.as_ptr()) };
  if hwnd == 0 {
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
fn keep_main_taskbar_icon() {
  use std::ptr::null;
  use windows_sys::Win32::UI::WindowsAndMessaging::FindWindowW;
  let title = wide_null("Yue Launcher");
  let hwnd = unsafe { FindWindowW(null(), title.as_ptr()) };
  keep_taskbar_visible_by_hwnd(hwnd);
}

fn show_main_window(app: &tauri::AppHandle) {
  #[cfg(target_os = "windows")]
  keep_main_taskbar_icon();
  let _ = app.emit("edge-force-show", ());
  if let Some(strip) = app.get_webview_window("edge-strip") {
    let _ = strip.hide();
  }
  if let Some(window) = app.get_webview_window("main") {
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
  }
}

fn hide_main_window(app: &tauri::AppHandle) {
  #[cfg(target_os = "windows")]
  keep_main_taskbar_icon();
  if let Some(strip) = app.get_webview_window("edge-strip") {
    let _ = strip.hide();
  }
  if let Some(window) = app.get_webview_window("main") {
    let _ = window.hide();
  }
}


#[tauri::command]
fn open_new_main_window(app: tauri::AppHandle) -> Result<(), String> {
  let label = format!("main-{}", std::time::SystemTime::now()
    .duration_since(std::time::UNIX_EPOCH)
    .map(|d| d.as_millis())
    .unwrap_or(0));

  let window = WebviewWindowBuilder::new(&app, label, WebviewUrl::App("index.html".into()))
    .title("Yue Launcher - 多开")
    .inner_size(980.0, 660.0)
    .min_inner_size(8.0, 8.0)
    .decorations(false)
    .transparent(true)
    .shadow(true)
    .resizable(true)
    .visible(true)
    .build()
    .map_err(|e| e.to_string())?;

  if let Some(icon) = app.default_window_icon() {
    let _ = window.set_icon(icon.clone());
  }
  let _ = window.set_focus();
  #[cfg(target_os = "windows")]
  keep_main_taskbar_icon();
  Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let _single_instance_guard = match acquire_single_instance_or_wake() {
    Some(guard) => guard,
    None => return,
  };

  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .setup(|app| {
      let show_item = MenuItem::with_id(app, "show", "显示主窗口", true, None::<&str>)?;
      let hide_item = MenuItem::with_id(app, "hide", "隐藏到托盘", true, None::<&str>)?;
      let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
      let tray_menu = Menu::with_items(app, &[&show_item, &hide_item, &quit_item])?;

      let mut tray = TrayIconBuilder::new()
        .tooltip("Yue Launcher")
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
        keep_main_taskbar_icon();
        std::thread::spawn(|| {
          std::thread::sleep(std::time::Duration::from_millis(300));
          remove_dwm_ghost_line();
          keep_main_taskbar_icon();
        });
      }

      tray.build(app)?;
      Ok(())
    })
    .on_window_event(|window, event| {
      if let WindowEvent::CloseRequested { api, .. } = event {
        let label = window.label().to_string();
        if label == "main" && CLOSE_TO_TRAY.load(Ordering::SeqCst) {
          api.prevent_close();
          if let Some(strip) = window.app_handle().get_webview_window("edge-strip") {
            let _ = strip.hide();
          }
          let _ = window.hide();
        } else if label == "main" {
          window.app_handle().exit(0);
        } else if label.starts_with("main-") {
          // 多开窗口按正常方式关闭，只保留主窗口的“关闭到托盘”行为。
        } else {
          api.prevent_close();
          let _ = window.hide();
        }
      }
    })
    .invoke_handler(tauri::generate_handler![
      commands::launch_item,
      commands::open_file_location,
      commands::resolve_lnk,
      commands::save_config,
      commands::load_config,
      commands::get_file_info,
      commands::fetch_website_favicon,
      commands::get_cached_website_favicon,
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
      open_new_main_window
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
