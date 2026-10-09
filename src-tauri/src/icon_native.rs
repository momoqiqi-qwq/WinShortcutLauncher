//! 原生 Windows 图标提取。
//!
//! 为什么不用 PowerShell：旧实现每个图标都要起一个 `powershell.exe`，
//! 里面还 `Add-Type` 现场编译一段 C#。实测一次调用约 **560 ms**
//! （进程启动 ~400 ms + Add-Type ~126 ms + 取图标编码 ~35 ms）。
//! 映射文件夹会把根目录里的全部文件与文件夹都列出来，
//! 几十上百个条目就是几十上百次进程创建 —— 这正是「映射文件夹卡顿」的主因。
//!
//! 这里改成直接调 shell32 / gdi32：
//!
//! 1. `SHGetFileInfoW(SHGFI_ICON | SHGFI_LARGEICON)` 拿到 `HICON`
//!    （走的是系统关联，比 `ExtractIconEx` 更准，`.lnk` / 普通文件都能解析）；
//! 2. `GetIconInfo` 拿到彩色位图，`GetObjectW` 问出真实尺寸；
//! 3. 建一张 32bpp 顶向下的 DIB，`DrawIconEx(DI_NORMAL)` 把图标画进去
//!    —— 这样 32 位带 alpha 的图标与老的 AND 掩码图标都能正确合成；
//! 4. 读回 BGRA，转成 RGBA，编码成 PNG，套上 `data:image/png;base64,`。
//!
//! 输出格式与旧实现完全一致（PNG data URL），前端与持久化缓存都不用改。

use std::{ffi::c_void, path::Path, ptr::null_mut};

use base64::{engine::general_purpose, Engine as _};
use windows::core::PCWSTR;
use windows::Win32::Graphics::Gdi::{
  CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, GetObjectW, SelectObject, BITMAP,
  BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HGDIOBJ,
};
use windows::Win32::Storage::FileSystem::FILE_ATTRIBUTE_NORMAL;
use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED};
use windows::Win32::UI::Shell::{
  ExtractIconExW, SHGetFileInfoW, SHFILEINFOW, SHGFI_ICON, SHGFI_LARGEICON,
};
use windows::Win32::UI::WindowsAndMessaging::{
  DestroyIcon, DrawIconEx, GetIconInfo, DI_NORMAL, HICON, ICONINFO,
};

/// 一次 COM 初始化的配对守卫。
///
/// `SHGetFileInfoW` 会加载 shell 扩展，按文档要求线程上必须有 COM 公寓。
/// 命令已经挪到 tokio 的阻塞线程池上执行，那些线程默认没有初始化 COM，
/// 所以每次进来自己初始化一次；只有 `CoInitializeEx` 成功（含 `S_FALSE`）才需要配对释放，
/// `RPC_E_CHANGED_MODE` 这种失败不能去 `CoUninitialize`。
struct ComApartment(bool);

impl ComApartment {
  fn new() -> Self {
    let hr = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) };
    Self(hr.is_ok())
  }
}

impl Drop for ComApartment {
  fn drop(&mut self) {
    if self.0 {
      unsafe { CoUninitialize() };
    }
  }
}

/// 解析 `路径,索引` / `路径;索引` / `路径#索引` 这种带图标下标的写法。
///
/// 与旧 PowerShell 里的正则 `^(.*?)[,;#](-?\d+)$` 等价（非贪婪前缀 + 全数字结尾，
/// 实际效果就是「最后一个合法分隔符」）。
fn split_icon_index(raw: &str) -> (String, i32) {
  let bytes = raw.as_bytes();
  let mut digits_start = bytes.len();
  while digits_start > 0 && bytes[digits_start - 1].is_ascii_digit() {
    digits_start -= 1;
  }
  if digits_start == bytes.len() {
    return (raw.to_string(), 0);
  }
  let mut sign_start = digits_start;
  if sign_start > 0 && bytes[sign_start - 1] == b'-' {
    sign_start -= 1;
  }
  if sign_start == 0 {
    return (raw.to_string(), 0);
  }
  let separator = bytes[sign_start - 1];
  if separator != b',' && separator != b';' && separator != b'#' {
    return (raw.to_string(), 0);
  }
  match raw[sign_start..].parse::<i32>() {
    Ok(index) => (raw[..sign_start - 1].trim().to_string(), index),
    Err(_) => (raw.to_string(), 0),
  }
}

