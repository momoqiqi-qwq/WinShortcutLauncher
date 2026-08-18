# v0.1.114 设置生效链路修复

本版本基于 v0.1.113 的设置审计结果，目标是把“配置里有字段、设置页能保存，但运行行为没有完整消费”的路径全部收口。

## 1. 设置面板两个死设置恢复真实行为

修复：

- `behavior.settingsPanelAdaptiveSize`
- `behavior.rememberSettingsPanelBounds`

v113 中设置面板实际写死为 `adaptivePanel = true`、`rememberPanel = false`，而 v85 CSS 又无条件覆盖了 `resize: none`，所以字段即使保存也无法改变设置窗口。

v114 改为：

- 设置面板直接读取两个 behavior 字段；
- “设置 → 窗口”增加“设置面板自动适配主窗口大小”和“记住设置面板大小和位置”；
- 自动适配开启：继续按主窗口可用空间自动布局；
- 自动适配关闭：标题栏可以拖动，右下角可以调整大小；
- 记忆开启：重新打开设置后恢复上次位置和尺寸；
- 记忆关闭：重新打开设置时恢复默认位置和尺寸。

## 2. 文件中转站 / 图片浏览器总开关完全生效

v113 中 `enabled=false` 只让面板不渲染，但顶部按钮和快捷键仍能把内部 open state 设为 true，导致贴边暂停、外部拖放等逻辑把一个不可见面板当成已打开。

v114 增加统一 feature gate：

- 关闭总开关时，已打开面板立即关闭；
- 顶部按钮不再进入不可见 open 状态；
- 快捷键不再进入不可见 open 状态；
- 关闭时给出“已在设置中关闭”的提示；
- 贴边暂停、主界面拖放拦截、Esc 关闭等逻辑全部使用真正 active 状态。

## 3. “允许外部拖入”不再被 DOM drop 绕过

修复：

- `transferStation.acceptExternalDrops`
- `imageBrowser.acceptExternalDrops`

除了原来的 Tauri `onDragDropEvent`，面板 DOM `onDragOver/onDrop` 现在也检查该设置。关闭后拖入不会再添加文件/图片，同时仍阻止 WebView 默认的文件导航行为。

## 4. 设置搜索与真实设置项对齐

“窗口置顶”不再指向一个不存在的 Behavior 设置行：

- “设置 → 窗口”增加真实“窗口置顶”开关；
- 与右上角图钉、`toggleAlwaysOnTop` 快捷键共用 `behavior.alwaysOnTop`；
- 设置搜索的“窗口置顶”改为定位到 Window 页真实设置项；
- 新增“设置面板自动适配 / 记住设置面板大小和位置”的精确搜索项。

## 5. 补齐中央设置入口

以下参数原来运行时有效，但中央设置没有入口，本版补齐：

- `globalSearch.debounceMs` → 设置 → 搜索 → 搜索输入防抖；
- `transferStation.showIcon` → 设置 → 文件中转 → 显示文件图标；
- `transferStation.confirmClear` → 设置 → 文件中转 → 清空中转站前确认。

并增加对应的精确设置搜索索引。

## 6. 旧 edgeAutoHide 影子字段收口

`windowState.edgeAutoHide` 保留用于读取旧配置，但不再允许与 `behavior.edgeAutoHide` 漂移：

- `updateBehavior({ edgeAutoHide })` 会同步 windowState；
- 旧调用 `updateWindowState({ edgeAutoHide })` 会反向更新 canonical behavior；
- 导入 / rehydrate 配置时强制用 `behavior.edgeAutoHide` 覆盖影子字段；
- 类型上标注为 deprecated 兼容字段。

`experience.directoryRightClickMode` 仍作为明确标注的旧配置兼容字段保留，不作为独立功能设置恢复。
