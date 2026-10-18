# Edge Dock Native V5

V5 不再使用 `AnimateWindow` 对透明 Tauri 窗口做滑动隐藏，因为透明 / layered 窗口在 Windows DWM 下容易出现额外的半透明缩放框。新版使用 Rust 后端 `SetWindowPos` 做短时位置动画：

- 隐藏：主窗口从原位置移动到屏幕外，然后 `ShowWindow(SW_HIDE)`。
- 展开：主窗口先放到屏幕外，再快速移动回原位置。
- 触发条：独立 `edge-strip` 窗口，颜色由本地配置读取，可跟随主题 accent。
- 拖离边缘：如果用户在展开后把主窗口拖离边缘，原生控制器切回 Visible，不再自动隐藏。

这比前端 JS 逐帧 setPosition 更稳定，也避免了 Windows `AnimateWindow` 对透明窗口的视觉残影。


## 贴边隐藏 V6：Rust 原生即时模式

- 贴边隐藏由 Rust 后端原生控制。
- 后端轮询周期为 8ms，使用 Win32 GetCursorPos / GetWindowRect 判断鼠标和主窗口位置。
- 不依赖前端 mouseenter / mouseleave，也不再使用前端 JS 逐帧 setPosition。
- 隐藏和展开使用 Win32 AnimateWindow，动画速度可在设置中调节，默认 90ms。
- 默认贴边隐藏延迟改为“立即”。
