use std::{
  collections::hash_map::DefaultHasher,
  fs,
  hash::{Hash, Hasher},
  path::{Path, PathBuf},
  time::UNIX_EPOCH,
};

use serde::Serialize;
use tauri::{AppHandle, Manager};

const SUPPORTED_EXTENSIONS: &[&str] = &[
  "png", "jpg", "jpeg", "webp", "bmp", "gif", "apng", "svg", "mp4", "webm", "ogv", "ogg",
];
const LARGE_MEDIA_WARNING_BYTES: u64 = 256 * 1024 * 1024;
const MAX_MEDIA_BYTES: u64 = 2 * 1024 * 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundMediaInfo {
  size_bytes: u64,
  extension: String,
  already_cached: bool,
  requires_confirmation: bool,
}

fn normalized_extension(path: &Path) -> Result<String, String> {
  let extension = path
    .extension()
    .map(|value| value.to_string_lossy().to_ascii_lowercase())
    .unwrap_or_default();
  if SUPPORTED_EXTENSIONS.contains(&extension.as_str()) {
    Ok(extension)
  } else {
    let label = if extension.is_empty() { "未知" } else { extension.as_str() };
    Err(format!("不支持的背景媒体格式：{label}"))
  }
}

fn media_fingerprint(path: &Path, metadata: &fs::Metadata) -> u64 {
  let mut hasher = DefaultHasher::new();
  path.to_string_lossy().to_lowercase().hash(&mut hasher);
  metadata.len().hash(&mut hasher);
  metadata
    .modified()
    .ok()
    .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
    .map(|value| value.as_millis())
    .unwrap_or_default()
    .hash(&mut hasher);
  hasher.finish()
}

fn wallpaper_directory(app: &AppHandle) -> Result<PathBuf, String> {
  let directory = app
    .path()
    .app_data_dir()
    .map_err(|error| format!("无法定位应用数据目录：{error}"))?
    .join("wallpapers");
  fs::create_dir_all(&directory).map_err(|error| format!("无法创建壁纸目录：{error}"))?;
  Ok(directory)
}

fn inspect_media(app: &AppHandle, path: &str) -> Result<(PathBuf, fs::Metadata, String, PathBuf), String> {
  let source = PathBuf::from(path.trim());
  if !source.is_file() {
    return Err("选择的背景媒体不存在或不是文件".to_string());
  }
  let extension = normalized_extension(&source)?;
  let metadata = fs::metadata(&source).map_err(|error| format!("无法读取背景媒体信息：{error}"))?;
  if metadata.len() > MAX_MEDIA_BYTES {
    return Err("背景媒体超过 2 GB 安全上限，请先压缩或转换后再导入".to_string());
  }
  let directory = wallpaper_directory(app)?;
  Ok((source, metadata, extension, directory))
}

#[tauri::command]
pub fn inspect_background_media(app: AppHandle, path: String) -> Result<BackgroundMediaInfo, String> {
  let (source, metadata, extension, directory) = inspect_media(&app, &path)?;
  Ok(BackgroundMediaInfo {
    size_bytes: metadata.len(),
    extension,
    already_cached: source.starts_with(&directory),
    requires_confirmation: metadata.len() >= LARGE_MEDIA_WARNING_BYTES && !source.starts_with(&directory),
  })
}

fn copy_background_media(app: AppHandle, path: String, allow_large: bool) -> Result<String, String> {
  let (source, metadata, extension, directory) = inspect_media(&app, &path)?;
  if source.starts_with(&directory) {
    return Ok(source.to_string_lossy().to_string());
  }
  if metadata.len() >= LARGE_MEDIA_WARNING_BYTES && !allow_large {
    return Err("LARGE_MEDIA_CONFIRMATION_REQUIRED".to_string());
  }

  let fingerprint = media_fingerprint(&source, &metadata);
  let destination = directory.join(format!("wallpaper-{fingerprint:016x}.{extension}"));
  if !destination.exists() {
    fs::copy(&source, &destination).map_err(|error| format!("无法保存壁纸副本：{error}"))?;
  }
  Ok(destination.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn cache_background_media(app: AppHandle, path: String, allow_large: Option<bool>) -> Result<String, String> {
  tauri::async_runtime::spawn_blocking(move || copy_background_media(app, path, allow_large.unwrap_or(false)))
    .await
    .map_err(|error| format!("壁纸缓存任务异常结束：{error}"))?
}
