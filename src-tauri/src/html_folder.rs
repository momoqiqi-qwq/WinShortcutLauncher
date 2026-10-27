//! HTML 目录（v173）：扫描用户指定的文件夹，列出里面的 .html / .htm 页面。
//!
//! 和 `mapped_folder` 的区别：
//!
//! | | mapped_folder | html_folder |
//! | --- | --- | --- |
//! | 列什么 | 全部文件/文件夹 | 只要 html / htm |
//! | 扫几层 | 一层 | 递归（可关），深度上限 4 |
//! | 用来干什么 | 映射成快捷方式 | 卡片里**实时预览首页** |
//!
//! 预览走 Tauri 的 asset 协议：前端把绝对路径 `convertFileSrc()` 成
//! `http://asset.localhost/<path>`，塞进 iframe。协议层有自己的作用域白名单
//! （`tauri.conf.json` 里只放开了 `$APPDATA/**/*`），所以扫描前必须先
//! `allow_html_preview` 把根目录**递归**加进去，否则页面本体和它的相对图片
//! 都会被协议层拒掉（表现为 iframe 一片空白）。
//!
//! 所有命令都是 `async` + `offload`：扫盘是阻塞活儿，跑在主线程会让整个界面冻住。

use serde::Serialize;
use std::{
  fs,
  path::{Path, PathBuf},
  time::UNIX_EPOCH,
};
use tauri::{AppHandle, Manager};

/// 认作「页面」的扩展名。
const HTML_EXTENSIONS: [&str; 2] = ["html", "htm"];
/// 递归深度上限（根目录算第 0 层）。
const MAX_DEPTH: u8 = 4;
/// 单次扫描的页面数量上限，防止误选到 `C:\Users` 这类巨型目录。
const MAX_PAGES: usize = 800;
/// 这些目录名不往下钻：体积大、基本没有页面、扫起来还慢。
const SKIP_DIRS: [&str; 9] = [
  "node_modules",
  "target",
  "dist",
  "build",
  ".git",
  ".svn",
  ".hg",
  "__pycache__",
  "vendor",
];
/// 这些文件名当成「首页」，卡片上打个标。
const INDEX_STEMS: [&str; 4] = ["index", "default", "main", "home"];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HtmlPage {
  /// 文件名（含扩展名），例如 `index.html`。
  pub name: String,
  /// 去掉扩展名的名字，卡片标题用它。
  pub stem: String,
  /// 绝对路径。
  pub path: String,
  pub extension: String,
  /// 相对根目录的路径，子文件夹里的同名页面靠它区分。
  pub relative: String,
  /// 相对根目录的父文件夹；直接在根目录下时是空串。
  pub directory: String,
  /// 是否是 index/default/main/home 这类首页。
  pub is_index: bool,
  /// 修改时间（毫秒时间戳），拿不到就是 None。
  pub modified: Option<u64>,
}

fn extension_of(path: &Path) -> String {
  path
    .extension()
    .map(|value| value.to_string_lossy().to_lowercase())
    .unwrap_or_default()
}

fn is_html(path: &Path) -> bool {
  let extension = extension_of(path);
  HTML_EXTENSIONS.iter().any(|item| *item == extension)
}

fn modified_ms(path: &Path) -> Option<u64> {
  let modified = fs::metadata(path).ok()?.modified().ok()?;
  modified
    .duration_since(UNIX_EPOCH)
    .ok()
    .map(|value| value.as_millis() as u64)
}

