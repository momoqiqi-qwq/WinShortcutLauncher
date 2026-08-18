use serde::{Deserialize, Serialize};
use std::{env, fs, path::{Path, PathBuf}, process::Command, time::{SystemTime, UNIX_EPOCH}};

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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FaviconTestResult {
  pub provider_id: String,
  pub provider_name: String,
  pub group: String,
  pub success: bool,
  pub elapsed_ms: u128,
  pub url: Option<String>,
  pub error: Option<String>,
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

#[cfg(target_os = "windows")]
fn find_registered_app_path(exe_name: &str) -> Option<PathBuf> {
  let script = format!(
    "$keys=@('HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\{0}','HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\{0}'); foreach($k in $keys){{if(Test-Path $k){{$v=(Get-Item $k).GetValue(''); if($v){{Write-Output $v; break}}}}}}",
    ps_escape(exe_name)
  );
  let value = run_powershell(&script).ok()?;
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
        profiles.push(BrowserProfileInfo {
          id: key.clone(),
          name: if name.is_empty() { key.clone() } else { name.to_string() },
          path: path.to_string_lossy().to_string(),
          profile_key: key.clone(),
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

#[tauri::command]
pub fn scan_browsers(custom_browsers: Option<Vec<CustomBrowserInput>>) -> Vec<BrowserCatalogEntry> {
  build_browser_catalog(custom_browsers.unwrap_or_default())
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
      return PathBuf::from(appdata).join("WinShortcutLauncher").join("favicons");
    }
  }
  if let Ok(home) = env::var("HOME") {
    return PathBuf::from(home).join(".win-shortcut-launcher").join("favicons");
  }
  env::temp_dir().join("win-shortcut-launcher").join("favicons")
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

fn favicon_cache_domain(host: &str) -> String {
  const COMPOUND_SUFFIXES: [&str; 18] = [
    "com.cn", "net.cn", "org.cn", "gov.cn", "edu.cn",
    "co.uk", "org.uk", "ac.uk",
    "com.au", "net.au", "org.au",
    "co.jp", "ne.jp", "or.jp",
    "co.kr", "com.br", "com.sg", "com.hk",
  ];

  let normalized = host.trim().trim_end_matches('.').trim_start_matches("www.").to_ascii_lowercase();
  if normalized.is_empty() || normalized == "localhost" || normalized.contains(':') {
    return normalized;
  }
  if normalized.split('.').all(|part| !part.is_empty() && part.chars().all(|ch| ch.is_ascii_digit())) {
    return normalized;
  }

  let labels = normalized.split('.').filter(|part| !part.is_empty()).collect::<Vec<_>>();
  if labels.len() <= 2 {
    return normalized;
  }
  let last_two = format!("{}.{}", labels[labels.len() - 2], labels[labels.len() - 1]);
  if COMPOUND_SUFFIXES.contains(&last_two.as_str()) && labels.len() >= 3 {
    return format!("{}.{}", labels[labels.len() - 3], last_two);
  }
  last_two
}

fn is_favicon_file(path: &Path) -> bool {
  path.extension()
    .and_then(|ext| ext.to_str())
    .map(|ext| matches!(ext.to_ascii_lowercase().as_str(), "png" | "svg" | "ico" | "webp" | "jpg" | "jpeg" | "gif"))
    .unwrap_or(false)
}

fn cached_favicon_for_domain(dir: &Path, cache_domain: &str) -> Option<PathBuf> {
  let canonical_prefix = format!("site_{}", safe_file_part(cache_domain));
  let mut candidates: Vec<(std::time::SystemTime, PathBuf)> = Vec::new();
  let entries = fs::read_dir(dir).ok()?;
  for entry in entries.flatten() {
    let path = entry.path();
    if !path.is_file() || !is_favicon_file(&path) {
      continue;
    }
    let stem = path.file_stem().and_then(|value| value.to_str()).unwrap_or_default();
    let is_canonical = stem == canonical_prefix;
    let legacy_host = stem.split('_').next().unwrap_or_default().to_ascii_lowercase();
    let is_same_site_legacy = legacy_host == cache_domain || legacy_host.ends_with(&format!(".{}", cache_domain));
    if !is_canonical && !is_same_site_legacy {
      continue;
    }
    let modified = entry.metadata().and_then(|meta| meta.modified()).unwrap_or(std::time::UNIX_EPOCH);
    candidates.push((modified, path));
  }
  candidates.sort_by(|left, right| right.0.cmp(&left.0));
  candidates.into_iter().map(|(_, path)| path).next()
}

fn remove_canonical_favicon_variants(dir: &Path, cache_domain: &str, except: Option<&Path>) {
  let canonical_prefix = format!("site_{}", safe_file_part(cache_domain));
  let Ok(entries) = fs::read_dir(dir) else { return; };
  for entry in entries.flatten() {
    let path = entry.path();
    if except.is_some_and(|keep| keep == path.as_path()) {
      continue;
    }
    let stem = path.file_stem().and_then(|value| value.to_str()).unwrap_or_default();
    if stem == canonical_prefix && is_favicon_file(&path) {
      let _ = fs::remove_file(path);
    }
  }
}


fn favicon_provider_meta(id: &str) -> (&'static str, &'static str) {
  match id {
    "quicker" => ("Quicker", "国内"),
    "faviconIm" => ("Favicon.im", "国内"),
    "iowen" => ("Iowen", "国内"),
    "google" => ("Google", "国外"),
    "duckduckgo" => ("DuckDuckGo", "国外"),
    "clearbit" => ("Clearbit", "国外"),
    "iconHorse" => ("Icon Horse", "国外"),
    "faviconKit" => ("FaviconKit", "国外"),
    "yandex" => ("Yandex", "国外"),
    "direct" => ("网站 /favicon.ico", "直连"),
    _ => ("自动兜底", "国内"),
  }
}

fn favicon_provider_order(provider_id: Option<&str>, fallback: bool) -> Vec<&'static str> {
  const DEFAULTS: [&str; 10] = ["quicker", "faviconIm", "iowen", "google", "duckduckgo", "clearbit", "iconHorse", "faviconKit", "yandex", "direct"];
  let selected = provider_id.unwrap_or("auto");
  if selected == "auto" || selected.trim().is_empty() {
    return DEFAULTS.to_vec();
  }
  if !fallback {
    return vec![match selected {
      "quicker" => "quicker",
      "faviconIm" => "faviconIm",
      "iowen" => "iowen",
      "google" => "google",
      "duckduckgo" => "duckduckgo",
      "clearbit" => "clearbit",
      "iconHorse" => "iconHorse",
      "faviconKit" => "faviconKit",
      "yandex" => "yandex",
      "direct" => "direct",
      _ => "quicker",
    }];
  }
  let selected_static = match selected {
    "quicker" => "quicker",
    "faviconIm" => "faviconIm",
    "iowen" => "iowen",
    "google" => "google",
    "duckduckgo" => "duckduckgo",
    "clearbit" => "clearbit",
    "iconHorse" => "iconHorse",
    "faviconKit" => "faviconKit",
    "yandex" => "yandex",
    "direct" => "direct",
    _ => "quicker",
  };
  let mut out = vec![selected_static];
  for item in DEFAULTS {
    if item != selected_static {
      out.push(item);
    }
  }
  out
}

fn favicon_candidate_url(provider: &str, host: &str, raw_url: &str) -> String {
  match provider {
    "quicker" => format!("https://helperservice.getquicker.cn/favicon/get/{}", host),
    "faviconIm" => format!("https://favicon.im/{}", host),
    "iowen" => format!("https://api.iowen.cn/favicon/{}.png", host),
    "google" => format!("https://www.google.com/s2/favicons?domain={}&sz=128", host),
    "duckduckgo" => format!("https://icons.duckduckgo.com/ip3/{}.ico", host),
    "clearbit" => format!("https://logo.clearbit.com/{}", host),
    "iconHorse" => format!("https://icon.horse/icon/{}", host),
    "faviconKit" => format!("https://api.faviconkit.com/{}/128", host),
    "yandex" => format!("https://favicon.yandex.net/favicon/{}", host),
    "direct" => {
      let scheme = if raw_url.starts_with("http://") { "http" } else { "https" };
      format!("{}://{}/favicon.ico", scheme, host)
    }
    _ => format!("https://helperservice.getquicker.cn/favicon/get/{}", host),
  }
}

fn append_refresh_token(url: String, refresh_token: Option<u128>) -> String {
  let Some(token) = refresh_token else { return url; };
  let separator = if url.contains('?') { "&" } else { "?" };
  format!("{}{}yue_refresh={}", url, separator, token)
}

fn favicon_candidates_ps(host: &str, raw_url: &str, provider_id: Option<String>, fallback: Option<bool>, refresh_token: Option<u128>) -> String {
  let providers = favicon_provider_order(provider_id.as_deref(), fallback.unwrap_or(true));
  providers
    .into_iter()
    .map(|provider| favicon_candidate_url(provider, host, raw_url))
    .map(|url| append_refresh_token(url, refresh_token))
    .map(|url| format!("'{}'", ps_escape(&url)))
    .collect::<Vec<_>>()
    .join(",")
}

#[tauri::command]
pub fn fetch_website_favicon(url: String, provider_id: Option<String>, fallback: Option<bool>, force_refresh: Option<bool>) -> Result<String, String> {
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

  let cache_domain = favicon_cache_domain(&host);
  let force_refresh = force_refresh.unwrap_or(false);
  if !force_refresh {
    if let Some(cached) = cached_favicon_for_domain(&dir, &cache_domain) {
      return Ok(cached.to_string_lossy().to_string());
    }
  }

  let refresh_token = if force_refresh {
    Some(SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis())
  } else {
    None
  };
  let prefix = dir.join(format!("site_{}", safe_file_part(&cache_domain)));
  let prefix_string = prefix.to_string_lossy().to_string();

  let candidates = favicon_candidates_ps(&cache_domain, trimmed, provider_id, fallback, refresh_token);
  let script_template = r#"
$ErrorActionPreference = 'Stop'
$rawUrl = '__URL__'
$outPrefix = '__PREFIX__'
$candidates = @(__CANDIDATES__)

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
    .replace("__PREFIX__", &ps_escape(&prefix_string))
    .replace("__CANDIDATES__", &candidates);
  let out = run_powershell(&script)?;
  if out.trim().is_empty() {
    return Err("未获取到网站图标".to_string());
  }

  let refreshed_path = PathBuf::from(out.lines().last().unwrap_or(out.trim()).trim());
  remove_canonical_favicon_variants(&dir, &cache_domain, Some(&refreshed_path));
  Ok(refreshed_path.to_string_lossy().to_string())
}



#[tauri::command]
pub fn test_favicon_sources(domain: String) -> Result<Vec<FaviconTestResult>, String> {
  let host = host_from_url(&domain);
  let clean_host = if host.is_empty() { domain.trim().trim_start_matches("http://").trim_start_matches("https://").split('/').next().unwrap_or("").to_ascii_lowercase() } else { host };
  if clean_host.is_empty() {
    return Err("请输入要测试的域名".to_string());
  }
  let raw_url = format!("https://{}", clean_host);
  let providers = favicon_provider_order(Some("auto"), true);
  let mut results = Vec::new();
  for provider in providers {
    let candidate = favicon_candidate_url(provider, &clean_host, &raw_url);
    let start = std::time::Instant::now();
    let script = format!(
      "$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; try {{ $r=Invoke-WebRequest -Uri '{}' -UseBasicParsing -TimeoutSec 6 -MaximumRedirection 3; $b=$r.Content; if ($b -is [string]) {{ $l=$b.Length }} else {{ $l=$b.Length }}; if ($l -gt 31) {{ Write-Output 'ok' }} else {{ throw 'too small' }} }} catch {{ Write-Output ('err:' + $_.Exception.Message) }}",
      ps_escape(&candidate)
    );
    let out = run_powershell(&script).unwrap_or_else(|error| format!("err:{}", error));
    let elapsed_ms = start.elapsed().as_millis();
    let success = out.trim().lines().last().unwrap_or("").trim() == "ok";
    let (name, group) = favicon_provider_meta(provider);
    results.push(FaviconTestResult {
      provider_id: provider.to_string(),
      provider_name: name.to_string(),
      group: group.to_string(),
      success,
      elapsed_ms,
      url: Some(candidate),
      error: if success { None } else { Some(out.trim().to_string()) },
    });
  }
  results.sort_by(|a, b| b.success.cmp(&a.success).then(a.elapsed_ms.cmp(&b.elapsed_ms)));
  Ok(results)
}

#[tauri::command]
pub fn fetch_website_title(url: String) -> Result<String, String> {
  let trimmed = url.trim();
  if !(trimmed.starts_with("http://") || trimmed.starts_with("https://")) {
    return Err("只支持 http/https 网址".to_string());
  }

  let script_template = r#"
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$url = '__URL__'
$response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 8 -MaximumRedirection 5
$html = [string]$response.Content
$title = ''
if ($html -match '(?is)<title[^>]*>(.*?)</title>') {
  $title = $Matches[1]
  $title = [System.Net.WebUtility]::HtmlDecode($title)
  $title = ($title -replace '\s+', ' ').Trim()
}
if ($title.Length -gt 120) { $title = $title.Substring(0, 120) }
Write-Output $title
"#;
  let script = script_template.replace("__URL__", &ps_escape(trimmed));
  let out = run_powershell(&script)?;
  let title = out.lines().last().unwrap_or(out.trim()).trim().to_string();
  if title.is_empty() {
    Err("未获取到网页标题".to_string())
  } else {
    Ok(title)
  }
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

#[cfg(target_os = "windows")]
#[tauri::command]
pub fn set_auto_start(enabled: bool) -> Result<(), String> {
  let value_name = startup_registry_value_name();
  let run_value = current_exe_run_value()?;
  let script = if enabled {
    format!(
      "$ErrorActionPreference = 'Stop'; $runKey = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'; New-Item -Path $runKey -Force | Out-Null; Set-ItemProperty -Path $runKey -Name '{}' -Value '{}'; Write-Output 'enabled'",
      ps_escape(value_name),
      ps_escape(&run_value)
    )
  } else {
    format!(
      "$ErrorActionPreference = 'SilentlyContinue'; $runKey = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'; Remove-ItemProperty -Path $runKey -Name '{}' -ErrorAction SilentlyContinue; Write-Output 'disabled'",
      ps_escape(value_name)
    )
  };
  run_powershell(&script).map(|_| ())
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub fn set_auto_start(_enabled: bool) -> Result<(), String> {
  Err("开机自启动目前只支持 Windows".to_string())
}

#[cfg(target_os = "windows")]
#[tauri::command]
pub fn get_auto_start() -> Result<bool, String> {
  let value_name = startup_registry_value_name();
  let expected = env::current_exe().map_err(|error| error.to_string())?.to_string_lossy().to_ascii_lowercase();
  let script = format!(
    "$ErrorActionPreference = 'SilentlyContinue'; $runKey = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'; $v = (Get-ItemProperty -Path $runKey -Name '{}' -ErrorAction SilentlyContinue).'{}'; if ($null -eq $v) {{ Write-Output '' }} else {{ Write-Output ([string]$v) }}",
    ps_escape(value_name),
    ps_escape(value_name)
  );
  let out = run_powershell(&script)?;
  let value = out.trim().trim_matches('"').to_ascii_lowercase();
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
