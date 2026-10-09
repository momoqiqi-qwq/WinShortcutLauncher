//! 原生注册表读写：替代「起一个 `powershell.exe` 去查注册表」的做法。
//!
//! 为什么不用 PowerShell：`run_powershell` 单次要 **330–400 ms**，其中绝大部分是
//! `powershell.exe` 进程启动与模块加载的固定开销，跟脚本本身几乎无关 —— 实测连
//! `Write-Output 'x'` 这种空脚本也要 376 ms。而注册表查询本身是微秒级的，
//! 直接用 `RegGetValueW` / `RegSetValueExW` / `RegDeleteValueW` 就够了。
//!
//! 本模块**不依赖 tauri**，因此可以被独立的基准工程用 `#[path]` 引进去直接测量。

use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;

use windows_sys::Win32::Foundation::{
  ERROR_FILE_NOT_FOUND, ERROR_INSUFFICIENT_BUFFER, ERROR_MORE_DATA, ERROR_PATH_NOT_FOUND,
  ERROR_SUCCESS, WIN32_ERROR,
};
use windows_sys::Win32::System::Registry::{
  RegCloseKey, RegCreateKeyExW, RegDeleteValueW, RegGetValueW, RegOpenKeyExW, RegSetValueExW,
  HKEY, HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_SET_VALUE, REG_EXPAND_SZ,
  REG_OPTION_NON_VOLATILE, REG_SZ, RRF_NOEXPAND, RRF_RT_ANY,
};

/// 注册表根键。只暴露本项目实际用到的两个。
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RegistryRoot {
  CurrentUser,
  LocalMachine,
}

impl RegistryRoot {
  fn raw(self) -> HKEY {
    match self {
      RegistryRoot::CurrentUser => HKEY_CURRENT_USER,
      RegistryRoot::LocalMachine => HKEY_LOCAL_MACHINE,
    }
  }
}

/// 自启动项所在的位置（`HKCU` 下，不需要管理员权限）。
pub const RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";

/// `App Paths` 所在的位置（查某个 exe 的实际安装路径）。
pub const APP_PATHS_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\App Paths";

fn wide(value: &str) -> Vec<u16> {
  OsStr::new(value).encode_wide().chain(std::iter::once(0)).collect()
}

/// 展开 `REG_EXPAND_SZ` 里的 `%NAME%`（等价于 `ExpandEnvironmentStringsW`，
/// 但不用再多开一个 windows-sys feature）。
fn expand_environment(value: &str) -> String {
  if !value.contains('%') {
    return value.to_string();
  }
  let mut out = String::with_capacity(value.len());
  let mut rest = value;
  while let Some(start) = rest.find('%') {
    out.push_str(&rest[..start]);
    let after = &rest[start + 1..];
    match after.find('%') {
      Some(end) if end > 0 => {
        let name = &after[..end];
        match std::env::var(name) {
          Ok(replacement) => out.push_str(&replacement),
          Err(_) => {
            out.push('%');
            out.push_str(name);
            out.push('%');
          }
        }
        rest = &after[end + 1..];
      }
      _ => {
        out.push('%');
        rest = after;
      }
    }
  }
  out.push_str(rest);
  out
}

/// 读一个字符串值（`REG_SZ` / `REG_EXPAND_SZ`）。
///
/// `value_name` 传 `None` 表示读**默认值** —— `App Paths\<exe>` 就是用默认值存
/// exe 路径的。`REG_EXPAND_SZ` 里的环境变量会一并展开。查不到返回 `None`。
pub fn read_string(root: RegistryRoot, subkey: &str, value_name: Option<&str>) -> Option<String> {
  let subkey_wide = wide(subkey);
  let value_wide = value_name.map(wide);
  let value_ptr = value_wide.as_ref().map_or(std::ptr::null(), |value| value.as_ptr());

  // 注册表值大小未知，给个 1 KB 起步的缓冲；不够就按返回码指示放大重试。
  let mut capacity: u32 = 512;
  loop {
    let mut buffer = vec![0u16; capacity as usize];
    let mut size = capacity * 2;
    let mut kind: u32 = 0;
    // `RRF_NOEXPAND` 必加：不加的话 `RegGetValueW` 会自己展开 `REG_EXPAND_SZ`，而它报回来的
    // `pcbData` 并没有跟着变成展开后的长度 —— 实测会在字符串末尾多读出一个 `\0` 和一个 `2`
    // （`%SystemRoot%\System32` 读成 `"C:\\Windows\\System32\02"`，那正是 REG_EXPAND_SZ 的类型值）。
    // 展开这件事由下面 `expand_environment` 自己做，既不依赖这个 API 的怪脾气，语义也看得见。
    let status = unsafe {
      RegGetValueW(
        root.raw(),
        subkey_wide.as_ptr(),
        value_ptr,
        RRF_RT_ANY | RRF_NOEXPAND,
        &mut kind,
        buffer.as_mut_ptr().cast(),
        &mut size,
      )
    };

    match status {
      ERROR_SUCCESS => {
        // size 是字节数（含结尾 NUL），转换成长度时要减掉它。
        let units = (size as usize) / 2;
        let len = units.saturating_sub(1).min(buffer.len());
        let value = String::from_utf16_lossy(&buffer[..len]);
        return Some(if kind == REG_EXPAND_SZ { expand_environment(&value) } else { value });
      }
      ERROR_MORE_DATA | ERROR_INSUFFICIENT_BUFFER => {
        capacity = capacity.saturating_mul(4);
        if capacity > 1 << 20 {
          // 1 MB 还读不出来，放弃（正常注册表值不会这么大）。
          return None;
        }
      }
      _ => return None,
    }
  }
}

