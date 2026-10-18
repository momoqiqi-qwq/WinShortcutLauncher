use serde::Deserialize;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicIsize, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, OnceLock};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

#[cfg(target_os = "windows")]
use windows_sys::Win32::Foundation::{BOOL, HWND, LPARAM, POINT, RECT};
#[cfg(target_os = "windows")]
use windows_sys::Win32::System::Threading::GetCurrentProcessId;
#[cfg(target_os = "windows")]
use windows_sys::Win32::Graphics::Gdi::{GetMonitorInfoW, MonitorFromRect, MONITORINFO, MONITOR_DEFAULTTONEAREST};
#[cfg(target_os = "windows")]
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON};
#[cfg(target_os = "windows")]
use windows_sys::Win32::UI::WindowsAndMessaging::{
  AnimateWindow, EnumWindows, GetCursorPos, GetWindowLongW, GetWindowRect, GetWindowTextW,
  GetWindowThreadProcessId, IsIconic, IsWindow, IsWindowVisible, SetLayeredWindowAttributes,
  SetWindowLongW, SetWindowPos, ShowWindow, AW_BLEND, AW_HIDE, AW_HOR_NEGATIVE, AW_HOR_POSITIVE,
  AW_SLIDE, AW_VER_NEGATIVE, AW_VER_POSITIVE, GWL_EXSTYLE, HWND_TOPMOST, LWA_ALPHA, SW_HIDE,
  SW_SHOWNA, SW_SHOWNOACTIVATE, SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOMOVE,
  SWP_NOOWNERZORDER, SWP_NOSIZE, SWP_NOZORDER, SWP_SHOWWINDOW, WS_EX_APPWINDOW, WS_EX_LAYERED,
  WS_EX_TOOLWINDOW,
};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeEdgeOptions {
  pub enabled: bool,
  pub paused: bool,
  pub hide_delay_ms: u64,
  pub strip_size: i32,
  pub edge_tolerance: i32,
  pub animation_ms: u32,
  #[serde(default = "default_animation_style")]
  pub animation_style: String,
  #[serde(default = "default_true")]
  pub dock_auto_hide: bool,
  #[serde(default)]
  pub ignore_taskbar: bool,
  #[serde(default = "default_auto_edge_hide")]
  pub auto_edge_hide: bool,
  #[serde(default = "default_auto_edge_bounce")]
  pub auto_edge_bounce: bool,
  #[serde(default = "default_auto_edge_snap_back")]
  pub auto_edge_snap_back: bool,
  #[serde(default = "default_auto_edge_snap_back_animation")]
  pub auto_edge_snap_back_animation: bool,
  #[serde(default = "default_auto_edge_snap_back_animation_ms")]
  pub auto_edge_snap_back_animation_ms: u32,
  #[serde(default = "default_auto_edge_hide_delay")]
  pub auto_edge_hide_delay: u64,
  #[serde(default = "default_edge_visible_pixels")]
  pub edge_visible_pixels: i32,
  #[serde(default = "default_ghost_frame_fix")]
  pub ghost_frame_fix: bool,
  #[serde(default = "default_mouse_leave_hide_ms")]
  pub mouse_leave_hide_ms: u32,
  #[serde(default = "default_use_main_window_strip")]
  pub use_main_window_strip: bool,
}

fn default_animation_style() -> String { "animate-window".into() }
fn default_true() -> bool { true }
fn default_auto_edge_hide() -> bool { true }
fn default_auto_edge_bounce() -> bool { true }
fn default_auto_edge_snap_back() -> bool { false }
fn default_auto_edge_snap_back_animation() -> bool { true }
fn default_auto_edge_snap_back_animation_ms() -> u32 { 220 }
fn default_auto_edge_hide_delay() -> u64 { 1000 }
fn default_edge_visible_pixels() -> i32 { 5 }
fn default_ghost_frame_fix() -> bool { true }
fn default_mouse_leave_hide_ms() -> u32 { 90 }
fn default_use_main_window_strip() -> bool { true }

impl Default for NativeEdgeOptions {
  fn default() -> Self {
    Self {
      enabled: false,
      paused: false,
      hide_delay_ms: 0,
      strip_size: 12,
      edge_tolerance: 24,
      animation_ms: 90,
      animation_style: "animate-window".into(),
      dock_auto_hide: true,
      ignore_taskbar: false,
      auto_edge_hide: true,
      auto_edge_bounce: true,
      auto_edge_snap_back: false,
      auto_edge_snap_back_animation: true,
      auto_edge_snap_back_animation_ms: 220,
      auto_edge_hide_delay: 1000,
      edge_visible_pixels: 5,
      ghost_frame_fix: true,
      mouse_leave_hide_ms: 90,
      use_main_window_strip: true,
    }
  }
}

#[cfg(target_os = "windows")]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Edge {
  Left,
  Right,
  Top,
  Bottom,
}

#[cfg(target_os = "windows")]
#[derive(Debug, Clone, Copy)]
struct SimpleRect {
  x: i32,
  y: i32,
  w: i32,
  h: i32,
}

#[cfg(target_os = "windows")]
impl SimpleRect {
  fn right(self) -> i32 { self.x + self.w }
  fn bottom(self) -> i32 { self.y + self.h }
  fn contains(self, x: i32, y: i32) -> bool {
    x >= self.x && x < self.right() && y >= self.y && y < self.bottom()
  }
}

static STARTED: AtomicBool = AtomicBool::new(false);
static FORCE_SHOW: AtomicBool = AtomicBool::new(false);
static ANIMATION_RUNNING: AtomicBool = AtomicBool::new(false);
static NATIVE_SUSPEND_UNTIL_MS: AtomicU64 = AtomicU64::new(0);
static TRAY_HIDDEN: AtomicBool = AtomicBool::new(false);
static EXTERNAL_SHOW_RESET: AtomicBool = AtomicBool::new(false);
static WAKE_REQUIRES_POINTER_VISIT: AtomicBool = AtomicBool::new(false);
static CONFIG_VERSION: AtomicU64 = AtomicU64::new(1);
static SETTINGS: OnceLock<Arc<Mutex<NativeEdgeOptions>>> = OnceLock::new();
// v160: 动画代号与开始时间。旧动画线程结束时只清自己那一代的标志，超时后由主循环兜底复位。
static ANIMATION_GENERATION: AtomicU64 = AtomicU64::new(0);
static ANIMATION_STARTED_MS: AtomicU64 = AtomicU64::new(0);
// v160: Tauri 交给我们的真实窗口句柄（0 表示还不知道，回退到按标题 + 本进程查找）。
static MAIN_HWND: AtomicIsize = AtomicIsize::new(0);
static STRIP_HWND: AtomicIsize = AtomicIsize::new(0);
static LOG_PATH: OnceLock<PathBuf> = OnceLock::new();
static MONO_EPOCH: OnceLock<Instant> = OnceLock::new();

/// 动画超过这个时长仍未结束，视为卡死并强制复位，避免整个贴边状态机永久停摆。
const ANIMATION_STALE_MS: u64 = 3000;
const LOG_MAX_BYTES: u64 = 512 * 1024;

fn settings() -> Arc<Mutex<NativeEdgeOptions>> {
  SETTINGS
    .get_or_init(|| Arc::new(Mutex::new(NativeEdgeOptions::default())))
    .clone()
}

/// 读配置时容忍锁中毒：中毒只说明别处 panic 过，数据本身仍可用。
fn lock_settings(config: &Mutex<NativeEdgeOptions>) -> MutexGuard<'_, NativeEdgeOptions> {
  config.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// 单调时钟毫秒数（进程内）。系统时间被校准/休眠唤醒回拨时不会让挂起计时失效或卡住。
fn mono_millis() -> u64 {
  // 起点往前拨一小时，保证"现在减去某个过去时刻"的比较永远不会因为起点太近而失真。
  MONO_EPOCH
    .get_or_init(|| Instant::now().checked_sub(Duration::from_secs(3600)).unwrap_or_else(Instant::now))
    .elapsed()
    .as_millis() as u64
}

fn native_suspended() -> bool {
  let until = NATIVE_SUSPEND_UNTIL_MS.load(Ordering::SeqCst);
  until > mono_millis()
}

fn utc_timestamp() -> String {
  let ms = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0);
  let secs = ms.div_euclid(1000);
  let days = secs.div_euclid(86_400);
  let sod = secs.rem_euclid(86_400);
  // civil_from_days (Howard Hinnant)
  let z = days + 719_468;
  let era = z.div_euclid(146_097);
  let doe = z - era * 146_097;
  let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
  let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
  let mp = (5 * doy + 2) / 153;
  let d = doy - (153 * mp + 2) / 5 + 1;
  let m = if mp < 10 { mp + 3 } else { mp - 9 };
  let y = yoe + era * 400 + i64::from(m <= 2);
  format!(
    "{y:04}-{m:02}-{d:02} {:02}:{:02}:{:02}.{:03}Z",
    sod / 3600,
    (sod / 60) % 60,
    sod % 60,
    ms.rem_euclid(1000)
  )
}

/// 贴边诊断日志：只记状态切换和异常，不记每一帧。超过上限时轮转为 .old。
fn edge_log(message: &str) {
  use std::io::Write;
  let Some(path) = LOG_PATH.get() else { return; };
  if let Ok(meta) = std::fs::metadata(path) {
    if meta.len() > LOG_MAX_BYTES {
      let _ = std::fs::rename(path, path.with_extension("log.old"));
    }
  }
  if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
    let _ = writeln!(file, "{} {}", utc_timestamp(), message);
  }
}

#[cfg(target_os = "windows")]
struct OwnWindowSearch {
  title: Vec<u16>,
  pid: u32,
  found: HWND,
}

#[cfg(target_os = "windows")]
unsafe extern "system" fn own_window_enum_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
  let search = &mut *(lparam as *mut OwnWindowSearch);
  let mut pid = 0u32;
  GetWindowThreadProcessId(hwnd, &mut pid);
  if pid != search.pid {
    return 1;
  }
  let mut buf = [0u16; 128];
  let len = GetWindowTextW(hwnd, buf.as_mut_ptr(), buf.len() as i32);
  if len > 0 && buf[..len as usize] == search.title[..] {
    search.found = hwnd;
    return 0;
  }
  1
}

