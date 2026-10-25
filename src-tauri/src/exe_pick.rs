//! v172「拖动拾取程序」：把光标下窗口所属进程的 exe 路径交回前端。
//!
//! 流程（前端 `src/lib/exePick.ts` 配套）：
//! 1. 用户点「添加EXE」→ 倒计时 3 秒让用户把光标挪到目标程序窗口上；
//! 2. 前端调 `start_exe_pick`：主窗口立刻隐藏，后端每 90ms 探测一次光标下的窗口；
//! 3. 用户点一下左键（或按住拖到目标上再松开）= 确认；Esc = 取消；120 秒自动超时；
//! 4. 结束后主窗口自动恢复，`exe-pick-end` 事件把结果（exe 路径 / 程序名 / 窗口标题）交回前端。
//!
//! 判定沿用 easy-espanso 的「松开即确认」口径（`down_seen && !down`）：先看到按下、再看到松开，
//! 才认这次点击，避免刚隐藏窗口时残留的鼠标状态误判。若调用进来时按钮已经按着（用户正在拖），
//! 那一下的「松开」同样算确认。
//!
//! 只做探测，不注入、不拦截：目标窗口照常收到这次点击，和用户自己点它一样。

use std::sync::{
  atomic::{AtomicBool, Ordering},
  Arc, Mutex,
};
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

/// 轮询间隔：既要跟手，也别让后台线程空转。
const POLL_INTERVAL: Duration = Duration::from_millis(90);
/// 单次拾取上限：用户走神太久就自己收摊，别留一个永远在探测的线程。
const MAX_DURATION: Duration = Duration::from_secs(120);
/// 启动后这段时间内不采信探测结果：主窗口刚隐藏时窗口层级还在变，免得拾到自己。
const STARTUP_GRACE: Duration = Duration::from_millis(700);

/// 一次探测到的目标程序。
#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExePickTarget {
  /// 进程可执行文件的完整路径，例如 `C:\Program Files\Google\Chrome\Application\chrome.exe`。
  pub path: String,
  /// 程序名（exe 文件名去掉扩展名），用作项目标题。
  pub name: String,
  /// 窗口标题，仅用于让用户确认「拾到的是那个窗口」。
  pub title: String,
}

/// 拾取结束事件负载。
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExePickEnd {
  /// `picked` | `cancelled` | `timeout` | `failed`
  pub status: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub target: Option<ExePickTarget>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub message: Option<String>,
}

impl ExePickEnd {
  fn new(status: &str, message: Option<String>) -> Self {
    Self { status: status.to_string(), target: None, message }
  }
}

pub struct ExePickState(Mutex<PickInner>);

struct PickInner {
  /// 每次 start 递增；只有当前代号的线程有权上报结果，被 stop 掉的旧线程结果自动作废。
  generation: u64,
  /// 当前探测线程的停止旗标。
  stop: Option<Arc<AtomicBool>>,
}

impl Default for ExePickState {
  fn default() -> Self {
    Self(Mutex::new(PickInner { generation: 1, stop: None }))
  }
}

/// 开始一次拾取：隐藏主窗口，起一个后台线程探测光标下的窗口。
#[tauri::command]
pub fn start_exe_pick(app: AppHandle, state: State<'_, ExePickState>) -> Result<(), String> {
  let (generation, stop) = {
    let mut inner = state.0.lock().map_err(|_| "拾取状态被占用，请重试".to_string())?;
    if let Some(previous) = inner.stop.take() {
      previous.store(true, Ordering::SeqCst);
    }
    inner.generation = inner.generation.wrapping_add(1);
    let stop = Arc::new(AtomicBool::new(false));
    inner.stop = Some(stop.clone());
    (inner.generation, stop)
  };

  // 先收起自己的窗口：光标底下才可能是用户真正想指的那个程序。
  // 这里刻意不走 hide_main_window（那是「隐藏到托盘」语义，会改 MAIN_HIDDEN_TO_TRAY
  // 与窗口几何记忆），拾取只是一次临时的收放。
  hide_launcher(&app);

  let handle = app.clone();
  std::thread::spawn(move || run_pick(handle, generation, stop));
  Ok(())
}

/// 取消拾取（前端点「取消」、或对话框被关掉时调用）。
#[tauri::command]
pub fn stop_exe_pick(app: AppHandle, state: State<'_, ExePickState>) -> Result<(), String> {
  {
    let mut inner = state.0.lock().map_err(|_| "拾取状态被占用，请重试".to_string())?;
    if let Some(stop) = inner.stop.take() {
      stop.store(true, Ordering::SeqCst);
    }
    inner.generation = inner.generation.wrapping_add(1);
  }
  show_launcher(&app);
  Ok(())
}

fn hide_launcher(app: &AppHandle) {
  if let Some(window) = app.get_webview_window("main") {
    let _ = window.hide();
  }
}

fn show_launcher(app: &AppHandle) {
  if let Some(window) = app.get_webview_window("main") {
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
  }
}

