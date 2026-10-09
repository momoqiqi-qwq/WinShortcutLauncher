use serde::{Deserialize, Serialize};
use std::{env, fs, path::{Path, PathBuf}, process::Command};

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

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ForegroundBrowserInfo {
  pub name: String,
  pub executable: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BrowserProfileInfo {
  pub id: String,
  pub name: String,
  pub path: String,
  pub profile_key: String,
  /// 修复乱码前的原始名称；仅在名称被自动修复时返回。
  #[serde(skip_serializing_if = "Option::is_none")]
  pub name_raw: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BrowserCatalogEntry {
  pub id: String,
  pub name: String,
  pub executable: String,
  pub engine: String,
  pub profile_root: Option<String>,
  pub source: String,
  pub profiles: Vec<BrowserProfileInfo>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CustomBrowserInput {
  pub id: String,
  pub name: String,
  pub executable: String,
  pub engine: String,
  pub profile_root: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BrowserLaunchTarget {
  pub browser_id: Option<String>,
  pub browser_name: Option<String>,
  pub executable: String,
  pub engine: String,
  pub profile_id: Option<String>,
  pub profile_name: Option<String>,
  pub profile_path: Option<String>,
  pub profile_key: Option<String>,
  pub profile_root: Option<String>,
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

/// 解析 `.lnk` 的真实目标（同步实现）。
///
/// 走的是 PowerShell，单次约半秒，所以只允许在阻塞线程池上调用 ——
/// 见下面 `resolve_lnk` / `get_file_info` 两个 async 命令。
fn resolve_lnk_blocking(path: &str) -> Result<String, String> {
  if !path.to_ascii_lowercase().ends_with(".lnk") {
    return Ok(path.to_string());
  }

  let script = format!(
    "$shell = New-Object -ComObject WScript.Shell; $s = $shell.CreateShortcut('{}'); if ($s.Arguments) {{ Write-Output ($s.TargetPath + ' ' + $s.Arguments) }} else {{ Write-Output $s.TargetPath }}",
    ps_escape(path)
  );
  run_powershell(&script)
}

#[tauri::command]
pub async fn resolve_lnk(path: String) -> Result<String, String> {
  crate::blocking::offload(move || resolve_lnk_blocking(&path)).await
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

#[cfg(target_os = "windows")]
fn browser_name_for_executable(executable: &str) -> Option<&'static str> {
  let file_name = Path::new(executable)
    .file_name()
    .and_then(|value| value.to_str())?
    .to_ascii_lowercase();
  match file_name.as_str() {
    "msedge.exe" => Some("Microsoft Edge"),
    "chrome.exe" => Some("Google Chrome"),
    "firefox.exe" => Some("Mozilla Firefox"),
    "brave.exe" => Some("Brave"),
    "vivaldi.exe" => Some("Vivaldi"),
    "opera.exe" => Some("Opera"),
    "opera_gx.exe" => Some("Opera GX"),
    "arc.exe" => Some("Arc"),
    "zen.exe" => Some("Zen Browser"),
    "floorp.exe" => Some("Floorp"),
    "thorium.exe" => Some("Thorium"),
    "catsxp.exe" => Some("Catsxp"),
    "360chrome.exe" => Some("360 极速浏览器"),
    "360se.exe" => Some("360 安全浏览器"),
    "qqbrowser.exe" => Some("QQ 浏览器"),
    "sogouexplorer.exe" => Some("搜狗浏览器"),
    "whale.exe" => Some("Naver Whale"),
    _ => None,
  }
}

fn browser_engine_for_executable(executable: &str) -> &'static str {
  let file_name = Path::new(executable)
    .file_name()
    .and_then(|value| value.to_str())
    .unwrap_or_default()
    .to_ascii_lowercase();
  match file_name.as_str() {
    "firefox.exe" | "floorp.exe" | "zen.exe" => "gecko",
    "msedge.exe" | "chrome.exe" | "brave.exe" | "vivaldi.exe" | "opera.exe" | "opera_gx.exe" | "arc.exe" | "thorium.exe" | "catsxp.exe" | "360chrome.exe" | "360se.exe" | "qqbrowser.exe" | "sogouexplorer.exe" | "whale.exe" => "chromium",
    _ => "generic",
  }
}

fn clean_browser_id(value: &str) -> String {
  value
    .chars()
    .map(|ch| if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' { ch } else { '-' })
    .collect::<String>()
    .trim_matches('-')
    .to_ascii_lowercase()
}

fn existing_path(candidates: impl IntoIterator<Item = PathBuf>) -> Option<PathBuf> {
  candidates.into_iter().find(|path| path.is_file())
}

/// 查 `App Paths\<exe>` 得到浏览器真实安装路径。
///
/// 以前这里起一个 `powershell.exe` 去 `Test-Path` + `Get-Item`，单次约 400 ms；
/// 每个候选路径都不存在的浏览器都要白付一次，所以直接读注册表。
#[cfg(target_os = "windows")]
fn find_registered_app_path(exe_name: &str) -> Option<PathBuf> {
  let value = crate::windows_registry::find_app_path(exe_name)?;
  let path = PathBuf::from(value.trim().trim_matches('"'));
  path.is_file().then_some(path)
}

#[cfg(not(target_os = "windows"))]
fn find_registered_app_path(_exe_name: &str) -> Option<PathBuf> {
  None
}

fn find_browser_executable(exe_name: &str, candidates: Vec<PathBuf>) -> Option<PathBuf> {
  existing_path(candidates).or_else(|| find_registered_app_path(exe_name))
}

fn read_json_file(path: &Path) -> Option<serde_json::Value> {
  let content = fs::read_to_string(path).ok()?;
  serde_json::from_str(&content).ok()
}

/// 修复被按 GBK 误解码的 UTF-8 名称，例如 Edge Local State 里可能出现的
/// “鐢ㄦ埛閰嶇疆 1”（实为“用户配置 1”）。仅当字符串能以 GBK 无损编码回字节、
/// 且这些字节恰好是合法 UTF-8、结果包含 CJK 时才修复，正常中文名不会命中。
fn repair_double_encoded_name(name: &str) -> Option<String> {
  use encoding_rs::GBK;
  fn has_cjk(value: &str) -> bool {
    value.chars().any(|ch| (0x4E00..=0x9FFF).contains(&(ch as u32)))
  }
  if !has_cjk(name) {
    return None;
  }
  let (bytes, _, had_errors) = GBK.encode(name);
  if had_errors {
    return None;
  }
  let repaired = String::from_utf8(bytes.into_owned()).ok()?;
  if repaired == name || !has_cjk(&repaired) {
    return None;
  }
  Some(repaired)
}

fn scan_chromium_profiles(root: &Path) -> Vec<BrowserProfileInfo> {
  let mut profiles = Vec::new();
  if let Some(json) = read_json_file(&root.join("Local State")) {
    if let Some(cache) = json.pointer("/profile/info_cache").and_then(|value| value.as_object()) {
      for (key, value) in cache {
        let path = root.join(key);
        if !path.is_dir() {
          continue;
        }
        let name = value.get("name").and_then(|entry| entry.as_str()).unwrap_or(key).trim();
        let (display_name, name_raw) = match repair_double_encoded_name(name) {
          Some(repaired) => (repaired, Some(name.to_string())),
          None => (name.to_string(), None),
        };
        profiles.push(BrowserProfileInfo {
          id: key.clone(),
          name: if display_name.is_empty() { key.clone() } else { display_name },
          path: path.to_string_lossy().to_string(),
          profile_key: key.clone(),
          name_raw,
        });
      }
    }
  }

  if profiles.is_empty() {
    if let Ok(entries) = fs::read_dir(root) {
      for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
          continue;
        }
        let key = entry.file_name().to_string_lossy().to_string();
        if key != "Default" && !key.starts_with("Profile ") {
          continue;
        }
        profiles.push(BrowserProfileInfo {
          id: key.clone(),
          name: key.clone(),
          path: path.to_string_lossy().to_string(),
          profile_key: key,
          name_raw: None,
        });
      }
    }
  }

  profiles.sort_by(|a, b| {
    if a.profile_key == "Default" { return std::cmp::Ordering::Less; }
    if b.profile_key == "Default" { return std::cmp::Ordering::Greater; }
    a.name.to_ascii_lowercase().cmp(&b.name.to_ascii_lowercase())
  });
  profiles
}

fn parse_gecko_profiles_ini(root: &Path) -> Vec<BrowserProfileInfo> {
  let ini_path = if root.is_file() { root.to_path_buf() } else { root.join("profiles.ini") };
  let base = ini_path.parent().unwrap_or(root);
  let Ok(content) = fs::read_to_string(&ini_path) else { return Vec::new(); };
  let mut profiles = Vec::new();
  let mut section = String::new();
  let mut name = String::new();
  let mut profile_path = String::new();
  let mut relative = true;

  let mut flush = |section: &str, name: &mut String, profile_path: &mut String, relative: &mut bool, profiles: &mut Vec<BrowserProfileInfo>| {
    if !section.to_ascii_lowercase().starts_with("profile") || profile_path.trim().is_empty() {
      name.clear();
      profile_path.clear();
      *relative = true;
      return;
    }
    let raw_path = profile_path.trim().replace('/', "\\");
    let path = if *relative { base.join(&raw_path) } else { PathBuf::from(&raw_path) };
    if path.is_dir() {
      let display_name = if name.trim().is_empty() {
        path.file_name().and_then(|value| value.to_str()).unwrap_or("Profile").to_string()
      } else {
        name.trim().to_string()
      };
      profiles.push(BrowserProfileInfo {
        id: path.to_string_lossy().to_string(),
        name: display_name.clone(),
        path: path.to_string_lossy().to_string(),
        profile_key: display_name,
        name_raw: None,
      });
    }
    name.clear();
    profile_path.clear();
    *relative = true;
  };

  for raw_line in content.lines() {
    let line = raw_line.trim();
    if line.starts_with('[') && line.ends_with(']') {
      flush(&section, &mut name, &mut profile_path, &mut relative, &mut profiles);
      section = line.trim_matches(&['[', ']'][..]).to_string();
      continue;
    }
    if let Some((key, value)) = line.split_once('=') {
      match key.trim().to_ascii_lowercase().as_str() {
        "name" => name = value.trim().to_string(),
        "path" => profile_path = value.trim().to_string(),
        "isrelative" => relative = value.trim() != "0",
        _ => {}
      }
    }
  }
  flush(&section, &mut name, &mut profile_path, &mut relative, &mut profiles);
  profiles
}

fn scan_gecko_profiles(root: &Path) -> Vec<BrowserProfileInfo> {
  let profiles = parse_gecko_profiles_ini(root);
  if !profiles.is_empty() {
    return profiles;
  }
  let profiles_dir = if root.file_name().and_then(|value| value.to_str()).map(|value| value.eq_ignore_ascii_case("Profiles")).unwrap_or(false) {
    root.to_path_buf()
  } else {
    root.join("Profiles")
  };
  let mut result = Vec::new();
  if let Ok(entries) = fs::read_dir(profiles_dir) {
    for entry in entries.flatten() {
      let path = entry.path();
      if !path.is_dir() { continue; }
      let key = entry.file_name().to_string_lossy().to_string();
      result.push(BrowserProfileInfo {
        id: path.to_string_lossy().to_string(),
        name: key.clone(),
        path: path.to_string_lossy().to_string(),
        profile_key: key,
        name_raw: None,
      });
    }
  }
  result.sort_by(|a, b| a.name.to_ascii_lowercase().cmp(&b.name.to_ascii_lowercase()));
  result
}

fn scan_profiles(engine: &str, root: Option<&Path>) -> Vec<BrowserProfileInfo> {
  let Some(root) = root else { return Vec::new(); };
  match engine {
    "chromium" => scan_chromium_profiles(root),
    "gecko" => scan_gecko_profiles(root),
    _ => Vec::new(),
  }
}

fn built_in_browser_entries() -> Vec<BrowserCatalogEntry> {
  let local = env::var_os("LOCALAPPDATA").map(PathBuf::from);
  let roaming = env::var_os("APPDATA").map(PathBuf::from);
  let program_files = env::var_os("ProgramFiles").map(PathBuf::from);
  let program_files_x86 = env::var_os("ProgramFiles(x86)").map(PathBuf::from);
  let user_profile = env::var_os("USERPROFILE").map(PathBuf::from);
  let mut entries = Vec::new();

  let specs: Vec<(&str, &str, &str, Vec<PathBuf>, Option<PathBuf>)> = vec![
    (
      "chrome", "Google Chrome", "chrome.exe",
      [
        local.as_ref().map(|p| p.join("Google/Chrome/Application/chrome.exe")),
        program_files.as_ref().map(|p| p.join("Google/Chrome/Application/chrome.exe")),
        program_files_x86.as_ref().map(|p| p.join("Google/Chrome/Application/chrome.exe")),
      ].into_iter().flatten().collect(),
      local.as_ref().map(|p| p.join("Google/Chrome/User Data")),
    ),
    (
      "edge", "Microsoft Edge", "msedge.exe",
      [
        program_files_x86.as_ref().map(|p| p.join("Microsoft/Edge/Application/msedge.exe")),
        program_files.as_ref().map(|p| p.join("Microsoft/Edge/Application/msedge.exe")),
        local.as_ref().map(|p| p.join("Microsoft/Edge/Application/msedge.exe")),
      ].into_iter().flatten().collect(),
      local.as_ref().map(|p| p.join("Microsoft/Edge/User Data")),
    ),
    (
      "firefox", "Mozilla Firefox", "firefox.exe",
      [
        program_files.as_ref().map(|p| p.join("Mozilla Firefox/firefox.exe")),
        program_files_x86.as_ref().map(|p| p.join("Mozilla Firefox/firefox.exe")),
      ].into_iter().flatten().collect(),
      roaming.as_ref().map(|p| p.join("Mozilla/Firefox")),
    ),
    (
      "floorp", "Floorp", "floorp.exe",
      [
        program_files.as_ref().map(|p| p.join("Ablaze Floorp/floorp.exe")),
        program_files.as_ref().map(|p| p.join("Floorp/floorp.exe")),
        program_files_x86.as_ref().map(|p| p.join("Ablaze Floorp/floorp.exe")),
        local.as_ref().map(|p| p.join("Programs/Floorp/floorp.exe")),
        local.as_ref().map(|p| p.join("Floorp/floorp.exe")),
        user_profile.as_ref().map(|p| p.join("scoop/apps/floorp/current/floorp.exe")),
      ].into_iter().flatten().collect(),
      roaming.as_ref().map(|p| p.join("Floorp")),
    ),
  ];

  for (id, name, exe_name, candidates, root) in specs {
    let Some(executable) = find_browser_executable(exe_name, candidates) else { continue; };
    let engine = browser_engine_for_executable(executable.to_string_lossy().as_ref()).to_string();
    let mut profile_root = root.filter(|path| path.exists());
    if engine == "gecko" && profile_root.is_none() {
      let adjacent = executable.parent().map(|parent| parent.to_path_buf());
      if let Some(parent) = adjacent {
        if parent.join("profiles.ini").is_file() || parent.join("Profiles").is_dir() {
          profile_root = Some(parent);
        }
      }
    }
    let profiles = scan_profiles(&engine, profile_root.as_deref());
    entries.push(BrowserCatalogEntry {
      id: id.to_string(),
      name: name.to_string(),
      executable: executable.to_string_lossy().to_string(),
      engine,
      profile_root: profile_root.map(|path| path.to_string_lossy().to_string()),
      source: "auto".to_string(),
      profiles,
    });
  }
  entries
}

fn build_browser_catalog(custom_browsers: Vec<CustomBrowserInput>) -> Vec<BrowserCatalogEntry> {
  let mut entries = built_in_browser_entries();
  for (index, custom) in custom_browsers.into_iter().enumerate() {
    let executable = PathBuf::from(custom.executable.trim());
    if !executable.is_file() { continue; }
    let engine = match custom.engine.as_str() {
      "chromium" | "gecko" => custom.engine.clone(),
      _ => browser_engine_for_executable(executable.to_string_lossy().as_ref()).to_string(),
    };
    let profile_root = custom.profile_root.as_ref().map(|value| PathBuf::from(value.trim())).filter(|path| path.exists());
    let profiles = scan_profiles(&engine, profile_root.as_deref());
    let id = if custom.id.trim().is_empty() { format!("custom-{}", index + 1) } else { clean_browser_id(&custom.id) };
    entries.retain(|entry| entry.id != id);
    entries.push(BrowserCatalogEntry {
      id,
      name: if custom.name.trim().is_empty() { executable.file_stem().and_then(|value| value.to_str()).unwrap_or("自定义浏览器").to_string() } else { custom.name.trim().to_string() },
      executable: executable.to_string_lossy().to_string(),
      engine,
      profile_root: profile_root.map(|path| path.to_string_lossy().to_string()),
      source: "custom".to_string(),
      profiles,
    });
  }
  entries
}

/// 扫浏览器目录 + 探测已安装浏览器。会读多个配置目录，放阻塞线程池跑。
#[tauri::command]
pub async fn scan_browsers(custom_browsers: Option<Vec<CustomBrowserInput>>) -> Result<Vec<BrowserCatalogEntry>, String> {
  crate::blocking::offload(move || Ok(build_browser_catalog(custom_browsers.unwrap_or_default()))).await
}

fn browser_launch_target_from_catalog(
  browser_id: &str,
  profile_id: Option<&str>,
  custom_browsers: Vec<CustomBrowserInput>,
) -> Option<BrowserLaunchTarget> {
  let catalog = build_browser_catalog(custom_browsers);
  let browser = catalog.into_iter().find(|entry| entry.id == browser_id)?;
  let profile = profile_id.and_then(|id| browser.profiles.iter().find(|profile| profile.id == id)).cloned();
  Some(BrowserLaunchTarget {
    browser_id: Some(browser.id),
    browser_name: Some(browser.name),
    executable: browser.executable,
    engine: browser.engine,
    profile_id: profile.as_ref().map(|value| value.id.clone()),
    profile_name: profile.as_ref().map(|value| value.name.clone()),
    profile_path: profile.as_ref().map(|value| value.path.clone()),
    profile_key: profile.as_ref().map(|value| value.profile_key.clone()),
    profile_root: browser.profile_root,
  })
}

fn command_arg(value: &str) -> String {
  format!("\"{}\"", value.replace('"', "\\\""))
}

fn launch_browser_target(target: &BrowserLaunchTarget, url: &str, as_admin: bool) -> Result<(), String> {
  let executable = target.executable.trim();
  if executable.is_empty() || !Path::new(executable).is_file() {
    return Err("指定浏览器不存在或路径无效".to_string());
  }
  let engine = match target.engine.as_str() {
    "chromium" | "gecko" | "generic" => target.engine.as_str(),
    _ => browser_engine_for_executable(executable),
  };

  let mut args: Vec<String> = Vec::new();
  match engine {
    "chromium" => {
      if let Some(root) = target.profile_root.as_deref().filter(|value| !value.trim().is_empty()) {
        args.push(format!("--user-data-dir={}", root.trim()));
      }
      if let Some(key) = target.profile_key.as_deref().filter(|value| !value.trim().is_empty()) {
        args.push(format!("--profile-directory={}", key.trim()));
      }
      args.push(url.to_string());
    }
    "gecko" => {
      if let Some(path) = target.profile_path.as_deref().filter(|value| !value.trim().is_empty()) {
        args.push("-profile".to_string());
        args.push(path.trim().to_string());
      } else if let Some(key) = target.profile_key.as_deref().filter(|value| !value.trim().is_empty()) {
        args.push("-P".to_string());
        args.push(key.trim().to_string());
      }
      args.push("-new-tab".to_string());
      args.push(url.to_string());
    }
    _ => args.push(url.to_string()),
  }

  if as_admin {
    let joined = args.iter().map(|value| command_arg(value)).collect::<Vec<_>>().join(" ");
    return shell_execute(executable, Some(&joined), true);
  }

  let mut command = Command::new(executable);
  command.args(&args);
  #[cfg(target_os = "windows")]
  command.creation_flags(CREATE_NO_WINDOW);
  command.spawn().map(|_| ()).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn test_browser_target(target: BrowserLaunchTarget) -> Result<String, String> {
  launch_browser_target(&target, "about:blank", false)?;
  let browser_name = target.browser_name.as_deref().filter(|value| !value.trim().is_empty()).unwrap_or("指定浏览器");
  let profile_name = target.profile_name.as_deref().filter(|value| !value.trim().is_empty());
  Ok(match profile_name {
    Some(profile) => format!("已启动 {} · {}", browser_name, profile),
    None => format!("已启动 {}", browser_name),
  })
}

#[cfg(target_os = "windows")]
fn process_executable_path(process_id: u32) -> Option<String> {
  use windows_sys::Win32::Foundation::CloseHandle;
  use windows_sys::Win32::System::Threading::{OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION};

  let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, process_id) };
  if handle.is_null() {
    return None;
  }
  let mut buffer = vec![0u16; 32768];
  let mut size = buffer.len() as u32;
  let ok = unsafe { QueryFullProcessImageNameW(handle, 0, buffer.as_mut_ptr(), &mut size) };
  unsafe { CloseHandle(handle) };
  if ok == 0 || size == 0 {
    return None;
  }
  Some(String::from_utf16_lossy(&buffer[..size as usize]))
}

#[cfg(target_os = "windows")]
fn browser_for_window(hwnd: windows_sys::Win32::Foundation::HWND) -> Option<ForegroundBrowserInfo> {
  use windows_sys::Win32::System::Threading::GetCurrentProcessId;
  use windows_sys::Win32::UI::WindowsAndMessaging::{GetWindowThreadProcessId, IsIconic, IsWindowVisible};

  if hwnd.is_null() || unsafe { IsWindowVisible(hwnd) } == 0 || unsafe { IsIconic(hwnd) } != 0 {
    return None;
  }
  let mut process_id = 0u32;
  unsafe { GetWindowThreadProcessId(hwnd, &mut process_id) };
  if process_id == 0 || process_id == unsafe { GetCurrentProcessId() } {
    return None;
  }
  let executable = process_executable_path(process_id)?;
  let name = browser_name_for_executable(&executable)?;
  Some(ForegroundBrowserInfo { name: name.to_string(), executable })
}

#[cfg(target_os = "windows")]
fn find_foreground_browser() -> Option<ForegroundBrowserInfo> {
  use windows_sys::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindow, GW_HWNDNEXT};

  let mut hwnd = unsafe { GetForegroundWindow() };
  for _ in 0..48 {
    if hwnd.is_null() {
      break;
    }
    if let Some(browser) = browser_for_window(hwnd) {
      return Some(browser);
    }
    hwnd = unsafe { GetWindow(hwnd, GW_HWNDNEXT) };
  }
  None
}

#[cfg(not(target_os = "windows"))]
fn find_foreground_browser() -> Option<ForegroundBrowserInfo> {
  None
}

#[tauri::command]
pub fn detect_foreground_browser() -> Option<ForegroundBrowserInfo> {
  find_foreground_browser()
}

#[tauri::command]
pub fn read_url_shortcut(path: String) -> Result<String, String> {
  let content = fs::read_to_string(&path).map_err(|error| error.to_string())?;
  for line in content.lines() {
    let trimmed = line.trim();
    if let Some(value) = trimmed.strip_prefix("URL=").or_else(|| trimmed.strip_prefix("url=")) {
      let url = value.trim();
      if url.starts_with("http://") || url.starts_with("https://") {
        return Ok(url.to_string());
      }
    }
  }
  Err("未在 .url 文件中找到网址".to_string())
}

#[tauri::command]
pub fn launch_item(
  path: String,
  as_admin: bool,
  url_open_mode: Option<String>,
  specified_browser_id: Option<String>,
  specified_profile_id: Option<String>,
  custom_browsers: Option<Vec<CustomBrowserInput>>,
) -> Result<(), String> {
  let trimmed = path.trim();
  if trimmed.is_empty() {
    return Err("路径为空".to_string());
  }

  if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
    if url_open_mode.as_deref() == Some("foreground-browser") {
      if let Some(browser) = find_foreground_browser() {
        if shell_execute(&browser.executable, Some(trimmed), as_admin).is_ok() {
          return Ok(());
        }
      }
    }
    if url_open_mode.as_deref() == Some("specified") {
      if let Some(browser_id) = specified_browser_id.as_deref().filter(|value| !value.trim().is_empty()) {
        if let Some(target) = browser_launch_target_from_catalog(browser_id, specified_profile_id.as_deref(), custom_browsers.unwrap_or_default()) {
          if launch_browser_target(&target, trimmed, as_admin).is_ok() {
            return Ok(());
          }
        }
      }
    }
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

/// 写整份配置 JSON。文件可能有几百 KB，别占着主线程。
#[tauri::command]
pub async fn save_config(config: String, path: String) -> Result<(), String> {
  crate::blocking::offload(move || fs::write(path, config).map_err(|error| error.to_string())).await
}

#[tauri::command]
pub async fn load_config(path: String) -> Result<String, String> {
  crate::blocking::offload(move || fs::read_to_string(path).map_err(|error| error.to_string())).await
}

#[tauri::command]
pub async fn get_file_info(path: String) -> Result<FileInfo, String> {
  crate::blocking::offload(move || get_file_info_blocking(&path)).await
}

fn get_file_info_blocking(path: &str) -> Result<FileInfo, String> {
  let resolved_path = resolve_lnk_blocking(path).unwrap_or_else(|_| path.to_string());
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
    path: path.to_string(),
    resolved_path,
    exists: metadata.is_some(),
    is_dir,
    extension,
    r#type: item_type.to_string(),
  })
}