/// 只在本进程的顶层窗口里按标题查找。FindWindowW 会匹配任意进程里同名的第一个窗口，
/// 旧版本残留实例、同名资源管理器窗口都可能被误抓，导致状态机操作错窗口。
#[cfg(target_os = "windows")]
fn find_own_window_by_title(title: &str) -> HWND {
  let mut search = OwnWindowSearch {
    title: title.encode_utf16().collect(),
    pid: unsafe { GetCurrentProcessId() },
    found: std::ptr::null_mut(),
  };
  unsafe {
    EnumWindows(Some(own_window_enum_proc), &mut search as *mut OwnWindowSearch as LPARAM);
  }
  search.found
}

#[cfg(target_os = "windows")]
fn window_alive(hwnd: HWND) -> bool {
  !hwnd.is_null() && unsafe { IsWindow(hwnd) } != 0
}

/// 优先用 Tauri 提供的真实句柄；句柄失效或尚未登记时回退到本进程内按标题查找。
#[cfg(target_os = "windows")]
fn resolve_window(stored: &AtomicIsize, title: &str) -> HWND {
  let known = stored.load(Ordering::SeqCst) as HWND;
  if window_alive(known) {
    return known;
  }
  let found = find_own_window_by_title(title);
  if !found.is_null() {
    stored.store(found as isize, Ordering::SeqCst);
  }
  found
}

#[cfg(target_os = "windows")]
fn window_iconic(hwnd: HWND) -> bool {
  !hwnd.is_null() && unsafe { IsIconic(hwnd) } != 0
}

#[cfg(target_os = "windows")]
fn window_visible(hwnd: HWND) -> bool {
  !hwnd.is_null() && unsafe { IsWindowVisible(hwnd) } != 0
}

/// 可以当作"上次正常可见位置"保存的矩形：最小化后的小标题条（约 160x28）等异常尺寸一律拒收，
/// 否则它会污染恢复位置，之后每次"恢复"都恢复成一个小条。
#[cfg(target_os = "windows")]
fn plausible_visible_rect(rect: SimpleRect) -> bool {
  rect.w >= 260 && rect.h >= 180
}

#[cfg(target_os = "windows")]
fn remember_good(slot: &mut Option<SimpleRect>, rect: SimpleRect) {
  if plausible_visible_rect(rect) {
    *slot = Some(rect);
  }
}

/// 窗口在某条边上伸出显示器的像素数。
#[cfg(target_os = "windows")]
fn edge_overflow(edge: Edge, rect: SimpleRect, mon: SimpleRect) -> i32 {
  match edge {
    Edge::Left => mon.x - rect.x,
    Edge::Right => rect.right() - mon.right(),
    Edge::Top => mon.y - rect.y,
    Edge::Bottom => rect.bottom() - mon.bottom(),
  }
}

/// 窗口是否仍处于"藏在这条边外面"的状态：伸出去的部分至少占该方向尺寸的一半。
#[cfg(target_os = "windows")]
fn still_edge_hidden(edge: Edge, rect: SimpleRect, mon: SimpleRect) -> bool {
  let span = match edge {
    Edge::Left | Edge::Right => rect.w,
    Edge::Top | Edge::Bottom => rect.h,
  };
  span > 0 && edge_overflow(edge, rect, mon) * 2 >= span
}

#[cfg(target_os = "windows")]
fn rect_moved(a: SimpleRect, b: SimpleRect, tolerance: i32) -> bool {
  (a.x - b.x).abs() > tolerance
    || (a.y - b.y).abs() > tolerance
    || (a.w - b.w).abs() > tolerance
    || (a.h - b.h).abs() > tolerance
}

#[cfg(target_os = "windows")]
fn rect_from_hwnd(hwnd: HWND) -> Option<SimpleRect> {
  let mut r = RECT { left: 0, top: 0, right: 0, bottom: 0 };
  let ok = unsafe { GetWindowRect(hwnd, &mut r) };
  if ok == 0 { return None; }
  let w = r.right - r.left;
  let h = r.bottom - r.top;
  if w <= 0 || h <= 0 { return None; }
  Some(SimpleRect { x: r.left, y: r.top, w, h })
}

#[cfg(target_os = "windows")]
fn cursor_pos() -> Option<(i32, i32)> {
  let mut p = POINT { x: 0, y: 0 };
  let ok = unsafe { GetCursorPos(&mut p) };
  if ok == 0 { None } else { Some((p.x, p.y)) }
}

#[cfg(target_os = "windows")]
fn monitor_rect_near(rect: SimpleRect) -> SimpleRect {
  let win_rect = RECT { left: rect.x, top: rect.y, right: rect.right(), bottom: rect.bottom() };
  let hmon = unsafe { MonitorFromRect(&win_rect, MONITOR_DEFAULTTONEAREST) };
  if !hmon.is_null() {
    let mut mi = MONITORINFO {
      cbSize: std::mem::size_of::<MONITORINFO>() as u32,
      rcMonitor: RECT { left: 0, top: 0, right: 0, bottom: 0 },
      rcWork: RECT { left: 0, top: 0, right: 0, bottom: 0 },
      dwFlags: 0,
    };
    let ok = unsafe { GetMonitorInfoW(hmon, &mut mi) };
    if ok != 0 {
      return SimpleRect {
        x: mi.rcWork.left,
        y: mi.rcWork.top,
        w: mi.rcWork.right - mi.rcWork.left,
        h: mi.rcWork.bottom - mi.rcWork.top,
      };
    }
  }
  SimpleRect { x: 0, y: 0, w: 1920, h: 1080 }
}

#[cfg(target_os = "windows")]
fn monitor_full_rect_near(rect: SimpleRect) -> SimpleRect {
  let win_rect = RECT { left: rect.x, top: rect.y, right: rect.right(), bottom: rect.bottom() };
  let hmon = unsafe { MonitorFromRect(&win_rect, MONITOR_DEFAULTTONEAREST) };
  if !hmon.is_null() {
    let mut mi = MONITORINFO {
      cbSize: std::mem::size_of::<MONITORINFO>() as u32,
      rcMonitor: RECT { left: 0, top: 0, right: 0, bottom: 0 },
      rcWork: RECT { left: 0, top: 0, right: 0, bottom: 0 },
      dwFlags: 0,
    };
    let ok = unsafe { GetMonitorInfoW(hmon, &mut mi) };
    if ok != 0 {
      return SimpleRect {
        x: mi.rcMonitor.left,
        y: mi.rcMonitor.top,
        w: mi.rcMonitor.right - mi.rcMonitor.left,
        h: mi.rcMonitor.bottom - mi.rcMonitor.top,
      };
    }
  }
  SimpleRect { x: 0, y: 0, w: 1920, h: 1080 }
}

#[cfg(target_os = "windows")]
fn edge_detection_monitor_rect(rect: SimpleRect, ignore_taskbar: bool) -> SimpleRect {
  if ignore_taskbar { monitor_full_rect_near(rect) } else { monitor_rect_near(rect) }
}

#[cfg(target_os = "windows")]
fn hide_monitor_rect_for(edge: Edge, rect: SimpleRect, work_mon: SimpleRect) -> SimpleRect {
  // Bottom edge is the only direction where the taskbar/work-area boundary can leave
  // a thick visible band above the taskbar. Use the physical monitor bottom for the
  // hidden target while keeping normal restore/edge detection on the work area.
  if edge == Edge::Bottom {
    monitor_full_rect_near(rect)
  } else {
    work_mon
  }
}

#[cfg(target_os = "windows")]
fn detect_edge(rect: SimpleRect, mon: SimpleRect, tolerance: i32) -> Option<Edge> {
  if (rect.x - mon.x).abs() <= tolerance { return Some(Edge::Left); }
  if (rect.right() - mon.right()).abs() <= tolerance { return Some(Edge::Right); }
  if (rect.y - mon.y).abs() <= tolerance { return Some(Edge::Top); }
  if (rect.bottom() - mon.bottom()).abs() <= tolerance { return Some(Edge::Bottom); }
  None
}

#[cfg(target_os = "windows")]
fn strip_rect_for(edge: Edge, rect: SimpleRect, mon: SimpleRect, strip_size: i32) -> SimpleRect {
  let strip = strip_size.clamp(4, 32);
  let x = clamp_i32(rect.x, mon.x, mon.right() - rect.w);
  let y = clamp_i32(rect.y, mon.y, mon.bottom() - rect.h);
  match edge {
    Edge::Left => SimpleRect { x: mon.x, y, w: strip, h: rect.h.max(80) },
    Edge::Right => SimpleRect { x: mon.right() - strip, y, w: strip, h: rect.h.max(80) },
    Edge::Top => SimpleRect { x, y: mon.y, w: rect.w.max(120), h: strip },
    Edge::Bottom => SimpleRect { x, y: mon.bottom() - strip, w: rect.w.max(120), h: strip },
  }
}

#[cfg(target_os = "windows")]
fn detect_overflow_edge(rect: SimpleRect, mon: SimpleRect, threshold: i32) -> Option<Edge> {
  let candidates = [
    (Edge::Left, mon.x - rect.x),
    (Edge::Right, rect.right() - mon.right()),
    (Edge::Top, mon.y - rect.y),
    (Edge::Bottom, rect.bottom() - mon.bottom()),
  ];
  candidates
    .into_iter()
    .filter(|(_, overflow)| *overflow > threshold)
    .max_by_key(|(_, overflow)| *overflow)
    .map(|(edge, _)| edge)
}

#[cfg(target_os = "windows")]
fn clamp_i32(value: i32, min: i32, max: i32) -> i32 {
  if max < min { min } else { value.clamp(min, max) }
}

