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