#[cfg(target_os = "windows")]
fn startup_registry_value_name() -> &'static str {
  "Yue launcher"
}

#[cfg(target_os = "windows")]
fn current_exe_run_value() -> Result<String, String> {
  let exe = env::current_exe().map_err(|error| error.to_string())?;
  Ok(format!("\"{}\"", exe.to_string_lossy()))
}


#[cfg(target_os = "windows")]
#[tauri::command]
pub fn set_window_always_on_top(always_on_top: bool) -> Result<(), String> {
  use std::ptr::null;
  use windows_sys::Win32::UI::WindowsAndMessaging::{FindWindowW, SetWindowPos, HWND_NOTOPMOST, HWND_TOPMOST, SWP_NOMOVE, SWP_NOSIZE, SWP_NOACTIVATE, SWP_SHOWWINDOW};
  let title: Vec<u16> = "Yue launcher".encode_utf16().chain(std::iter::once(0)).collect();
  let hwnd = unsafe { FindWindowW(null(), title.as_ptr()) };
  if hwnd.is_null() {
    return Err("未找到主窗口".to_string());
  }
  let insert_after = if always_on_top { HWND_TOPMOST } else { HWND_NOTOPMOST };
  let ok = unsafe { SetWindowPos(hwnd, insert_after, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW) };
  if ok == 0 { Err("设置窗口置顶失败".to_string()) } else { Ok(()) }
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub fn set_window_always_on_top(_always_on_top: bool) -> Result<(), String> {
  Ok(())
}

/// 写/删系统启动项里的自启动登记（原生注册表写入，微秒级）。
///
/// 以前 `set` + `get` 连着跑两个 PowerShell，切换开关要卡近 0.8 秒。
#[cfg(target_os = "windows")]
#[tauri::command]
pub fn set_auto_start(enabled: bool) -> Result<(), String> {
  let value_name = startup_registry_value_name();
  if enabled {
    let run_value = current_exe_run_value()?;
    crate::windows_registry::write_run_entry(value_name, &run_value)
  } else {
    crate::windows_registry::remove_run_entry(value_name).map(|_| ())
  }
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub fn set_auto_start(_enabled: bool) -> Result<(), String> {
  Err("开机自启动目前只支持 Windows".to_string())
}

/// 读系统启动项里的自启动登记（原生注册表读取，微秒级）。
///
/// 以前走 PowerShell：读一次约 330–400 ms，打开设置 → 操作行为时会白卡 0.4 秒。
#[cfg(target_os = "windows")]
#[tauri::command]
pub fn get_auto_start() -> Result<bool, String> {
  let value_name = startup_registry_value_name();
  let expected = env::current_exe().map_err(|error| error.to_string())?.to_string_lossy().to_ascii_lowercase();
  let Some(value) = crate::windows_registry::read_run_entry(value_name) else {
    return Ok(false);
  };
  let value = value.trim().trim_matches('"').to_ascii_lowercase();
  if value.is_empty() {
    return Ok(false);
  }
  Ok(value.contains(&expected) || value.contains("yue launcher"))
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub fn get_auto_start() -> Result<bool, String> {
  Ok(false)
}

#[cfg(target_os = "windows")]
#[tauri::command]
pub fn get_double_click_time_ms() -> u32 {
  unsafe { windows_sys::Win32::UI::Input::KeyboardAndMouse::GetDoubleClickTime() }
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub fn get_double_click_time_ms() -> u32 {
  420
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
