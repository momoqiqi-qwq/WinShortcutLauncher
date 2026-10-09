//! 开始菜单直连子目录。
//!
//! 根目录固定为「当前用户」的开始菜单文件夹：
//! `%APPDATA%\Microsoft\Windows\Start Menu\Programs`，读写都无需管理员权限。
//!
//! 目录只扫描根一层（不递归子文件夹），只认 `.lnk` / `.url` / `.exe` 三类文件。
//! 真正的实现（列目录 / 建快捷方式 / 送回收站 / 重命名）都在 `folder_mirror` 里，
//! 这里只是把「根目录固定 + 过滤方式」绑上去。
//!
//! **所有命令都是 `async`**：见 `crate::blocking` 的说明 —— 同步命令跑在主线程上，
//! 而这些命令要么扫盘、要么起 PowerShell。

use crate::blocking::offload;
use crate::folder_mirror::{self, CreateShortcutsResult, EntryFilter, FolderEntry};
use std::{env, fs, path::{Path, PathBuf}};

/// 当前用户的开始菜单 Programs 目录。
pub fn start_menu_dir() -> Result<PathBuf, String> {
  if let Ok(appdata) = env::var("APPDATA") {
    if !appdata.trim().is_empty() {
      return Ok(Path::new(&appdata)
        .join("Microsoft")
        .join("Windows")
        .join("Start Menu")
        .join("Programs"));
    }
  }
  let profile = env::var("USERPROFILE").map_err(|_| "找不到 APPDATA / USERPROFILE 环境变量".to_string())?;
  Ok(Path::new(&profile)
    .join("AppData")
    .join("Roaming")
    .join("Microsoft")
    .join("Windows")
    .join("Start Menu")
    .join("Programs"))
}

#[tauri::command]
pub async fn get_start_menu_folder() -> Result<String, String> {
  offload(|| {
    let dir = start_menu_dir()?;
    Ok(dir.to_string_lossy().to_string())
  })
  .await
}

/// 扫描开始菜单根目录（不递归），按名称排序返回。
#[tauri::command]
pub async fn list_start_menu_shortcuts() -> Result<Vec<FolderEntry>, String> {
  offload(|| {
    let dir = start_menu_dir()?;
    folder_mirror::list_entries(&dir, EntryFilter::ShortcutsOnly)
  })
  .await
}

/// 把外部拖入的路径写成开始菜单快捷方式。
#[tauri::command]
pub async fn create_start_menu_shortcuts(paths: Vec<String>) -> Result<CreateShortcutsResult, String> {
  offload(move || {
    let dir = start_menu_dir()?;
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    folder_mirror::create_shortcuts(&dir, paths)
  })
  .await
}

/// 把网址写成开始菜单的 `.url` 快捷方式。
#[tauri::command]
pub async fn create_start_menu_url(url: String, name: String) -> Result<String, String> {
  offload(move || {
    let dir = start_menu_dir()?;
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    folder_mirror::create_url_shortcut(&dir, &url, &name)
  })
  .await
}

/// 删除开始菜单快捷方式（送入回收站，可恢复）。
#[tauri::command]
pub async fn remove_start_menu_shortcuts(paths: Vec<String>) -> Result<u32, String> {
  offload(move || {
    let dir = start_menu_dir()?;
    folder_mirror::remove_entries(&dir, paths)
  })
  .await
}

/// 重命名开始菜单快捷方式（改的是真实的 `.lnk` / `.url` 文件名）。
#[tauri::command]
pub async fn rename_start_menu_shortcut(path: String, name: String) -> Result<String, String> {
  offload(move || {
    let dir = start_menu_dir()?;
    folder_mirror::rename_entry(&dir, &path, &name)
  })
  .await
}
