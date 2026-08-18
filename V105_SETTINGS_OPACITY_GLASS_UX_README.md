# v0.1.105 设置面板透明度 / 玻璃效果 UX 修复

## 问题根因

旧版 `Settings.css` 在 `.settings-glass-enabled` 下把设置窗口、卡片和导航分别写死为 62% / 68% / 66% 透明度，会覆盖 `--settings-panel-alpha`。另外，部分主题的 `--panel` / `--panel-2` 本身也是 `rgba(..., alpha)`，因此即使滑块是 100%，仍会继承主题 alpha。

## 修复

1. 玻璃模式不再使用固定 62% / 68% / 66%，所有相关表面都读取 `--settings-panel-alpha`。
2. 主题安装时生成 `--panel-solid` / `--panel-2-solid`，将半透明主题表面先按主题背景合成为实色。
3. 面板透明度从这些实色表面上重新施加，所以 100% 不再被隐藏 alpha 削弱。
4. 同样修复了主界面背景的「面板不透明度」对半透明主题的误差。

## 新增自由度

- 面板快捷档位：实色 100% / 90% / 75% / 60%。
- 玻璃模糊：0-40px。
- 玻璃饱和度：100%-180%。
- 高光强度：0%-100%。
- 玻璃预设：轻柔 / 标准 / 强烈。
- 实时预览会同步模糊和饱和度。

## 代码结构调整

- `SettingsSliderRow.tsx`：从 `DisplaySettings.tsx` 抽出 160ms 合并提交的滑块逻辑。
- `SettingsSurfaceAppearanceControls.tsx`：独立承载面板透明度与玻璃参数。
- `SettingsSurfaceAppearanceControls.css`：新功能样式不再继续追加到 `Settings.css`。
- `themeColors.ts`：纯函数处理主题 alpha 合成，并配套单元测试。
