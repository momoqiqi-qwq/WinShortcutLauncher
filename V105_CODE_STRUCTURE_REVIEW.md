# v0.1.105 代码结构复查

## 本版已做的低风险优化

- 抽出 `SettingsSliderRow.tsx`，避免 `DisplaySettings.tsx` 继续膨胀。
- 新增的面板外观 UI 和 CSS 独立成模块。
- 主题 alpha 处理放到纯函数 `themeColors.ts`，而不是再写 CSS 特例。
- 设置搜索索引已补上新控件关键词。

## 仍然最值得优化的热点

### A. `Settings.css`（约 2720 行）

还存在明显的历史覆盖式追加：`.floating-settings-panel.settings-panel-adaptive` 在同文件里出现 6 次，`.floating-settings-panel` / `.experience-choice-card` / `.experience-segmented` 均出现 4 次。

建议下一步按「只迁移、不改视觉」原则拆为 core / layout / display / sections / effects，每次只移一组并做回归。

### B. `DisplaySettings.tsx`（约 989 行）

仍同时承担主界面背景、设置背景、缩放、滚动条、导航、窗口按钮和局部目录显示。建议下版拆 `BackgroundSettingsSection`、`ScaleSettingsSection`、`WindowControlsDisplaySection`。

### C. `App.tsx`（约 741 行）

建议抽 `useAppDropImport` / `useGlobalShortcutRouter` / `useLauncherOverlayRouter`，先搬纯函数，后搬 hook，不同时改业务逻辑。

### D. `ImageBrowserPanel.tsx`（约 793 行）

建议拆 controller hook / toolbar / gallery / editor dialog。这一项改动后需要重点回归裁剪和拖动。

### E. `GlobalSearchSettingsSection.tsx`（约 449 行）

仍把 Search / Transfer / Image 多个设置区块放在同一文件，是最低风险的继续拆分对象。

## 需要你决定的下一步

- 方案 A（推荐）：先拆 `Settings.css + DisplaySettings.tsx`，不改功能，专门降低以后加设置时的回归风险。
- 方案 B：先做「设置自由度」功能版，加更多外观 / 密度 / 圆角 / 动画 / 快捷操作。
- 方案 C：先拆 `App.tsx + ImageBrowserPanel.tsx`，结构收益更大，但回归范围也更大。

不建议把高风险的 Windows 贴边原生状态机与设置中心重构放在同一版本。