#[cfg(target_os = "windows")]
fn restore_rect_for(edge: Edge, rect: SimpleRect, mon: SimpleRect) -> SimpleRect {
  let x_inside = if rect.w >= mon.w { mon.x } else { clamp_i32(rect.x, mon.x, mon.right() - rect.w) };
  let y_inside = if rect.h >= mon.h { mon.y } else { clamp_i32(rect.y, mon.y, mon.bottom() - rect.h) };
  match edge {
    Edge::Left => SimpleRect { x: mon.x, y: y_inside, ..rect },
    Edge::Right => SimpleRect { x: if rect.w >= mon.w { mon.x } else { mon.right() - rect.w }, y: y_inside, ..rect },
    Edge::Top => SimpleRect { x: x_inside, y: mon.y, ..rect },
    Edge::Bottom => SimpleRect { x: x_inside, y: if rect.h >= mon.h { mon.y } else { mon.bottom() - rect.h }, ..rect },
  }
}

#[cfg(target_os = "windows")]
fn auto_hidden_rect_for(edge: Edge, restore_rect: SimpleRect, mon: SimpleRect, visible_pixels: i32) -> SimpleRect {
  let visible = visible_pixels.clamp(2, 48);
  match edge {
    Edge::Left => SimpleRect { x: mon.x - restore_rect.w + visible, ..restore_rect },
    Edge::Right => SimpleRect { x: mon.right() - visible, ..restore_rect },
    Edge::Top => SimpleRect { y: mon.y - restore_rect.h + visible, ..restore_rect },
    Edge::Bottom => SimpleRect { y: mon.bottom() - visible, ..restore_rect },
  }
}

#[cfg(target_os = "windows")]
fn auto_visible_rect_for(edge: Edge, hidden_rect: SimpleRect, mon: SimpleRect, visible_pixels: i32) -> SimpleRect {
  let visible = visible_pixels.clamp(2, 48);
  match edge {
    Edge::Left => SimpleRect { x: mon.x, y: hidden_rect.y, w: visible, h: hidden_rect.h },
    Edge::Right => SimpleRect { x: mon.right() - visible, y: hidden_rect.y, w: visible, h: hidden_rect.h },
    Edge::Top => SimpleRect { x: hidden_rect.x, y: mon.y, w: hidden_rect.w, h: visible },
    Edge::Bottom => SimpleRect { x: hidden_rect.x, y: mon.bottom() - visible, w: hidden_rect.w, h: visible },
  }
}

#[cfg(target_os = "windows")]
fn start_position_slide(hwnd: HWND, from: SimpleRect, to: SimpleRect, ms: u32) -> bool {
  let hwnd_raw = hwnd as isize;
  start_animation(move || {
    let hwnd = hwnd_raw as HWND;
    setwindowpos_slide(hwnd, from, to, ms, false);
  })
}

#[cfg(target_os = "windows")]
fn start_snap_back_slide(hwnd: HWND, from: SimpleRect, to: SimpleRect, ms: u32) -> bool {
  let hwnd_raw = hwnd as isize;
  start_animation(move || {
    let hwnd = hwnd_raw as HWND;
    setwindowpos_slide_with_easing(hwnd, from, to, ms, false, SlideEasing::Back);
  })
}


#[cfg(target_os = "windows")]
fn is_left_button_down() -> bool {
  unsafe { (GetAsyncKeyState(VK_LBUTTON as i32) as u16 & 0x8000) != 0 }
}

#[cfg(target_os = "windows")]
fn aw_hide_flag(edge: Edge) -> u32 {
  match edge {
    Edge::Left => AW_SLIDE | AW_HIDE | AW_HOR_NEGATIVE,
    Edge::Right => AW_SLIDE | AW_HIDE | AW_HOR_POSITIVE,
    Edge::Top => AW_SLIDE | AW_HIDE | AW_VER_NEGATIVE,
    Edge::Bottom => AW_SLIDE | AW_HIDE | AW_VER_POSITIVE,
  }
}

#[cfg(target_os = "windows")]
fn aw_show_flag(edge: Edge) -> u32 {
  match edge {
    Edge::Left => AW_SLIDE | AW_HOR_POSITIVE,
    Edge::Right => AW_SLIDE | AW_HOR_NEGATIVE,
    Edge::Top => AW_SLIDE | AW_VER_POSITIVE,
    Edge::Bottom => AW_SLIDE | AW_VER_NEGATIVE,
  }
}

#[cfg(target_os = "windows")]
fn keep_out_of_taskbar(hwnd: HWND) {
  if hwnd.is_null() { return; }
  unsafe {
    let style = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
    let next = (style | WS_EX_TOOLWINDOW) & !WS_EX_APPWINDOW;
    if next != style {
      SetWindowLongW(hwnd, GWL_EXSTYLE, next as i32);
      SetWindowPos(
        hwnd,
        std::ptr::null_mut(),
        0,
        0,
        0,
        0,
        SWP_FRAMECHANGED | SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE,
      );
    }
  }
}

fn move_window(hwnd: HWND, rect: SimpleRect, topmost: bool, show: bool) {
  let z = if topmost { HWND_TOPMOST } else { std::ptr::null_mut() };
  let mut flags = SWP_NOACTIVATE | SWP_NOOWNERZORDER;
  if !topmost { flags |= SWP_NOZORDER; }
  if show { flags |= SWP_SHOWWINDOW; }
  unsafe {
    SetWindowPos(hwnd, z, rect.x, rect.y, rect.w.max(4), rect.h.max(4), flags);
  }
}

#[cfg(target_os = "windows")]
fn show_strip(strip: HWND, rect: SimpleRect) {
  if strip.is_null() { return; }
  move_window(strip, rect, true, true);
  unsafe { ShowWindow(strip, SW_SHOWNA); }
}

#[cfg(target_os = "windows")]
fn hide_strip(strip: HWND) {
  if strip.is_null() { return; }
  unsafe { ShowWindow(strip, SW_HIDE); }
}

#[cfg(target_os = "windows")]
fn offscreen_rect_for(edge: Edge, rect: SimpleRect) -> SimpleRect {
  match edge {
    Edge::Left => SimpleRect { x: rect.x - rect.w, ..rect },
    Edge::Right => SimpleRect { x: rect.x + rect.w, ..rect },
    Edge::Top => SimpleRect { y: rect.y - rect.h, ..rect },
    Edge::Bottom => SimpleRect { y: rect.y + rect.h, ..rect },
  }
}

#[cfg(target_os = "windows")]
fn force_hide_and_park(hwnd: HWND, edge: Edge, rect: SimpleRect, ghost_frame_fix: bool) {
  unsafe {
    ShowWindow(hwnd, SW_HIDE);
    // Reset alpha in case the previous animation used AW_BLEND / layered alpha.
    SetLayeredWindowAttributes(hwnd, 0, 255, LWA_ALPHA);
  }

  if ghost_frame_fix {
    // Some transparent WebView windows can leave a small DWM/AnimateWindow frame at the
    // last visible position.  Parking the hidden native window fully outside the edge
    // keeps the saved restore rect intact while forcing Windows to stop painting it.
    let parked = offscreen_rect_for(edge, rect);
    move_window(hwnd, parked, false, false);
  }
}

#[cfg(target_os = "windows")]
#[derive(Debug, Clone, Copy)]
enum SlideEasing {
  Linear,
  Cubic,
  Quint,
  Back,
}

#[cfg(target_os = "windows")]
fn ease_out_cubic(t: f64) -> f64 {
  1.0 - (1.0 - t).powi(3)
}

#[cfg(target_os = "windows")]
fn ease_out_quint(t: f64) -> f64 {
  1.0 - (1.0 - t).powi(5)
}

#[cfg(target_os = "windows")]
fn ease_out_back(t: f64) -> f64 {
  let c1 = 1.70158;
  let c3 = c1 + 1.0;
  1.0 + c3 * (t - 1.0).powi(3) + c1 * (t - 1.0).powi(2)
}

#[cfg(target_os = "windows")]
fn easing_progress(easing: SlideEasing, t: f64) -> f64 {
  match easing {
    SlideEasing::Linear => t,
    SlideEasing::Cubic => ease_out_cubic(t),
    SlideEasing::Quint => ease_out_quint(t),
    SlideEasing::Back => ease_out_back(t),
  }
}

#[cfg(target_os = "windows")]
fn lerp_i32(a: i32, b: i32, t: f64) -> i32 {
  (a as f64 + (b - a) as f64 * t).round() as i32
}

#[cfg(target_os = "windows")]
fn setwindowpos_slide_with_easing(hwnd: HWND, from: SimpleRect, to: SimpleRect, ms: u32, hide_at_end: bool, easing: SlideEasing) {
  let ms = ms.clamp(0, 320);
  if ms <= 10 {
    move_window(hwnd, to, true, !hide_at_end);
    unsafe { ShowWindow(hwnd, if hide_at_end { SW_HIDE } else { SW_SHOWNA }); }
    return;
  }

  let frames = ((ms as f64 / 7.0).ceil() as u32).clamp(1, 96);
  unsafe { ShowWindow(hwnd, SW_SHOWNA); }
  for frame in 0..=frames {
    let t = frame as f64 / frames as f64;
    let progress = easing_progress(easing, t);
    let current = SimpleRect {
      x: lerp_i32(from.x, to.x, progress),
      y: lerp_i32(from.y, to.y, progress),
      w: lerp_i32(from.w, to.w, progress).max(4),
      h: lerp_i32(from.h, to.h, progress).max(4),
    };
    move_window(hwnd, current, true, true);
    if frame < frames {
      thread::sleep(Duration::from_millis(7));
    }
  }
  if hide_at_end {
    unsafe { ShowWindow(hwnd, SW_HIDE); }
  } else {
    move_window(hwnd, to, true, true);
    unsafe { ShowWindow(hwnd, SW_SHOWNA); }
  }
}

#[cfg(target_os = "windows")]
fn setwindowpos_slide(hwnd: HWND, from: SimpleRect, to: SimpleRect, ms: u32, hide_at_end: bool) {
  setwindowpos_slide_with_easing(hwnd, from, to, ms, hide_at_end, SlideEasing::Quint)
}