/// 递归收集页面。
///
/// 深度优先、按名字排序（子文件夹的页面才会稳定地跟在父级后面），
/// 并且每进一层都重新检查 `MAX_PAGES`，避免超大树把内存吃穿。
fn collect_pages(root: &Path, dir: &Path, depth: u8, recursive: bool, out: &mut Vec<HtmlPage>) {
  if depth > MAX_DEPTH || out.len() >= MAX_PAGES {
    return;
  }
  let entries = match fs::read_dir(dir) {
    Ok(entries) => entries,
    // 没有权限的子文件夹直接跳过，不要因为一个目录让整次扫描失败。
    Err(_) => return,
  };
  let mut children: Vec<fs::DirEntry> = entries.filter_map(Result::ok).collect();
  children.sort_by(|left, right| {
    left
      .file_name()
      .to_string_lossy()
      .to_lowercase()
      .cmp(&right.file_name().to_string_lossy().to_lowercase())
  });

  for entry in children {
    if out.len() >= MAX_PAGES {
      return;
    }
    let name = entry.file_name().to_string_lossy().to_string();
    if name.starts_with('.') || name.eq_ignore_ascii_case("desktop.ini") {
      continue;
    }
    let file_type = match entry.file_type() {
      Ok(kind) => kind,
      Err(_) => continue,
    };
    let path = entry.path();
    if file_type.is_dir() {
      if !recursive || SKIP_DIRS.iter().any(|skip| name.eq_ignore_ascii_case(skip)) {
        continue;
      }
      collect_pages(root, &path, depth + 1, recursive, out);
      continue;
    }
    if !is_html(&path) {
      continue;
    }
    let relative = path
      .strip_prefix(root)
      .unwrap_or(&path)
      .to_string_lossy()
      .replace('/', "\\");
    let directory = Path::new(&relative)
      .parent()
      .map(|parent| parent.to_string_lossy().to_string())
      .unwrap_or_default();
    let stem = path
      .file_stem()
      .map(|value| value.to_string_lossy().to_string())
      .unwrap_or_else(|| name.clone());
    let is_index = INDEX_STEMS
      .iter()
      .any(|candidate| stem.to_lowercase() == *candidate);
    out.push(HtmlPage {
      name,
      stem,
      path: path.to_string_lossy().to_string(),
      extension: extension_of(&path),
      relative,
      directory,
      is_index,
      modified: modified_ms(&path),
    });
  }
}

fn scan(root: &str, recursive: bool) -> Result<Vec<HtmlPage>, String> {
  let root_path = crate::folder_mirror::resolve_root(root)?;
  let mut pages = Vec::new();
  collect_pages(&root_path, &root_path, 0, recursive, &mut pages);
  Ok(pages)
}

/// 校验用户选的 HTML 根目录，返回规整后的绝对路径。
///
/// 前端在「选择文件夹」之后立刻调一次，好在建目录之前就把不存在的路径挡掉。
#[tauri::command]
pub async fn validate_html_folder(path: String) -> Result<String, String> {
  crate::blocking::offload(move || {
    let root = crate::folder_mirror::resolve_root(&path)?;
    Ok(root.to_string_lossy().to_string())
  })
  .await
}

/// 扫描 HTML 目录，返回其中所有页面。
#[tauri::command]
pub async fn list_html_folder(path: String, recursive: Option<bool>) -> Result<Vec<HtmlPage>, String> {
  crate::blocking::offload(move || scan(&path, recursive.unwrap_or(true))).await
}

/// 把 HTML 根目录（递归）加进 asset 协议的作用域，让 iframe 能读到页面和它的相对资源。
///
/// 每次扫描前都调一次是**故意**的：作用域是运行时的，重启应用就没了；
/// 重复 add 是幂等的，代价只有一次路径比较。
#[tauri::command]
pub async fn allow_html_preview(app: AppHandle, path: String) -> Result<String, String> {
  crate::blocking::offload(move || {
    let root: PathBuf = crate::folder_mirror::resolve_root(&path)?;
    app
      .asset_protocol_scope()
      .allow_directory(&root, true)
      .map_err(|error| format!("预览目录授权失败：{error}"))?;
    Ok(root.to_string_lossy().to_string())
  })
  .await
}

/// 打开 HTML 目录所在位置（在资源管理器里）。
#[tauri::command]
pub async fn open_html_folder_location(path: String) -> Result<(), String> {
  crate::blocking::offload(move || {
    let root = crate::folder_mirror::resolve_root(&path)?;
    let mut command = std::process::Command::new("explorer.exe");
    command.arg(root.as_os_str());
    #[cfg(target_os = "windows")]
    {
      use std::os::windows::process::CommandExt;
      command.creation_flags(0x08000000);
    }
    command.spawn().map(|_| ()).map_err(|error| error.to_string())
  })
  .await
}
