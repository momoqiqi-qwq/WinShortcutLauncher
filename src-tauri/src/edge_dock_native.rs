use serde::Deserialize;
use std::ptr::null;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

#[cfg(target_os = "windows")]
use windows_sys::Win32::Foundation::{HWND, POINT, RECT};
#[cfg(target_os = "windows")]
use windows_sys::Win32::Graphics::Gdi::{GetMonitorInfoW, MonitorFromRect, MONITORINFO, MONITOR_DEFAULTTONEAREST};
#[cfg(target_os = "windows")]
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON};
#[cfg(target_os = "windows")]
use windows_sys::Win32::UI::WindowsAndMessaging::{
  AnimateWindow, FindWindowW, GetCursorPos, GetWindowLongW, GetWindowRect, IsWindowVisible,
  SetLayeredWindowAttributes, SetWindowLongW, SetWindowPos, ShowWindow, AW_BLEND, AW_HIDE,
  AW_HOR_NEGATIVE, AW_HOR_POSITIVE, AW_SLIDE, AW_VER_NEGATIVE, AW_VER_POSITIVE, GWL_EXSTYLE,
  HWND_TOPMOST, LWA_ALPHA, SW_HIDE, SW_SHOWNA, SWP_NOACTIVATE, SWP_NOOWNERZORDER, SWP_NOZORDER,
  SWP_SHOWWINDOW, WS_EX_APPWINDOW, WS_EX_LAYERED, WS_EX_TOOLWINDOW,
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
  #[serde(default = "default_auto_edge_hide")]
  pub auto_edge_hide: bool,
  #[serde(default = "default_auto_edge_bounce")]
  pub auto_edge_bounce: bool,
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
      auto_edge_hide: true,
      auto_edge_bounce: true,
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
static CONFIG_VERSION: AtomicU64 = AtomicU64::new(1);
static SETTINGS: OnceLock<Arc<Mutex<NativeEdgeOptions>>> = OnceLock::new();

fn settings() -> Arc<Mutex<NativeEdgeOptions>> {
  SETTINGS
    .get_or_init(|| Arc::new(Mutex::new(NativeEdgeOptions::default())))
    .clone()
}

fn now_millis() -> u64 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|d| d.as_millis() as u64)
    .unwrap_or(0)
}

fn native_suspended() -> bool {
  let until = NATIVE_SUSPEND_UNTIL_MS.load(Ordering::SeqCst);
  until > now_millis()
}

#[cfg(target_os = "windows")]
fn wide_null(s: &str) -> Vec<u16> {
  s.encode_utf16().chain(std::iter::once(0)).collect()
}