#[cfg(target_os = "windows")]
fn fade_slide(hwnd: HWND, from: SimpleRect, to: SimpleRect, ms: u32, hide_at_end: bool, easing: SlideEasing) {
  let ms = ms.clamp(0, 320);
  if ms <= 10 {
    move_window(hwnd, to, true, !hide_at_end);
    unsafe {
      ShowWindow(hwnd, if hide_at_end { SW_HIDE } else { SW_SHOWNA });
      SetLayeredWindowAttributes(hwnd, 0, 255, LWA_ALPHA);
    }
    return;
  }

  ensure_layered(hwnd);
  let frames = ((ms as f64 / 7.0).ceil() as u32).clamp(1, 96);
  unsafe { ShowWindow(hwnd, SW_SHOWNA); }
  for frame in 0..=frames {
    let t = frame as f64 / frames as f64;
    let progress = easing_progress(easing, t);
    let alpha_progress = if hide_at_end { 1.0 - t } else { t };
    let alpha = (alpha_progress.clamp(0.0, 1.0) * 255.0).round() as u8;
    let current = SimpleRect {
      x: lerp_i32(from.x, to.x, progress),
      y: lerp_i32(from.y, to.y, progress),
      w: lerp_i32(from.w, to.w, progress).max(4),
      h: lerp_i32(from.h, to.h, progress).max(4),
    };
    unsafe { SetLayeredWindowAttributes(hwnd, 0, alpha, LWA_ALPHA); }
    move_window(hwnd, current, true, true);
    if frame < frames {
      thread::sleep(Duration::from_millis(7));
    }
  }
  unsafe { SetLayeredWindowAttributes(hwnd, 0, 255, LWA_ALPHA); }
  if hide_at_end {
    unsafe { ShowWindow(hwnd, SW_HIDE); }
  } else {
    move_window(hwnd, to, true, true);
    unsafe { ShowWindow(hwnd, SW_SHOWNA); }
  }
}

#[cfg(target_os = "windows")]
fn ensure_layered(hwnd: HWND) {
  unsafe {
    let style = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
    if style & WS_EX_LAYERED == 0 {
      SetWindowLongW(hwnd, GWL_EXSTYLE, (style | WS_EX_LAYERED) as i32);
    }
    SetLayeredWindowAttributes(hwnd, 0, 255, LWA_ALPHA);
  }
}

#[cfg(target_os = "windows")]
fn normalize_animation_style(style: &str) -> &str {
  match style {
    "setwindowpos"
    | "setwindowpos-linear"
    | "setwindowpos-cubic"
    | "setwindowpos-back"
    | "fade-slide"
    | "fade"
    | "instant" => style,
    _ => "animate-window",
  }
}

#[cfg(target_os = "windows")]
fn animate_hide_impl(hwnd: HWND, edge: Edge, rect: SimpleRect, ms: u32, style: &str, ghost_frame_fix: bool) {
  let ms = ms.clamp(0, 260);
  match normalize_animation_style(style) {
    "instant" => unsafe {
      ShowWindow(hwnd, SW_HIDE);
    },
    "setwindowpos" => {
      let target = offscreen_rect_for(edge, rect);
      setwindowpos_slide_with_easing(hwnd, rect, target, ms, true, SlideEasing::Quint);
    }
    "setwindowpos-linear" => {
      let target = offscreen_rect_for(edge, rect);
      setwindowpos_slide_with_easing(hwnd, rect, target, ms, true, SlideEasing::Linear);
    }
    "setwindowpos-cubic" => {
      let target = offscreen_rect_for(edge, rect);
      setwindowpos_slide_with_easing(hwnd, rect, target, ms, true, SlideEasing::Cubic);
    }
    "setwindowpos-back" => {
      let target = offscreen_rect_for(edge, rect);
      setwindowpos_slide_with_easing(hwnd, rect, target, ms, true, SlideEasing::Back);
    }
    "fade-slide" => {
      let target = offscreen_rect_for(edge, rect);
      fade_slide(hwnd, rect, target, ms, true, SlideEasing::Cubic);
    }
    "fade" => unsafe {
      ensure_layered(hwnd);
      if ms <= 10 {
        ShowWindow(hwnd, SW_HIDE);
      } else {
        AnimateWindow(hwnd, ms, AW_HIDE | AW_BLEND);
        ShowWindow(hwnd, SW_HIDE);
      }
      SetLayeredWindowAttributes(hwnd, 0, 255, LWA_ALPHA);
    },
    _ => unsafe {
      // AnimateWindow 只能由窗口所属线程调用；这里在动画线程上调用会直接失败（返回 0）。
      // 失败时必须兜底隐藏，否则窗口留在原地、状态机却以为已隐藏。
      if ms <= 10 || AnimateWindow(hwnd, ms, aw_hide_flag(edge)) == 0 {
        ShowWindow(hwnd, SW_HIDE);
      }
    },
  }
  if ghost_frame_fix {
    force_hide_and_park(hwnd, edge, rect, true);
  }
}

#[cfg(target_os = "windows")]
fn animate_show_impl(hwnd: HWND, edge: Edge, rect: SimpleRect, ms: u32, style: &str) {
  let ms = ms.clamp(0, 260);
  match normalize_animation_style(style) {
    "instant" => {
      move_window(hwnd, rect, true, false);
      unsafe { ShowWindow(hwnd, SW_SHOWNA); }
    }
    "setwindowpos" => {
      let start = offscreen_rect_for(edge, rect);
      move_window(hwnd, start, true, false);
      unsafe { ShowWindow(hwnd, SW_SHOWNA); }
      setwindowpos_slide_with_easing(hwnd, start, rect, ms, false, SlideEasing::Quint);
    }
    "setwindowpos-linear" => {
      let start = offscreen_rect_for(edge, rect);
      move_window(hwnd, start, true, false);
      unsafe { ShowWindow(hwnd, SW_SHOWNA); }
      setwindowpos_slide_with_easing(hwnd, start, rect, ms, false, SlideEasing::Linear);
    }
    "setwindowpos-cubic" => {
      let start = offscreen_rect_for(edge, rect);
      move_window(hwnd, start, true, false);
      unsafe { ShowWindow(hwnd, SW_SHOWNA); }
      setwindowpos_slide_with_easing(hwnd, start, rect, ms, false, SlideEasing::Cubic);
    }
    "setwindowpos-back" => {
      let start = offscreen_rect_for(edge, rect);
      move_window(hwnd, start, true, false);
      unsafe { ShowWindow(hwnd, SW_SHOWNA); }
      setwindowpos_slide_with_easing(hwnd, start, rect, ms, false, SlideEasing::Back);
    }
    "fade-slide" => {
      let start = offscreen_rect_for(edge, rect);
      move_window(hwnd, start, true, false);
      unsafe { ShowWindow(hwnd, SW_SHOWNA); }
      fade_slide(hwnd, start, rect, ms, false, SlideEasing::Cubic);
    }
    "fade" => unsafe {
      move_window(hwnd, rect, true, false);
      ensure_layered(hwnd);
      if ms <= 10 {
        ShowWindow(hwnd, SW_SHOWNA);
      } else {
        AnimateWindow(hwnd, ms, AW_BLEND);
        ShowWindow(hwnd, SW_SHOWNA);
      }
      move_window(hwnd, rect, true, true);
      SetLayeredWindowAttributes(hwnd, 0, 255, LWA_ALPHA);
    },
    _ => {
      move_window(hwnd, rect, true, false);
      unsafe {
        // 同上：跨线程 AnimateWindow 失败时兜底显示，避免"从触发条出不来"。
        if ms <= 10 || AnimateWindow(hwnd, ms, aw_show_flag(edge)) == 0 {
          ShowWindow(hwnd, SW_SHOWNA);
        }
      }
    }
  }
}

/// 动画结束（包括 panic 展开）时清除"动画进行中"标志。只清自己这一代，
/// 这样一个被判定为超时、后来才返回的旧动画线程不会误清新动画的标志。
#[cfg(target_os = "windows")]
struct AnimationGuard {
  generation: u64,
}

#[cfg(target_os = "windows")]
impl Drop for AnimationGuard {
  fn drop(&mut self) {
    if ANIMATION_GENERATION.load(Ordering::SeqCst) == self.generation {
      ANIMATION_RUNNING.store(false, Ordering::SeqCst);
    }
  }
}

#[cfg(target_os = "windows")]
fn animation_busy() -> bool {
  if !ANIMATION_RUNNING.load(Ordering::SeqCst) {
    return false;
  }
  let started = ANIMATION_STARTED_MS.load(Ordering::SeqCst);
  if mono_millis().saturating_sub(started) > ANIMATION_STALE_MS {
    // 动画线程卡在跨线程 SetWindowPos 等调用里迟迟不返回：放弃等待，让状态机继续工作。
    ANIMATION_GENERATION.fetch_add(1, Ordering::SeqCst);
    ANIMATION_RUNNING.store(false, Ordering::SeqCst);
    edge_log("animation exceeded watchdog limit; flag force-reset");
    return false;
  }
  true
}

#[cfg(target_os = "windows")]
fn start_animation<F>(task: F) -> bool
where
  F: FnOnce() + Send + 'static,
{
  if animation_busy() || ANIMATION_RUNNING.swap(true, Ordering::SeqCst) {
    return false;
  }
  let generation = ANIMATION_GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
  ANIMATION_STARTED_MS.store(mono_millis(), Ordering::SeqCst);
  let result = thread::Builder::new()
    .name("native-edge-animation".into())
    .spawn(move || {
      let _guard = AnimationGuard { generation };
      task();
    });
  if result.is_err() {
    if ANIMATION_GENERATION.load(Ordering::SeqCst) == generation {
      ANIMATION_RUNNING.store(false, Ordering::SeqCst);
    }
    return false;
  }
  true
}

