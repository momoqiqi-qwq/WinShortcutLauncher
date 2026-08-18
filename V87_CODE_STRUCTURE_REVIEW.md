# Yue launcher v87 代码结构复查

本次只执行合并、回归修复和低风险界面优化，没有直接进行大规模结构重构。

## 当前体量较大的模块

1. `src/components/Settings/Settings.css`：约 2320 行
   - 多个历史版本的样式追加在同一文件中，同一选择器存在分散定义。
   - 建议拆为基础布局、通用控件、背景、体验、右键菜单、字体和响应式样式。
   - 风险：低。

2. `src-tauri/src/edge_dock_native.rs`：约 1228 行
   - 贴边检测、展开、收回、任务栏交互和窗口状态集中在一个模块。
   - 建议先画出明确状态机，再逐步拆分；必须在 Windows 实机验证。
   - 风险：高。

3. `src/App.tsx`：约 769 行
   - 同时处理全局快捷键、浏览器网址拖入、浮层、通知、右键菜单和贴边暂停。
   - 建议拆为 `useGlobalShortcuts`、`useBrowserUrlDrop`、`useOverlayController` 和 `AppOverlayHost`。
   - 风险：中。

4. `src/components/ImageBrowser/ImageBrowserPanel.tsx`：约 677 行
   - 图片分组、缩略图、裁剪、重命名和拖出操作集中。
   - 建议拆分控制器、缩略图列表、预览层和裁剪层。
   - 风险：中。

5. `src/components/Settings/DisplaySettings.tsx`：约 599 行
   - 缩放、顶栏、侧栏、窗口按钮、主背景和设置背景均在同一组件。
   - 建议按折叠区拆成独立子组件，配置字段保持不变。
   - 风险：低。

6. `src/components/Settings/GlobalSearchSettingsSection.tsx`：约 436 行
   - 搜索、中转和图片预览设置仍位于同一文件。
   - 建议拆成三个文件，只保留兼容导出。
   - 风险：低。

## 推荐的结构优化顺序

### 方案 A：低风险设置模块整理

- 拆分 `Settings.css`。
- 拆分 `DisplaySettings.tsx` 和 `GlobalSearchSettingsSection.tsx`。
- 提取统一的设置卡片、设置行和分段选择组件。
- 不改配置格式，不改界面功能。

### 方案 B：中风险全局交互拆分

- 拆分 `App.tsx` 中的快捷键、浮层、网址拖入和通知逻辑。
- 为浮层关闭优先级和快捷键冲突增加测试。

### 方案 C：高风险贴边状态机

- 统一前端 Hook 与 Rust 原生贴边状态。
- 需要 Windows 多屏、不同任务栏位置和缩放比例的实机回归。

## 下一版本建议

推荐 v88 先做“方案 A + 设置项级搜索”：

- 搜索具体设置项，而不只是筛选设置分类。
- 点击搜索结果后自动跳到对应卡片并短暂高亮。
- 每张设置卡片提供单独的“恢复默认”。
- 同时拆分设置样式和显示设置组件，降低后续合并覆盖风险。
