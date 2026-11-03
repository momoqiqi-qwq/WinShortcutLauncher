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
  collections::hash_map::DefaultHasher,
  fs,
  hash::{Hash, Hasher},
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

/// v175: 目录「指纹」—— 页面清单 + 每个文件的修改时间和大小。
///
/// 前端拿它做自动刷新：指纹没变就不重扫，变了才刷新卡片墙。
/// 只做 stat 不读内容，几十个页面的目录跑一次是毫秒级，2 秒轮一次不会拖慢界面。
fn fingerprint(root: &Path, recursive: bool) -> String {
  let mut pages = Vec::new();
  collect_pages(root, root, 0, recursive, &mut pages);
  let mut hasher = DefaultHasher::new();
  for page in &pages {
    page.relative.hash(&mut hasher);
    page.modified.unwrap_or(0).hash(&mut hasher);
    fs::metadata(&page.path)
      .map(|meta| meta.len())
      .unwrap_or(0)
      .hash(&mut hasher);
  }
  format!("{:x}", hasher.finish())
}

/// v175: 复制 / 新增进 HTML 根目录的结果。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HtmlCopyResult {
  /// 真正落盘的页面（绝对路径），前端用它提示「新增了几张卡片」。
  pub copied: Vec<String>,
  /// 被跳过的来源，附带原因。
  pub skipped: Vec<String>,
  pub contains_folders: bool,
}

/// 目标重名时自动加序号：`index.html` → `index (2).html`。
///
/// 刻意不覆盖同名文件 —— 拖进来一个同名页面，用户要的是「多一张卡」，
/// 不是「悄悄替换掉原来那张」。
fn unique_target(dir: &Path, name: &str) -> PathBuf {
  let candidate = dir.join(name);
  if !candidate.exists() {
    return candidate;
  }
  let path = Path::new(name);
  let stem = path
    .file_stem()
    .map(|value| value.to_string_lossy().to_string())
    .unwrap_or_else(|| name.to_string());
  let extension = path
    .extension()
    .map(|value| format!(".{}", value.to_string_lossy()))
    .unwrap_or_default();
  for index in 2..1000u32 {
    let next = dir.join(format!("{stem} ({index}){extension}"));
    if !next.exists() {
      return next;
    }
  }
  dir.join(format!("{stem}-{}{extension}", std::process::id()))
}

/// 整目录复制（页面依赖的 css / js / 图片跟着一起走）。
///
/// 深度上限 8：防止误拖一个巨型目录把磁盘写满；隐藏文件跳过，
/// 和扫描时忽略 `.` 开头的规则保持一致。
fn copy_dir_recursive(source: &Path, target: &Path, depth: u8) -> Result<(), String> {
  if depth > 8 {
    return Ok(());
  }
  fs::create_dir_all(target).map_err(|error| format!("创建文件夹失败：{error}"))?;
  let entries = match fs::read_dir(source) {
    Ok(entries) => entries,
    Err(error) => return Err(format!("读取文件夹失败：{error}")),
  };
  for entry in entries.filter_map(Result::ok) {
    let name = entry.file_name().to_string_lossy().to_string();
    if name.starts_with('.') {
      continue;
    }
    let path = entry.path();
    let destination = target.join(&name);
    let file_type = entry.file_type().map_err(|error| error.to_string())?;
    if file_type.is_symlink() {
      continue;
    }
    if file_type.is_dir() {
      copy_dir_recursive(&path, &destination, depth + 1)?;
    } else {
      fs::copy(&path, &destination).map_err(|error| format!("复制「{name}」失败：{error}"))?;
    }
  }
  Ok(())
}

