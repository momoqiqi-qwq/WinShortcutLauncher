//! 文件夹镜像的共享核心。
//!
//! 两个使用者共用这一套逻辑，区别只在「根目录从哪来」和「列哪些条目」：
//!
//! | 使用者 | 根目录 | 条目过滤 |
//! | --- | --- | --- |
//! | `start_menu` | 固定：`%APPDATA%\Microsoft\Windows\Start Menu\Programs` | `ShortcutsOnly` |
//! | `mapped_folder` | 用户自选（存在配置里） | `All` |
//!
//! 为了避开 PowerShell 输出编码（本机是 GBK，不是 UTF-8）带来的乱码风险，
//! 所有「结果」都在 Rust 侧计算，PowerShell 只负责写入动作，不解析它的 stdout。

use serde::Serialize;
use std::{fs, path::{Path, PathBuf}, process::Command};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

const CREATE_NO_WINDOW: u32 = 0x08000000;

/// 会被当成「快捷方式」处理的扩展名。
pub const SHORTCUT_EXTENSIONS: [&str; 3] = ["lnk", "url", "exe"];

/// 列目录时保留哪些条目。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EntryFilter {
  /// 只列根级、且扩展名属于 `SHORTCUT_EXTENSIONS` 的文件（开始菜单的语义）。
  ShortcutsOnly,
  /// 列根级全部文件与文件夹（映射目录的语义）。
  All,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderEntry {
  pub name: String,
  pub path: String,
  pub extension: String,
  pub is_dir: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateShortcutsResult {
  pub created: Vec<String>,
  pub skipped: Vec<String>,
  pub errors: Vec<String>,
}

fn ps_escape(value: &str) -> String {
  value.replace('`', "``").replace('\'', "''")
}

/// 只判返回码，不解析 stdout —— 见文件头关于 GBK 的说明。
fn run_powershell(script: &str) -> Result<(), String> {
  let mut command = Command::new("powershell.exe");
  command.args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script]);
  #[cfg(target_os = "windows")]
  command.creation_flags(CREATE_NO_WINDOW);

  let output = command.output().map_err(|error| error.to_string())?;
  if output.status.success() {
    Ok(())
  } else {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    Err(if stderr.is_empty() { "PowerShell 执行失败".to_string() } else { stderr })
  }
}

fn ps_string_array(values: &[String]) -> String {
  let items: Vec<String> = values.iter().map(|value| format!("'{}'", ps_escape(value))).collect();
  format!("@({})", items.join(","))
}

/// 归一化路径用于「是否在根目录内」的比较。
///
/// `canonicalize()` 在 Windows 上会带上 `\\?\` 前缀，而且只要两侧之一没解析成功，
/// 直接 `starts_with` 就会误判。这里统一小写、统一分隔符、去掉 `\\?\` 前缀再比。
pub fn path_key(path: &Path) -> String {
  let text = path.to_string_lossy().replace('/', "\\").to_lowercase();
  let text = text.strip_prefix("\\\\?\\").map(str::to_string).unwrap_or(text);
  text.trim_end_matches('\\').to_string()
}

/// 判断 `target_key` 是否落在 `root_key` 之内（含 root 自身）。
///
/// 必须带上分隔符比较：直接用 `starts_with` 的话，
/// `...\Programs2\x.lnk` 会被误判成在 `...\Programs` 内。
pub fn is_inside(root_key: &str, target_key: &str) -> bool {
  if root_key.is_empty() {
    return false;
  }
  target_key == root_key || target_key.starts_with(&format!("{root_key}\\"))
}

/// 确保目标路径确实位于 `root` 之内，避免误删/误改用户其它文件。
///
/// 返回**原始路径**（不带 `\\?\` 前缀），因为后续要交给 PowerShell 使用。
pub fn ensure_inside(root: &Path, path: &Path) -> Result<PathBuf, String> {
  let root_key = path_key(&root.canonicalize().unwrap_or_else(|_| root.to_path_buf()));
  let target_key = path_key(&path.canonicalize().unwrap_or_else(|_| path.to_path_buf()));
  if is_inside(&root_key, &target_key) {
    Ok(path.to_path_buf())
  } else {
    Err(format!("路径不在镜像目录内：{}", path.display()))
  }
}

/// 校验用户自选的映射根目录：必须存在、必须是目录。
///
/// 返回**原始路径**（不带 `\\?\`），因为后续要交给 PowerShell 使用。
pub fn resolve_root(raw: &str) -> Result<PathBuf, String> {
  let trimmed = raw.trim().trim_matches('"');
  if trimmed.is_empty() {
    return Err("映射目录不能为空".to_string());
  }
  let candidate = PathBuf::from(trimmed);
  if !candidate.exists() {
    return Err(format!("目录不存在：{trimmed}"));
  }
  if !candidate.is_dir() {
    return Err(format!("不是文件夹：{trimmed}"));
  }
  Ok(candidate)
}

