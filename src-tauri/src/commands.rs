use serde::Serialize;
use std::{collections::hash_map::DefaultHasher, env, fs, hash::{Hash, Hasher}, path::{Path, PathBuf}, process::Command};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileInfo {
  pub name: String,
  pub path: String,
  pub resolved_path: String,
  pub exists: bool,
  pub is_dir: bool,
  pub extension: String,
  pub r#type: String,
}

const CREATE_NO_WINDOW: u32 = 0x08000000;

fn quote_for_explorer(value: &str) -> String {
  if value.starts_with('"') && value.ends_with('"') {
    value.to_string()
  } else {
    format!("\"{}\"", value.replace('"', "\\\""))
  }
}

fn ps_escape(value: &str) -> String {
  value.replace('`', "``").replace('\'', "''")
}

fn run_powershell(script: &str) -> Result<String, String> {
  let mut command = Command::new("powershell.exe");
  command.args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script]);
  #[cfg(target_os = "windows")]
  command.creation_flags(CREATE_NO_WINDOW);

  let output = command.output().map_err(|error| error.to_string())?;

  if output.status.success() {
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
  } else {
    Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
  }
}

#[tauri::command]
pub fn resolve_lnk(path: String) -> Result<String, String> {
  if !path.to_ascii_lowercase().ends_with(".lnk") {
    return Ok(path);
  }

  let script = format!(
    "$shell = New-Object -ComObject WScript.Shell; $s = $shell.CreateShortcut('{}'); if ($s.Arguments) {{ Write-Output ($s.TargetPath + ' ' + $s.Arguments) }} else {{ Write-Output $s.TargetPath }}",
    ps_escape(&path)
  );
  run_powershell(&script)
}

fn split_command_line(value: &str) -> (String, Option<String>) {
  let trimmed = value.trim();
  if trimmed.starts_with('"') {
    if let Some(end) = trimmed[1..].find('"') {
      let file = trimmed[1..=end].to_string();
      let rest = trimmed[end + 2..].trim();
      return (file, (!rest.is_empty()).then(|| rest.to_string()));
    }
  }
  let mut parts = trimmed.splitn(2, char::is_whitespace);
  let file = parts.next().unwrap_or(trimmed).to_string();
  let args = parts.next().map(str::trim).filter(|s| !s.is_empty()).map(ToOwned::to_owned);
  (file, args)
}

#[cfg(target_os = "windows")]
fn shell_execute(file: &str, args: Option<&str>, as_admin: bool) -> Result<(), String> {
  use std::{ffi::OsStr, os::windows::ffi::OsStrExt, ptr};
  use windows_sys::Win32::UI::Shell::ShellExecuteW;
  use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

  fn wide(value: &str) -> Vec<u16> {
    OsStr::new(value).encode_wide().chain(Some(0)).collect()
  }

  let verb = wide(if as_admin { "runas" } else { "open" });
  let file_w = wide(file);
  let args_w = args.map(wide);
  let args_ptr = args_w.as_ref().map_or(ptr::null(), |value| value.as_ptr());
  let result = unsafe {
    ShellExecuteW(
      ptr::null_mut(),
      verb.as_ptr(),
      file_w.as_ptr(),
      args_ptr,
      ptr::null(),
      SW_SHOWNORMAL,
    )
  } as isize;

  if result <= 32 {
    Err(format!("ShellExecuteW 启动失败，错误码：{}", result))
  } else {
    Ok(())
  }
}

#[cfg(not(target_os = "windows"))]
fn shell_execute(file: &str, args: Option<&str>, _as_admin: bool) -> Result<(), String> {
  let mut command = Command::new(file);
  if let Some(args) = args {
    command.args(args.split_whitespace());
  }
  command.spawn().map(|_| ()).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn launch_item(path: String, as_admin: bool) -> Result<(), String> {
  let trimmed = path.trim();
  if trimmed.is_empty() {
    return Err("路径为空".to_string());
  }

  if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
    return shell_execute(trimmed, None, as_admin);
  }

  if Path::new(trimmed).exists() {
    return shell_execute(trimmed, None, as_admin);
  }

  let (file, args) = split_command_line(trimmed);
  shell_execute(&file, args.as_deref(), as_admin)
}