fn run_pick(app: AppHandle, generation: u64, stop: Arc<AtomicBool>) {
  let started = Instant::now();
  let mut down_seen = left_button_down();
  let mut target: Option<ExePickTarget> = None;
  let mut result = ExePickEnd::new("cancelled", Some("已取消拾取".to_string()));

  loop {
    if stop.load(Ordering::SeqCst) {
      break;
    }
    if started.elapsed() > MAX_DURATION {
      result = ExePickEnd::new("timeout", Some("拾取超过 120 秒，已自动结束".to_string()));
      break;
    }

    if started.elapsed() >= STARTUP_GRACE {
      if let Some(found) = target_under_cursor() {
        target = Some(found);
      }
    }

    if escape_down() {
      result = ExePickEnd::new("cancelled", Some("已按 Esc 取消拾取".to_string()));
      break;
    }

    let down = left_button_down();
    if down {
      down_seen = true;
    } else if down_seen {
      match target.clone() {
        Some(found) => {
          result = ExePickEnd { status: "picked".to_string(), target: Some(found), message: None };
          break;
        }
        // 松开时光标不在任何窗口上（桌面 / 任务栏）：这一下不算数，继续等。
        None => down_seen = false,
      }
    }

    std::thread::sleep(POLL_INTERVAL);
  }

  let picked = result.status == "picked";
  if !picked {
    result.target = None;
  }

  show_launcher(&app);
  finish(&app, generation, result);
}

/// 只有当前代号还有权上报（旧线程被 stop 掉之后不该再动前端状态）。
fn finish(app: &AppHandle, generation: u64, payload: ExePickEnd) {
  {
    let state = app.state::<ExePickState>();
    let mut inner = match state.0.lock() {
      Ok(guard) => guard,
      Err(_) => return,
    };
    if inner.generation != generation {
      return;
    }
    inner.stop = None;
  }
  let _ = app.emit("exe-pick-end", &payload);
}

#[cfg(target_os = "windows")]
fn left_button_down() -> bool {
  use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON};
  unsafe { GetAsyncKeyState(VK_LBUTTON as i32) as u16 & 0x8000 != 0 }
}

#[cfg(not(target_os = "windows"))]
fn left_button_down() -> bool {
  false
}

#[cfg(target_os = "windows")]
fn escape_down() -> bool {
  use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_ESCAPE};
  unsafe { GetAsyncKeyState(VK_ESCAPE as i32) as u16 & 0x8000 != 0 }
}

#[cfg(not(target_os = "windows"))]
fn escape_down() -> bool {
  false
}

fn target_under_cursor() -> Option<ExePickTarget> {
  #[cfg(target_os = "windows")]
  {
    windows_target_under_cursor()
  }
  #[cfg(not(target_os = "windows"))]
  {
    None
  }
}

#[cfg(target_os = "windows")]
fn windows_target_under_cursor() -> Option<ExePickTarget> {
  use windows_sys::Win32::Foundation::POINT;
  use windows_sys::Win32::System::Threading::GetCurrentProcessId;
  use windows_sys::Win32::UI::WindowsAndMessaging::{
    GetCursorPos, GetWindowThreadProcessId, IsWindowVisible, WindowFromPoint,
  };

  let mut point = POINT { x: 0, y: 0 };
  if unsafe { GetCursorPos(&mut point) } == 0 {
    return None;
  }
  let hwnd = unsafe { WindowFromPoint(point) };
  if hwnd.is_null() {
    return None;
  }
  if unsafe { IsWindowVisible(hwnd) } == 0 {
    return None;
  }

  let mut process_id = 0u32;
  unsafe { GetWindowThreadProcessId(hwnd, &mut process_id) };
  // 自己不算目标：隐藏主窗口后仍可能有一瞬间落在本进程的窗口上。
  if process_id == 0 || process_id == unsafe { GetCurrentProcessId() } {
    return None;
  }

  let path = crate::commands::process_executable_path(process_id)?;
  let name = std::path::Path::new(&path)
    .file_stem()
    .map(|value| value.to_string_lossy().to_string())
    .filter(|value| !value.is_empty())
    .unwrap_or_else(|| "程序".to_string());
  let title = window_title(hwnd);
  Some(ExePickTarget { path, name, title })
}

#[cfg(target_os = "windows")]
fn window_title(hwnd: windows_sys::Win32::Foundation::HWND) -> String {
  use windows_sys::Win32::UI::WindowsAndMessaging::{GetWindowTextLengthW, GetWindowTextW};

  let length = unsafe { GetWindowTextLengthW(hwnd) };
  if length <= 0 {
    return String::new();
  }
  let mut buffer = vec![0u16; length as usize + 1];
  let written = unsafe { GetWindowTextW(hwnd, buffer.as_mut_ptr(), buffer.len() as i32) };
  if written <= 0 {
    return String::new();
  }
  String::from_utf16_lossy(&buffer[..written as usize]).trim().to_string()
}