#[cfg(target_os = "windows")]
fn animate_hide(hwnd: HWND, edge: Edge, rect: SimpleRect, ms: u32, style: &str, ghost_frame_fix: bool) {
  if normalize_animation_style(style) == "instant" {
    animate_hide_impl(hwnd, edge, rect, ms, style, ghost_frame_fix);
    return;
  }
  let hwnd_raw = hwnd as isize;
  let style = normalize_animation_style(style).to_string();
  let _ = start_animation(move || {
    let hwnd = hwnd_raw as HWND;
    animate_hide_impl(hwnd, edge, rect, ms, &style, ghost_frame_fix);
  });
}

#[cfg(target_os = "windows")]
fn animate_show(hwnd: HWND, edge: Edge, rect: SimpleRect, ms: u32, style: &str) {
  if normalize_animation_style(style) == "instant" {
    animate_show_impl(hwnd, edge, rect, ms, style);
    return;
  }
  let hwnd_raw = hwnd as isize;
  let style = normalize_animation_style(style).to_string();
  let _ = start_animation(move || {
    let hwnd = hwnd_raw as HWND;
    animate_show_impl(hwnd, edge, rect, ms, &style);
  });
}

#[cfg(target_os = "windows")]
fn native_loop(config: Arc<Mutex<NativeEdgeOptions>>) {
  const AUTO_EDGE_THRESHOLD: i32 = 20;
  const AUTO_BOUNCE_MS: u32 = 420;

  #[derive(Debug)]
  enum Mode {
    Visible,
    Hidden { edge: Edge, main_rect: SimpleRect, strip_rect: SimpleRect, must_exit_strip: bool },
    OpenedByStrip { edge: Edge, main_rect: SimpleRect, shown_at: Instant, entered_main: bool },
    AutoHidden { edge: Edge, restore_rect: SimpleRect, hidden_rect: SimpleRect, visible_rect: SimpleRect, must_exit_visible: bool },
  }

  impl Mode {
    fn tag(&self) -> &'static str {
      match self {
        Mode::Visible => "Visible",
        Mode::Hidden { .. } => "Hidden",
        Mode::OpenedByStrip { .. } => "OpenedByStrip",
        Mode::AutoHidden { .. } => "AutoHidden",
      }
    }
  }

  let mut mode = Mode::Visible;
  let mut last_edge: Option<Edge> = None;
  let mut dock_since: Option<Instant> = None;
  let mut auto_overflow_edge: Option<Edge> = None;
  let mut auto_overflow_since: Option<Instant> = None;
  let mut cached_main: HWND = std::ptr::null_mut();
  let mut cached_strip: HWND = std::ptr::null_mut();
  let mut last_lookup = Instant::now() - Duration::from_secs(10);
  let mut last_config_version = CONFIG_VERSION.load(Ordering::SeqCst);
  let mut last_good_visible_rect: Option<SimpleRect> = None;
  let mut reveal_hold_until: Option<Instant> = None;
  let mut reveal_requires_cursor_exit = false;
  let mut wake_requires_pointer_visit = false;
  let mut last_mode_tag = mode.tag();
  let mut last_redock: Option<Instant> = None;

  loop {
    let cfg = lock_settings(&config).clone();

    let lookup_due = last_lookup.elapsed() > Duration::from_millis(700)
      || (!window_alive(cached_main) && last_lookup.elapsed() > Duration::from_millis(50));
    if lookup_due {
      let main = resolve_window(&MAIN_HWND, "Yue launcher");
      let strip = resolve_window(&STRIP_HWND, "edge-strip");
      if main != cached_main || strip != cached_strip {
        edge_log(&format!("window handles main={:?} strip={:?}", main, strip));
      }
      cached_main = main;
      cached_strip = strip;
      if !cached_main.is_null() { keep_out_of_taskbar(cached_main); }
      last_lookup = Instant::now();
    }

    let tag = mode.tag();
    if tag != last_mode_tag {
      edge_log(&format!("mode {last_mode_tag} -> {tag}"));
      last_mode_tag = tag;
    }

    // When the app is explicitly hidden to the system tray, edge docking must stay dormant.
    // This prevents the strip/edge state machine from re-showing or parking the main window.
    if TRAY_HIDDEN.load(Ordering::SeqCst) {
      if !cached_strip.is_null() { hide_strip(cached_strip); }
      mode = Mode::Visible;
      dock_since = None;
      last_edge = None;
      auto_overflow_edge = None;
      auto_overflow_since = None;
      reveal_hold_until = None;
      reveal_requires_cursor_exit = false;
      wake_requires_pointer_visit = false;
      WAKE_REQUIRES_POINTER_VISIT.store(false, Ordering::SeqCst);
      thread::sleep(Duration::from_millis(80));
      continue;
    }

    if WAKE_REQUIRES_POINTER_VISIT.swap(false, Ordering::SeqCst) {
      wake_requires_pointer_visit = true;
    }

    // A tray restore owns the window geometry. Clear any stale edge-hidden restore rect before
    // the regular suspended/force-show paths can act on it.
    if EXTERNAL_SHOW_RESET.swap(false, Ordering::SeqCst) {
      if !cached_strip.is_null() { hide_strip(cached_strip); }
      mode = Mode::Visible;
      dock_since = None;
      last_edge = None;
      auto_overflow_edge = None;
      auto_overflow_since = None;
      reveal_hold_until = None;
      reveal_requires_cursor_exit = false;
      wake_requires_pointer_visit = true;
    }

    if native_suspended() && !cached_main.is_null() {
      if !cached_strip.is_null() { hide_strip(cached_strip); }
      if !animation_busy() {
        match mode {
          Mode::Hidden { main_rect, .. } => {
            move_window(cached_main, main_rect, true, true);
            unsafe { ShowWindow(cached_main, SW_SHOWNA); }
            remember_good(&mut last_good_visible_rect, main_rect);
          }
          Mode::AutoHidden { restore_rect, .. } => {
            move_window(cached_main, restore_rect, true, true);
            unsafe { ShowWindow(cached_main, SW_SHOWNA); }
            remember_good(&mut last_good_visible_rect, restore_rect);
          }
          _ => {
            unsafe { ShowWindow(cached_main, SW_SHOWNA); }
          }
        }
        mode = Mode::Visible;
        dock_since = None;
        last_edge = None;
        auto_overflow_edge = None;
        auto_overflow_since = None;
        reveal_hold_until = None;
        reveal_requires_cursor_exit = false;
      }
      if wake_requires_pointer_visit {
        if let (Some(rect), Some((cx, cy))) = (rect_from_hwnd(cached_main), cursor_pos()) {
          if rect.contains(cx, cy) {
            wake_requires_pointer_visit = false;
          }
        }
      }
      thread::sleep(Duration::from_millis(24));
      continue;
    }

    // 主窗口条模式不需要独立的 edge-strip 窗口；它缺失时不应让整个贴边功能停摆。
    let strip_missing = cached_strip.is_null() && !cfg.use_main_window_strip;
    if !cfg.enabled || cfg.paused || cached_main.is_null() || strip_missing {
      if !cached_strip.is_null() { hide_strip(cached_strip); }
      match mode {
        Mode::Hidden { main_rect, .. } if !cached_main.is_null() => {
          move_window(cached_main, main_rect, true, true);
          unsafe { ShowWindow(cached_main, SW_SHOWNA); }
          remember_good(&mut last_good_visible_rect, main_rect);
        }
        Mode::AutoHidden { restore_rect, .. } if !cached_main.is_null() => {
          move_window(cached_main, restore_rect, true, true);
          unsafe { ShowWindow(cached_main, SW_SHOWNA); }
          remember_good(&mut last_good_visible_rect, restore_rect);
        }
        _ => {}
      }
      mode = Mode::Visible;
      dock_since = None;
      last_edge = None;
      auto_overflow_edge = None;
      auto_overflow_since = None;
      reveal_hold_until = None;
      reveal_requires_cursor_exit = false;
      thread::sleep(Duration::from_millis(80));
      continue;
    }

    // v160: 最小化（Win+D / Win+M / 显示桌面 / 最小化按钮）时 GetWindowRect 返回的是工作区左下角
    // 约 160x28 的小标题条，SetWindowPos 和 SW_SHOWNA 也都无法把窗口还原。旧逻辑把这个小条当成
    // 真实位置，于是"出不来、不再隐藏、越界不回弹"。最小化期间绝不读取/保存它的几何信息。
    if window_iconic(cached_main) {
      if animation_busy() {
        thread::sleep(Duration::from_millis(16));
        continue;
      }
      let docked = !matches!(mode, Mode::Visible);
      let fighting = last_redock.is_some_and(|t| t.elapsed() < Duration::from_millis(1500));
      if docked && !fighting {
        // 已经贴边时"最小化"没有意义：不激活地还原，放回贴边隐藏状态。
        last_redock = Some(Instant::now());
        let cursor = cursor_pos();
        unsafe { ShowWindow(cached_main, SW_SHOWNOACTIVATE); }
        match mode {
          Mode::AutoHidden { edge, restore_rect, hidden_rect, visible_rect, .. } => {
            move_window(cached_main, hidden_rect, true, true);
            let inside = cursor.is_some_and(|(x, y)| visible_rect.contains(x, y));
            mode = Mode::AutoHidden { edge, restore_rect, hidden_rect, visible_rect, must_exit_visible: inside || edge == Edge::Bottom };
          }
          Mode::Hidden { edge, main_rect, strip_rect, .. } => {
            force_hide_and_park(cached_main, edge, main_rect, cfg.ghost_frame_fix);
            unsafe { ShowWindow(cached_main, SW_HIDE); }
            if !cached_strip.is_null() { show_strip(cached_strip, strip_rect); }
            let inside = cursor.is_some_and(|(x, y)| strip_rect.contains(x, y));
            mode = Mode::Hidden { edge, main_rect, strip_rect, must_exit_strip: inside };
          }
          Mode::OpenedByStrip { edge, main_rect, .. } => {
            // 放回展开位置；指针不在窗口内时，下一轮会按正常的离开逻辑收回到边缘。
            move_window(cached_main, main_rect, true, true);
            reveal_hold_until = None;
            reveal_requires_cursor_exit = false;
            mode = Mode::OpenedByStrip { edge, main_rect, shown_at: Instant::now(), entered_main: true };
          }
          Mode::Visible => {}
        }
        edge_log(&format!("main window minimized while docked ({}); restored to dock state", mode.tag()));
      } else {
        // 正常显示时的最小化是用户的明确意图：保持最小化，状态机休眠，窗口被还原后再按真实位置接管。
        if docked {
          edge_log("main window minimized again right after re-dock; leaving it minimized");
        }
        if !cached_strip.is_null() { hide_strip(cached_strip); }
        mode = Mode::Visible;
        dock_since = None;
        last_edge = None;
        auto_overflow_edge = None;
        auto_overflow_since = None;
        reveal_hold_until = None;
        reveal_requires_cursor_exit = false;
        thread::sleep(Duration::from_millis(50));
        continue;
      }
      thread::sleep(Duration::from_millis(16));
      continue;
    }

    if FORCE_SHOW.swap(false, Ordering::SeqCst) {
      match mode {
        Mode::Hidden { edge, main_rect, .. } => {
          hide_strip(cached_strip);
          animate_show(cached_main, edge, main_rect, cfg.animation_ms, &cfg.animation_style);
          reveal_hold_until = Some(Instant::now() + Duration::from_millis(1400));
          reveal_requires_cursor_exit = true;
          mode = Mode::OpenedByStrip { edge, main_rect, shown_at: Instant::now(), entered_main: false };
        }
        Mode::AutoHidden { edge, restore_rect, hidden_rect, .. } => {
          hide_strip(cached_strip);
          let from = rect_from_hwnd(cached_main).unwrap_or(hidden_rect);
          if start_position_slide(cached_main, from, restore_rect, AUTO_BOUNCE_MS) {
            remember_good(&mut last_good_visible_rect, restore_rect);
            reveal_hold_until = Some(Instant::now() + Duration::from_millis(1800));
            reveal_requires_cursor_exit = true;
            mode = Mode::OpenedByStrip { edge, main_rect: restore_rect, shown_at: Instant::now(), entered_main: false };
          }
        }
        _ => unsafe { ShowWindow(cached_main, SW_SHOWNA); },
      }
    }

    let current_version = CONFIG_VERSION.load(Ordering::SeqCst);
    if current_version != last_config_version {
      // Settings changes must not inherit stale countdowns.
      dock_since = None;
      last_edge = None;
      auto_overflow_edge = None;
      auto_overflow_since = None;
      reveal_hold_until = None;
      reveal_requires_cursor_exit = false;
      last_config_version = current_version;
    }

    let (cx, cy) = match cursor_pos() {
      Some(p) => p,
      None => {
        thread::sleep(Duration::from_millis(16));
        continue;
      }
    };

    if animation_busy() {
      thread::sleep(Duration::from_millis(8));
      continue;
    }

    match mode {
      Mode::Hidden { edge, main_rect, strip_rect, mut must_exit_strip } => {
        // v160: 状态与现实对账。主窗口被外部显示出来（例如从别的入口还原）时，旧的隐藏状态已失效。
        if window_visible(cached_main) {
          hide_strip(cached_strip);
          if let Some(actual) = rect_from_hwnd(cached_main) {
            remember_good(&mut last_good_visible_rect, actual);
          }
          edge_log("Hidden: main window is visible externally; resync to Visible");
          mode = Mode::Visible;
          dock_since = None;
          last_edge = None;
          auto_overflow_edge = None;
          auto_overflow_since = None;
          continue;
        }
        if !cached_strip.is_null() && !window_visible(cached_strip) {
          show_strip(cached_strip, strip_rect);
          edge_log("Hidden: edge strip was hidden externally; re-shown");
        }
        let inside_strip = strip_rect.contains(cx, cy);
        if !inside_strip {
          must_exit_strip = false;
        }
        if inside_strip && !must_exit_strip {
          hide_strip(cached_strip);
          animate_show(cached_main, edge, main_rect, cfg.animation_ms, &cfg.animation_style);
          reveal_hold_until = Some(Instant::now() + Duration::from_millis(1400));
          reveal_requires_cursor_exit = true;
          mode = Mode::OpenedByStrip { edge, main_rect, shown_at: Instant::now(), entered_main: false };
          dock_since = None;
          last_edge = None;
          auto_overflow_edge = None;
          auto_overflow_since = None;
        } else {
          mode = Mode::Hidden { edge, main_rect, strip_rect, must_exit_strip };
        }
      }
      Mode::AutoHidden { edge, restore_rect, hidden_rect, visible_rect, mut must_exit_visible } => {
        // v160: 状态与现实对账。显示器重排、DPI 变化、从最小化小条还原、其它程序挪窗口，
        // 都会让窗口不在我们以为的隐藏位置上；旧逻辑永远不再检查，于是卡死在"已隐藏"。
        if !window_visible(cached_main) {
          edge_log("AutoHidden: main window is no longer visible; resync to Visible");
          mode = Mode::Visible;
          dock_since = None;
          last_edge = None;
          auto_overflow_edge = None;
          auto_overflow_since = None;
          continue;
        }
        if let Some(actual) = rect_from_hwnd(cached_main) {
          if rect_moved(actual, hidden_rect, 2) {
            let base_mon = edge_detection_monitor_rect(restore_rect, cfg.ignore_taskbar);
            let hide_mon = hide_monitor_rect_for(edge, restore_rect, base_mon);
            if still_edge_hidden(edge, actual, hide_mon) {
              // 仍藏在同一条边外，只是被系统挪了一点：采用新位置，避免和系统来回抢。
              let visible = match edge {
                Edge::Left | Edge::Right => visible_rect.w,
                Edge::Top | Edge::Bottom => visible_rect.h,
              };
              let new_visible_rect = auto_visible_rect_for(edge, actual, hide_mon, visible);
              edge_log(&format!("AutoHidden: window shifted to {:?}; adopted", actual));
              mode = Mode::AutoHidden {
                edge,
                restore_rect,
                hidden_rect: actual,
                visible_rect: new_visible_rect,
                must_exit_visible: must_exit_visible || new_visible_rect.contains(cx, cy),
              };
            } else {
              // 窗口已被带回屏幕内：放弃旧隐藏状态，按真实位置回到正常显示，隐藏/回弹逻辑随之恢复。
              hide_strip(cached_strip);
              remember_good(&mut last_good_visible_rect, actual);
              edge_log(&format!("AutoHidden: window back on screen at {:?}; resync to Visible", actual));
              mode = Mode::Visible;
              dock_since = None;
              last_edge = None;
              auto_overflow_edge = None;
              auto_overflow_since = None;
            }
            thread::sleep(Duration::from_millis(8));
            continue;
          }
        }
        let inside_visible = visible_rect.contains(cx, cy);
        if !inside_visible {
          must_exit_visible = false;
        }
        if cfg.auto_edge_bounce && inside_visible && !must_exit_visible {
          hide_strip(cached_strip);
          let from = rect_from_hwnd(cached_main).unwrap_or(hidden_rect);
          if start_position_slide(cached_main, from, restore_rect, AUTO_BOUNCE_MS) {
            remember_good(&mut last_good_visible_rect, restore_rect);
            reveal_hold_until = Some(Instant::now() + Duration::from_millis(1800));
            reveal_requires_cursor_exit = true;
            mode = Mode::OpenedByStrip { edge, main_rect: restore_rect, shown_at: Instant::now(), entered_main: true };
            dock_since = None;
            last_edge = None;
            auto_overflow_edge = None;
            auto_overflow_since = None;
          } else {
            mode = Mode::AutoHidden { edge, restore_rect, hidden_rect, visible_rect, must_exit_visible };
          }
        } else {
          mode = Mode::AutoHidden { edge, restore_rect, hidden_rect, visible_rect, must_exit_visible };
        }
      }
      Mode::OpenedByStrip { edge, main_rect, shown_at, mut entered_main } => {
        if !window_visible(cached_main) {
          hide_strip(cached_strip);
          edge_log("OpenedByStrip: main window is no longer visible; resync to Visible");
          mode = Mode::Visible;
          continue;
        }
        let current_rect = rect_from_hwnd(cached_main).unwrap_or(main_rect);
        let mon = edge_detection_monitor_rect(current_rect, cfg.ignore_taskbar);
        let current_edge = detect_edge(current_rect, mon, cfg.edge_tolerance);

        // 用户把主界面从边缘拖开后，退出贴边模式，不再自动吸回或自动隐藏。
        if current_edge != Some(edge) {
          hide_strip(cached_strip);
          mode = Mode::Visible;
          remember_good(&mut last_good_visible_rect, current_rect);
          reveal_hold_until = Some(Instant::now() + Duration::from_millis(1400));
          reveal_requires_cursor_exit = true;
          dock_since = None;
          last_edge = None;
          auto_overflow_edge = None;
          auto_overflow_since = None;
          continue;
        }

        if is_left_button_down() {
          mode = Mode::OpenedByStrip { edge, main_rect: current_rect, shown_at, entered_main };
          thread::sleep(Duration::from_millis(10));
          continue;
        }

        let inside_main = current_rect.contains(cx, cy);
        if inside_main {
          entered_main = true;
          wake_requires_pointer_visit = false;
          remember_good(&mut last_good_visible_rect, current_rect);
        }

        // 触发条展开后，鼠标仍停在窗口内时绝不再次隐藏；必须先离开主窗口。
        // 这能修复底部贴边时“刚弹出又收回、反复闪烁”的问题。
        if reveal_requires_cursor_exit && inside_main {
          mode = Mode::OpenedByStrip { edge, main_rect: current_rect, shown_at, entered_main };
          thread::sleep(Duration::from_millis(12));
          continue;
        }
        if reveal_requires_cursor_exit && !inside_main {
          reveal_requires_cursor_exit = false;
        }

        // 防止第一次从触发条展开时，因为鼠标坐标/透明窗口命中检测抖动而马上缩回。
        // 必须先进入过主窗口，并且展开后经过短暂保护时间，才允许离开后隐藏。
        let leave_guard_ms = if cfg.mouse_leave_hide_ms <= 10 { 0 } else { 80 };
        let can_hide_after_reveal = entered_main && shown_at.elapsed() > Duration::from_millis(leave_guard_ms);
        if !inside_main && can_hide_after_reveal {
          if cfg.use_main_window_strip {
            hide_strip(cached_strip);
            let visible = cfg.edge_visible_pixels.max(cfg.strip_size).clamp(2, 48);
            let hide_mon = hide_monitor_rect_for(edge, current_rect, mon);
            let hidden_rect = auto_hidden_rect_for(edge, current_rect, hide_mon, visible);
            let visible_rect = auto_visible_rect_for(edge, hidden_rect, hide_mon, visible);
            let inside_visible = visible_rect.contains(cx, cy);
            if edge == Edge::Bottom && cfg.mouse_leave_hide_ms <= 12 {
              move_window(cached_main, hidden_rect, true, true);
              mode = Mode::AutoHidden { edge, restore_rect: current_rect, hidden_rect, visible_rect, must_exit_visible: inside_visible || edge == Edge::Bottom };
            } else if start_position_slide(cached_main, current_rect, hidden_rect, cfg.mouse_leave_hide_ms.min(220)) {
              mode = Mode::AutoHidden { edge, restore_rect: current_rect, hidden_rect, visible_rect, must_exit_visible: inside_visible || edge == Edge::Bottom };
            } else {
              mode = Mode::OpenedByStrip { edge, main_rect: current_rect, shown_at, entered_main };
            }
          } else {
            let hide_mon = hide_monitor_rect_for(edge, current_rect, mon);
            let strip_rect = strip_rect_for(edge, current_rect, hide_mon, cfg.strip_size);
            show_strip(cached_strip, strip_rect);
            animate_hide(cached_main, edge, current_rect, cfg.mouse_leave_hide_ms, &cfg.animation_style, cfg.ghost_frame_fix);
            mode = Mode::Hidden { edge, main_rect: current_rect, strip_rect, must_exit_strip: false };
          }
        } else {
          mode = Mode::OpenedByStrip { edge, main_rect: current_rect, shown_at, entered_main };
        }
      }
      Mode::Visible => {
        if unsafe { IsWindowVisible(cached_main) } == 0 {
          hide_strip(cached_strip);
          dock_since = None;
          last_edge = None;
          auto_overflow_edge = None;
          auto_overflow_since = None;
          thread::sleep(Duration::from_millis(24));
          continue;
        }

        let main_rect = match rect_from_hwnd(cached_main) {
          Some(r) => r,
          None => {
            thread::sleep(Duration::from_millis(24));
            continue;
          }
        };
        let mut main_rect = main_rect;
        if main_rect.w < 260 || main_rect.h < 180 {
          if let Some(good) = last_good_visible_rect {
            move_window(cached_main, good, true, true);
            unsafe { ShowWindow(cached_main, SW_SHOWNA); }
            main_rect = good;
            dock_since = None;
            last_edge = None;
          }
        } else {
          remember_good(&mut last_good_visible_rect, main_rect);
        }
        let mon = edge_detection_monitor_rect(main_rect, cfg.ignore_taskbar);
        let inside_main = main_rect.contains(cx, cy);

        // Explicitly waking/restoring the launcher while the pointer is elsewhere must not
        // immediately start an edge-hide countdown. Arm hiding only after the pointer has
        // visited the main window once; the existing inside-window guard then requires a
        // subsequent leave before the window can retract.
        if wake_requires_pointer_visit {
          hide_strip(cached_strip);
          dock_since = None;
          last_edge = None;
          auto_overflow_edge = None;
          auto_overflow_since = None;
          if inside_main {
            wake_requires_pointer_visit = false;
          }
          thread::sleep(Duration::from_millis(12));
          continue;
        }

        if let Some(until) = reveal_hold_until {
          let inside_main = main_rect.contains(cx, cy);
          if Instant::now() < until || (reveal_requires_cursor_exit && inside_main) {
            hide_strip(cached_strip);
            dock_since = None;
            last_edge = None;
            auto_overflow_edge = None;
            auto_overflow_since = None;
            thread::sleep(Duration::from_millis(12));
            continue;
          }
          reveal_hold_until = None;
          reveal_requires_cursor_exit = false;
        }

        // 拖出屏幕自动隐藏/弹回：支持多显示器和 DPI 缩放，使用 Win32 物理像素坐标。
        // 当鼠标仍在 exe 界面内时，不进入隐藏模式，避免拖动窗口时刚松手就被隐藏。
        if cfg.auto_edge_hide {
          if let Some(edge) = detect_overflow_edge(main_rect, mon, AUTO_EDGE_THRESHOLD) {
            if is_left_button_down() {
              auto_overflow_edge = None;
              auto_overflow_since = None;
              thread::sleep(Duration::from_millis(10));
              continue;
            }
            if main_rect.contains(cx, cy) && !cfg.auto_edge_snap_back {
              auto_overflow_edge = None;
              auto_overflow_since = None;
            } else {
              if Some(edge) != auto_overflow_edge {
                auto_overflow_edge = Some(edge);
                auto_overflow_since = Some(Instant::now());
              }
              let elapsed = auto_overflow_since.map(|t| t.elapsed()).unwrap_or_default();
              if elapsed.as_millis() as u64 >= cfg.auto_edge_hide_delay {
                hide_strip(cached_strip);
                let restore_rect = restore_rect_for(edge, main_rect, mon);
                if cfg.auto_edge_snap_back {
                  if restore_rect.x != main_rect.x || restore_rect.y != main_rect.y {
                    let ms = cfg.auto_edge_snap_back_animation_ms.clamp(80, 600).min(AUTO_BOUNCE_MS);
                    if !cfg.auto_edge_snap_back_animation || ms <= 10 {
                      move_window(cached_main, restore_rect, true, true);
                    } else {
                      start_snap_back_slide(cached_main, main_rect, restore_rect, ms);
                    }
                    remember_good(&mut last_good_visible_rect, restore_rect);
                    reveal_hold_until = Some(Instant::now() + Duration::from_millis(900));
                    reveal_requires_cursor_exit = true;
                  }
                  dock_since = None;
                  last_edge = None;
                  auto_overflow_edge = None;
                  auto_overflow_since = None;
                  thread::sleep(Duration::from_millis(16));
                  continue;
                }

                let hide_mon = hide_monitor_rect_for(edge, restore_rect, mon);
                let hidden_rect = auto_hidden_rect_for(edge, restore_rect, hide_mon, cfg.edge_visible_pixels);
                let visible_rect = auto_visible_rect_for(edge, hidden_rect, hide_mon, cfg.edge_visible_pixels);
                let inside_visible = visible_rect.contains(cx, cy);
                if start_position_slide(cached_main, main_rect, hidden_rect, AUTO_BOUNCE_MS) {
                  mode = Mode::AutoHidden {
                    edge,
                    restore_rect,
                    hidden_rect,
                    visible_rect,
                    must_exit_visible: inside_visible || edge == Edge::Bottom,
                  };
                  dock_since = None;
                  last_edge = None;
                  auto_overflow_edge = None;
                  auto_overflow_since = None;
                  continue;
                }
              }
            }
          } else {
            auto_overflow_edge = None;
            auto_overflow_since = None;
          }
        } else {
          auto_overflow_edge = None;
          auto_overflow_since = None;
        }

        hide_strip(cached_strip);

        // 只要鼠标仍在主界面内，就保持贴边窗口展开。
        // 这同时覆盖“点击按钮后不要自动隐藏”和“鼠标停在界面内不要缩回”两种交互：
        // 点击期间不会启动隐藏计时，松开后只要指针还在窗口里也不会重新计时。
        // 等鼠标真正离开主窗口后，才从头开始计算 edge hide delay。
        if main_rect.contains(cx, cy) {
          dock_since = None;
          last_edge = None;
          thread::sleep(Duration::from_millis(12));
          continue;
        }

        if is_left_button_down() {
          dock_since = None;
          last_edge = None;
          thread::sleep(Duration::from_millis(10));
          continue;
        }

        if !cfg.dock_auto_hide {
          dock_since = None;
          last_edge = None;
          thread::sleep(Duration::from_millis(18));
          continue;
        }

        let edge = detect_edge(main_rect, mon, cfg.edge_tolerance);
        if edge.is_none() {
          dock_since = None;
          last_edge = None;
          thread::sleep(Duration::from_millis(18));
          continue;
        }
        let edge = edge.unwrap();
        if Some(edge) != last_edge {
          last_edge = Some(edge);
          dock_since = Some(Instant::now());
        }
        let elapsed = dock_since.map(|t| t.elapsed()).unwrap_or_default();
        if elapsed.as_millis() as u64 >= cfg.hide_delay_ms {
          if cfg.use_main_window_strip {
            // 无透明触发框模式：不显示独立 edge-strip 窗口，直接把主窗口滑出屏幕，保留可见边缘。
            // 这样隐藏后的可见区域属于主窗口本身，不会出现透明 WebView 触发条/残影框。
            hide_strip(cached_strip);
            let visible = cfg.edge_visible_pixels.max(cfg.strip_size).clamp(2, 48);
            let hide_mon = hide_monitor_rect_for(edge, main_rect, mon);
            let hidden_rect = auto_hidden_rect_for(edge, main_rect, hide_mon, visible);
            let visible_rect = auto_visible_rect_for(edge, hidden_rect, hide_mon, visible);
            let inside_visible = visible_rect.contains(cx, cy);
            if edge == Edge::Bottom && cfg.animation_ms <= 12 {
              move_window(cached_main, hidden_rect, true, true);
              mode = Mode::AutoHidden {
                edge,
                restore_rect: main_rect,
                hidden_rect,
                visible_rect,
                must_exit_visible: inside_visible || edge == Edge::Bottom,
              };
              dock_since = None;
              last_edge = None;
              auto_overflow_edge = None;
              auto_overflow_since = None;
              continue;
            } else if start_position_slide(cached_main, main_rect, hidden_rect, cfg.animation_ms.min(220)) {
              mode = Mode::AutoHidden {
                edge,
                restore_rect: main_rect,
                hidden_rect,
                visible_rect,
                must_exit_visible: inside_visible || edge == Edge::Bottom,
              };
              dock_since = None;
              last_edge = None;
              auto_overflow_edge = None;
              auto_overflow_since = None;
              continue;
            }
          } else {
            let hide_mon = hide_monitor_rect_for(edge, main_rect, mon);
            let strip_rect = strip_rect_for(edge, main_rect, hide_mon, cfg.strip_size);
            show_strip(cached_strip, strip_rect);
            let inside_strip = strip_rect.contains(cx, cy);
            keep_out_of_taskbar(cached_main);
            animate_hide(cached_main, edge, main_rect, cfg.animation_ms, &cfg.animation_style, cfg.ghost_frame_fix);
            mode = Mode::Hidden { edge, main_rect, strip_rect, must_exit_strip: inside_strip };
            dock_since = None;
            last_edge = None;
            auto_overflow_edge = None;
            auto_overflow_since = None;
          }
        }
      }
    }
    thread::sleep(Duration::from_millis(8));
  }
}

