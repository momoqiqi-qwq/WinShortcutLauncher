//! 映射文件夹子目录。
//!
//! 与 `start_menu` 的区别只有一个：**根目录由用户自选**（存在配置里，`Directory.mappedPath`）。
//! 其余行为完全一致 —— 实时镜像该文件夹、拖入写回真实快捷方式、删除送回收站。
//!
//! 因为是用户自选路径，每个命令都必须先校验：
//! 1. 根目录存在且是文件夹（`resolve_root`）；
//! 2. 被删/被改的路径确实在根目录之内（`ensure_inside`）—— 否则会误删用户其它文件。

use crate::folder_mirror::{self, CreateShortcutsResult, EntryFilter, FolderEntry};

/// 校验并规范化映射根目录，返回可以直接存进配置的绝对路径。
#[tauri::command]
pub fn validate_mapped_folder(root: String) -> Result<String, String> {
  let dir = folder_mirror::resolve_root(&root)?;
  Ok(dir.to_string_lossy().to_string())
}

/// 扫描映射目录**一层**（不递归），返回全部文件与文件夹。
#[tauri::command]
pub fn list_mapped_folder(root: String) -> Result<Vec<FolderEntry>, String> {
  let dir = folder_mirror::resolve_root(&root)?;
  folder_mirror::list_entries(&dir, EntryFilter::All)
}

/// 把外部拖入的路径写成映射目录里的快捷方式。
#[tauri::command]
pub fn create_mapped_shortcuts(root: String, paths: Vec<String>) -> Result<CreateShortcutsResult, String> {
  let dir = folder_mirror::resolve_root(&root)?;
  folder_mirror::create_shortcuts(&dir, paths)
}

/// 把网址写成映射目录里的 `.url` 快捷方式。
#[tauri::command]
pub fn create_mapped_url(root: String, url: String, name: String) -> Result<String, String> {
  let dir = folder_mirror::resolve_root(&root)?;
  folder_mirror::create_url_shortcut(&dir, &url, &name)
}

/// 删除映射目录里的条目（送入回收站，可恢复）。
#[tauri::command]
pub fn remove_mapped_entries(root: String, paths: Vec<String>) -> Result<u32, String> {
  let dir = folder_mirror::resolve_root(&root)?;
  folder_mirror::remove_entries(&dir, paths)
}

/// 重命名映射目录里的条目（改的是真实文件名）。
#[tauri::command]
pub fn rename_mapped_entry(root: String, path: String, name: String) -> Result<String, String> {
  let dir = folder_mirror::resolve_root(&root)?;
  folder_mirror::rename_entry(&dir, &path, &name)
}
