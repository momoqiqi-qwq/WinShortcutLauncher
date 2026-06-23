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

#[tauri::command]
pub fn get_file_icon(path: String) -> Result<String, String> {
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

  let script = script_template.replace("__PATH__", &ps_escape(&path));
  run_powershell(&script)
}

#[tauri::command]
pub fn read_icon_as_data_url(path: String) -> Result<String, String> {
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