/// 状态机线程的外壳：内部 panic 时记日志并在短暂退避后重启，而不是让贴边功能永久失效。
#[cfg(target_os = "windows")]
fn run_native_loop_supervised(config: Arc<Mutex<NativeEdgeOptions>>) {
  let mut restarts: u32 = 0;
  loop {
    let cfg = config.clone();
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(move || native_loop(cfg)));
    match result {
      Ok(()) => return,
      Err(payload) => {
        let reason = payload
          .downcast_ref::<&str>()
          .map(|s| s.to_string())
          .or_else(|| payload.downcast_ref::<String>().cloned())
          .unwrap_or_else(|| "unknown panic".into());
        restarts = restarts.saturating_add(1);
        edge_log(&format!("native loop panicked ({reason}); restart #{restarts}"));
        ANIMATION_GENERATION.fetch_add(1, Ordering::SeqCst);
        ANIMATION_RUNNING.store(false, Ordering::SeqCst);
        thread::sleep(Duration::from_millis(if restarts > 5 { 2000 } else { 300 }));
      }
    }
  }
}

#[cfg(target_os = "windows")]
fn register_window_handles(app: &tauri::AppHandle) {
  use tauri::Manager;
  for (label, slot) in [("main", &MAIN_HWND), ("edge-strip", &STRIP_HWND)] {
    if let Some(window) = app.get_webview_window(label) {
      if let Ok(hwnd) = window.hwnd() {
        slot.store(hwnd.0 as isize, Ordering::SeqCst);
      }
    }
  }
}

