//! 「用 setup.exe 更新」这条链路：查最新版本 → 决定安装包该落到哪个目录 → 下载 → 运行安装包。
//!
//! 下载目录的决策顺序（见 `pick_installer_dir`），每一步都要先过「目录存在 + 真的可写」：
//!   1. 配置里记住的「上次下载目录」——用户上次把安装包放在哪，这次默认还放哪；
//!   2. 当前程序自己所在的目录——自动检测「软件装在哪」，便携版就直接下到它旁边；
//!   3. 系统下载目录（`%USERPROFILE%\Downloads`）；
//!   4. 临时目录兜底。
//!
//! 运行安装包走「临时 cmd 脚本 + 延迟 2 秒」，让当前进程先退出再覆盖安装，
//! 并把当前程序所在目录通过 NSIS 的 `/D=` 传给安装器，默认装回原来的位置。

use crate::blocking::offload;
use serde::{Deserialize, Serialize};
use std::{
  env, fs,
  io::{Read, Write},
  path::{Path, PathBuf},
  process::Command,
  sync::OnceLock,
  time::Duration,
};
use tauri::{AppHandle, Emitter};

const RELEASE_API: &str = "https://api.github.com/repos/momoqiqi-qwq/WinShortcutLauncher/releases/latest";
const RELEASE_PAGE: &str = "https://github.com/momoqiqi-qwq/WinShortcutLauncher/releases/latest";
const USER_AGENT: &str = "Yue-launcher-updater";
const DOWNLOAD_PROGRESS_EVENT: &str = "updater-download-progress";
const DOWNLOAD_BUFFER_BYTES: usize = 128 * 1024;
/// 进度事件的节流：百分比变了、或者累计又走了这么多字节才发一次。
const PROGRESS_MIN_BYTES: u64 = 512 * 1024;
/// 下载安装包可能几十 MB，超时给足。
const DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(900);
const CHECK_TIMEOUT: Duration = Duration::from_secs(15);
/// 脚本先等这么久，留给当前进程退出。
const RESTART_DELAY_PINGS: u32 = 3;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAsset {
  pub name: String,
  pub size: u64,
  pub download_url: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
  pub current_version: String,
  pub latest_version: String,
  pub has_update: bool,
  pub release_url: String,
  pub release_notes: String,
  pub published_at: String,
  pub assets: Vec<UpdateAsset>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateLocations {
  /// 当前程序所在目录（「软件装在哪」）。
  pub app_dir: String,
  /// 当前程序完整路径。
  pub app_exe: String,
  /// 目录里有 uninstall.exe，说明是安装版而不是免安装便捷版。
  pub is_installed_build: bool,
  /// 安装包默认落地的目录。
  pub default_download_dir: String,
  /// 默认目录是哪来的：remembered / app / downloads / temp。
  pub default_download_source: String,
  /// 配置里记住的目录是否仍然可用（不存在或不可写就是 false）。
  pub remembered_dir_usable: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
  pub file_name: String,
  pub received: u64,
  pub total: u64,
  pub percent: u32,
}

#[derive(Debug, Deserialize)]
struct ReleasePayload {
  tag_name: Option<String>,
  html_url: Option<String>,
  body: Option<String>,
  published_at: Option<String>,
  #[serde(default)]
  assets: Vec<AssetPayload>,
}

#[derive(Debug, Deserialize)]
struct AssetPayload {
  name: Option<String>,
  #[serde(default)]
  size: u64,
  browser_download_url: Option<String>,
}

static CHECK_CLIENT: OnceLock<reqwest::blocking::Client> = OnceLock::new();
static DOWNLOAD_CLIENT: OnceLock<reqwest::blocking::Client> = OnceLock::new();

fn build_client(timeout: Duration) -> Result<reqwest::blocking::Client, String> {
  reqwest::blocking::Client::builder()
    .connect_timeout(Duration::from_secs(9))
    .timeout(timeout)
    .redirect(reqwest::redirect::Policy::limited(6))
    .build()
    .map_err(|error| format!("HTTP client 初始化失败：{error}"))
}

fn check_client() -> Result<&'static reqwest::blocking::Client, String> {
  if CHECK_CLIENT.get().is_none() {
    let _ = CHECK_CLIENT.set(build_client(CHECK_TIMEOUT)?);
  }
  CHECK_CLIENT.get().ok_or_else(|| "HTTP client 初始化失败".to_string())
}

