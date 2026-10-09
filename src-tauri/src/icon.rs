use std::{env, fs, path::PathBuf, process::Command};

use base64::{engine::general_purpose, Engine as _};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

const CREATE_NO_WINDOW: u32 = 0x08000000;

fn ps_escape(value: &str) -> String {
  value.replace('`', "``").replace('\'', "''")
}


fn resolve_readable_icon_path(path: &str) -> PathBuf {
  let trimmed = path.trim().trim_matches('"');
  let candidate = PathBuf::from(trimmed);
  if candidate.is_absolute() || candidate.exists() {
    return candidate;
  }

  let relative_candidate = trimmed.trim_start_matches(|ch| ch == '/' || ch == '\\');

  if let Ok(current_dir) = env::current_dir() {
    let joined = current_dir.join(trimmed);
    if joined.exists() {
      return joined;
    }
    if relative_candidate != trimmed {
      let joined = current_dir.join(relative_candidate);
      if joined.exists() {
        return joined;
      }
    }
  }

  if let Ok(exe) = env::current_exe() {
    if let Some(exe_dir) = exe.parent() {
      let joined = exe_dir.join(trimmed);
      if joined.exists() {
        return joined;
      }
      if relative_candidate != trimmed {
        let joined = exe_dir.join(relative_candidate);
        if joined.exists() {
          return joined;
        }
      }
    }
  }

  candidate
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

/// 旧的 PowerShell 取图标脚本，现在**只作为原生实现的兜底**。
///
/// 每取一个图标就要起一个 `powershell.exe` 并现场 `Add-Type` 编译 C#，
/// 实测单次约 560 ms。正常路径已经换成 `icon_native` 的毫秒级原生提取，
/// 只有原生实现拿不到图标时才会走到这里。
fn powershell_icon_script(path: &str) -> String {
  let script_template = r#"
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class NativeIcon {
  [DllImport("Shell32.dll", CharSet = CharSet.Unicode)]
  public static extern int ExtractIconEx(string lpszFile, int nIconIndex, IntPtr[] phiconLarge, IntPtr[] phiconSmall, int nIcons);
  [DllImport("User32.dll", SetLastError = true)]
  public static extern bool DestroyIcon(IntPtr hIcon);
}
"@

function Resolve-LauncherIconPath([string]$value) {
  $v = $value.Trim()
  if ($v -match '^/system/(.+)$') {
    return Join-Path ([Environment]::SystemDirectory) $Matches[1]
  }
  if ($v -match '^/windows/(.+)$') {
    return Join-Path $env:SystemRoot $Matches[1]
  }
  return $v
}

function Write-IconAsPngDataUrl([System.Drawing.Icon]$icon) {
  if ($null -eq $icon) { return }
  $bitmap = $icon.ToBitmap()
  $ms = New-Object System.IO.MemoryStream
  $bitmap.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $base64 = [Convert]::ToBase64String($ms.ToArray())
  Write-Output ('data:image/png;base64,' + $base64)
  $ms.Dispose()
  $bitmap.Dispose()
}

$raw = '__PATH__'
$target = $raw.Trim()
$index = 0
if ($target -match '^(.*?)[,;#](-?\d+)$') {
  $target = $Matches[1].Trim()
  $index = [int]$Matches[2]
}
$target = Resolve-LauncherIconPath $target

try {
  $large = New-Object IntPtr[] 1
  $small = New-Object IntPtr[] 1
  [void][NativeIcon]::ExtractIconEx($target, $index, $large, $small, 1)
  $handle = [IntPtr]::Zero
  if ($large[0] -ne [IntPtr]::Zero) { $handle = $large[0] }
  elseif ($small[0] -ne [IntPtr]::Zero) { $handle = $small[0] }

  if ($handle -ne [IntPtr]::Zero) {
    $icon = [System.Drawing.Icon]::FromHandle($handle).Clone()
    Write-IconAsPngDataUrl $icon
    $icon.Dispose()
    [void][NativeIcon]::DestroyIcon($handle)
    exit 0
  }

  $associated = [System.Drawing.Icon]::ExtractAssociatedIcon($target)
  if ($null -ne $associated) {
    Write-IconAsPngDataUrl $associated
    $associated.Dispose()
  }
} catch {
  Write-Output ''
}
"#;

  script_template.replace("__PATH__", &ps_escape(path))
}

/// 同步地取一个图标的 PNG data URL：原生优先，PowerShell 兜底。
fn resolve_icon_data_url(path: &str) -> Result<String, String> {
  let trimmed = path.trim().trim_matches('"');
  if trimmed.is_empty() {
    return Ok(String::new());
  }
  #[cfg(target_os = "windows")]
  {
    if let Some(data_url) = crate::icon_native::extract_icon_data_url(trimmed) {
      return Ok(data_url);
    }
  }
  run_powershell(&powershell_icon_script(trimmed))
}

/// 取文件 / 快捷方式 / 文件夹的图标（PNG data URL）。
///
/// **必须异步**：Tauri 里没标 `async` 的命令跑在**主线程**上，而这个命令
/// 最坏情况要等一个 PowerShell 进程。映射文件夹一次会请求几十上百个图标，
/// 同步执行就等于把界面冻结几十秒 —— 这正是「映射文件夹卡顿」的根因。
#[tauri::command]
pub async fn get_file_icon(path: String) -> Result<String, String> {
  crate::blocking::offload(move || resolve_icon_data_url(&path)).await
}

#[tauri::command]
pub async fn read_icon_as_data_url(path: String) -> Result<String, String> {
  crate::blocking::offload(move || read_icon_file_as_data_url(&path)).await
}

fn read_icon_file_as_data_url(path: &str) -> Result<String, String> {
  let resolved_path = resolve_readable_icon_path(&path);
  let bytes = fs::read(&resolved_path).map_err(|error| error.to_string())?;
  let extension = resolved_path
    .extension()
    .map(|value| value.to_string_lossy().to_ascii_lowercase())
    .unwrap_or_default();
  let mime = match extension.as_str() {
    "png" => "image/png",
    "jpg" | "jpeg" => "image/jpeg",
    "webp" => "image/webp",
    "gif" => "image/gif",
    "svg" => "image/svg+xml",
    "ico" => "image/x-icon",
    _ => "application/octet-stream",
  };
  Ok(format!("data:{};base64,{}", mime, general_purpose::STANDARD.encode(bytes)))
}
