use serde::Deserialize;
use std::sync::atomic::{AtomicU64, Ordering};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize};

static EDGE_ANIMATION_TOKEN: AtomicU64 = AtomicU64::new(1);

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EdgeDockRect {
  pub x: i32,
  pub y: i32,
  pub width: u32,
  pub height: u32,
}

fn next_animation_token() -> u64 {
  EDGE_ANIMATION_TOKEN.fetch_add(1, Ordering::SeqCst).wrapping_add(1)
}

fn ease_out_quint(t: f64) -> f64 {
  1.0 - (1.0 - t).powi(5)
}

fn lerp_i32(a: i32, b: i32, t: f64) -> i32 {
  (a as f64 + (b as f64 - a as f64) * t).round() as i32
}

#[tauri::command]
pub fn edge_cancel_animation() {
  let _ = next_animation_token();
}

#[tauri::command]
pub async fn edge_animate_window(
  app: AppHandle,
  label: String,
  from: EdgeDockRect,
  to: EdgeDockRect,
  duration_ms: u64,
  show_before: bool,
  hide_after: bool,
  focus_after: bool,
) -> Result<(), String> {
  let token = next_animation_token();
  let window = app
    .get_webview_window(&label)
    .ok_or_else(|| format!("window '{}' not found", label))?;

  if show_before {
    window
      .set_size(PhysicalSize::new(from.width.max(8), from.height.max(8)))
      .map_err(|e| e.to_string())?;
    window
      .set_position(PhysicalPosition::new(from.x, from.y))
      .map_err(|e| e.to_string())?;
    window.show().map_err(|e| e.to_string())?;
  }

  let duration = duration_ms.min(420);
  if duration == 0 {
    window
      .set_position(PhysicalPosition::new(to.x, to.y))
      .map_err(|e| e.to_string())?;
  } else {
    let start = Instant::now();
    let frame_time = Duration::from_millis(7);
    let mut last_x = i32::MIN;
    let mut last_y = i32::MIN;

    loop {
      if EDGE_ANIMATION_TOKEN.load(Ordering::SeqCst) != token {
        return Ok(());
      }

      let elapsed = start.elapsed().as_millis() as u64;
      let progress = (elapsed as f64 / duration as f64).clamp(0.0, 1.0);
      let eased = ease_out_quint(progress);
      let x = lerp_i32(from.x, to.x, eased);
      let y = lerp_i32(from.y, to.y, eased);

      if x != last_x || y != last_y {
        last_x = x;
        last_y = y;
        window
          .set_position(PhysicalPosition::new(x, y))
          .map_err(|e| e.to_string())?;
      }

      if progress >= 1.0 {
        break;
      }
      thread::sleep(frame_time);
    }

    window
      .set_position(PhysicalPosition::new(to.x, to.y))
      .map_err(|e| e.to_string())?;
  }

  if focus_after {
    let _ = window.set_focus();
  }
  if hide_after {
    window.hide().map_err(|e| e.to_string())?;
  }
  Ok(())
}