pub fn extension_of(path: &Path) -> String {
  path
    .extension()
    .map(|value| value.to_string_lossy().to_ascii_lowercase())
    .unwrap_or_default()
}

/// 清掉 Windows 文件名非法字符，避免生成快捷方式时失败。
pub fn sanitize_file_stem(value: &str) -> String {
  let cleaned: String = value
    .chars()
    .map(|ch| if "\\/:*?\"<>|".contains(ch) { '_' } else { ch })
    .collect();
  let trimmed = cleaned.trim().trim_end_matches('.').trim().to_string();
  if trimmed.is_empty() {
    "快捷方式".to_string()
  } else {
    trimmed.chars().take(120).collect()
  }
}

/// 在目标目录里找一个不冲突的 `.lnk` 文件名，返回完整路径。
fn unique_lnk_path(directory: &Path, base_name: &str) -> PathBuf {
  let base = sanitize_file_stem(base_name);
  let candidate = directory.join(format!("{base}.lnk"));
  if !candidate.exists() {
    return candidate;
  }
  let mut index = 2;
  loop {
    let candidate = directory.join(format!("{base} ({index}).lnk"));
    if !candidate.exists() {
      return candidate;
    }
    index += 1;
  }
}

fn unique_copy_path(directory: &Path, file_name: &str, extension: &str) -> PathBuf {
  let stem = Path::new(file_name)
    .file_stem()
    .map(|value| value.to_string_lossy().to_string())
    .filter(|value| !value.trim().is_empty())
    .unwrap_or_else(|| "快捷方式".to_string());
  let candidate = directory.join(format!("{stem}.{extension}"));
  if !candidate.exists() {
    return candidate;
  }
  let mut index = 2;
  loop {
    let candidate = directory.join(format!("{stem} ({index}).{extension}"));
    if !candidate.exists() {
      return candidate;
    }
    index += 1;
  }
}

/// 条目的显示名。
///
/// - 文件夹：原名（不带扩展名概念）。
/// - `ShortcutsOnly`：一律去掉扩展名（开始菜单里 `.lnk` 后缀是噪音）。
/// - `All`：只对 `.lnk` / `.url` 去扩展名，其余保留（`报告.docx` 比 `报告` 有信息量）。
fn display_name(file_name: &str, extension: &str, is_dir: bool, filter: EntryFilter) -> String {
  if is_dir {
    return file_name.to_string();
  }
  let strip = match filter {
    EntryFilter::ShortcutsOnly => true,
    EntryFilter::All => extension == "lnk" || extension == "url",
  };
  if !strip {
    return file_name.to_string();
  }
  Path::new(file_name)
    .file_stem()
    .map(|value| value.to_string_lossy().to_string())
    .filter(|value| !value.trim().is_empty())
    .unwrap_or_else(|| file_name.to_string())
}

/// 扫描根目录**一层**（不递归），按名称排序返回。
pub fn list_entries(root: &Path, filter: EntryFilter) -> Result<Vec<FolderEntry>, String> {
  if !root.is_dir() {
    return Ok(Vec::new());
  }

  let mut entries: Vec<FolderEntry> = Vec::new();
  let read = fs::read_dir(root).map_err(|error| error.to_string())?;
  for item in read.flatten() {
    let path = item.path();
    let file_name = path
      .file_name()
      .map(|value| value.to_string_lossy().to_string())
      .unwrap_or_default();
    if file_name.is_empty() {
      continue;
    }
    // desktop.ini 等隐藏系统文件不展示。
    if file_name.starts_with('.') || file_name.eq_ignore_ascii_case("desktop.ini") {
      continue;
    }

    let is_dir = path.is_dir();
    let extension = if is_dir { String::new() } else { extension_of(&path) };
    if is_dir {
      if filter != EntryFilter::All {
        continue;
      }
    } else if filter == EntryFilter::ShortcutsOnly && !SHORTCUT_EXTENSIONS.contains(&extension.as_str()) {
      continue;
    }

    entries.push(FolderEntry {
      name: display_name(&file_name, &extension, is_dir, filter),
      path: path.to_string_lossy().to_string(),
      extension,
      is_dir,
    });
  }

  entries.sort_by(|left, right| left.name.to_lowercase().cmp(&right.name.to_lowercase()));
  Ok(entries)
}