#[cfg(target_os = "windows")]
fn find_window_by_title(title: &str) -> HWND {
  let title = wide_null(title);
  unsafe { FindWindowW(null(), title.as_ptr()) }
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
  if hmon != 0 {
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

fn keep_taskbar_visible(hwnd: HWND) {
  if hwnd == 0 { return; }
  unsafe {
    let style = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
    let next = (style | WS_EX_APPWINDOW) & !WS_EX_TOOLWINDOW;
    if next != style {
      SetWindowLongW(hwnd, GWL_EXSTYLE, next as i32);
    }
  }
}

fn move_window(hwnd: HWND, rect: SimpleRect, topmost: bool, show: bool) {
  let z = if topmost { HWND_TOPMOST } else { 0 };
  let mut flags = SWP_NOACTIVATE | SWP_NOOWNERZORDER;
  if !topmost { flags |= SWP_NOZORDER; }
  if show { flags |= SWP_SHOWWINDOW; }
  unsafe {
    SetWindowPos(hwnd, z, rect.x, rect.y, rect.w.max(4), rect.h.max(4), flags);
  }
}

#[cfg(target_os = "windows")]
fn show_strip(strip: HWND, rect: SimpleRect) {
  move_window(strip, rect, true, true);
  unsafe { ShowWindow(strip, SW_SHOWNA); }
}

#[cfg(target_os = "windows")]
fn hide_strip(strip: HWND) {
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
fn force_hide_and_park(hwnd: HWND, edge: Edge, rect: SimpleRect, _ghost_frame_fix: bool) {
  // 不再使用 SW_HIDE 隐藏主窗口。主窗口一旦被真正 Hide，Windows 任务栏图标会消失。
  // 现在改为把主窗口停放到屏幕外并保持可见，这样贴边隐藏时任务栏图标仍然保留。
  let parked = offscreen_rect_for(edge, rect);
  keep_taskbar_visible(hwnd);
  unsafe {
    SetLayeredWindowAttributes(hwnd, 0, 255, LWA_ALPHA);
    ShowWindow(hwnd, SW_SHOWNA);
  }
  move_window(hwnd, parked, false, true);
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
  let target = offscreen_rect_for(edge, rect);
  keep_taskbar_visible(hwnd);

  match normalize_animation_style(style) {
    "instant" => {
      move_window(hwnd, target, false, true);
      unsafe { ShowWindow(hwnd, SW_SHOWNA); }
    }
    "setwindowpos-linear" => setwindowpos_slide_with_easing(hwnd, rect, target, ms, false, SlideEasing::Linear),
    "setwindowpos-cubic" => setwindowpos_slide_with_easing(hwnd, rect, target, ms, false, SlideEasing::Cubic),
    "setwindowpos-back" => setwindowpos_slide_with_easing(hwnd, rect, target, ms, false, SlideEasing::Back),
    "setwindowpos" | "fade-slide" | "fade" => {
      setwindowpos_slide_with_easing(hwnd, rect, target, ms, false, SlideEasing::Quint);
    }
    _ => {
      // AnimateWindow 的 AW_HIDE 会让任务栏图标消失，所以默认动画也改成可见窗口滑出屏幕。
      setwindowpos_slide_with_easing(hwnd, rect, target, ms, false, SlideEasing::Quint);
    }
  }

  force_hide_and_park(hwnd, edge, rect, ghost_frame_fix);
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
        if ms <= 10 {
          ShowWindow(hwnd, SW_SHOWNA);
        } else {
          AnimateWindow(hwnd, ms, aw_show_flag(edge));
        }
      }
    }
  }
}

#[cfg(target_os = "windows")]
fn animation_busy() -> bool {
  ANIMATION_RUNNING.load(Ordering::SeqCst)
}

