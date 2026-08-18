use serde::{Deserialize, Serialize};
use std::{
  collections::HashMap,
  fs,
  path::PathBuf,
  sync::Mutex,
  time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, State, WebviewWindow};
use tauri_plugin_window_state::{AppHandleExt, StateFlags, WindowExt};

pub const AUTO_STATE_FILENAME: &str = ".window-state-auto.json";
const SETTINGS_FILENAME: &str = "window-persistence-settings.json";
const MANUAL_STATE_FILENAME: &str = "manual-window-state.json";
const DEFAULT_WINDOW_WIDTH: u32 = 1180;
const DEFAULT_WINDOW_HEIGHT: u32 = 880;
const MIN_WINDOW_WIDTH: u32 = 900;
const MIN_WINDOW_HEIGHT: u32 = 640;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowPersistenceSettings {
  pub manual_window_state_enabled: bool,
  pub restore_window_state_on_launch: bool,
  pub save_window_state_on_exit: bool,
}

impl Default for WindowPersistenceSettings {
  fn default() -> Self {
    Self {
      manual_window_state_enabled: false,
      restore_window_state_on_launch: true,
      save_window_state_on_exit: true,
    }
  }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManualWindowState {
  pub width: u32,
  pub height: u32,
  pub x: i32,
  pub y: i32,
  pub maximized: bool,
  pub saved_at: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowPersistenceStatus {
  pub settings: WindowPersistenceSettings,
  pub manual_state: Option<ManualWindowState>,
  pub automatic_state_available: bool,
  pub startup_source: String,
}


#[derive(Clone, Debug, Deserialize)]
struct PluginWindowStateMeta {
  width: u32,
  height: u32,
}

pub struct WindowPersistenceRuntime {
  settings: Mutex<WindowPersistenceSettings>,
  startup_source: Mutex<String>,
}

pub fn tracked_state_flags() -> StateFlags {
  StateFlags::SIZE | StateFlags::POSITION | StateFlags::MAXIMIZED
}

fn now_millis() -> u64 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .unwrap_or_default()
    .as_millis() as u64
}

fn app_config_file(app: &AppHandle, filename: &str) -> Result<PathBuf, String> {
  let directory = app.path().app_config_dir().map_err(|error| error.to_string())?;
  fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
  Ok(directory.join(filename))
}

fn read_json<T: for<'de> Deserialize<'de>>(app: &AppHandle, filename: &str) -> Option<T> {
  let path = app_config_file(app, filename).ok()?;
  let bytes = fs::read(path).ok()?;
  serde_json::from_slice(&bytes).ok()
}

fn write_json<T: Serialize>(app: &AppHandle, filename: &str, value: &T) -> Result<(), String> {
  let path = app_config_file(app, filename)?;
  let bytes = serde_json::to_vec_pretty(value).map_err(|error| error.to_string())?;
  fs::write(path, bytes).map_err(|error| error.to_string())
}

fn read_settings(app: &AppHandle) -> WindowPersistenceSettings {
  read_json(app, SETTINGS_FILENAME).unwrap_or_default()
}

fn read_manual_state(app: &AppHandle) -> Option<ManualWindowState> {
  read_json(app, MANUAL_STATE_FILENAME).filter(is_valid_state)
}

fn has_valid_automatic_state(app: &AppHandle) -> bool {
  read_json::<HashMap<String, PluginWindowStateMeta>>(app, AUTO_STATE_FILENAME)
    .and_then(|states| states.get("main").cloned())
    .map(|state| {
      state.width >= MIN_WINDOW_WIDTH
        && state.height >= MIN_WINDOW_HEIGHT
        && state.width <= 10000
        && state.height <= 10000
    })
    .unwrap_or(false)
}

fn is_valid_state(state: &ManualWindowState) -> bool {
  state.width >= MIN_WINDOW_WIDTH
    && state.height >= MIN_WINDOW_HEIGHT
    && state.width <= 10000
    && state.height <= 10000
}

fn capture_window_state(window: &WebviewWindow) -> Result<ManualWindowState, String> {
  let size = window.inner_size().map_err(|error| error.to_string())?;
  if size.width < MIN_WINDOW_WIDTH || size.height < MIN_WINDOW_HEIGHT {
    return Err(format!(
      "当前窗口过小（{} x {}），请先调整到至少 {} x {} 再保存。",
      size.width, size.height, MIN_WINDOW_WIDTH, MIN_WINDOW_HEIGHT
    ));
  }
  let position = window.outer_position().map_err(|error| error.to_string())?;
  Ok(ManualWindowState {
    width: size.width,
    height: size.height,
    x: position.x,
    y: position.y,
    maximized: window.is_maximized().map_err(|error| error.to_string())?,
    saved_at: now_millis(),
  })
}

fn state_intersects_monitor(window: &WebviewWindow, state: &ManualWindowState) -> bool {
  let monitors = match window.available_monitors() {
    Ok(value) => value,
    Err(_) => return false,
  };
  monitors.iter().any(|monitor| {
    let monitor_position = monitor.position();
    let monitor_size = monitor.size();
    let left = monitor_position.x;
    let top = monitor_position.y;
    let right = left + monitor_size.width as i32;
    let bottom = top + monitor_size.height as i32;
    let state_right = state.x + state.width as i32;
    let state_bottom = state.y + state.height as i32;
    state.x < right && state_right > left && state.y < bottom && state_bottom > top
  })
}

fn apply_manual_state(window: &WebviewWindow, state: &ManualWindowState) -> Result<(), String> {
  if !is_valid_state(state) {
    return Err("手动保存的窗口大小无效".into());
  }
  let _ = window.unminimize();
  let _ = window.unmaximize();
  window
    .set_size(PhysicalSize {
      width: state.width,
      height: state.height,
    })
    .map_err(|error| error.to_string())?;
  if state_intersects_monitor(window, state) {
    window
      .set_position(PhysicalPosition { x: state.x, y: state.y })
      .map_err(|error| error.to_string())?;
  } else {
    let _ = window.center();
  }
  if state.maximized {
    window.maximize().map_err(|error| error.to_string())?;
  }
  Ok(())
}

fn apply_default_state(window: &WebviewWindow) {
  let _ = window.unminimize();
  let _ = window.unmaximize();
  let _ = window.set_size(PhysicalSize {
    width: DEFAULT_WINDOW_WIDTH,
    height: DEFAULT_WINDOW_HEIGHT,
  });
  let _ = window.center();
}

fn window_has_safe_size(window: &WebviewWindow) -> bool {
  window
    .inner_size()
    .map(|size| size.width >= MIN_WINDOW_WIDTH && size.height >= MIN_WINDOW_HEIGHT)
    .unwrap_or(false)
}

pub fn initialize(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
  let app_handle = app.handle().clone();
  let settings = read_settings(&app_handle);
  app.manage(WindowPersistenceRuntime {
    settings: Mutex::new(settings.clone()),
    startup_source: Mutex::new("default".to_string()),
  });

  let Some(window) = app.get_webview_window("main") else {
    return Ok(());
  };

  let mut startup_source = "default".to_string();
  let mut restored = false;

  if settings.restore_window_state_on_launch {
    if settings.manual_window_state_enabled {
      if let Some(manual_state) = read_manual_state(&app_handle) {
        if apply_manual_state(&window, &manual_state).is_ok() {
          startup_source = "manual".to_string();
          restored = true;
        }
      }
    }

    if !restored
      && settings.save_window_state_on_exit
      && has_valid_automatic_state(&app_handle)
      && window.restore_state(tracked_state_flags()).is_ok()
      && window_has_safe_size(&window)
    {
      startup_source = "automatic".to_string();
      restored = true;
    }
  }

  if !restored {
    apply_default_state(&window);
  }

  let runtime = app.state::<WindowPersistenceRuntime>();
  if let Ok(mut source) = runtime.startup_source.lock() {
    *source = startup_source;
  }

  Ok(())
}

pub fn show_main_window_after_restore(app: &AppHandle) {
  if let Some(window) = app.get_webview_window("main") {
    let _ = window.show();
    let _ = window.set_focus();
  }
}

pub fn save_automatic_state_on_exit(app: &AppHandle) {
  let runtime = app.state::<WindowPersistenceRuntime>();
  let enabled = runtime
    .settings
    .lock()
    .map(|settings| settings.save_window_state_on_exit)
    .unwrap_or(true);
  if enabled {
    let _ = app.save_window_state(tracked_state_flags());
  }
}

#[tauri::command]
pub fn get_window_persistence_settings(
  state: State<'_, WindowPersistenceRuntime>,
) -> WindowPersistenceSettings {
  state
    .settings
    .lock()
    .map(|settings| settings.clone())
    .unwrap_or_default()
}

#[tauri::command]
pub fn set_window_persistence_settings(
  app: AppHandle,
  state: State<'_, WindowPersistenceRuntime>,
  settings: WindowPersistenceSettings,
) -> Result<(), String> {
  write_json(&app, SETTINGS_FILENAME, &settings)?;
  let mut current = state.settings.lock().map_err(|_| "窗口设置锁定失败".to_string())?;
  *current = settings;
  Ok(())
}

#[tauri::command]
pub fn save_manual_main_window_state(
  app: AppHandle,
  window: WebviewWindow,
) -> Result<ManualWindowState, String> {
  if window.label() != "main" {
    return Err("只能保存主窗口状态".into());
  }
  let saved = capture_window_state(&window)?;
  write_json(&app, MANUAL_STATE_FILENAME, &saved)?;
  Ok(saved)
}

#[tauri::command]
pub fn clear_manual_main_window_state(app: AppHandle) -> Result<(), String> {
  let path = app_config_file(&app, MANUAL_STATE_FILENAME)?;
  if path.exists() {
    fs::remove_file(path).map_err(|error| error.to_string())?;
  }
  Ok(())
}

#[tauri::command]
pub fn get_window_persistence_status(
  app: AppHandle,
  state: State<'_, WindowPersistenceRuntime>,
) -> WindowPersistenceStatus {
  let settings = state
    .settings
    .lock()
    .map(|value| value.clone())
    .unwrap_or_default();
  let startup_source = state
    .startup_source
    .lock()
    .map(|value| value.clone())
    .unwrap_or_else(|_| "default".to_string());
  let automatic_state_available = has_valid_automatic_state(&app);
  WindowPersistenceStatus {
    settings,
    manual_state: read_manual_state(&app),
    automatic_state_available,
    startup_source,
  }
}
