# V18 贴边稳定性修复

本版主要修复：

1. 贴边隐藏后首次鼠标触发展开又马上缩回的问题。
   - 展开后加入 650ms 保护期。
   - 必须先进入过主窗口，离开后才允许再次隐藏。

2. 关闭全局搜索 / 文件中转站后马上触发贴边隐藏的问题。
   - 新增 Rust 命令 `edge_native_suspend(ms)`。
   - 关闭浮层时先暂停 native 贴边检测，再更新 React 状态。

3. 偶发出现小窗口/残影的问题。
   - Native loop 新增最后一次正常窗口尺寸记录。
   - 检测到主窗口异常变小后自动恢复到正常尺寸。
   - 仍建议贴边动画方式优先选择“SetWindowPos 无残影滑动”。

4. 新增一键构建脚本：
   - `build.bat`
   - `一键构建.bat`

Windows 构建：双击 `一键构建.bat`，或执行：

```powershell
npm install
npm run tauri:build
```
