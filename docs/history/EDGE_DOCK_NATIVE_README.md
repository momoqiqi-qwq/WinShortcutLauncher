# Edge Dock Native Animation Update

本版本针对贴边隐藏继续优化：

- 不复制或反编译 Lucy_x64.exe 的代码，只参考用户提供视频中的交互效果。
- 保留双窗口架构：`main` 主窗口 + `edge-strip` 触发条窗口。
- 主窗口滑入/滑出动画从前端 JS `setPosition` 循环改为 Rust 后端命令 `edge_animate_window` 执行，减少 JS Promise 往返和 WebView 事件干扰。
- 新增 `edge_cancel_animation`，防止连续 hover / hide 导致动画叠加。
- 默认贴边动画速度改为 95ms，设置 -> 操作 中可调 60~220ms。
- 触发条仍由独立窗口承担，主窗口隐藏后不再参与 hover 检测，避免展开后马上收回。

建议设置：

- 贴边隐藏延迟：立即 或 0.3~0.5 秒
- 贴边动画速度：80~110ms

如果你的机器上仍然能看到闪动，把隐藏延迟设为 0.3 秒，动画速度设为 90ms，一般比“立即”更不容易被鼠标停留在窗口边缘造成二次触发。


## 贴边隐藏 V6：Rust 原生即时模式

- 贴边隐藏由 Rust 后端原生控制。
- 后端轮询周期为 8ms，使用 Win32 GetCursorPos / GetWindowRect 判断鼠标和主窗口位置。
- 不依赖前端 mouseenter / mouseleave，也不再使用前端 JS 逐帧 setPosition。
- 隐藏和展开使用 Win32 AnimateWindow，动画速度可在设置中调节，默认 90ms。
- 默认贴边隐藏延迟改为“立即”。