/// 写一个 `REG_SZ` 字符串值，注册表项不存在就创建（`RegCreateKeyExW` 的语义）。
pub fn write_string(
  root: RegistryRoot,
  subkey: &str,
  value_name: &str,
  data: &str,
) -> Result<(), String> {
  let subkey_wide = wide(subkey);
  let value_wide = wide(value_name);
  let data_wide = wide(data);

  let mut key: HKEY = std::ptr::null_mut();
  let mut disposition: u32 = 0;
  let status: WIN32_ERROR = unsafe {
    RegCreateKeyExW(
      root.raw(),
      subkey_wide.as_ptr(),
      0,
      std::ptr::null(),
      REG_OPTION_NON_VOLATILE,
      KEY_SET_VALUE,
      std::ptr::null(),
      &mut key,
      &mut disposition,
    )
  };
  if status != ERROR_SUCCESS {
    return Err(format!("打开注册表项失败（错误码 {status}）：{subkey}"));
  }

  let bytes = (data_wide.len() * 2) as u32;
  let status = unsafe {
    RegSetValueExW(key, value_wide.as_ptr(), 0, REG_SZ, data_wide.as_ptr().cast(), bytes)
  };
  unsafe { RegCloseKey(key) };

  if status != ERROR_SUCCESS {
    return Err(format!("写入注册表值失败（错误码 {status}）：{value_name}"));
  }
  Ok(())
}

/// 删除一个注册表值。值本来就不存在（或所在项不存在）返回 `Ok(false)`。
pub fn delete_value(root: RegistryRoot, subkey: &str, value_name: &str) -> Result<bool, String> {
  let subkey_wide = wide(subkey);
  let value_wide = wide(value_name);

  let mut key: HKEY = std::ptr::null_mut();
  let status: WIN32_ERROR = unsafe {
    RegOpenKeyExW(root.raw(), subkey_wide.as_ptr(), 0, KEY_SET_VALUE, &mut key)
  };
  match status {
    ERROR_SUCCESS => {}
    ERROR_FILE_NOT_FOUND | ERROR_PATH_NOT_FOUND => return Ok(false),
    _ => return Err(format!("打开注册表项失败（错误码 {status}）：{subkey}")),
  }

  let status = unsafe { RegDeleteValueW(key, value_wide.as_ptr()) };
  unsafe { RegCloseKey(key) };

  match status {
    ERROR_SUCCESS => Ok(true),
    ERROR_FILE_NOT_FOUND => Ok(false),
    _ => Err(format!("删除注册表值失败（错误码 {status}）：{value_name}")),
  }
}

/// 读开机自启动项里本应用登记启动命令（没登记返回 `None`）。
pub fn read_run_entry(value_name: &str) -> Option<String> {
  read_string(RegistryRoot::CurrentUser, RUN_KEY, Some(value_name))
    .map(|value| value.trim().to_string())
    .filter(|value| !value.is_empty())
}

/// 写开机自启动项。
pub fn write_run_entry(value_name: &str, command: &str) -> Result<(), String> {
  write_string(RegistryRoot::CurrentUser, RUN_KEY, value_name, command)
}

/// 删开机自启动项。
pub fn remove_run_entry(value_name: &str) -> Result<bool, String> {
  delete_value(RegistryRoot::CurrentUser, RUN_KEY, value_name)
}

/// 查 `App Paths\<exe>` 的默认值，先 `HKCU` 再 `HKLM`（与系统查找顺序一致）。
pub fn find_app_path(exe_name: &str) -> Option<String> {
  let subkey = format!("{APP_PATHS_KEY}\\{exe_name}");
  for root in [RegistryRoot::CurrentUser, RegistryRoot::LocalMachine] {
    if let Some(value) = read_string(root, &subkey, None) {
      let trimmed = value.trim().trim_matches('"').trim();
      if !trimmed.is_empty() {
        return Some(trimmed.to_string());
      }
    }
  }
  None
}
