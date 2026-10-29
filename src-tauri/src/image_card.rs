//! v188: 图片卡片的预览授权。
//!
//! 图片卡片不用 `read_icon_as_data_url` 那种整文件 base64 —— 几 MB 的原图直接塞进
//! data URL 会吃掉内存和 localStorage 额度。卡片的 `<img>` 走 asset 协议
//! （前端 `convertFileSrc`），由 WebView 自己解码、按卡片尺寸缩放。
//!
//! 但 asset 协议的作用域里只写了 `$APPDATA/**/*`，用户随便挑的一张图是读不到的，
//! 所以每次渲染图片卡片前都要把这张图（或它所在的文件夹）加进运行时作用域。
//! 这和 `html_folder::allow_html_preview` 是同一套做法，重复 add 幂等。

use std::path::PathBuf;

use tauri::{AppHandle, Manager};

/// 把一张图片加进 asset 协议作用域，返回解析后的绝对路径。
#[tauri::command]
pub async fn allow_image_preview(app: AppHandle, path: String) -> Result<String, String> {
  crate::blocking::offload(move || {
    let file = resolve_file(&path)?;
    let scope = app.asset_protocol_scope();
    // 先只放开这一个文件（最小权限）；个别路径形态 scope 不收时，
    // 退一步放开它所在的文件夹（非递归），预览能看就行。
    if scope.allow_file(&file).is_err() {
      let parent = file
        .parent()
        .map(PathBuf::from)
        .ok_or_else(|| format!("找不到图片所在文件夹：{}", file.to_string_lossy()))?;
      scope
        .allow_directory(&parent, false)
        .map_err(|error| format!("图片预览授权失败：{error}"))?;
    }
    Ok(file.to_string_lossy().to_string())
  })
  .await
}

/// 校验并规整前端传来的路径：去掉首尾空白与包裹的引号，确认它真的是个文件。
fn resolve_file(raw: &str) -> Result<PathBuf, String> {
  let trimmed = raw.trim().trim_matches('"');
  if trimmed.is_empty() {
    return Err("图片路径为空".to_string());
  }
  let candidate = PathBuf::from(trimmed);
  if !candidate.exists() {
    return Err(format!("图片不存在：{trimmed}"));
  }
  if candidate.is_dir() {
    return Err(format!("这不是图片文件：{trimmed}"));
  }
  Ok(candidate)
}

#[cfg(test)]
mod tests {
  use super::resolve_file;

  #[test]
  fn rejects_blank_path() {
    assert!(resolve_file("   ").is_err());
  }

  #[test]
  fn trims_quotes_and_spaces() {
    let dir = std::env::temp_dir();
    let file = dir.join("yue-image-card-test.txt");
    std::fs::write(&file, b"x").expect("write fixture");
    let raw = format!("  \"{}\"  ", file.to_string_lossy());
    let resolved = resolve_file(&raw).expect("resolve");
    assert_eq!(resolved, file);
    assert!(resolve_file(&dir.to_string_lossy()).is_err());
    let _ = std::fs::remove_file(&file);
  }
}
