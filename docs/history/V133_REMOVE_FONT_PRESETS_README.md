# V133 版本说明：移除“设置 → 字体 → 常用字体”预设区块

按需求删除字体设置页顶部的“常用字体”预设卡片区块（微软雅黑 UI / Segoe UI / HarmonyOS Sans / MiSans / 思源黑体 / 苹方 / 霞鹜文楷 / Cascadia Mono 八张卡片及“跟随主题”按钮）。

## 保留的字体功能

- **自定义字体**：手动填写字体名称或 CSS 字体栈，功能不变。
- **生效区域**：主界面 / 设置界面 / 右键菜单 / 便签正文四个勾选区不变。
- **项目名称显示 / 子目录名称显示**（V132 新增）不变。
- **字体预览**：保留；“当前选择”文案在自定义字体与主题字体之间切换（不再显示预设名）。

要恢复跟随主题字体，清空“自定义字体”输入框并点击“生效区域 → 暂不启用”即可。

## 实现

- `FontSettingsSection.tsx`：移除 `FONT_PRESETS`、`choosePreset`、`resetToTheme`、`selectedPreset` 与对应 JSX 区块，清理不再使用的 `Check` / `Type` / `RotateCcw` / `useMemo` 导入。
- 预设卡片相关 CSS 类（`font-preset-grid` 等）保留在 `Settings.css` 中未删，不影响运行。

## 验证与构建

- `npx tsc --noEmit` 通过；`npm run test` 154 / 154 通过。
- `npm run tauri:build` 构建通过，版本 0.1.132 → 0.1.133。