fn download_client() -> Result<&'static reqwest::blocking::Client, String> {
  if DOWNLOAD_CLIENT.get().is_none() {
    let _ = DOWNLOAD_CLIENT.set(build_client(DOWNLOAD_TIMEOUT)?);
  }
  DOWNLOAD_CLIENT.get().ok_or_else(|| "HTTP client 初始化失败".to_string())
}

fn parse_version(raw: &str) -> Option<(u64, u64, u64)> {
  let trimmed = raw.trim().trim_start_matches(['v', 'V']);
  if trimmed.is_empty() {
    return None;
  }
  let core = trimmed.split(['-', '+']).next().unwrap_or(trimmed);
  let mut parts = core.split('.');
  let major = parts.next()?.trim().parse::<u64>().ok()?;
  let minor = parts.next().unwrap_or("0").trim().parse::<u64>().ok()?;
  let patch = parts.next().unwrap_or("0").trim().parse::<u64>().ok()?;
  Some((major, minor, patch))
}

fn is_newer_version(latest: &str, current: &str) -> bool {
  match (parse_version(latest), parse_version(current)) {
    (Some(latest), Some(current)) => latest > current,
    (Some(_), None) => true,
    _ => false,
  }
}

fn normalize_version(raw: &str) -> String {
  let trimmed = raw.trim();
  let without_prefix = trimmed.trim_start_matches(['v', 'V']);
  match parse_version(without_prefix) {
    Some((major, minor, patch)) => format!("{major}.{minor}.{patch}"),
    None => without_prefix.to_string(),
  }
}

/// 目录必须真的能写：Program Files 这类需要提权的目录会被跳过。
fn is_writable_dir(dir: &Path) -> bool {
  if !dir.is_dir() {
    return false;
  }
  let probe = dir.join(format!(".yue-launcher-write-probe-{}", std::process::id()));
  match fs::File::create(&probe) {
    Ok(_) => {
      let _ = fs::remove_file(&probe);
      true
    }
    Err(_) => false,
  }
}

fn current_exe_dir() -> Option<PathBuf> {
  let exe = env::current_exe().ok()?;
  exe.parent().map(|parent| parent.to_path_buf())
}

fn downloads_dir() -> Option<PathBuf> {
  if let Ok(profile) = env::var("USERPROFILE") {
    let candidate = PathBuf::from(profile).join("Downloads");
    if candidate.is_dir() {
      return Some(candidate);
    }
  }
  None
}