/// 还原旧实现里的 `/system/xxx`、`/windows/xxx` 虚拟前缀。
fn resolve_virtual_prefix(raw: &str) -> String {
  let lower = raw.to_ascii_lowercase();
  if let Some(rest) = lower.strip_prefix("/system/").map(|_| &raw["/system/".len()..]) {
    if !rest.is_empty() {
      if let Ok(root) = std::env::var("SystemRoot") {
        return Path::new(&root).join("System32").join(rest).to_string_lossy().to_string();
      }
    }
  }
  if let Some(rest) = lower.strip_prefix("/windows/").map(|_| &raw["/windows/".len()..]) {
    if !rest.is_empty() {
      if let Ok(root) = std::env::var("SystemRoot") {
        return Path::new(&root).join(rest).to_string_lossy().to_string();
      }
    }
  }
  raw.to_string()
}

fn wide(value: &str) -> Vec<u16> {
  value.encode_utf16().chain(std::iter::once(0)).collect()
}

/// 用 `ExtractIconExW` 取指定下标的图标（`路径,3` 这种写法才走这里）。
unsafe fn icon_from_extract(path: &str, index: i32) -> Option<HICON> {
  let wide_path = wide(path);
  let mut large = [HICON::default(); 1];
  let mut small = [HICON::default(); 1];
  let count = ExtractIconExW(
    PCWSTR(wide_path.as_ptr()),
    index,
    Some(large.as_mut_ptr()),
    Some(small.as_mut_ptr()),
    1,
  );
  if count == 0 {
    return None;
  }
  let handle = if !large[0].0.is_null() { large[0] } else { small[0] };
  if handle.0.is_null() {
    return None;
  }
  // 两个句柄都要收，避免泄漏。
  if !small[0].0.is_null() && small[0] != handle {
    let _ = DestroyIcon(small[0]);
  }
  if !large[0].0.is_null() && large[0] != handle {
    let _ = DestroyIcon(large[0]);
  }
  Some(handle)
}

/// 走系统关联拿图标（`.lnk`、`.exe`、普通文件、文件夹都适用）。
unsafe fn icon_from_shell(path: &str) -> Option<HICON> {
  let wide_path = wide(path);
  let mut info = SHFILEINFOW::default();
  let ok = SHGetFileInfoW(
    PCWSTR(wide_path.as_ptr()),
    FILE_ATTRIBUTE_NORMAL,
    Some(&mut info),
    std::mem::size_of::<SHFILEINFOW>() as u32,
    SHGFI_ICON | SHGFI_LARGEICON,
  );
  if ok == 0 || info.hIcon.0.is_null() {
    return None;
  }
  Some(info.hIcon)
}

