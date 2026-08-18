# v0.1.106 代码结构复查与下一步建议

## 当前规模与主要热点

本次复查后，仍然最值得继续拆分的文件是：

1. `src/components/Settings/Settings.css`：约 2738 行。
2. `src/components/Settings/DisplaySettings.tsx`：约 975 行。
3. `src/App.tsx`：约 805 行。
4. `src/components/ImageBrowser/ImageBrowserPanel.tsx`：约 793 行。
5. `src/index.css`：约 698 行。
6. `src/components/ImageBrowser/ImageBrowserPanel.css`：约 522 行。

这几个文件目前还没有到“不能维护”的程度，但继续加功能时最容易出现 CSS 覆盖、状态职责混杂和回归范围过大的问题。

## 本版已经做的低风险结构优化

### 父目录设置独立组件化

父目录外观与配色分别拆为独立组件/样式文件，避免把新功能继续写进 `DisplaySettings.tsx` 和 `Settings.css`。

### 设置开关控件去重

`NavigationSettingsSection` 与 `ExperienceSettingsSection` 原本各维护一份几乎相同的 `ToggleRow`，现在统一为 `SettingsPrimitives.ToggleCard`。

### 批量父目录配色改成单次 store 更新

新增 `setGroupColors`。一键彩色分组或清除配色时只产生一次 Zustand 状态更新，父目录多时会比逐个调用更平滑，也减少自动保存层收到的连续变更。

## 建议继续优化，但这次没有强行修改的部分

### A. 拆 `App.tsx` —— 推荐优先级：高

目前 `App.tsx` 同时负责：

- 全局快捷键；
- 外部拖放；
- URL 拖放与 favicon/title 补全；
- 各类 Overlay 打开/关闭；
- Edge Dock 暂停逻辑；
- 全局 CSS 变量组装；
- 主布局与上下文菜单挂载。

建议以后拆成：

- `useLauncherGlobalShortcuts()`；
- `useLauncherExternalDrop()`；
- `useLauncherOverlays()`；
- `buildLauncherCssVariables()`。

收益：以后加入“内部项目拖到父目录”“拖到父目录悬停自动切换”等功能时，不会继续把拖拽状态塞到 `App.tsx`。

### B. 拆 `DisplaySettings.tsx` —— 推荐优先级：高

最大块是壁纸选择、动态媒体检测、预览、焦点定位和主/设置两套背景配置。

建议拆成：

- `WallpaperSettingsSection`；
- `WallpaperPreview`；
- `useWallpaperDraft`；
- `useBackgroundMediaPicker`。

这样 `DisplaySettings` 可以重新变成只负责组合各设置区块。

### C. 拆 `Settings.css` —— 推荐优先级：中高

不建议一次性重写 CSS，因为层叠顺序会带来较大回归风险。建议按“新增功能不再进入大文件、旧功能逐区迁移”的方式逐步拆：

- `SettingsLayout.css`；
- `SettingsNavigation.css`；
- `SettingsFormControls.css`；
- `SettingsBackground.css`；
- 各功能组件自己的 `.css`。

本版已经按这个策略执行：新的父目录 CSS 没有继续写进 `Settings.css`。

### D. 拆 `ImageBrowserPanel.tsx` —— 推荐优先级：中

建议拆成：

- `ImageBrowserGroupBar`；
- `ImageBrowserToolbar`；
- `ImageBrowserPreview`；
- `useImageBrowserActions`。

图片浏览功能复杂，但和本次父目录功能关系不大，所以这次不动它，降低回归面。

## 我建议 v0.1.107 做什么

建议主题：**“跨父目录拖拽 + 可撤销整理”**。

优先功能：

1. 主界面中的快捷项目可以直接拖到顶部父目录标签；
2. 多选项目可以一次拖过去；
3. 拖到父目录后弹出其普通子目录供选择，只有一个普通子目录时直接移动；
4. 拖到父目录上停留约 400~600ms 可临时展开/切换目标，方便精准放到某个子目录；
5. 子目录也可以拖到另一个父目录；
6. 移动完成后提供短时“撤销”按钮，降低误拖成本；
7. 设置中增加“拖到父目录默认动作：移动 / 复制 / 每次询问”“悬停切换延迟”“移动后是否切换到目标”等选项。

这是目前和“彩色父目录方框”最自然的一步：父目录从视觉分组真正升级为可以接收内容的容器。

## 需要你决定的较大优化

下一轮如果除了 v0.1.107 功能之外还要做代码重构，建议从下面选：

- A：先拆 `App.tsx` 的全局快捷键/拖放/Overlay；风险较低，最利于继续做跨父目录拖拽。
- B：先拆 `DisplaySettings.tsx` 的壁纸相关逻辑；能明显降低设置中心复杂度。
- C：开始逐步迁移 `Settings.css`；长期收益最高，但需要更多 UI 回归测试。
- D：先不做大重构，只继续加用户可见功能。

推荐顺序：**A -> B -> C -> ImageBrowser**。