fn pick_installer_dir(preferred: Option<&str>) -> (PathBuf, &'static str) {
  let mut candidates: Vec<(PathBuf, &'static str)> = Vec::new();
  if let Some(dir) = preferred.map(str::trim).filter(|value| !value.is_empty()) {
    candidates.push((PathBuf::from(dir), "remembered"));
  }
  if let Some(dir) = current_exe_dir() {
    candidates.push((dir, "app"));
  }
  if let Some(dir) = downloads_dir() {
    candidates.push((dir, "downloads"));
  }
  let temp = env::temp_dir();
  candidates.push((temp.clone(), "temp"));

  for (dir, source) in candidates {
    if is_writable_dir(&dir) {
      return (dir, source);
    }
  }
  (temp, "temp")
}

fn looks_like_installed_build(app_dir: &Path) -> bool {
  app_dir.join("uninstall.exe").is_file()
}

fn sanitize_file_name(raw: &str) -> Result<String, String> {
  let name = raw.trim();
  if name.is_empty() {
    return Err("安装包文件名为空".to_string());
  }
  if name.contains('/') || name.contains('\\') || name.contains("..") {
    return Err("安装包文件名不合法".to_string());
  }
  Ok(name.to_string())
}

/// 在 release 的附件里挑安装包：优先带 setup 的 exe，其次任意 exe。
fn installer_index(assets: &[UpdateAsset]) -> Option<usize> {
  assets
    .iter()
    .position(|asset| {
      let name = asset.name.to_ascii_lowercase();
      name.ends_with(".exe") && name.contains("setup")
    })
    .or_else(|| {
      assets
        .iter()
        .position(|asset| asset.name.to_ascii_lowercase().ends_with(".exe"))
    })
}

/// 安装包排到最前，其余保持原顺序。
fn reorder_assets(assets: Vec<UpdateAsset>) -> Vec<UpdateAsset> {
  let Some(index) = installer_index(&assets) else {
    return assets;
  };
  let mut ordered = Vec::with_capacity(assets.len());
  ordered.push(assets[index].clone());
  for (position, asset) in assets.into_iter().enumerate() {
    if position != index {
      ordered.push(asset);
    }
  }
  ordered
}

fn check_update_blocking(current_version: &str) -> Result<UpdateInfo, String> {
  let client = check_client()?;
  let response = client
    .get(RELEASE_API)
    .header(reqwest::header::USER_AGENT, USER_AGENT)
    .header(reqwest::header::ACCEPT, "application/vnd.github+json")
    .send()
    .map_err(|error| format!("查询最新版本失败：{error}"))?;

  let status = response.status();
  if status.as_u16() == 404 {
    return Err("仓库还没有发布任何 Release".to_string());
  }
  if !status.is_success() {
    return Err(format!("查询最新版本失败：HTTP {status}"));
  }

  // reqwest 没开 json feature，这里手动解析，省得为它再加依赖特性。
  let body = response
    .text()
    .map_err(|error| format!("读取版本信息失败：{error}"))?;
  let payload: ReleasePayload =
    serde_json::from_str(&body).map_err(|error| format!("解析版本信息失败：{error}"))?;

  let latest_version = normalize_version(payload.tag_name.as_deref().unwrap_or_default());
  if latest_version.is_empty() {
    return Err("最新版本号为空".to_string());
  }

  let assets = payload
    .assets
    .iter()
    .filter_map(|asset| {
      let name = asset.name.as_deref()?.trim().to_string();
      let download_url = asset.browser_download_url.as_deref()?.trim().to_string();
      if name.is_empty() || download_url.is_empty() {
        return None;
      }
      Some(UpdateAsset { name, size: asset.size, download_url })
    })
    .collect::<Vec<_>>();

  // 附件按「安装包优先」排好，前端取第一个即可，不用再猜。
  let ordered = reorder_assets(assets);

  Ok(UpdateInfo {
    current_version: normalize_version(current_version),
    has_update: is_newer_version(&latest_version, current_version),
    latest_version,
    release_url: payload
      .html_url
      .filter(|value| !value.trim().is_empty())
      .unwrap_or_else(|| RELEASE_PAGE.to_string()),
    release_notes: payload.body.unwrap_or_default(),
    published_at: payload.published_at.unwrap_or_default(),
    assets: ordered,
  })
}

fn download_blocking(app: &AppHandle, url: &str, target: &Path) -> Result<String, String> {
  if let Some(parent) = target.parent() {
    if !parent.is_dir() {
      fs::create_dir_all(parent)
        .map_err(|error| format!("无法创建下载目录 {}：{error}", parent.display()))?;
    }
  }

  let client = download_client()?;
  let mut response = client
    .get(url)
    .header(reqwest::header::USER_AGENT, USER_AGENT)
    .send()
    .map_err(|error| format!("下载安装包失败：{error}"))?;

  let status = response.status();
  if !status.is_success() {
    return Err(format!("下载安装包失败：HTTP {status}"));
  }

  let file_name = target
    .file_name()
    .and_then(|value| value.to_str())
    .unwrap_or("setup.exe")
    .to_string();
  let total = response.content_length().unwrap_or(0);
  let part_path = PathBuf::from(format!("{}.part", target.display()));

  {
    let mut file = fs::File::create(&part_path)
      .map_err(|error| format!("无法写入 {}：{error}", part_path.display()))?;
    let mut buffer = vec![0u8; DOWNLOAD_BUFFER_BYTES];
    let mut received: u64 = 0;
    let mut last_percent: u32 = u32::MAX;
    let mut last_emit_bytes: u64 = 0;

    let _ = app.emit(
      DOWNLOAD_PROGRESS_EVENT,
      DownloadProgress { file_name: file_name.clone(), received: 0, total, percent: 0 },
    );

    loop {
      let read = response
        .read(&mut buffer)
        .map_err(|error| format!("下载中断：{error}"))?;
      if read == 0 {
        break;
      }
      file
        .write_all(&buffer[..read])
        .map_err(|error| format!("写入安装包失败：{error}"))?;
      received += read as u64;

      let percent = received
        .saturating_mul(100)
        .checked_div(total)
        .map_or(0, |value| value.min(100) as u32);
      if percent != last_percent || received.saturating_sub(last_emit_bytes) >= PROGRESS_MIN_BYTES {
        last_percent = percent;
        last_emit_bytes = received;
        let _ = app.emit(
          DOWNLOAD_PROGRESS_EVENT,
          DownloadProgress { file_name: file_name.clone(), received, total, percent },
        );
      }
    }

    file.flush().map_err(|error| format!("写入安装包失败：{error}"))?;
    if received == 0 {
      drop(file);
      let _ = fs::remove_file(&part_path);
      return Err("下载到的文件为空，请检查网络或稍后重试".to_string());
    }
  }

  // Windows 上 rename 不会覆盖已存在的文件，先删目标。
  let _ = fs::remove_file(target);
  fs::rename(&part_path, target).map_err(|error| format!("保存安装包失败：{error}"))?;

  let _ = app.emit(
    DOWNLOAD_PROGRESS_EVENT,
    DownloadProgress {
      file_name: file_name.clone(),
      received: total,
      total,
      percent: 100,
    },
  );

  Ok(target.to_string_lossy().to_string())
}

fn now_millis() -> u128 {
  std::time::SystemTime::now()
    .duration_since(std::time::UNIX_EPOCH)
    .unwrap_or_default()
    .as_millis()
}

fn launch_installer_blocking(
  installer_path: &str,
  install_dir: Option<&str>,
  silent: bool,
) -> Result<(), String> {
  let installer = Path::new(installer_path.trim());
  if !installer.is_file() {
    return Err(format!("安装包不存在：{}", installer.display()));
  }
  let extension = installer
    .extension()
    .and_then(|value| value.to_str())
    .unwrap_or_default()
    .to_ascii_lowercase();
  if extension != "exe" {
    return Err("只支持运行 .exe 安装包".to_string());
  }

  let script_path = env::temp_dir().join(format!("yue-launcher-update-{}.cmd", now_millis()));
  let mut script = String::new();
  script.push_str("@echo off\r\n");
  script.push_str(&format!(
    "ping -n {RESTART_DELAY_PINGS} 127.0.0.1 >nul\r\n"
  ));
  script.push_str(&format!("start \"\" \"{}\"", installer.display()));
  if silent {
    script.push_str(" /S");
  }
  if let Some(dir) = install_dir.map(str::trim).filter(|value| !value.is_empty()) {
    // NSIS 规定：/D 必须是最后一个参数，且不能加引号（路径里的空格允许）。
    let trimmed = dir.trim_end_matches(['\\', '/']);
    if !trimmed.is_empty() {
      script.push_str(&format!(" /D={trimmed}"));
    }
  }
  script.push_str("\r\n");
  script.push_str("del /q \"%~f0\" >nul 2>&1\r\n");

  fs::write(&script_path, script).map_err(|error| format!("无法创建更新脚本：{error}"))?;

  Command::new("cmd.exe")
    .args(["/C", "start", "", "/min"])
    .arg(&script_path)
    .spawn()
    .map(|_| ())
    .map_err(|error| format!("启动安装包失败：{error}"))
}

/// 查最新版本并与当前版本比对。附件按「安装包优先」排序返回。
#[tauri::command]
pub async fn check_update(current_version: String) -> Result<UpdateInfo, String> {
  offload(move || check_update_blocking(&current_version)).await
}

/// 自动检测：当前程序在哪、该不该复用上次的下载目录、安装包默认落到哪。
#[tauri::command]
pub async fn get_update_locations(preferred_dir: Option<String>) -> Result<UpdateLocations, String> {
  offload(move || {
    let app_exe = env::current_exe().map_err(|error| format!("无法获取当前程序路径：{error}"))?;
    let app_dir = app_exe
      .parent()
      .map(|parent| parent.to_path_buf())
      .unwrap_or_else(|| app_exe.clone());
    let remembered = preferred_dir
      .as_deref()
      .map(str::trim)
      .filter(|value| !value.is_empty())
      .map(|value| is_writable_dir(Path::new(value)));
    let (dir, source) = pick_installer_dir(preferred_dir.as_deref());

    Ok(UpdateLocations {
      app_dir: app_dir.to_string_lossy().to_string(),
      app_exe: app_exe.to_string_lossy().to_string(),
      is_installed_build: looks_like_installed_build(&app_dir),
      default_download_dir: dir.to_string_lossy().to_string(),
      default_download_source: source.to_string(),
      remembered_dir_usable: remembered.unwrap_or(false),
    })
  })
  .await
}

/// 把安装包下载到指定目录（目录不存在会自动创建），返回最终文件路径。
#[tauri::command]
pub async fn download_installer(
  app: AppHandle,
  url: String,
  directory: String,
  file_name: String,
) -> Result<String, String> {
  let url = url.trim().to_string();
  if url.is_empty() {
    return Err("下载地址为空".to_string());
  }
  let dir = PathBuf::from(directory.trim());
  if dir.as_os_str().is_empty() {
    return Err("下载目录为空".to_string());
  }
  let target = dir.join(sanitize_file_name(&file_name)?);

  offload(move || download_blocking(&app, &url, &target)).await
}

/// 运行安装包（默认把当前程序所在目录作为安装目录传进去），可选先结束当前应用。
#[tauri::command]
pub async fn launch_installer(
  app: AppHandle,
  installer_path: String,
  install_dir: Option<String>,
  silent: Option<bool>,
  exit_after: Option<bool>,
) -> Result<(), String> {
  let silent = silent.unwrap_or(false);
  offload(move || launch_installer_blocking(&installer_path, install_dir.as_deref(), silent)).await?;
  if exit_after.unwrap_or(false) {
    app.exit(0);
  }
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn parses_and_compares_versions() {
    assert_eq!(parse_version("v0.1.149"), Some((0, 1, 149)));
    assert_eq!(parse_version("0.1.9"), Some((0, 1, 9)));
    assert_eq!(parse_version("1.2"), Some((1, 2, 0)));
    assert_eq!(parse_version("v2.0.0-beta.1"), Some((2, 0, 0)));
    assert_eq!(parse_version(""), None);
    assert!(is_newer_version("v0.1.150", "0.1.149"));
    assert!(!is_newer_version("v0.1.149", "0.1.149"));
    assert!(!is_newer_version("v0.1.9", "0.1.10"));
    assert_eq!(normalize_version("V0.1.150"), "0.1.150");
  }

  #[test]
  fn rejects_unsafe_file_names() {
    assert_eq!(sanitize_file_name(" Yue-setup.exe ").unwrap(), "Yue-setup.exe");
    assert!(sanitize_file_name("../evil.exe").is_err());
    assert!(sanitize_file_name("dir\\evil.exe").is_err());
    assert!(sanitize_file_name("   ").is_err());
  }
}