/// 把 `HICON` 合成到 32bpp 顶向下 DIB，读回 RGBA。
unsafe fn icon_to_rgba(hicon: HICON) -> Option<(Vec<u8>, u32, u32)> {
  let mut info = ICONINFO::default();
  GetIconInfo(hicon, &mut info).ok()?;

  let color_bitmap = info.hbmColor;
  let mask_bitmap = info.hbmMask;
  let probe = if !color_bitmap.0.is_null() { color_bitmap } else { mask_bitmap };
  if probe.0.is_null() {
    return None;
  }

  let mut bitmap = BITMAP::default();
  let read = GetObjectW(
    HGDIOBJ(probe.0),
    std::mem::size_of::<BITMAP>() as i32,
    Some(&mut bitmap as *mut BITMAP as *mut c_void),
  );
  let width = bitmap.bmWidth;
  let mut height = bitmap.bmHeight;
  // 单色图标没有彩色位图，掩码里塞了 AND / XOR 两张，高度是两倍。
  if color_bitmap.0.is_null() {
    height /= 2;
  }
  if read == 0 || width <= 0 || height <= 0 {
    let _ = DeleteObject(HGDIOBJ(color_bitmap.0));
    let _ = DeleteObject(HGDIOBJ(mask_bitmap.0));
    return None;
  }
  // 防御：尺寸离谱就放弃（正常图标最大 256），别去分配一块巨大的内存，
  // 也别截断成一张缺角的图。放弃后由调用方回退到旧实现。
  if width > 512 || height > 512 {
    let _ = DeleteObject(HGDIOBJ(color_bitmap.0));
    let _ = DeleteObject(HGDIOBJ(mask_bitmap.0));
    return None;
  }

  let memory_dc = CreateCompatibleDC(None);
  let mut header = BITMAPINFO::default();
  header.bmiHeader.biSize = std::mem::size_of::<BITMAPINFOHEADER>() as u32;
  header.bmiHeader.biWidth = width;
  header.bmiHeader.biHeight = -height; // 负数 = 顶向下，省掉一次整幅翻转
  header.bmiHeader.biPlanes = 1;
  header.bmiHeader.biBitCount = 32;
  header.bmiHeader.biCompression = BI_RGB.0;
  header.bmiHeader.biSizeImage = (width * height * 4) as u32;

  let mut bits: *mut c_void = null_mut();
  let section = match CreateDIBSection(Some(memory_dc), &header, DIB_RGB_COLORS, &mut bits, None, 0) {
    Ok(handle) if !bits.is_null() => handle,
    _ => {
      let _ = DeleteDC(memory_dc);
      let _ = DeleteObject(HGDIOBJ(color_bitmap.0));
      let _ = DeleteObject(HGDIOBJ(mask_bitmap.0));
      return None;
    }
  };

  let previous = SelectObject(memory_dc, HGDIOBJ(section.0));
  std::ptr::write_bytes(bits as *mut u8, 0, (width * height * 4) as usize);
  let drawn = DrawIconEx(memory_dc, 0, 0, hicon, width, height, 0, None, DI_NORMAL).is_ok();

  let mut rgba = vec![0u8; (width * height * 4) as usize];
  if drawn {
    let source = std::slice::from_raw_parts(bits as *const u8, rgba.len());
    for index in (0..rgba.len()).step_by(4) {
      // DIB 里是 BGRA，PNG 要 RGBA；同时把预乘的 alpha 还原回去（见下面说明）。
      rgba[index] = unpremultiply(source[index + 2], source[index + 3]);
      rgba[index + 1] = unpremultiply(source[index + 1], source[index + 3]);
      rgba[index + 2] = unpremultiply(source[index], source[index + 3]);
      rgba[index + 3] = source[index + 3];
    }
  }

  SelectObject(memory_dc, previous);
  let _ = DeleteObject(HGDIOBJ(section.0));
  let _ = DeleteDC(memory_dc);
  let _ = DeleteObject(HGDIOBJ(color_bitmap.0));
  let _ = DeleteObject(HGDIOBJ(mask_bitmap.0));

  drawn.then_some((rgba, width as u32, height as u32))
}

/// 把 GDI 预乘过的通道值还原成 straight alpha。
///
/// `DrawIconEx` 在 32bpp 目标上是**按 alpha 混合**画的，而我们的目标 DIB 初始
/// 全是 `(0,0,0,0)`，于是结果被预乘了一次：`out = icon * alpha / 255`。
/// 这种数据直接交给浏览器，半透明边缘会偏暗 —— 浅色主题下能看到一圈暗边。
/// 逐像素反预乘即可还原（实测 300/300 个半透明像素都能还原回旧实现的取值）。
fn unpremultiply(value: u8, alpha: u8) -> u8 {
  if alpha == 0 {
    return 0;
  }
  if alpha == 255 {
    return value;
  }
  // 四舍五入，并且夹在 255 以内（alpha 很小时乘法会溢出真实取值范围）。
  (((value as u32 * 255) + (alpha as u32 / 2)) / alpha as u32).min(255) as u8
}

fn encode_png_data_url(rgba: &[u8], width: u32, height: u32) -> Option<String> {
  let mut buffer: Vec<u8> = Vec::new();
  {
    let mut encoder = png::Encoder::new(&mut buffer, width, height);
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);
    let mut writer = encoder.write_header().ok()?;
    writer.write_image_data(rgba).ok()?;
  }
  Some(format!(
    "data:image/png;base64,{}",
    general_purpose::STANDARD.encode(&buffer)
  ))
}

/// 原生提取一个图标；失败返回 `None`，由调用方决定是否回退到旧实现。
pub fn extract_icon_data_url(path: &str) -> Option<String> {
  let trimmed = path.trim().trim_matches('"');
  if trimmed.is_empty() {
    return None;
  }
  let (target, index) = split_icon_index(trimmed);
  let target = resolve_virtual_prefix(&target);
  if target.is_empty() {
    return None;
  }

  let _apartment = ComApartment::new();
  unsafe {
    let hicon = if index != 0 {
      icon_from_extract(&target, index).or_else(|| icon_from_shell(&target))
    } else {
      icon_from_shell(&target)
    };
    let hicon = hicon?;
    let pixels = icon_to_rgba(hicon);
    let _ = DestroyIcon(hicon);
    let (rgba, width, height) = pixels?;
    encode_png_data_url(&rgba, width, height)
  }
}