#[tauri::command]
pub fn edge_native_configure(app: tauri::AppHandle, options: NativeEdgeOptions) -> Result<(), String> {
  let config = settings();
  *lock_settings(&config) = options;
  CONFIG_VERSION.fetch_add(1, Ordering::SeqCst);

  if LOG_PATH.get().is_none() {
    use tauri::Manager;
    if let Ok(dir) = app.path().app_log_dir() {
      if std::fs::create_dir_all(&dir).is_ok() {
        let _ = LOG_PATH.set(dir.join("edge-dock.log"));
      }
    }
  }

  #[cfg(target_os = "windows")]
  {
    register_window_handles(&app);
    if !STARTED.swap(true, Ordering::SeqCst) {
      edge_log(&format!("native edge dock starting (v{})", env!("CARGO_PKG_VERSION")));
      let cfg = config.clone();
      if let Err(e) = thread::Builder::new()
        .name("native-edge-dock".into())
        .spawn(move || run_native_loop_supervised(cfg))
      {
        STARTED.store(false, Ordering::SeqCst);
        return Err(e.to_string());
      }
    }
  }
  Ok(())
}

pub fn set_tray_hidden(hidden: bool) {
  TRAY_HIDDEN.store(hidden, Ordering::SeqCst);
  if hidden {
    FORCE_SHOW.store(false, Ordering::SeqCst);
    WAKE_REQUIRES_POINTER_VISIT.store(false, Ordering::SeqCst);
  } else {
    EXTERNAL_SHOW_RESET.store(true, Ordering::SeqCst);
    WAKE_REQUIRES_POINTER_VISIT.store(true, Ordering::SeqCst);
  }
}

