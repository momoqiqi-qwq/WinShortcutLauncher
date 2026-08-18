# v0.1.113 设置生效链路审计

审计对象：`tauri-shortcut-launcher-v113-first-run-search-drop-rename`

审计方法：沿“类型定义 → 默认值/规范化 → 设置 UI → 持久化 → 运行时消费”检查核心配置模型，同时检查快捷键、设置搜索索引，以及文件中转/图片浏览的入口与拖放路径。

## 结论

核心配置模型共检查 251 个字段。绝大多数设置均有实际运行时消费，但发现以下问题。

### A. 确认完全无法生效的字段

1. `behavior.rememberSettingsPanelBounds`
   - 有类型、默认值、规范化和持久化。
   - 运行时没有读取它。
   - `SettingsPanel.tsx` 实际写死 `const rememberPanel = false`。
   - 因此无论配置为 true/false，设置窗口位置/尺寸记忆行为都不会改变。

2. `behavior.settingsPanelAdaptiveSize`
   - 有类型、默认值、规范化和持久化。
   - 运行时没有读取它。
   - `SettingsPanel.tsx` 实际写死 `const adaptivePanel = true`。
   - 因此无论配置为 true/false，设置窗口始终走自适应尺寸。

### B. 兼容/冗余字段，不应再作为独立设置

1. `experience.directoryRightClickMode`
   - 类型注释已标明“旧配置兼容字段”。
   - 当前运行逻辑不再读取，子目录始终打开独立管理菜单。

2. `windowState.edgeAutoHide`
   - 会随 `behavior.edgeAutoHide` 被同步写入和保存，但运行时贴边逻辑实际读取的是 `behavior.edgeAutoHide`。
   - 该字段没有独立行为，属于冗余影子状态，容易造成以后配置漂移。

### C. 设置存在，但只部分生效

1. `transferStation.enabled`
   - 关闭后面板不渲染。
   - 但右上角按钮/快捷键仍然会把 `transferStationOpen` 设为 true。
   - App 又把该 open 状态用于暂停贴边和部分拖放逻辑，因此会产生“面板看不见，但应用认为它打开了”的隐藏状态。

2. `imageBrowser.enabled`
   - 与文件中转相同：关闭后面板不渲染，但按钮/快捷键仍可进入不可见 open 状态。

3. `transferStation.acceptExternalDrops`
   - 只阻止 Tauri 原生 `onDragDropEvent`。
   - 面板自己的 DOM `onDrop` 没有检查该设置，仍会接收文件。

4. `imageBrowser.acceptExternalDrops`
   - 同样只拦原生拖放监听，DOM `onDrop` 可绕过开关继续接收图片。

### D. 设置有效，但中央设置页没有入口

这些字段运行时确实有效，不属于“死设置”，但普通用户不能通过中央设置页修改：

- `globalSearch.debounceMs`：实际控制全局搜索防抖，默认 80ms。
- `transferStation.showIcon`：实际控制中转项目图标显示。
- `transferStation.confirmClear`：实际控制清空中转站前是否确认。

图片浏览器的 `showFileName`、`previewBackground`、`previewPadding`、`previewRadius`、`showHint`、`showImageMeta` 虽然不在中央设置页，但在图片浏览面板自身的设置区有入口，因此不是问题。

### E. 设置搜索索引存在失配

`settingsSearchIndex.ts` 中保留了“窗口置顶 → behavior”搜索项，但 Behavior 设置页并没有“窗口置顶”设置行。置顶功能本身仍通过右上角钉子和快捷键正常工作，但从“设置搜索”点击这个结果时，没有对应的设置项可以定位/高亮。

### F. 已确认正常的重点项目

- v113 的搜索框提示文字：主界面搜索与全局搜索均读取 `globalSearch.placeholder`。
- 搜索路径 / 搜索网址：运行时已独立判断。
- 包含系统工具 / 包含便签 / 包含目录 / 设置 / 命令：均存在实际过滤逻辑。
- 拼音搜索、最近使用优先、结果类型、Enter/Ctrl+Enter 动作：均有运行时消费。
- 设置背景的图片/视频、位置、透明度、模糊、播放速度等：均由 `SettingsPanel` 实际消费。
- 记住设置 Tab、设置滚动位置、设置简洁导航、隐藏描述：均在设置面板内部生效。
- 自动启动：通过 Tauri 原生命令读取/写入，不是死设置。
- 快捷键定义的 10 个动作均能找到对应处理逻辑；文件中转/图片浏览快捷键的主要问题是没有尊重各自 `enabled` 总开关。

## 建议修复顺序

P0：修复 `rememberSettingsPanelBounds` / `settingsPanelAdaptiveSize` 的硬编码脱节；修复文件中转/图片浏览 `enabled` 的不可见 open 状态。

P1：给两个 `acceptExternalDrops` 的 DOM drop 路径补同样的开关检查。

P2：删除或迁移 `windowState.edgeAutoHide`、明确废弃 `directoryRightClickMode`；清理“窗口置顶”错误的设置搜索索引。

P3：决定是否把 `debounceMs`、`showIcon`、`confirmClear` 暴露到中央设置界面。
