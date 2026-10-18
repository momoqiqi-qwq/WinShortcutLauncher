# V20 Search / Transfer / Edge Fix

## 修复内容

1. 全局搜索滚动卡顿优化
   - 搜索结果图标改为懒加载，只加载可视区域附近的图标。
   - 图标解析复用现有 `lib/iconCache` 队列，最多 3 个并发，避免一次性触发大量 `get_file_icon`。
   - 滚轮滚动时暂时不更新 hover 高亮，减少滚动期间 React 重绘。
   - 搜索结果行启用局部渲染隔离，降低滚动重排成本。

2. 文件中转站拖入冲突修复
   - 文件中转站打开时，外部拖入文件只添加到中转站。
   - 不再同时弹出“添加快捷项目”对话框。

3. 文件中转站拖出修复
   - 文件中转站和中转站项目不再触发主窗口拖动。
   - 中转站项目拖拽时写入 `text/plain`、`text/uri-list`、`DownloadURL` 等数据，尽量兼容外部文件管理器。
   - 本应用内拖到“文件夹快捷项目”仍继续使用 `application/x-launcher-transfer-paths`。

4. 贴边隐藏透明框 / 第一次触发缩回优化
   - 新增设置：`隐藏后直接保留主窗口边缘（解决透明触发框）`。
   - 开启后不再依赖独立透明 edge-strip 触发窗口，而是把主窗口滑出屏幕并保留一条可见边缘。
   - 默认开启，减少透明 WebView 触发条/AnimateWindow 残影。
   - 展开后保护时间加长，避免第一次触发弹出又马上缩回。

5. 一键构建脚本修复
   - `build.bat` 强制切换到项目根目录。
   - 自动加入 Cargo / npm / node_modules\.bin 到 PATH。
   - 直接使用 `npm run tauri:build`，避免独立 `cargo check` 带来的环境差异。
   - 构建失败时输出 `build.log` 最后 100 行。