pub fn prepare_tray_show(ms: u64) {
  TRAY_HIDDEN.store(false, Ordering::SeqCst);
  EXTERNAL_SHOW_RESET.store(true, Ordering::SeqCst);
  WAKE_REQUIRES_POINTER_VISIT.store(true, Ordering::SeqCst);
  FORCE_SHOW.store(false, Ordering::SeqCst);
  let until = mono_millis().saturating_add(ms.max(250));
  NATIVE_SUSPEND_UNTIL_MS.store(until, Ordering::SeqCst);
}

#[tauri::command]
pub fn edge_native_force_show() -> Result<(), String> {
  WAKE_REQUIRES_POINTER_VISIT.store(true, Ordering::SeqCst);
  FORCE_SHOW.store(true, Ordering::SeqCst);
  Ok(())
}

#[tauri::command]
pub fn edge_native_suspend(ms: u64) -> Result<(), String> {
  let until = mono_millis().saturating_add(ms.max(50));
  NATIVE_SUSPEND_UNTIL_MS.store(until, Ordering::SeqCst);
  FORCE_SHOW.store(true, Ordering::SeqCst);
  Ok(())
}

#[cfg(all(test, target_os = "windows"))]
mod tests {
  use super::*;

  fn r(x: i32, y: i32, w: i32, h: i32) -> SimpleRect {
    SimpleRect { x, y, w, h }
  }

  #[test]
  fn minimized_stub_is_not_a_plausible_visible_rect() {
    // 实机取证：110% 缩放下最小化的工具窗口小标题条是 176x30。
    assert!(!plausible_visible_rect(r(0, 1482, 176, 30)));
    assert!(plausible_visible_rect(r(1373, 303, 1196, 889)));
  }

  #[test]
  fn remember_good_rejects_tiny_rects() {
    let good = r(100, 100, 1196, 889);
    let mut slot = Some(good);
    remember_good(&mut slot, r(0, 1482, 176, 30));
    assert_eq!(slot.map(|g| (g.x, g.w)), Some((100, 1196)));
    remember_good(&mut slot, r(5, 6, 900, 700));
    assert_eq!(slot.map(|g| (g.x, g.w)), Some((5, 900)));
  }

  #[test]
  fn still_edge_hidden_distinguishes_hidden_from_restored() {
    let work = r(0, 44, 2560, 1468);
    let full = r(0, 0, 2560, 1600);
    let window = r(1373, 303, 1196, 889);
    // 右边缘隐藏：只露 5px。
    let hidden_right = auto_hidden_rect_for(Edge::Right, window, work, 5);
    assert!(still_edge_hidden(Edge::Right, hidden_right, work));
    // 被还原回屏幕内。
    assert!(!still_edge_hidden(Edge::Right, window, work));
    // 底边隐藏使用整块显示器矩形。
    let bottom_restore = r(400, 600, 1196, 889);
    let hidden_bottom = auto_hidden_rect_for(Edge::Bottom, bottom_restore, full, 5);
    assert!(still_edge_hidden(Edge::Bottom, hidden_bottom, full));
    // 系统把隐藏窗口往里挪了几十像素（DPI/显示器重排），仍算隐藏。
    let shifted = SimpleRect { x: hidden_right.x - 40, ..hidden_right };
    assert!(still_edge_hidden(Edge::Right, shifted, work));
  }

  #[test]
  fn rect_moved_respects_tolerance() {
    let a = r(10, 10, 100, 100);
    assert!(!rect_moved(a, r(12, 8, 101, 99), 2));
    assert!(rect_moved(a, r(13, 10, 100, 100), 2));
    assert!(rect_moved(a, r(10, 10, 100, 70), 2));
  }

  #[test]
  fn suspend_uses_monotonic_clock() {
    NATIVE_SUSPEND_UNTIL_MS.store(mono_millis() + 60_000, Ordering::SeqCst);
    assert!(native_suspended());
    NATIVE_SUSPEND_UNTIL_MS.store(0, Ordering::SeqCst);
    assert!(!native_suspended());
  }

  #[test]
  fn animation_flag_is_cleared_by_guard_and_watchdog() {
    // 正常结束（含 panic 展开）由守卫清除。
    assert!(start_animation(|| {}));
    let deadline = Instant::now() + Duration::from_secs(2);
    while animation_busy() && Instant::now() < deadline {
      thread::sleep(Duration::from_millis(5));
    }
    assert!(!animation_busy());

    assert!(start_animation(|| panic!("boom")));
    let deadline = Instant::now() + Duration::from_secs(2);
    while animation_busy() && Instant::now() < deadline {
      thread::sleep(Duration::from_millis(5));
    }
    assert!(!animation_busy());

    // 卡死的动画：超过看门狗时长后强制复位。
    ANIMATION_RUNNING.store(true, Ordering::SeqCst);
    ANIMATION_STARTED_MS.store(mono_millis() - ANIMATION_STALE_MS - 1000, Ordering::SeqCst);
    assert!(!animation_busy());
    // 新动画开始后仍算忙碌。
    ANIMATION_RUNNING.store(true, Ordering::SeqCst);
    ANIMATION_STARTED_MS.store(mono_millis(), Ordering::SeqCst);
    assert!(animation_busy());
    ANIMATION_RUNNING.store(false, Ordering::SeqCst);
  }

  #[test]
  fn utc_timestamp_has_expected_shape() {
    let ts = utc_timestamp();
    assert_eq!(ts.len(), "2026-10-18 07:00:00.000Z".len());
    assert!(ts.ends_with('Z'));
  }
}
