use std::fs;
use std::path::{Path, PathBuf};

fn copy_dir_all(src: &Path, dst: &Path) -> Result<(), String> {
  if !dst.exists() {
    fs::create_dir_all(dst).map_err(|e| format!("create dir failed: {e}"))?;
  }
  for entry in fs::read_dir(src).map_err(|e| format!("read dir failed: {e}"))? {
    let entry = entry.map_err(|e| format!("read entry failed: {e}"))?;
    let ty = entry.file_type().map_err(|e| format!("file type failed: {e}"))?;
    let target = dst.join(entry.file_name());
    if ty.is_dir() {
      copy_dir_all(&entry.path(), &target)?;
    } else {
      fs::copy(entry.path(), target).map_err(|e| format!("copy file failed: {e}"))?;
    }
  }
  Ok(())
}

fn unique_target(folder: &Path, name: &str) -> PathBuf {
  let mut target = folder.join(name);
  if !target.exists() {
    return target;
  }
  let stem = Path::new(name).file_stem().and_then(|x| x.to_str()).unwrap_or("item");
  let ext = Path::new(name).extension().and_then(|x| x.to_str()).unwrap_or("");
  for i in 1..9999 {
    let file_name = if ext.is_empty() { format!("{stem} ({i})") } else { format!("{stem} ({i}).{ext}") };
    target = folder.join(file_name);
    if !target.exists() {
      return target;
    }
  }
  folder.join(name)
}

#[tauri::command]
pub fn copy_transfer_paths_to_folder(paths: Vec<String>, folder: String, action: Option<String>) -> Result<(), String> {
  let target_folder = PathBuf::from(folder);
  if !target_folder.exists() || !target_folder.is_dir() {
    return Err("目标不是有效文件夹".to_string());
  }
  let should_move = action.unwrap_or_else(|| "copy".to_string()) == "move";

  for raw in paths {
    let src = PathBuf::from(raw.trim_matches('"'));
    if !src.exists() {
      continue;
    }
    let name = src.file_name().and_then(|x| x.to_str()).ok_or_else(|| "无法读取文件名".to_string())?;
    let dst = unique_target(&target_folder, name);
    if should_move {
      match fs::rename(&src, &dst) {
        Ok(_) => continue,
        Err(_) => {
          // Cross-volume move: fallback to copy + delete.
          if src.is_dir() {
            copy_dir_all(&src, &dst)?;
            fs::remove_dir_all(&src).map_err(|e| format!("remove source dir failed: {e}"))?;
          } else {
            fs::copy(&src, &dst).map_err(|e| format!("copy file failed: {e}"))?;
            fs::remove_file(&src).map_err(|e| format!("remove source file failed: {e}"))?;
          }
        }
      }
    } else if src.is_dir() {
      copy_dir_all(&src, &dst)?;
    } else {
      fs::copy(&src, &dst).map_err(|e| format!("copy file failed: {e}"))?;
    }
  }
  Ok(())
}

#[tauri::command]
pub fn get_path_kind(path: String) -> Result<String, String> {
  let p = PathBuf::from(path);
  if p.is_dir() { Ok("folder".to_string()) }
  else if p.is_file() { Ok("file".to_string()) }
  else { Ok("unknown".to_string()) }
}