#[tauri::command]
pub fn open_file_location(path: String) -> Result<(), String> {
  let target = Path::new(&path);
  let arg = if target.is_dir() {
    quote_for_explorer(&path)
  } else {
    format!("/select,{}", quote_for_explorer(&path))
  };

  Command::new("explorer.exe")
    .arg(arg)
    .spawn()
    .map(|_| ())
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_config(config: String, path: String) -> Result<(), String> {
  fs::write(path, config).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn load_config(path: String) -> Result<String, String> {
  fs::read_to_string(path).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_file_info(path: String) -> Result<FileInfo, String> {
  let resolved_path = resolve_lnk(path.clone()).unwrap_or_else(|_| path.clone());
  let metadata = fs::metadata(&resolved_path).ok();
  let target = Path::new(&resolved_path);
  let name = target
    .file_stem()
    .or_else(|| target.file_name())
    .map(|value| value.to_string_lossy().to_string())
    .unwrap_or_else(|| resolved_path.clone());
  let extension = target
    .extension()
    .map(|value| value.to_string_lossy().to_ascii_lowercase())
    .unwrap_or_default();
  let is_dir = metadata.as_ref().map(|meta| meta.is_dir()).unwrap_or(false);
  let item_type = if resolved_path.starts_with("http://") || resolved_path.starts_with("https://") {
    "url"
  } else if is_dir {
    "folder"
  } else if ["exe", "bat", "cmd", "ps1", "msc", "cpl"].contains(&extension.as_str()) || !Path::new(&resolved_path).exists() {
    "command"
  } else {
    "file"
  };

  Ok(FileInfo {
    name,
    path,
    resolved_path,
    exists: metadata.is_some(),
    is_dir,
    extension,
    r#type: item_type.to_string(),
  })
}


fn launcher_cache_dir() -> PathBuf {
  #[cfg(target_os = "windows")]
  {
    if let Ok(appdata) = env::var("APPDATA") {
      return PathBuf::from(appdata).join("YueLauncher").join("favicons");
    }
  }
  if let Ok(home) = env::var("HOME") {
    return PathBuf::from(home).join(".yue-launcher").join("favicons");
  }
  env::temp_dir().join("yue-launcher").join("favicons")
}

fn safe_file_part(value: &str) -> String {
  let mut out = String::new();
  for ch in value.chars() {
    if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' || ch == '.' {
      out.push(ch);
    } else {
      out.push('_');
    }
  }
  if out.is_empty() { "site".to_string() } else { out }
}

fn host_from_url(value: &str) -> String {
  let trimmed = value.trim();
  let after_scheme = trimmed.split_once("://").map(|(_, rest)| rest).unwrap_or(trimmed);
  let authority = after_scheme.split('/').next().unwrap_or(after_scheme);
  let host_port = authority.rsplit('@').next().unwrap_or(authority);
  host_port.split(':').next().unwrap_or(host_port).trim().to_ascii_lowercase()
}


fn favicon_file_host(path: &Path) -> Option<String> {
  let ext = path.extension()?.to_string_lossy().to_ascii_lowercase();
  if !matches!(ext.as_str(), "png" | "jpg" | "jpeg" | "webp" | "svg" | "ico") {
    return None;
  }
  let stem = path.file_stem()?.to_string_lossy();
  let (host, hash) = stem.rsplit_once('_')?;
  if hash.len() != 16 || !hash.chars().all(|ch| ch.is_ascii_hexdigit()) {
    return None;
  }
  let host = host.trim().to_ascii_lowercase();
  if host.is_empty() { None } else { Some(host) }
}

fn favicon_host_match_score(requested_host: &str, cached_host: &str) -> u8 {
  if requested_host == cached_host {
    return 4;
  }
  let requested_without_www = requested_host.strip_prefix("www.").unwrap_or(requested_host);
  let cached_without_www = cached_host.strip_prefix("www.").unwrap_or(cached_host);
  if requested_without_www == cached_without_www {
    return 3;
  }
  if requested_host.ends_with(&format!(".{}", cached_host)) || requested_without_www.ends_with(&format!(".{}", cached_without_www)) {
    return 2;
  }
  if cached_host.ends_with(&format!(".{}", requested_host)) || cached_without_www.ends_with(&format!(".{}", requested_without_www)) {
    return 1;
  }
  0
}

#[tauri::command]
pub fn get_cached_website_favicon(url: String) -> Result<String, String> {
  let host = host_from_url(&url);
  if host.is_empty() {
    return Err("无法解析网址域名".to_string());
  }
  let dir = launcher_cache_dir();
  let entries = fs::read_dir(&dir).map_err(|_| "本地网站图标缓存为空".to_string())?;
  let mut best: Option<(u8, u128, PathBuf)> = None;

  for entry in entries.flatten() {
    let path = entry.path();
    if !path.is_file() {
      continue;
    }
    let Some(cached_host) = favicon_file_host(&path) else { continue; };
    let score = favicon_host_match_score(&host, &cached_host);
    if score == 0 {
      continue;
    }
    let modified = entry
      .metadata()
      .and_then(|metadata| metadata.modified())
      .ok()
      .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
      .map(|duration| duration.as_millis())
      .unwrap_or(0);
    let replace = best.as_ref().map(|(best_score, best_modified, _)| {
      score > *best_score || (score == *best_score && modified > *best_modified)
    }).unwrap_or(true);
    if replace {
      best = Some((score, modified, path));
    }
  }

  if let Some((_, _, path)) = best {
    Ok(path.to_string_lossy().to_string())
  } else {
    Err("未找到可复用的网站图标缓存".to_string())
  }
}

#[tauri::command]
pub fn fetch_website_favicon(url: String) -> Result<String, String> {
  let trimmed = url.trim();
  if !(trimmed.starts_with("http://") || trimmed.starts_with("https://")) {
    return Err("只支持 http/https 网址".to_string());
  }
  let host = host_from_url(trimmed);
  if host.is_empty() {
    return Err("无法解析网址域名".to_string());
  }

  let dir = launcher_cache_dir();
  fs::create_dir_all(&dir).map_err(|error| error.to_string())?;

  let mut hasher = DefaultHasher::new();
  trimmed.hash(&mut hasher);
  let hash = hasher.finish();
  let prefix = dir.join(format!("{}_{:016x}", safe_file_part(&host), hash));
  let prefix_string = prefix.to_string_lossy().to_string();

  let script_template = r#"
$ErrorActionPreference = 'Stop'
$rawUrl = '__URL__'
$hostName = '__HOST__'
$outPrefix = '__PREFIX__'
$uri = [Uri]$rawUrl
$candidates = New-Object System.Collections.Generic.List[string]
if ($hostName) { $candidates.Add('https://www.google.com/s2/favicons?domain=' + [uri]::EscapeDataString($hostName) + '&sz=128') }
try { $candidates.Add((New-Object Uri($uri, '/favicon.ico')).AbsoluteUri) } catch {}

foreach ($candidate in $candidates) {
  try {
    $response = Invoke-WebRequest -Uri $candidate -UseBasicParsing -TimeoutSec 8 -MaximumRedirection 5
    $bytes = $response.Content
    if ($bytes -is [string]) { $bytes = [System.Text.Encoding]::UTF8.GetBytes($bytes) }
    if ($null -eq $bytes -or $bytes.Length -lt 32) { continue }
    $contentType = ''
    try { $contentType = [string]$response.Headers['Content-Type'] } catch {}
    $ext = 'png'
    if ($contentType -match 'svg') { $ext = 'svg' }
    elseif ($contentType -match 'x-icon|icon|ico') { $ext = 'ico' }
    elseif ($contentType -match 'webp') { $ext = 'webp' }
    elseif ($contentType -match 'jpeg|jpg') { $ext = 'jpg' }
    elseif ($candidate -match '\.ico($|\?)') { $ext = 'ico' }
    $out = $outPrefix + '.' + $ext
    [System.IO.File]::WriteAllBytes($out, [byte[]]$bytes)
    Write-Output $out
    exit 0
  } catch {
    continue
  }
}
exit 1
"#;

  let script = script_template
    .replace("__URL__", &ps_escape(trimmed))
    .replace("__HOST__", &ps_escape(&host))
    .replace("__PREFIX__", &ps_escape(&prefix_string));
  let out = run_powershell(&script)?;
  if out.trim().is_empty() {
    Err("未获取到网站图标".to_string())
  } else {
    Ok(out.lines().last().unwrap_or(out.trim()).trim().to_string())
  }
}

#[cfg(target_os = "windows")]
#[tauri::command]
pub fn open_windows_clipboard_history() -> Result<(), String> {
  use std::{thread, time::Duration};
  use windows_sys::Win32::UI::Input::KeyboardAndMouse::{keybd_event, KEYEVENTF_KEYUP};

  const VK_LWIN_CODE: u8 = 0x5B;
  const VK_V_CODE: u8 = 0x56;

  unsafe {
    keybd_event(VK_LWIN_CODE, 0, 0, 0);
    keybd_event(VK_V_CODE, 0, 0, 0);
    thread::sleep(Duration::from_millis(30));
    keybd_event(VK_V_CODE, 0, KEYEVENTF_KEYUP, 0);
    keybd_event(VK_LWIN_CODE, 0, KEYEVENTF_KEYUP, 0);
  }
  Ok(())
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub fn open_windows_clipboard_history() -> Result<(), String> {
  Err("Windows clipboard history is only available on Windows".to_string())
}
