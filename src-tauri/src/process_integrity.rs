#[cfg(target_os = "windows")]
use std::{
  env,
  ffi::{c_void, OsStr, OsString},
  mem::{size_of, zeroed},
  os::windows::ffi::{OsStrExt, OsStringExt},
  ptr::{null, null_mut},
};

use serde::Serialize;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessIntegrityStatus {
  pub level: String,
  pub rid: u32,
  pub is_medium: bool,
  pub is_above_medium: bool,
  pub message: String,
}

#[cfg(target_os = "windows")]
const SECURITY_MANDATORY_LOW_RID: u32 = 0x1000;
#[cfg(target_os = "windows")]
const SECURITY_MANDATORY_MEDIUM_RID: u32 = 0x2000;
#[cfg(target_os = "windows")]
const SECURITY_MANDATORY_MEDIUM_PLUS_RID: u32 = 0x2100;
#[cfg(target_os = "windows")]
const SECURITY_MANDATORY_HIGH_RID: u32 = 0x3000;
#[cfg(target_os = "windows")]
const SECURITY_MANDATORY_SYSTEM_RID: u32 = 0x4000;
#[cfg(target_os = "windows")]
const MEDIUM_RELAUNCH_ARG: &str = "--yue-medium-relaunch";

#[cfg(target_os = "windows")]
struct OwnedHandle(windows_sys::Win32::Foundation::HANDLE);

#[cfg(target_os = "windows")]
impl OwnedHandle {
  fn new(handle: windows_sys::Win32::Foundation::HANDLE) -> Result<Self, String> {
    if handle.is_null() {
      Err(last_error("Windows handle acquisition failed"))
    } else {
      Ok(Self(handle))
    }
  }

  fn raw(&self) -> windows_sys::Win32::Foundation::HANDLE {
    self.0
  }
}

#[cfg(target_os = "windows")]
impl Drop for OwnedHandle {
  fn drop(&mut self) {
    if !self.0.is_null() {
      unsafe {
        let _ = windows_sys::Win32::Foundation::CloseHandle(self.0);
      }
    }
  }
}

#[cfg(target_os = "windows")]
fn last_error(context: &str) -> String {
  let code = unsafe { windows_sys::Win32::Foundation::GetLastError() };
  format!("{context} (Win32 error {code})")
}

#[cfg(target_os = "windows")]
fn integrity_label(rid: u32) -> &'static str {
  if rid >= SECURITY_MANDATORY_SYSTEM_RID {
    "System"
  } else if rid >= SECURITY_MANDATORY_HIGH_RID {
    "High"
  } else if rid >= SECURITY_MANDATORY_MEDIUM_PLUS_RID {
    "Medium Plus"
  } else if rid >= SECURITY_MANDATORY_MEDIUM_RID {
    "Medium"
  } else if rid >= SECURITY_MANDATORY_LOW_RID {
    "Low"
  } else {
    "Untrusted"
  }
}

#[cfg(target_os = "windows")]
fn current_integrity_rid() -> Result<u32, String> {
  use windows_sys::Win32::{
    Security::{
      GetSidSubAuthority, GetSidSubAuthorityCount, GetTokenInformation, TokenIntegrityLevel,
      TOKEN_MANDATORY_LABEL, TOKEN_QUERY,
    },
    System::Threading::{GetCurrentProcess, OpenProcessToken},
  };

  let mut token = null_mut();
  let opened = unsafe { OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) };
  if opened == 0 {
    return Err(last_error("OpenProcessToken failed"));
  }
  let token = OwnedHandle::new(token)?;

  let mut required = 0u32;
  unsafe {
    let _ = GetTokenInformation(
      token.raw(),
      TokenIntegrityLevel,
      null_mut(),
      0,
      &mut required,
    );
  }
  if required < size_of::<TOKEN_MANDATORY_LABEL>() as u32 {
    return Err(last_error("GetTokenInformation(TokenIntegrityLevel) size query failed"));
  }

  let mut buffer = vec![0u8; required as usize];
  let ok = unsafe {
    GetTokenInformation(
      token.raw(),
      TokenIntegrityLevel,
      buffer.as_mut_ptr() as *mut c_void,
      required,
      &mut required,
    )
  };
  if ok == 0 {
    return Err(last_error("GetTokenInformation(TokenIntegrityLevel) failed"));
  }

  let label = unsafe { &*(buffer.as_ptr() as *const TOKEN_MANDATORY_LABEL) };
  if label.Label.Sid.is_null() {
    return Err("Token integrity SID was null".to_string());
  }
  let count_ptr = unsafe { GetSidSubAuthorityCount(label.Label.Sid) };
  if count_ptr.is_null() {
    return Err("GetSidSubAuthorityCount failed".to_string());
  }
  let count = unsafe { *count_ptr };
  if count == 0 {
    return Err("Token integrity SID had no sub-authorities".to_string());
  }
  let rid_ptr = unsafe { GetSidSubAuthority(label.Label.Sid, u32::from(count - 1)) };
  if rid_ptr.is_null() {
    return Err("GetSidSubAuthority failed".to_string());
  }
  Ok(unsafe { *rid_ptr })
}

