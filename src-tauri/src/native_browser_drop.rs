use std::{
  cell::UnsafeCell,
  ffi::OsString,
  os::{raw::c_void, windows::ffi::OsStringExt},
  path::PathBuf,
  ptr,
};

use crate::website_metadata;
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use windows::{
  core::{implement, w, BOOL, PCWSTR},
  Win32::{
    Foundation::{DRAGDROP_E_INVALIDHWND, HWND, LPARAM, POINT, POINTL},
    Graphics::Gdi::ScreenToClient,
    System::{
      Com::{IDataObject, DVASPECT_CONTENT, FORMATETC, TYMED_HGLOBAL},
      DataExchange::RegisterClipboardFormatW,
      Memory::{GlobalLock, GlobalSize, GlobalUnlock},
      Ole::{
        IDropTarget, IDropTarget_Impl, RegisterDragDrop, ReleaseStgMedium, RevokeDragDrop,
        CF_HDROP, CF_TEXT, CF_UNICODETEXT, DROPEFFECT, DROPEFFECT_COPY, DROPEFFECT_LINK,
        DROPEFFECT_NONE,
      },
      SystemServices::MODIFIERKEYS_FLAGS,
    },
    UI::{
      Shell::{DragQueryFileW, HDROP},
      WindowsAndMessaging::{EnumChildWindows, FindWindowW},
    },
  },
};