#[cfg(target_os = "windows")]
fn start_animation<F>(task: F) -> bool
where
  F: FnOnce() + Send + 'static,
{
  if ANIMATION_RUNNING.swap(true, Ordering::SeqCst) {
    return false;
  }
  let result = thread::Builder::new()
    .name("native-edge-animation".into())
    .spawn(move || {
      task();
      ANIMATION_RUNNING.store(false, Ordering::SeqCst);
    });
  if result.is_err() {
    ANIMATION_RUNNING.store(false, Ordering::SeqCst);
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
  const AUTO_BOUNCE_MS: u32 = 200;

  #[derive(Debug)]
  enum Mode {
    Visible,
    Hidden { edge: Edge, main_rect: SimpleRect, strip_rect: SimpleRect, must_exit_strip: bool },
    OpenedByStrip { edge: Edge, main_rect: SimpleRect, shown_at: Instant, entered_main: bool },
    AutoHidden { edge: Edge, restore_rect: SimpleRect, hidden_rect: SimpleRect, visible_rect: SimpleRect, must_exit_visible: bool },
  }

  let mut mode = Mode::Visible;
  let mut last_edge: Option<Edge> = None;
  let mut dock_since: Option<Instant> = None;
  let mut auto_overflow_edge: Option<Edge> = None;
  let mut auto_overflow_since: Option<Instant> = None;
  let mut cached_main: HWND = 0;
  let mut cached_strip: HWND = 0;
  let mut last_lookup = Instant::now() - Duration::from_secs(10);
  let mut last_config_version = CONFIG_VERSION.load(Ordering::SeqCst);
  let mut last_good_visible_rect: Option<SimpleRect> = None;
  let mut reveal_hold_until: Option<Instant> = None;
  let mut reveal_requires_cursor_exit = false;

  loop {
    let cfg = config.lock().map(|g| g.clone()).unwrap_or_default();

    if last_lookup.elapsed() > Duration::from_millis(700) || cached_main == 0 || cached_strip == 0 {
      cached_main = find_window_by_title("Yue Launcher");
      if cached_main != 0 { keep_taskbar_visible(cached_main); }
      cached_strip = find_window_by_title("edge-strip");
      last_lookup = Instant::now();
    }

    if native_suspended() && cached_main != 0 {
      if cached_strip != 0 { hide_strip(cached_strip); }
      if !animation_busy() {
        match mode {
          Mode::Hidden { main_rect, .. } => {
            move_window(cached_main, main_rect, true, true);
            unsafe { ShowWindow(cached_main, SW_SHOWNA); }
            last_good_visible_rect = Some(main_rect);
          }
          Mode::AutoHidden { restore_rect, .. } => {
            move_window(cached_main, restore_rect, true, true);
            unsafe { ShowWindow(cached_main, SW_SHOWNA); }
            last_good_visible_rect = Some(restore_rect);
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
      thread::sleep(Duration::from_millis(24));
      continue;
    }

    if !cfg.enabled || cfg.paused || cached_main == 0 || cached_strip == 0 {
      if cached_strip != 0 { hide_strip(cached_strip); }
      match mode {
        Mode::Hidden { main_rect, .. } => {
          if cached_main != 0 {
            move_window(cached_main, main_rect, true, true);
            unsafe { ShowWindow(cached_main, SW_SHOWNA); }
            last_good_visible_rect = Some(main_rect);
          }
        }
        Mode::AutoHidden { restore_rect, .. } => {
          if cached_main != 0 {
            move_window(cached_main, restore_rect, true, true);
            unsafe { ShowWindow(cached_main, SW_SHOWNA); }
            last_good_visible_rect = Some(restore_rect);
          }
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

    if FORCE_SHOW.swap(false, Ordering::SeqCst) {
      match mode {
        Mode::Hidden { edge, main_rect, .. } => {
          hide_strip(cached_strip);
          animate_show(cached_main, edge, main_rect, cfg.animation_ms, &cfg.animation_style);
          reveal_hold_until = Some(Instant::now() + Duration::from_millis(1400));
          reveal_requires_cursor_exit = true;
          mode = Mode::OpenedByStrip { edge, main_rect, shown_at: Instant::now(), entered_main: false };
        }
        Mode::AutoHidden { restore_rect, hidden_rect, .. } => {
          hide_strip(cached_strip);
          let from = rect_from_hwnd(cached_main).unwrap_or(hidden_rect);
          if start_position_slide(cached_main, from, restore_rect, AUTO_BOUNCE_MS) {
            last_good_visible_rect = Some(restore_rect);
            reveal_hold_until = Some(Instant::now() + Duration::from_millis(1800));
            reveal_requires_cursor_exit = true;
            mode = Mode::OpenedByStrip { edge, main_rect: restore_rect, shown_at: Instant::now(), entered_main: true };
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
        let inside_visible = visible_rect.contains(cx, cy);
        if !inside_visible {
          must_exit_visible = false;
        }
        if cfg.auto_edge_bounce && inside_visible && !must_exit_visible {
          hide_strip(cached_strip);
          let from = rect_from_hwnd(cached_main).unwrap_or(hidden_rect);
          if start_position_slide(cached_main, from, restore_rect, AUTO_BOUNCE_MS) {
            last_good_visible_rect = Some(restore_rect);
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
        let current_rect = rect_from_hwnd(cached_main).unwrap_or(main_rect);
        let mon = monitor_rect_near(current_rect);
        let current_edge = detect_edge(current_rect, mon, cfg.edge_tolerance);

        // 用户把主界面从边缘拖开后，退出贴边模式，不再自动吸回或自动隐藏。
        if current_edge != Some(edge) {
          hide_strip(cached_strip);
          mode = Mode::Visible;
          last_good_visible_rect = Some(current_rect);
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
          last_good_visible_rect = Some(current_rect);
        }

        // 防止第一次从触发条展开时，因为鼠标坐标/透明窗口命中检测抖动而马上缩回。
        // 必须先进入过主窗口，并且展开后经过短暂保护时间，才允许离开后隐藏。
        let can_hide_after_reveal = entered_main && shown_at.elapsed() > Duration::from_millis(1200);
        if !inside_main && can_hide_after_reveal {
          let strip_rect = strip_rect_for(edge, current_rect, mon, cfg.strip_size);
          show_strip(cached_strip, strip_rect);
          animate_hide(cached_main, edge, current_rect, cfg.mouse_leave_hide_ms, &cfg.animation_style, cfg.ghost_frame_fix);
          mode = Mode::Hidden { edge, main_rect: current_rect, strip_rect, must_exit_strip: false };
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
          last_good_visible_rect = Some(main_rect);
        }
        let mon = monitor_rect_near(main_rect);

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

        // 拖出屏幕自动隐藏/回弹：支持多显示器和 DPI 缩放，使用 Win32 物理像素坐标。
        // 与普通贴边隐藏相互独立；即使鼠标左键仍按下，也会实时检测拖出阈值。
        if cfg.auto_edge_hide {
          if let Some(edge) = detect_overflow_edge(main_rect, mon, AUTO_EDGE_THRESHOLD) {
            if Some(edge) != auto_overflow_edge {
              auto_overflow_edge = Some(edge);
              auto_overflow_since = Some(Instant::now());
            }
            let elapsed = auto_overflow_since.map(|t| t.elapsed()).unwrap_or_default();
            if elapsed.as_millis() as u64 >= cfg.auto_edge_hide_delay {
              hide_strip(cached_strip);
              let restore_rect = restore_rect_for(edge, main_rect, mon);
              let hidden_rect = auto_hidden_rect_for(edge, restore_rect, mon, cfg.edge_visible_pixels);
              let visible_rect = auto_visible_rect_for(edge, hidden_rect, mon, cfg.edge_visible_pixels);
              let inside_visible = visible_rect.contains(cx, cy);
              if start_position_slide(cached_main, main_rect, hidden_rect, AUTO_BOUNCE_MS) {
                mode = Mode::AutoHidden {
                  edge,
                  restore_rect,
                  hidden_rect,
                  visible_rect,
                  must_exit_visible: inside_visible,
                };
                dock_since = None;
                last_edge = None;
                auto_overflow_edge = None;
                auto_overflow_since = None;
                continue;
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
            let hidden_rect = auto_hidden_rect_for(edge, main_rect, mon, visible);
            let visible_rect = auto_visible_rect_for(edge, hidden_rect, mon, visible);
            let inside_visible = visible_rect.contains(cx, cy);
            if start_position_slide(cached_main, main_rect, hidden_rect, cfg.animation_ms.max(45).min(220)) {
              mode = Mode::AutoHidden {
                edge,
                restore_rect: main_rect,
                hidden_rect,
                visible_rect,
                must_exit_visible: inside_visible,
              };
              dock_since = None;
              last_edge = None;
              auto_overflow_edge = None;
              auto_overflow_since = None;
              continue;
            }
          } else {
            let strip_rect = strip_rect_for(edge, main_rect, mon, cfg.strip_size);
            show_strip(cached_strip, strip_rect);
            let inside_strip = strip_rect.contains(cx, cy);
            keep_taskbar_visible(cached_main);
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

#[tauri::command]
pub fn edge_native_configure(options: NativeEdgeOptions) -> Result<(), String> {
  let config = settings();
  if let Ok(mut guard) = config.lock() {
    *guard = options;
  }
  CONFIG_VERSION.fetch_add(1, Ordering::SeqCst);

  #[cfg(target_os = "windows")]
  {
    if !STARTED.swap(true, Ordering::SeqCst) {
      let cfg = config.clone();
      thread::Builder::new()
        .name("native-edge-dock".into())
        .spawn(move || native_loop(cfg))
        .map_err(|e| e.to_string())?;
    }
  }
  Ok(())
}

#[tauri::command]
pub fn edge_native_force_show() -> Result<(), String> {
  FORCE_SHOW.store(true, Ordering::SeqCst);
  Ok(())
}

#[tauri::command]
pub fn edge_native_suspend(ms: u64) -> Result<(), String> {
  let until = now_millis().saturating_add(ms.max(50));
  NATIVE_SUSPEND_UNTIL_MS.store(until, Ordering::SeqCst);
  FORCE_SHOW.store(true, Ordering::SeqCst);
  Ok(())
}