#[cfg(target_os = "windows")]
fn build_status(rid: u32) -> ProcessIntegrityStatus {
  // Keep the launcher on the same standard Medium band as Explorer and normal browsers.
  // Medium Plus is intentionally treated as elevated for cross-process drag/drop purposes.
  let is_medium = rid >= SECURITY_MANDATORY_MEDIUM_RID && rid < SECURITY_MANDATORY_MEDIUM_PLUS_RID;
  let is_above_medium = rid >= SECURITY_MANDATORY_MEDIUM_PLUS_RID;
  let level = integrity_label(rid).to_string();
  let message = if is_medium {
    "Yue Launcher 正在标准 Medium Integrity 运行；与普通 Floorp/Firefox/Explorer 的跨进程拖放权限匹配。".to_string()
  } else if is_above_medium {
    format!("Yue Launcher 当前为 {level} Integrity，高于普通桌面应用的标准 Medium；Windows UIPI 可能直接阻止 Floorp/Firefox/Explorer 拖入。启动保护会优先尝试用桌面 Shell 的普通令牌重新启动。")
  } else {
    format!("Yue Launcher 当前为 {level} Integrity；权限低于普通桌面应用，部分写入/交互功能可能受限。")
  };
  ProcessIntegrityStatus {
    level,
    rid,
    is_medium,
    is_above_medium,
    message,
  }
}

#[cfg(target_os = "windows")]
pub fn current_status() -> Result<ProcessIntegrityStatus, String> {
  current_integrity_rid().map(build_status)
}

#[cfg(not(target_os = "windows"))]
pub fn current_status() -> Result<ProcessIntegrityStatus, String> {
  Ok(ProcessIntegrityStatus {
    level: "Not Windows".to_string(),
    rid: 0,
    is_medium: false,
    is_above_medium: false,
    message: "Integrity Level 检查仅用于 Windows。".to_string(),
  })
}

#[tauri::command]
pub fn get_process_integrity_status() -> Result<ProcessIntegrityStatus, String> {
  current_status()
}

#[cfg(target_os = "windows")]
fn quote_windows_arg_wide(value: &OsStr) -> Vec<u16> {
  let input: Vec<u16> = value.encode_wide().collect();
  let needs_quotes = input.is_empty()
    || input.iter().any(|unit| matches!(*unit, 0x0009 | 0x0020 | 0x0022));
  if !needs_quotes {
    return input;
  }

  // Follow the Windows CommandLineToArgvW / C-runtime escaping convention: backslashes
  // immediately before a quote are doubled, and trailing backslashes are doubled before
  // the closing quote. Work directly in UTF-16 so non-lossy Windows paths stay intact.
  let mut output = Vec::with_capacity(input.len() + 2);
  output.push(0x0022);
  let mut backslashes = 0usize;
  for unit in input {
    if unit == 0x005c {
      backslashes += 1;
      continue;
    }
    if unit == 0x0022 {
      output.extend(std::iter::repeat(0x005c).take(backslashes * 2 + 1));
      output.push(0x0022);
      backslashes = 0;
      continue;
    }
    output.extend(std::iter::repeat(0x005c).take(backslashes));
    backslashes = 0;
    output.push(unit);
  }
  output.extend(std::iter::repeat(0x005c).take(backslashes * 2));
  output.push(0x0022);
  output
}

#[cfg(target_os = "windows")]
fn wide_null(value: &OsStr) -> Vec<u16> {
  value.encode_wide().chain(std::iter::once(0)).collect()
}