/// 把外部拖入的路径写成镜像目录里的快捷方式。
///
/// - 源是 `.lnk` / `.url`：直接复制文件过去（保留原快捷方式）。
/// - 其它（`.exe`、文件夹、普通文件）：用 WScript.Shell 生成指向它的 `.lnk`。
pub fn create_shortcuts(root: &Path, paths: Vec<String>) -> Result<CreateShortcutsResult, String> {
  if !root.is_dir() {
    return Err(format!("镜像目录不存在：{}", root.display()));
  }
  let root_key = path_key(&root.canonicalize().unwrap_or_else(|_| root.to_path_buf()));

  let mut result = CreateShortcutsResult {
    created: Vec::new(),
    skipped: Vec::new(),
    errors: Vec::new(),
  };

  for raw in paths {
    let trimmed = raw.trim().trim_matches('"').to_string();
    if trimmed.is_empty() {
      continue;
    }
    let source = PathBuf::from(&trimmed);
    if !source.exists() {
      result.errors.push(format!("源路径不存在：{trimmed}"));
      continue;
    }

    // 已经在这个目录里的，不重复写入。
    let source_key = path_key(&source.canonicalize().unwrap_or_else(|_| source.clone()));
    if is_inside(&root_key, &source_key) {
      result.skipped.push(trimmed);
      continue;
    }

    let extension = extension_of(&source);
    let is_shortcut = extension == "lnk" || extension == "url";
    let destination = if is_shortcut {
      let file_name = source
        .file_name()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| format!("快捷方式.{extension}"));
      unique_copy_path(root, &file_name, &extension)
    } else {
      let stem = source
        .file_stem()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| "快捷方式".to_string());
      unique_lnk_path(root, &stem)
    };

    if is_shortcut {
      match fs::copy(&source, &destination) {
        Ok(_) => result.created.push(destination.to_string_lossy().to_string()),
        Err(error) => result.errors.push(format!("{}：{}", source.display(), error)),
      }
      continue;
    }

    let working_directory = source
      .parent()
      .map(|value| value.to_string_lossy().to_string())
      .unwrap_or_default();
    let script = format!(
      "$shell = New-Object -ComObject WScript.Shell; $s = $shell.CreateShortcut('{}'); $s.TargetPath = '{}'; $s.WorkingDirectory = '{}'; $s.Save()",
      ps_escape(&destination.to_string_lossy()),
      ps_escape(&source.to_string_lossy()),
      ps_escape(&working_directory),
    );

    match run_powershell(&script) {
      Ok(()) => result.created.push(destination.to_string_lossy().to_string()),
      Err(error) => result.errors.push(format!("{}：{}", source.display(), error)),
    }
  }

  Ok(result)
}

/// 把网址写成镜像目录里的 `.url` 快捷方式。
pub fn create_url_shortcut(root: &Path, url: &str, name: &str) -> Result<String, String> {
  let trimmed = url.trim();
  if !(trimmed.starts_with("http://") || trimmed.starts_with("https://")) {
    return Err("只支持 http/https 网址".to_string());
  }
  if !root.is_dir() {
    return Err(format!("镜像目录不存在：{}", root.display()));
  }

  let base = if name.trim().is_empty() { trimmed.to_string() } else { name.trim().to_string() };
  let destination = unique_copy_path(root, &format!("{}.url", sanitize_file_stem(&base)), "url");
  let content = format!("[InternetShortcut]\r\nURL={trimmed}\r\n");
  fs::write(&destination, content).map_err(|error| error.to_string())?;
  Ok(destination.to_string_lossy().to_string())
}

/// 删除镜像目录里的条目（送入回收站，可恢复）。
pub fn remove_entries(root: &Path, paths: Vec<String>) -> Result<u32, String> {
  let mut verified: Vec<String> = Vec::new();
  let mut errors: Vec<String> = Vec::new();
  for raw in paths {
    let trimmed = raw.trim().to_string();
    if trimmed.is_empty() {
      continue;
    }
    match ensure_inside(root, Path::new(&trimmed)) {
      Ok(resolved) => verified.push(resolved.to_string_lossy().to_string()),
      Err(error) => errors.push(error),
    }
  }

  if verified.is_empty() {
    return Err(if errors.is_empty() { "没有可删除的项目".to_string() } else { errors.join("；") });
  }

  let script = format!(
    "Add-Type -AssemblyName Microsoft.VisualBasic; foreach ($p in {}) {{ [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($p, 'OnlyErrorDialogs', 'SendToRecycleBin') }}",
    ps_string_array(&verified),
  );
  run_powershell(&script)?;
  Ok(verified.len() as u32)
}

/// 重命名镜像目录里的条目（改的是真实文件名，文件与文件夹都支持）。
pub fn rename_entry(root: &Path, path: &str, name: &str) -> Result<String, String> {
  let source = ensure_inside(root, Path::new(path.trim()))?;
  if !source.exists() {
    return Err(format!("路径不存在：{}", source.display()));
  }
  if name.trim().is_empty() {
    return Err("名称不能为空".to_string());
  }
  let next_name = sanitize_file_stem(name);

  let parent = source.parent().ok_or_else(|| "找不到所在目录".to_string())?;
  let extension = if source.is_dir() { String::new() } else { extension_of(&source) };
  let destination = parent.join(if extension.is_empty() {
    next_name
  } else {
    format!("{next_name}.{extension}")
  });

  if destination == source {
    return Ok(source.to_string_lossy().to_string());
  }
  if destination.exists() {
    return Err(format!("已存在同名项目：{}", destination.display()));
  }
  fs::rename(&source, &destination).map_err(|error| error.to_string())?;
  Ok(destination.to_string_lossy().to_string())
}