const DROP_EVENT: &str = "native-external-drop";
const DRAG_STATE_EVENT: &str = "native-external-drag-state";

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeExternalDropPayload {
  url: Option<String>,
  title: Option<String>,
  /// v150: 原始拖入文字（微信/QQ 会话文本等），便签目录直接把它落进便签。
  text: Option<String>,
  paths: Vec<String>,
  formats: Vec<String>,
  x: i32,
  y: i32,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeExternalDragStatePayload {
  hovering: bool,
  x: Option<i32>,
  y: Option<i32>,
}

#[derive(Clone, Copy)]
enum TextEncoding {
  Utf16,
  Bytes,
  Auto,
}

#[derive(Clone, Copy)]
struct RegisteredFormat {
  id: u16,
  name: &'static str,
  encoding: TextEncoding,
}

fn format_etc(id: u16) -> FORMATETC {
  FORMATETC {
    cfFormat: id,
    ptd: ptr::null_mut(),
    dwAspect: DVASPECT_CONTENT.0,
    lindex: -1,
    tymed: TYMED_HGLOBAL.0 as u32,
  }
}

fn register_format(name: &'static str, value: PCWSTR, encoding: TextEncoding) -> RegisteredFormat {
  let id = unsafe { RegisterClipboardFormatW(value) } as u16;
  RegisteredFormat { id, name, encoding }
}

fn known_registered_formats() -> Vec<RegisteredFormat> {
  vec![
    register_format("UniformResourceLocatorW", w!("UniformResourceLocatorW"), TextEncoding::Utf16),
    register_format("UniformResourceLocator", w!("UniformResourceLocator"), TextEncoding::Bytes),
    register_format("text/x-moz-url", w!("text/x-moz-url"), TextEncoding::Auto),
    register_format("text/x-moz-url-data", w!("text/x-moz-url-data"), TextEncoding::Auto),
    register_format("text/x-moz-url-desc", w!("text/x-moz-url-desc"), TextEncoding::Auto),
    register_format("text/x-moz-url-priv", w!("text/x-moz-url-priv"), TextEncoding::Auto),
    register_format("application/x-moz-file-promise-url", w!("application/x-moz-file-promise-url"), TextEncoding::Auto),
    register_format("application/x-moz-file-promise", w!("application/x-moz-file-promise"), TextEncoding::Auto),
    register_format("text/uri-list", w!("text/uri-list"), TextEncoding::Auto),
    register_format("text/html", w!("text/html"), TextEncoding::Auto),
    register_format("HTML Format", w!("HTML Format"), TextEncoding::Bytes),
    register_format("System.String", w!("System.String"), TextEncoding::Auto),
    register_format("text/unicode", w!("text/unicode"), TextEncoding::Auto),
    register_format("text/plain", w!("text/plain"), TextEncoding::Auto),
    register_format("text/x-moz-text-internal", w!("text/x-moz-text-internal"), TextEncoding::Auto),
    register_format("application/x-moz-tabbrowser-tab", w!("application/x-moz-tabbrowser-tab"), TextEncoding::Auto),
    // Keep the historical typo/fallback as a compatibility alias for non-Gecko producers.
    register_format("text/x-moz-tabbrowser-tab", w!("text/x-moz-tabbrowser-tab"), TextEncoding::Auto),
  ]
}

fn has_format(data_obj: &IDataObject, id: u16) -> bool {
  if id == 0 {
    return false;
  }
  let format = format_etc(id);
  unsafe { data_obj.QueryGetData(&format).is_ok() }
}

fn available_format_names(data_obj: &IDataObject) -> Vec<String> {
  let mut names = Vec::new();
  if has_format(data_obj, CF_HDROP.0) {
    names.push("CF_HDROP".to_string());
  }
  if has_format(data_obj, CF_UNICODETEXT.0) {
    names.push("CF_UNICODETEXT".to_string());
  }
  if has_format(data_obj, CF_TEXT.0) {
    names.push("CF_TEXT".to_string());
  }
  for format in known_registered_formats() {
    if has_format(data_obj, format.id) {
      names.push(format.name.to_string());
    }
  }
  names.sort();
  names.dedup();
  names
}

fn has_supported_payload(data_obj: &IDataObject) -> bool {
  if has_format(data_obj, CF_HDROP.0)
    || has_format(data_obj, CF_UNICODETEXT.0)
    || has_format(data_obj, CF_TEXT.0)
  {
    return true;
  }
  known_registered_formats()
    .into_iter()
    .any(|format| has_format(data_obj, format.id))
}

unsafe fn read_hglobal_bytes(data_obj: &IDataObject, id: u16) -> Option<Vec<u8>> {
  if id == 0 {
    return None;
  }
  let format = format_etc(id);
  let mut medium = data_obj.GetData(&format).ok()?;
  let hglobal = medium.u.hGlobal;
  let size = GlobalSize(hglobal);
  let locked = GlobalLock(hglobal) as *const u8;
  if locked.is_null() || size == 0 {
    if !locked.is_null() {
      let _ = GlobalUnlock(hglobal);
    }
    ReleaseStgMedium(&mut medium);
    return None;
  }
  let bytes = std::slice::from_raw_parts(locked, size).to_vec();
  let _ = GlobalUnlock(hglobal);
  ReleaseStgMedium(&mut medium);
  Some(bytes)
}

fn decode_utf16(bytes: &[u8]) -> String {
  let mut words = Vec::with_capacity(bytes.len() / 2);
  for pair in bytes.chunks_exact(2) {
    let value = u16::from_le_bytes([pair[0], pair[1]]);
    if value == 0 {
      break;
    }
    words.push(value);
  }
  String::from_utf16_lossy(&words)
}

fn decode_bytes(bytes: &[u8]) -> String {
  let end = bytes.iter().position(|value| *value == 0).unwrap_or(bytes.len());
  String::from_utf8_lossy(&bytes[..end]).into_owned()
}

fn decode_auto(bytes: &[u8]) -> String {
  if bytes.len() >= 4 {
    let pairs = bytes.len() / 2;
    let zero_high_bytes = bytes
      .chunks_exact(2)
      .take(32)
      .filter(|pair| pair[1] == 0)
      .count();
    if zero_high_bytes >= pairs.min(32).saturating_div(2).max(1) {
      return decode_utf16(bytes);
    }
  }
  decode_bytes(bytes)
}

fn read_text(data_obj: &IDataObject, id: u16, encoding: TextEncoding) -> Option<String> {
  let bytes = unsafe { read_hglobal_bytes(data_obj, id) }?;
  let value = match encoding {
    TextEncoding::Utf16 => decode_utf16(&bytes),
    TextEncoding::Bytes => decode_bytes(&bytes),
    TextEncoding::Auto => decode_auto(&bytes),
  };
  let trimmed = value.trim_matches('\0').trim();
  (!trimmed.is_empty()).then(|| trimmed.to_string())
}

fn http_url_from_text(value: &str) -> Option<String> {
  for raw_line in value.replace('\r', "\n").lines() {
    let line = raw_line.trim().trim_matches(|ch| matches!(ch, '\0' | '"' | '\'' | '<' | '>'));
    if line.is_empty() || line.starts_with('#') {
      continue;
    }
    if line.starts_with("http://") || line.starts_with("https://") {
      return Some(line.to_string());
    }
    let lower = line.to_ascii_lowercase();
    let start = lower.find("https://").or_else(|| lower.find("http://"));
    if let Some(index) = start {
      let candidate = line[index..]
        .split_whitespace()
        .next()
        .unwrap_or("")
        .trim_matches(|ch| matches!(ch, '\0' | '"' | '\'' | '<' | '>'));
      if candidate.starts_with("http://") || candidate.starts_with("https://") {
        return Some(candidate.to_string());
      }
    }
  }
  None
}

/// v156: CF_HTML 拖拽格式带一段 `Version:0.9 / StartHTML:... / StartFragment:...` 头，
/// 真正的片段从 StartFragment 的字节偏移开始，不剥掉会连头部数字一起当标题。
fn strip_cf_html_header(text: &str) -> &str {
  if !text.starts_with("Version:") {
    return text;
  }
  let mut fragment_offset = None;
  for line in text.lines().take(8) {
    if let Some(value) = line.strip_prefix("StartFragment:") {
      fragment_offset = value.trim().parse::<usize>().ok();
    }
  }
  fragment_offset
    .and_then(|offset| text.get(offset..))
    .unwrap_or(text)
}

fn clean_html_title(value: &str) -> Option<String> {
  let decoded = html_escape::decode_html_entities(value);
  let collapsed = decoded.split_whitespace().collect::<Vec<_>>().join(" ");
  let title = collapsed.chars().take(120).collect::<String>();
  (!title.is_empty()).then_some(title)
}

/// v156: Chrome / Edge 拖标签页时，`text/html` / `HTML Format` 里就带着
/// `<title>` 或 `<a href>链接文字</a>`，本地直接取到标题，省掉一次网络请求。
fn title_from_html_payload(text: &str) -> Option<String> {
  let body = strip_cf_html_header(text);
  let lower = body.to_ascii_lowercase();

  if let Some(start) = lower.find("<title") {
    if let Some(tag_end_rel) = lower[start..].find('>') {
      let inner_start = start + tag_end_rel + 1;
      if let Some(close_rel) = lower[inner_start..].find("</title>") {
        if let Some(title) = clean_html_title(&body[inner_start..inner_start + close_rel]) {
          return Some(title);
        }
      }
    }
  }

  let mut cursor = 0;
  while let Some(anchor_rel) = lower[cursor..].find("<a ") {
    let anchor_start = cursor + anchor_rel;
    let Some(tag_end_rel) = lower[anchor_start..].find('>') else {
      break;
    };
    let inner_start = anchor_start + tag_end_rel + 1;
    let Some(close_rel) = lower[inner_start..].find("</a>") else {
      break;
    };
    let inner_end = inner_start + close_rel;
    if let Some(title) = clean_html_title(&body[inner_start..inner_end]) {
      return Some(title);
    }
    cursor = inner_end + 4;
  }

  None
}

fn extract_url_and_title(data_obj: &IDataObject) -> (Option<String>, Option<String>) {
  let formats = known_registered_formats();
  let mut title = None;

  for name in [
    "UniformResourceLocatorW",
    "UniformResourceLocator",
    "text/x-moz-url-data",
    "application/x-moz-file-promise-url",
    "text/uri-list",
    "text/html",
    "HTML Format",
    "System.String",
    "text/unicode",
    "text/x-moz-text-internal",
  ] {
    if let Some(format) = formats.iter().find(|format| format.name == name) {
      if let Some(text) = read_text(data_obj, format.id, format.encoding) {
        if let Some(url) = http_url_from_text(&text) {
          if title.is_none() {
            title = formats
              .iter()
              .find(|candidate| candidate.name == "text/x-moz-url-desc")
              .and_then(|candidate| read_text(data_obj, candidate.id, candidate.encoding));
          }
          if title.is_none() && matches!(name, "text/html" | "HTML Format") {
            title = title_from_html_payload(&text);
          }
          return (Some(url), title);
        }
      }
    }
  }

  if let Some(format) = formats.iter().find(|format| format.name == "text/x-moz-url") {
    if let Some(text) = read_text(data_obj, format.id, format.encoding) {
      let normalized = text.replace('\r', "\n");
      let mut lines = normalized.lines().map(str::trim).filter(|line| !line.is_empty());
      if let Some(first) = lines.next() {
        if let Some(url) = http_url_from_text(first) {
          title = lines.next().map(str::to_string).filter(|value| !value.is_empty());
          return (Some(url), title);
        }
      }
      if let Some(url) = http_url_from_text(&text) {
        return (Some(url), title);
      }
    }
  }

  for name in ["text/x-moz-url-priv", "text/plain"] {
    if let Some(format) = formats.iter().find(|format| format.name == name) {
      if let Some(text) = read_text(data_obj, format.id, format.encoding) {
        if let Some(url) = http_url_from_text(&text) {
          return (Some(url), title);
        }
      }
    }
  }

  if let Some(text) = read_text(data_obj, CF_UNICODETEXT.0, TextEncoding::Utf16) {
    if let Some(url) = http_url_from_text(&text) {
      return (Some(url), title);
    }
  }
  if let Some(text) = read_text(data_obj, CF_TEXT.0, TextEncoding::Bytes) {
    if let Some(url) = http_url_from_text(&text) {
      return (Some(url), title);
    }
  }

  (None, title)
}

/// v150: 便签拖入要的是原始文字，不能只认网址。
/// 优先 CF_UNICODETEXT（编码正确且最完整），再退回注册剪贴板格式里最长的一段。
fn extract_plain_text(data_obj: &IDataObject) -> Option<String> {
  if let Some(text) = read_text(data_obj, CF_UNICODETEXT.0, TextEncoding::Utf16) {
    return Some(text);
  }

  let formats = known_registered_formats();
  let mut candidates: Vec<String> = Vec::new();
  for name in [
    "text/unicode",
    "text/plain",
    "text/x-moz-text-internal",
    "text/x-moz-url-desc",
  ] {
    if let Some(format) = formats.iter().find(|format| format.name == name) {
      if let Some(text) = read_text(data_obj, format.id, format.encoding) {
        candidates.push(text);
      }
    }
  }
  if let Some(text) = candidates.into_iter().max_by_key(|value| value.chars().count()) {
    return Some(text);
  }

  // ANSI 兜底放最后：中文可能乱码，只在没有任何 Unicode 来源时使用。
  read_text(data_obj, CF_TEXT.0, TextEncoding::Bytes)
}

unsafe fn extract_paths(data_obj: &IDataObject) -> Vec<String> {
  let format = format_etc(CF_HDROP.0);
  let Ok(mut medium) = data_obj.GetData(&format) else {
    return Vec::new();
  };
  let hdrop = HDROP(medium.u.hGlobal.0 as _);
  let item_count = DragQueryFileW(hdrop, 0xFFFFFFFF, None);
  let mut paths = Vec::with_capacity(item_count as usize);
  for index in 0..item_count {
    let character_count = DragQueryFileW(hdrop, index, None) as usize;
    if character_count == 0 {
      continue;
    }
    let mut path_buf = vec![0u16; character_count + 1];
    DragQueryFileW(hdrop, index, Some(&mut path_buf));
    let path: PathBuf = OsString::from_wide(&path_buf[..character_count]).into();
    paths.push(path.to_string_lossy().into_owned());
  }
  ReleaseStgMedium(&mut medium);
  paths
}

fn choose_effect(source_effect: DROPEFFECT, has_url: bool, has_files: bool) -> DROPEFFECT {
  if has_url && source_effect.0 & DROPEFFECT_LINK.0 != 0 {
    DROPEFFECT_LINK
  } else if (has_url || has_files) && source_effect.0 & DROPEFFECT_COPY.0 != 0 {
    DROPEFFECT_COPY
  } else {
    DROPEFFECT_NONE
  }
}

#[implement(IDropTarget)]
struct NativeBrowserDropTarget {
  coordinate_hwnd: HWND,
  app: AppHandle,
  cursor_effect: UnsafeCell<DROPEFFECT>,
  enter_is_valid: UnsafeCell<bool>,
}

impl NativeBrowserDropTarget {
  fn new(coordinate_hwnd: HWND, app: AppHandle) -> Self {
    Self {
      coordinate_hwnd,
      app,
      cursor_effect: DROPEFFECT_NONE.into(),
      enter_is_valid: false.into(),
    }
  }

  fn client_point(&self, point: &POINTL) -> POINT {
    let mut client_point = POINT { x: point.x, y: point.y };
    let _ = unsafe { ScreenToClient(self.coordinate_hwnd, &mut client_point) };
    client_point
  }

  fn emit_hover(&self, hovering: bool, point: Option<&POINTL>) {
    let client_point = point.map(|value| self.client_point(value));
    let _ = self.app.emit(DRAG_STATE_EVENT, NativeExternalDragStatePayload {
      hovering,
      x: client_point.map(|value| value.x),
      y: client_point.map(|value| value.y),
    });
  }
}

#[allow(non_snake_case)]
impl IDropTarget_Impl for NativeBrowserDropTarget_Impl {
  fn DragEnter(
    &self,
    pDataObj: windows::core::Ref<'_, IDataObject>,
    _grfKeyState: MODIFIERKEYS_FLAGS,
    pt: &POINTL,
    pdwEffect: *mut DROPEFFECT,
  ) -> windows::core::Result<()> {
    let Some(data_obj) = pDataObj.as_ref() else {
      return Ok(());
    };

    let has_files = has_format(data_obj, CF_HDROP.0);
    let has_url = known_registered_formats()
      .into_iter()
      .any(|format| has_format(data_obj, format.id))
      || has_format(data_obj, CF_UNICODETEXT.0)
      || has_format(data_obj, CF_TEXT.0);
    let recognized = has_supported_payload(data_obj);
    let source_effect = unsafe { *pdwEffect };
    let cursor_effect = if recognized {
      choose_effect(source_effect, has_url, has_files)
    } else {
      DROPEFFECT_NONE
    };

    unsafe {
      *pdwEffect = cursor_effect;
      *self.cursor_effect.get() = cursor_effect;
      *self.enter_is_valid.get() = recognized && cursor_effect != DROPEFFECT_NONE;
    }
    if cursor_effect != DROPEFFECT_NONE {
      self.emit_hover(true, Some(pt));
    }

    // v156: 悬停阶段就把标题抓起来。用户从浏览器拖到落点通常还有几百毫秒，
    // 等他松手时标题往往已经在缓存里，对话框第一帧就能显示真标题。
    if recognized && has_url && !has_files {
      if let (Some(url), None) = extract_url_and_title(data_obj) {
        website_metadata::prefetch_title(&url);
      }
    }
    Ok(())
  }

  fn DragOver(
    &self,
    _grfKeyState: MODIFIERKEYS_FLAGS,
    pt: &POINTL,
    pdwEffect: *mut DROPEFFECT,
  ) -> windows::core::Result<()> {
    unsafe {
      *pdwEffect = *self.cursor_effect.get();
    }
    if unsafe { *self.enter_is_valid.get() } {
      self.emit_hover(true, Some(pt));
    }
    Ok(())
  }

  fn DragLeave(&self) -> windows::core::Result<()> {
    if unsafe { *self.enter_is_valid.get() } {
      self.emit_hover(false, None);
    }
    unsafe {
      *self.enter_is_valid.get() = false;
      *self.cursor_effect.get() = DROPEFFECT_NONE;
    }
    Ok(())
  }

  fn Drop(
    &self,
    pDataObj: windows::core::Ref<'_, IDataObject>,
    _grfKeyState: MODIFIERKEYS_FLAGS,
    pt: &POINTL,
    pdwEffect: *mut DROPEFFECT,
  ) -> windows::core::Result<()> {
    self.emit_hover(false, None);
    let Some(data_obj) = pDataObj.as_ref() else {
      unsafe { *pdwEffect = DROPEFFECT_NONE; }
      return Ok(());
    };

    let client_point = self.client_point(pt);
    let formats = available_format_names(data_obj);
    let paths = unsafe { extract_paths(data_obj) };
    let (url, title) = extract_url_and_title(data_obj);
    let text = extract_plain_text(data_obj);
    let effect = unsafe { *self.cursor_effect.get() };

    let payload = NativeExternalDropPayload {
      url,
      title,
      text,
      paths,
      formats,
      x: client_point.x,
      y: client_point.y,
    };
    let _ = self.app.emit(DROP_EVENT, payload);

    unsafe {
      *pdwEffect = effect;
      *self.enter_is_valid.get() = false;
      *self.cursor_effect.get() = DROPEFFECT_NONE;
    }
    Ok(())
  }
}

#[derive(Default)]
struct NativeDropController {
  drop_targets: Vec<IDropTarget>,
}

impl NativeDropController {
  fn inject(&mut self, hwnd: HWND, coordinate_hwnd: HWND, app: &AppHandle) -> bool {
    let target: IDropTarget = NativeBrowserDropTarget::new(coordinate_hwnd, app.clone()).into();
    let revoke_result = unsafe { RevokeDragDrop(hwnd) };
    if revoke_result == Err(DRAGDROP_E_INVALIDHWND.into()) {
      return true;
    }
    if unsafe { RegisterDragDrop(hwnd, &target) }.is_ok() {
      self.drop_targets.push(target);
    }
    true
  }
}

pub fn install(app: &AppHandle) -> Result<usize, String> {
  // Tauri creates the main WebView window before setup runs. Install after the window has
  // been shown so WebView2's child HWNDs already exist and OLE is initialized on this thread.
  let main_hwnd = unsafe { FindWindowW(PCWSTR::null(), w!("Yue launcher")) }
    .map_err(|error| format!("main window HWND not found: {error}"))?;

  let mut controller = NativeDropController::default();
  controller.inject(main_hwnd, main_hwnd, app);

  let app_handle = app.clone();
  let mut callback = |hwnd| controller.inject(hwnd, main_hwnd, &app_handle);
  let mut trait_obj: &mut dyn FnMut(HWND) -> bool = &mut callback;
  let closure_pointer_pointer: *mut c_void = unsafe { std::mem::transmute(&mut trait_obj) };
  let lparam = LPARAM(closure_pointer_pointer as _);

  unsafe extern "system" fn enumerate_callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let closure = &mut *(lparam.0 as *mut c_void as *mut &mut dyn FnMut(HWND) -> bool);
    closure(hwnd).into()
  }

  let _ = unsafe { EnumChildWindows(Some(main_hwnd), Some(enumerate_callback), lparam) };
  let count = controller.drop_targets.len();
  if count == 0 {
    return Err("no Windows drop targets could be registered".to_string());
  }

  // RegisterDragDrop keeps COM references, and this leaked controller keeps a second app-lifetime
  // reference so later WebView2 calls cannot accidentally release our target early.
  Box::leak(Box::new(controller));
  Ok(count)
}
