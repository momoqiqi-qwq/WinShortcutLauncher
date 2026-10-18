# v0.1.103 代码结构复查

## 结论

这轮优先做“新增能力模块化”，没有顺手大拆旧核心，原因是当前贴边、窗口、背景和拖放已经有较多历史稳定性修复。继续优化是有价值的，但建议按风险分层，不要把原生贴边状态机和设置 UI 重构放在一个版本。

## 当前最值得继续拆分的热点

### A. `src/components/Settings/Settings.css` — 2718 行

存在多个按历史版本追加的样式区块。继续覆盖式追加会提高选择器冲突和视觉回归概率。

建议下一轮低风险拆成：

- `settings-core.css`：窗口、布局、通用行/按钮；
- `settings-display.css`：显示、背景、窗口控制；
- `settings-sections.css`：各设置区块；
- 新功能继续保持组件独立 CSS。

不要一次“清空重写”；先迁移、截图比对、再删除旧规则。

### B. `DisplaySettings.tsx` — 1035 行

职责过多：主界面背景、设置窗口背景、缩放、窗口按钮、局部 UI、预览和折叠状态集中在一个组件。

建议拆成：

- `BackgroundSettings`（通过 target=main/settings 复用）；
- `DisplayScaleSettings`；
- `WindowControlsSettings`；
- 其余布局/可见性子区块。

这是下一步最值得做的 React 结构优化，风险低于窗口原生代码。

### C. `App.tsx` — 722 行

仍集中处理全局快捷键、拖放 URL/文件、浮层/上下文菜单、窗口交互、通知与背景状态。

建议抽出：

- `useAppDropImport()`；
- `useGlobalShortcutRouter()`；
- `useLauncherOverlays()`；
- URL/拖放纯函数移动到 `lib/dropWebsite.ts`。

建议先抽“纯函数 + Hook”，不要改变行为，再做 UX 修改。

### D. `ImageBrowserPanel.tsx` — 677 行

包含 10 级左右的本地状态和大量事件函数。建议拆成 controller hook、toolbar、gallery/list、dialog 四层，减少每次改图片功能时牵动整个面板。

### E. `GlobalSearchSettingsSection.tsx` — 449 行

同文件同时导出 Search / Transfer / Image 三个设置区块。按功能拆文件即可，是非常低风险的清理项。

### F. `normalizers.ts` — 446 行 / `types.ts` — 447 行左右

后续可以按 `settings / launcher-content / media` 域拆开。但这属于可维护性优化，用户感知较低，优先级低于设置中心和 App 拆分。

### G. `edge_dock_native.rs` — 1228 行（高风险）

它是贴边稳定性的核心，混有状态计算、Win32 调用、时序和恢复逻辑。**本版没有动**。

如果要优化，建议单独版本：先把“纯状态决策”从 Win32 副作用中抽出来并加确定性状态机测试，再逐步迁移。必须在 Windows 多显示器、不同缩放、四边贴边、自动隐藏/回弹场景实机回归。

## v0.1.103 已主动改善的结构

- 动态 JDB 解析 -> 独立安全解析器；
- 导入合并/预览 -> 纯逻辑 `importCenter.ts`；
- 回滚存储 -> `importSnapshot.ts`；
- 导入 UI -> 独立 Dialog/CSS；
- 快捷设置目录与偏好 -> `quickSettings.ts`；
- 快捷设置 UI -> 独立组件/CSS，减少 TopBar 职责；
- 具体设置搜索 -> 独立索引和结果样式，而不是继续塞进大 CSS。

## 我建议征求你的意见后再做的结构优化

**方案 A（推荐，下版一起做）**：拆 `Settings.css + DisplaySettings.tsx + GlobalSearchSettingsSection.tsx`。用户体验基本不改，主要降低后续改设置的回归风险。

**方案 B（随后做）**：拆 `App.tsx + ImageBrowserPanel.tsx`。维护收益大，但需要更多交互回归。

**方案 C（独立稳定性版本）**：重构 `edge_dock_native.rs`。收益可能很高，但风险最高，不建议和功能版本混合。
