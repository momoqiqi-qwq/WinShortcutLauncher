//! 把同步的阻塞活儿挪出主线程 / 异步运行时。
//!
//! Tauri 的命令默认跑在**主线程**上（官方文档：*Commands without the async keyword
//! are executed on the main thread unless defined with `#[tauri::command(async)]`*）。
//! 凡是会扫盘、起 PowerShell、读大文件的命令，都必须显式变成 `async`，
//! 再用这里的小工具把真正的阻塞体扔进 `spawn_blocking` 的线程池，
//! 否则界面会在命令执行期间直接冻住。

/// 在阻塞线程池上跑一段同步代码。
pub async fn offload<T, F>(job: F) -> Result<T, String>
where
  T: Send + 'static,
  F: FnOnce() -> Result<T, String> + Send + 'static,
{
  tauri::async_runtime::spawn_blocking(job)
    .await
    .map_err(|error| format!("后台任务失败：{error}"))?
}

/// 一次 COM 初始化的配对守卫（v159 从 `icon_native.rs` 挪到这里共用）。
///
/// `SHGetFileInfoW` / `ShellExecuteW` 会经 COM 加载 shell 扩展，按文档要求线程上必须有 STA 公寓。
/// `offload` 用的阻塞线程池默认没有初始化 COM，所以每次进来自己初始化一次；
/// 只有 `CoInitializeEx` 成功（含 `S_FALSE`）才需要配对释放，`RPC_E_CHANGED_MODE` 这种失败不能去 `CoUninitialize`。
#[cfg(target_os = "windows")]
pub struct ComApartment(bool);

#[cfg(target_os = "windows")]
impl ComApartment {
  pub fn new() -> Self {
    use windows::Win32::System::Com::{CoInitializeEx, COINIT_APARTMENTTHREADED, COINIT_DISABLE_OLE1DDE};
    let hr = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE) };
    Self(hr.is_ok())
  }
}

#[cfg(target_os = "windows")]
impl Drop for ComApartment {
  fn drop(&mut self) {
    if self.0 {
      unsafe { windows::Win32::System::Com::CoUninitialize() };
    }
  }
}
