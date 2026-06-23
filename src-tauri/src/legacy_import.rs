use std::{collections::HashMap, path::{Path, PathBuf}};

use base64::{engine::general_purpose, Engine as _};
use rusqlite::{Connection, OptionalExtension};
use serde::Serialize;

#[derive(Debug, Clone)]
struct LegacyGroupRow {
  id: i64,
  name: String,
  pos: i64,
  parent_group: i64,
  group_type: i64,
  content: Option<String>,
}

#[derive(Debug, Clone)]
struct LegacyLinkRow {
  id: i64,
  name: String,
  pos: i64,
  parent_group: i64,
  link_type: i64,
  icon: String,
  path: String,
  parameter: String,
  work_dir: String,
  is_admin: i64,
  remark: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ShortcutItemOut {
  id: String,
  name: String,
  path: String,
  icon: Option<String>,
  #[serde(rename = "type")]
  item_type: String,
  order: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DirectoryOut {
  id: String,
  name: String,
  order: usize,
  kind: String,
  items: Vec<ShortcutItemOut>,
  #[serde(skip_serializing_if = "Option::is_none")]
  note: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GroupOut {
  id: String,
  name: String,
  order: usize,
  directories: Vec<DirectoryOut>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DisplayOut {
  label_lines: u8,
  chars_per_line: u8,
  font_size: u8,
  icon_size: u16,
  item_width: u16,
  item_height: u16,
  grid_gap: u16,
  view_mode: String,
  sort_mode: String,
  menu_font_size: u8,
  menu_item_height: u8,
  menu_min_width: u16,
  top_tab_equal_width: bool,
  top_tab_width: u16,
  top_tab_shape: String,
  sidebar_width: u16,
  sidebar_item_height: u16,
  sidebar_item_gap: u16,
  sidebar_font_size: u8,
  sidebar_item_radius: u16,
  ui_scale: f32,
  main_ui_scale: f32,
  settings_ui_scale: f32,
  scrollbar_size: u16,
  scrollbar_radius: u16,
  scrollbar_use_theme_color: bool,
  scrollbar_thumb_color: String,
  scrollbar_thumb_hover_color: String,
  scrollbar_track_color: String,
  remember_interface_collapse_state: bool,
  interface_collapsed_sections: Vec<String>,
  window_control_style: String,
  window_control_size: u16,
  window_control_gap: u16,
  background_enabled: bool,
  background_image: String,
  background_opacity: f32,
  background_dim: f32,
  background_blur: u16,
  background_fit: String,
  background_position: String,
  background_panel_opacity: f32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BehaviorOut {
  edge_auto_hide: bool,
  edge_hide_delay_seconds: f32,
  edge_animation_ms: u16,
  edge_animation_style: String,
  auto_edge_hide: bool,
  auto_edge_bounce: bool,
  auto_edge_hide_delay: u16,
  edge_visible_pixels: u16,
  edge_strip_size: u16,
  edge_strip_opacity: f32,
  edge_strip_use_theme_color: bool,
  edge_strip_color: String,
  launch_mode: String,
  auto_start: bool,
  close_action: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WindowStateOut {
  opacity: f32,
  edge_auto_hide: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AutoSaveOut {
  enabled: bool,
  directory: String,
  interval_minutes: u16,
  file_name: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppConfigOut {
  groups: Vec<GroupOut>,
  theme: String,
  display: DisplayOut,
  behavior: BehaviorOut,
  window_state: WindowStateOut,
  auto_save: AutoSaveOut,
}

fn has_table(conn: &Connection, name: &str) -> Result<bool, String> {
  conn
    .query_row(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1 LIMIT 1",
      [name],
      |_| Ok(()),
    )
    .optional()
    .map(|value| value.is_some())
    .map_err(|error| error.to_string())
}

fn resolve_link_and_icon_paths(selected: &Path, explicit_icon: Option<String>) -> Result<(PathBuf, Option<PathBuf>), String> {
  let selected_conn = Connection::open(selected).map_err(|error| format!("无法打开 DB：{}", error))?;
  let selected_is_link = has_table(&selected_conn, "Links")? && has_table(&selected_conn, "Groups")?;
  let selected_is_icon = has_table(&selected_conn, "Cache")?;
  drop(selected_conn);

  let parent = selected.parent().unwrap_or_else(|| Path::new("."));

  let link_path = if selected_is_link {
    selected.to_path_buf()
  } else if selected_is_icon {
    let sibling = parent.join("link.db");
    if sibling.exists() {
      sibling
    } else {
      return Err("你选择的是 icon.db，但同目录没有找到 link.db。请直接选择 link.db 导入。".to_string());
    }
  } else {
    return Err("这个 .db 不是支持的 Lucy/link.db 数据库。需要包含 Groups 和 Links 表。".to_string());
  };

  let icon_path = if let Some(value) = explicit_icon.filter(|v| !v.trim().is_empty()) {
    Some(PathBuf::from(value))
  } else if selected_is_icon {
    Some(selected.to_path_buf())
  } else {
    let sibling = parent.join("icon.db");
    sibling.exists().then_some(sibling)
  };

  Ok((link_path, icon_path))
}

fn load_groups(conn: &Connection) -> Result<Vec<LegacyGroupRow>, String> {
  let mut stmt = conn
    .prepare("SELECT ID, NAME, COALESCE(TYPE,0), COALESCE(POS,0), COALESCE(ParentGroup,0), Content FROM Groups ORDER BY COALESCE(ParentGroup,0), COALESCE(POS,0), ID")
    .map_err(|error| error.to_string())?;
  let rows = stmt
    .query_map([], |row| {
      Ok(LegacyGroupRow {
        id: row.get(0)?,
        name: row.get::<_, String>(1).unwrap_or_else(|_| "未命名".to_string()),
        group_type: row.get(2).unwrap_or(0),
        pos: row.get(3).unwrap_or(0),
        parent_group: row.get(4).unwrap_or(0),
        content: row.get(5).ok(),
      })
    })
    .map_err(|error| error.to_string())?;

  let mut out = Vec::new();
  for row in rows {
    out.push(row.map_err(|error| error.to_string())?);
  }
  Ok(out)
}

fn load_links(conn: &Connection) -> Result<Vec<LegacyLinkRow>, String> {
  let mut stmt = conn
    .prepare("SELECT ID, NAME, COALESCE(POS,0), COALESCE(ParentGroup,0), COALESCE(TYPE,0), COALESCE(ICON,''), COALESCE(PATH,''), COALESCE(Parameter,''), COALESCE(WorkDir,''), COALESCE(IsAdmin,0), COALESCE(Remark,'') FROM Links ORDER BY COALESCE(ParentGroup,0), COALESCE(POS,0), ID")
    .map_err(|error| error.to_string())?;
  let rows = stmt
    .query_map([], |row| {
      Ok(LegacyLinkRow {
        id: row.get(0)?,
        name: row.get::<_, String>(1).unwrap_or_else(|_| "未命名".to_string()),
        pos: row.get(2).unwrap_or(0),
        parent_group: row.get(3).unwrap_or(0),
        link_type: row.get(4).unwrap_or(0),
        icon: row.get::<_, String>(5).unwrap_or_default(),
        path: row.get::<_, String>(6).unwrap_or_default(),
        parameter: row.get::<_, String>(7).unwrap_or_default(),
        work_dir: row.get::<_, String>(8).unwrap_or_default(),
        is_admin: row.get(9).unwrap_or(0),
        remark: row.get::<_, String>(10).unwrap_or_default(),
      })
    })
    .map_err(|error| error.to_string())?;

  let mut out = Vec::new();
  for row in rows {
    out.push(row.map_err(|error| error.to_string())?);
  }
  Ok(out)
}

fn looks_like_separator(name: &str) -> bool {
  let trimmed = name.trim();
  trimmed.is_empty() || trimmed.contains("分隔") || trimmed.chars().all(|ch| ch == '-' || ch == '—' || ch == '_' || ch.is_whitespace())
}

fn sanitize_id_part(value: i64) -> String {
  if value < 0 { format!("n{}", -value) } else { value.to_string() }
}

fn normalize_icon_path(value: &str) -> Option<String> {
  let trimmed = value.trim();
  if trimmed.is_empty() || trimmed.starts_with('#') || trimmed.starts_with("*.") {
    return None;
  }
  let mut normalized = trimmed.replace('\\', "/");
  if let Some(stripped) = normalized.strip_prefix("./") {
    normalized = stripped.to_string();
  }
  Some(normalized)
}

fn query_icon_data_url(icon_conn: Option<&Connection>, link_id: i64) -> Option<String> {
  let conn = icon_conn?;
  let blob: Option<Vec<u8>> = conn
    .query_row(
      "SELECT COALESCE(Icon48, Icon32, Icon16) FROM Cache WHERE ID=?1 AND COALESCE(Invalid,0)=0 LIMIT 1",
      [link_id],
      |row| row.get(0),
    )
    .optional()
    .ok()
    .flatten();
  blob.filter(|data| !data.is_empty()).map(|data| format!("data:image/png;base64,{}", general_purpose::STANDARD.encode(data)))
}

fn item_type(row: &LegacyLinkRow) -> String {
  let path = row.path.trim().to_ascii_lowercase();
  let icon = row.icon.trim().to_ascii_lowercase();
  if path.starts_with("http://") || path.starts_with("https://") {
    "url".to_string()
  } else if row.link_type == 2 || icon == "#dir" {
    "folder".to_string()
  } else if row.link_type == 6 || row.link_type == 7 || path.starts_with("shell:") || path.ends_with(".msc") || path.ends_with(".cpl") || path.ends_with(".exe") || path.is_empty() {
    "command".to_string()
  } else {
    "file".to_string()
  }
}

fn command_path(row: &LegacyLinkRow) -> String {
  let path = row.path.trim();
  let parameter = row.parameter.trim();
  if path.is_empty() {
    return row.name.clone();
  }
  if parameter.is_empty() || path.starts_with("http://") || path.starts_with("https://") || path.starts_with("shell:") {
    return path.to_string();
  }
  if path.starts_with('"') || !path.contains(' ') {
    format!("{} {}", path, parameter)
  } else {
    format!("\"{}\" {}", path, parameter)
  }
}

fn shortcut_item(row: &LegacyLinkRow, order: usize, icon_conn: Option<&Connection>) -> ShortcutItemOut {
  let icon = query_icon_data_url(icon_conn, row.id).or_else(|| normalize_icon_path(&row.icon));
  ShortcutItemOut {
    id: format!("legacy_item_{}", sanitize_id_part(row.id)),
    name: row.name.trim().to_string(),
    path: command_path(row),
    icon,
    item_type: item_type(row),
    order,
  }
}

fn default_display() -> DisplayOut {
  DisplayOut {
    label_lines: 2,
    chars_per_line: 8,
    font_size: 12,
    icon_size: 52,
    item_width: 108,
    item_height: 116,
    grid_gap: 14,
    view_mode: "grid".to_string(),
    sort_mode: "custom".to_string(),
    menu_font_size: 14,
    menu_item_height: 34,
    menu_min_width: 210,
    top_tab_equal_width: false,
    top_tab_width: 104,
    top_tab_shape: "round".to_string(),
    sidebar_width: 176,
    sidebar_item_height: 38,
    sidebar_item_gap: 8,
    sidebar_font_size: 14,
    sidebar_item_radius: 12,
    ui_scale: 1.0,
    main_ui_scale: 1.0,
    settings_ui_scale: 1.0,
    scrollbar_size: 12,
    scrollbar_radius: 999,
    scrollbar_use_theme_color: true,
    scrollbar_thumb_color: "#8A8F98".to_string(),
    scrollbar_thumb_hover_color: "#5B8DEF".to_string(),
    scrollbar_track_color: "rgba(0, 0, 0, 0.08)".to_string(),
    remember_interface_collapse_state: false,
    interface_collapsed_sections: Vec::new(),
    window_control_style: "round".to_string(),
    window_control_size: 34,
    window_control_gap: 8,
    background_enabled: false,
    background_image: String::new(),
    background_opacity: 0.42,
    background_dim: 0.18,
    background_blur: 0,
    background_fit: "cover".to_string(),
    background_position: "center".to_string(),
    background_panel_opacity: 0.86,
  }
}

fn default_behavior() -> BehaviorOut {
  BehaviorOut {
    edge_auto_hide: true,
    edge_hide_delay_seconds: 0.0,
    edge_animation_ms: 90,
    edge_animation_style: "animate-window".to_string(),
    auto_edge_hide: true,
    auto_edge_bounce: true,
    auto_edge_hide_delay: 1000,
    edge_visible_pixels: 5,
    edge_strip_size: 10,
    edge_strip_opacity: 0.88,
    edge_strip_use_theme_color: true,
    edge_strip_color: "#C36A2D".to_string(),
    launch_mode: "double".to_string(),
    auto_start: false,
    close_action: "tray".to_string(),
  }
}

fn build_config(link_path: &Path, icon_path: Option<PathBuf>) -> Result<AppConfigOut, String> {
  let conn = Connection::open(link_path).map_err(|error| format!("无法打开 link.db：{}", error))?;
  if !has_table(&conn, "Groups")? || !has_table(&conn, "Links")? {
    return Err("link.db 需要包含 Groups 和 Links 表".to_string());
  }
  let icon_conn = icon_path
    .as_ref()
    .and_then(|path| Connection::open(path).ok())
    .filter(|conn| has_table(conn, "Cache").unwrap_or(false));

  let groups = load_groups(&conn)?;
  let links = load_links(&conn)?;

  let mut children_by_parent: HashMap<i64, Vec<LegacyGroupRow>> = HashMap::new();
  for group in &groups {
    children_by_parent.entry(group.parent_group).or_default().push(group.clone());
  }
  for children in children_by_parent.values_mut() {
    children.sort_by_key(|row| (row.pos, row.id));
  }

  let mut links_by_parent: HashMap<i64, Vec<LegacyLinkRow>> = HashMap::new();
  for link in links {
    links_by_parent.entry(link.parent_group).or_default().push(link);
  }
  for entries in links_by_parent.values_mut() {
    entries.sort_by_key(|row| (row.pos, row.id));
  }

  fn collect_descendant_dirs(
    group: &LegacyGroupRow,
    prefix: String,
    children_by_parent: &HashMap<i64, Vec<LegacyGroupRow>>,
    links_by_parent: &HashMap<i64, Vec<LegacyLinkRow>>,
    icon_conn: Option<&Connection>,
    out: &mut Vec<DirectoryOut>,
  ) {
    let clean_name = group.name.trim();
    if !looks_like_separator(clean_name) {
      let path_name = if prefix.is_empty() { clean_name.to_string() } else { format!("{} / {}", prefix, clean_name) };
      let items: Vec<ShortcutItemOut> = links_by_parent
        .get(&group.id)
        .cloned()
        .unwrap_or_default()
        .iter()
        .enumerate()
        .map(|(index, row)| shortcut_item(row, index, icon_conn))
        .collect();
      let kind = if clean_name == "全部" { "all" } else { "normal" };
      out.push(DirectoryOut {
        id: format!("legacy_dir_{}", sanitize_id_part(group.id)),
        name: clean_name.to_string(),
        order: out.len(),
        kind: kind.to_string(),
        items,
        note: group.content.clone().filter(|value| !value.trim().is_empty()),
      });
      if let Some(children) = children_by_parent.get(&group.id) {
        for child in children {
          collect_descendant_dirs(child, path_name.clone(), children_by_parent, links_by_parent, icon_conn, out);
        }
      }
    }
  }

  let top_groups = children_by_parent.get(&0).cloned().unwrap_or_default();
  let mut out_groups = Vec::new();

  for top in top_groups.iter().filter(|row| !looks_like_separator(&row.name)) {
    let mut directories = Vec::new();

    if let Some(direct_links) = links_by_parent.get(&top.id) {
      if !direct_links.is_empty() {
        directories.push(DirectoryOut {
          id: format!("legacy_dir_{}_root", sanitize_id_part(top.id)),
          name: "常用".to_string(),
          order: 0,
          kind: "normal".to_string(),
          items: direct_links.iter().enumerate().map(|(index, row)| shortcut_item(row, index, icon_conn.as_ref())).collect(),
          note: None,
        });
      }
    }

    if let Some(children) = children_by_parent.get(&top.id) {
      for child in children {
        collect_descendant_dirs(child, String::new(), &children_by_parent, &links_by_parent, icon_conn.as_ref(), &mut directories);
      }
    }

    if directories.is_empty() {
      directories.push(DirectoryOut {
        id: format!("legacy_dir_{}_empty", sanitize_id_part(top.id)),
        name: "常用".to_string(),
        order: 0,
        kind: "normal".to_string(),
        items: Vec::new(),
        note: None,
      });
    }

    for (index, directory) in directories.iter_mut().enumerate() {
      directory.order = index;
    }

    out_groups.push(GroupOut {
      id: format!("legacy_group_{}", sanitize_id_part(top.id)),
      name: top.name.trim().to_string(),
      order: out_groups.len(),
      directories,
    });
  }

  if out_groups.is_empty() {
    return Err("数据库里没有可导入的父分组".to_string());
  }

  Ok(AppConfigOut {
    groups: out_groups,
    theme: "dark-soft".to_string(),
    display: default_display(),
    behavior: default_behavior(),
    window_state: WindowStateOut { opacity: 0.96, edge_auto_hide: true },
    auto_save: AutoSaveOut { enabled: false, directory: String::new(), interval_minutes: 10, file_name: "win-launcher-config-autosave.json".to_string() },
  })
}

#[tauri::command]
pub fn import_legacy_db_config(path: String, icon_db_path: Option<String>) -> Result<String, String> {
  let selected = PathBuf::from(path);
  let (link_path, icon_path) = resolve_link_and_icon_paths(&selected, icon_db_path)?;
  let config = build_config(&link_path, icon_path)?;
  serde_json::to_string(&config).map_err(|error| error.to_string())
}