fn copy_into_folder(root: &Path, sources: Vec<String>) -> Result<HtmlCopyResult, String> {
  if !root.is_dir() {
    return Err("HTML 目录还没有选择有效的文件夹".to_string());
  }
  let mut copied = Vec::new();
  let mut skipped = Vec::new();
  let mut contains_folders = false;
  for raw in sources {
    let source = PathBuf::from(raw.trim().trim_matches('"'));
    let label = source
      .file_name()
      .map(|value| value.to_string_lossy().to_string())
      .unwrap_or_else(|| raw.clone());
    if !source.exists() {
      skipped.push(format!("{label}：找不到这个文件"));
      continue;
    }
    if source.is_dir() {
      // 不能把根目录或其祖先再复制到自己里面，避免递归自复制。
      let source_real = fs::canonicalize(&source).map_err(|error| error.to_string())?;
      let root_real = fs::canonicalize(root).map_err(|error| error.to_string())?;
      if root_real.starts_with(&source_real) {
        skipped.push(format!("{label}：不能把文件夹复制到它自身或其子文件夹中"));
        continue;
      }
      let destination = unique_target(root, &label);
      match copy_dir_recursive(&source, &destination, 0) {
        Ok(_) => {
          copied.push(destination.to_string_lossy().to_string());
          contains_folders = true;
        }
        Err(error) => skipped.push(format!("{label}：{error}")),
      }
      continue;
    }
    if !is_html(&source) {
      skipped.push(format!("{label}：不是 .html / .htm 文件"));
      continue;
    }
    let destination = unique_target(root, &label);
    match fs::copy(&source, &destination) {
      Ok(_) => copied.push(destination.to_string_lossy().to_string()),
      Err(error) => skipped.push(format!("{label}：复制失败（{error}）")),
    }
  }
  Ok(HtmlCopyResult { copied, skipped, contains_folders })
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

/// v175: 把拖进来的 .html / .htm（或整个页面文件夹）复制到 HTML 根目录。
///
/// 只复制、不移动 —— 用户手里的原件不能被启动器顺走。
#[tauri::command]
pub async fn copy_html_into_folder(path: String, sources: Vec<String>) -> Result<HtmlCopyResult, String> {
  crate::blocking::offload(move || {
    let root = crate::folder_mirror::resolve_root(&path)?;
    copy_into_folder(&root, sources)
  })
  .await
}

/// v175: 取 HTML 目录的指纹，供前端判断「文件夹里有没有新页面」。
#[tauri::command]
pub async fn html_folder_signature(path: String, recursive: Option<bool>) -> Result<String, String> {
  crate::blocking::offload(move || {
    let root = crate::folder_mirror::resolve_root(&path)?;
    Ok(fingerprint(&root, recursive.unwrap_or(true)))
  })
  .await
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
///
/// v195: 命令行文本走 `commands::explorer_argument` + `raw_arg`，和「在文件管理器中
/// 显示」共用一套拼法 —— 用 `arg()` 会被 Rust 再套一层引号，explorer 解析失败。
#[tauri::command]
pub async fn open_html_folder_location(path: String) -> Result<(), String> {
  crate::blocking::offload(move || {
    let root = crate::folder_mirror::resolve_root(&path)?;
    let argument = crate::commands::explorer_argument(&root);
    let mut command = std::process::Command::new("explorer.exe");
    #[cfg(target_os = "windows")]
    {
      use std::os::windows::process::CommandExt;
      command.raw_arg(argument.as_str());
      command.creation_flags(0x08000000);
    }
    #[cfg(not(target_os = "windows"))]
    command.arg(&argument);
    command.spawn().map(|_| ()).map_err(|error| error.to_string())
  })
  .await
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::sync::atomic::{AtomicUsize, Ordering};

  static NEXT_ID: AtomicUsize = AtomicUsize::new(0);

  struct TestFolder(PathBuf);

  impl TestFolder {
    fn new() -> Self {
      let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("target/html-drop-tests").join(format!(
        "yue-html-drop-{}-{}", std::process::id(), NEXT_ID.fetch_add(1, Ordering::Relaxed)
      ));
      fs::create_dir_all(&path).unwrap();
      Self(path)
    }
  }

  impl Drop for TestFolder {
    fn drop(&mut self) {
      let _ = fs::remove_dir_all(&self.0);
    }
  }

  #[test]
  fn copies_html_without_overwriting_or_removing_source() {
    let sandbox = TestFolder::new();
    let root = sandbox.0.join("destination");
    fs::create_dir(&root).unwrap();
    let source = sandbox.0.join("demo.html");
    fs::write(&source, "new page").unwrap();
    fs::write(root.join("demo.html"), "existing page").unwrap();

    let result = copy_into_folder(&root, vec![source.to_string_lossy().into_owned()]).unwrap();

    assert_eq!(result.copied.len(), 1);
    assert!(!result.contains_folders);
    assert_eq!(fs::read_to_string(&source).unwrap(), "new page");
    assert_eq!(fs::read_to_string(root.join("demo.html")).unwrap(), "existing page");
    assert_eq!(fs::read_to_string(root.join("demo (2).html")).unwrap(), "new page");
    let mut pages = Vec::new();
    collect_pages(&root, &root, 0, false, &mut pages);
    assert_eq!(pages.len(), 2);
  }

  #[test]
  fn copies_page_folder_with_assets_then_lists_the_copied_page() {
    let sandbox = TestFolder::new();
    let root = sandbox.0.join("destination");
    let source = sandbox.0.join("project");
    fs::create_dir(&root).unwrap();
    fs::create_dir_all(source.join("assets")).unwrap();
    fs::write(source.join("index.htm"), "<link href='assets/style.css'>").unwrap();
    fs::write(source.join("assets/style.css"), "body { color: red; }").unwrap();

    let result = copy_into_folder(&root, vec![source.to_string_lossy().into_owned()]).unwrap();

    assert!(result.contains_folders);
    assert!(result.skipped.is_empty());
    assert!(root.join("project/assets/style.css").is_file());
    let mut pages = Vec::new();
    collect_pages(&root, &root, 0, true, &mut pages);
    assert_eq!(pages.len(), 1);
    assert!(Path::new(&pages[0].path).starts_with(&root));
  }

  #[test]
  fn skips_self_and_ancestor_folder_drops_before_creating_any_copy() {
    let sandbox = TestFolder::new();
    let root = sandbox.0.join("destination");
    fs::create_dir(&root).unwrap();

    let result = copy_into_folder(&root, vec![
      root.to_string_lossy().into_owned(), sandbox.0.to_string_lossy().into_owned()
    ]).unwrap();

    assert!(result.copied.is_empty());
    assert_eq!(result.skipped.len(), 2);
    assert_eq!(fs::read_dir(&root).unwrap().count(), 0);
  }
}