#[cfg(target_os = "windows")]
fn relaunch_with_desktop_shell_token() -> Result<(), String> {
  use windows_sys::Win32::{
    Foundation::CloseHandle,
    Security::{TOKEN_ASSIGN_PRIMARY, TOKEN_DUPLICATE, TOKEN_QUERY},
    System::Threading::{
      CreateProcessWithTokenW, OpenProcess, OpenProcessToken, PROCESS_INFORMATION,
      PROCESS_QUERY_LIMITED_INFORMATION, STARTUPINFOW,
    },
    UI::WindowsAndMessaging::{GetShellWindow, GetWindowThreadProcessId},
  };

  let shell_hwnd = unsafe { GetShellWindow() };
  if shell_hwnd.is_null() {
    return Err("Windows desktop shell window was not available".to_string());
  }

  let mut shell_pid = 0u32;
  unsafe {
    let _ = GetWindowThreadProcessId(shell_hwnd, &mut shell_pid);
  }
  if shell_pid == 0 {
    return Err(last_error("GetWindowThreadProcessId(GetShellWindow) failed"));
  }

  let shell_process = OwnedHandle::new(unsafe {
    OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, shell_pid)
  })?;

  let mut shell_token = null_mut();
  let token_access = TOKEN_QUERY | TOKEN_DUPLICATE | TOKEN_ASSIGN_PRIMARY;
  let opened = unsafe { OpenProcessToken(shell_process.raw(), token_access, &mut shell_token) };
  if opened == 0 {
    return Err(last_error("OpenProcessToken(desktop shell) failed"));
  }
  let shell_token = OwnedHandle::new(shell_token)?;

  let exe = env::current_exe().map_err(|error| format!("current_exe failed: {error}"))?;
  let mut args: Vec<OsString> = env::args_os().skip(1).collect();
  args.retain(|arg| arg != OsStr::new(MEDIUM_RELAUNCH_ARG));
  args.push(OsString::from(MEDIUM_RELAUNCH_ARG));

  let mut command_line_w = quote_windows_arg_wide(exe.as_os_str());
  for arg in &args {
    command_line_w.push(0x0020);
    command_line_w.extend(quote_windows_arg_wide(arg));
  }
  command_line_w.push(0);
  let exe_w = wide_null(exe.as_os_str());

  let current_dir = env::current_dir().ok();
  let current_dir_w = current_dir.as_ref().map(|path| wide_null(path.as_os_str()));
  let current_dir_ptr = current_dir_w.as_ref().map_or(null(), |value| value.as_ptr());

  let mut startup: STARTUPINFOW = unsafe { zeroed() };
  startup.cb = size_of::<STARTUPINFOW>() as u32;
  let mut process_info: PROCESS_INFORMATION = unsafe { zeroed() };

  let created = unsafe {
    CreateProcessWithTokenW(
      shell_token.raw(),
      0,
      exe_w.as_ptr(),
      command_line_w.as_mut_ptr(),
      0,
      null(),
      current_dir_ptr,
      &startup,
      &mut process_info,
    )
  };
  if created == 0 {
    return Err(last_error("CreateProcessWithTokenW(desktop shell token) failed"));
  }

  unsafe {
    if !process_info.hThread.is_null() {
      let _ = CloseHandle(process_info.hThread);
    }
    if !process_info.hProcess.is_null() {
      let _ = CloseHandle(process_info.hProcess);
    }
  }
  Ok(())
}

/// Returns true when the current above-Medium instance successfully launched a replacement
/// using the normal desktop shell token and should exit before Tauri/WebView2 is initialized.
#[cfg(target_os = "windows")]
pub fn ensure_medium_integrity_before_run() -> bool {
  let status = match current_status() {
    Ok(status) => status,
    Err(error) => {
      eprintln!("[integrity] unable to query process integrity: {error}");
      return false;
    }
  };

  if !status.is_above_medium {
    eprintln!("[integrity] startup level={} rid=0x{:x}", status.level, status.rid);
    return false;
  }

  let already_relaunched = env::args_os().any(|arg| arg == OsStr::new(MEDIUM_RELAUNCH_ARG));
  if already_relaunched {
    eprintln!(
      "[integrity] replacement process is still {}; refusing a relaunch loop",
      status.level
    );
    return false;
  }

  match relaunch_with_desktop_shell_token() {
    Ok(()) => {
      eprintln!(
        "[integrity] {} process replaced using desktop shell token; exiting above-Medium instance",
        status.level
      );
      true
    }
    Err(error) => {
      eprintln!("[integrity] automatic Medium relaunch failed: {error}");
      false
    }
  }
}

#[cfg(all(test, target_os = "windows"))]
mod tests {
  use super::*;

  #[test]
  fn integrity_bands_keep_medium_plus_out_of_standard_medium() {
    assert!(build_status(SECURITY_MANDATORY_MEDIUM_RID).is_medium);
    assert!(!build_status(SECURITY_MANDATORY_MEDIUM_PLUS_RID).is_medium);
    assert!(build_status(SECURITY_MANDATORY_MEDIUM_PLUS_RID).is_above_medium);
    assert!(build_status(SECURITY_MANDATORY_HIGH_RID).is_above_medium);
  }

  #[test]
  fn windows_argument_quoting_preserves_spaces_and_quotes() {
    let decode = |value: &OsStr| String::from_utf16(&quote_windows_arg_wide(value)).unwrap();
    assert_eq!(decode(OsStr::new("plain")), "plain");
    assert_eq!(decode(OsStr::new("two words")), "\"two words\"");
    assert_eq!(decode(OsStr::new("a\"b")), "\"a\\\"b\"");
  }
}

#[cfg(not(target_os = "windows"))]
pub fn ensure_medium_integrity_before_run() -> bool {
  false
}
