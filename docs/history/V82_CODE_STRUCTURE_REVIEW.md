# Yue launcher v82 代码结构检查

## 本次已处理

### 设置窗口职责拆分

`SettingsPanel.tsx` 不再直接维护设置窗口位置、大小、拖动、缩放、自动适配、溢出检测和分类滚动记录。这些职责已集中到 `useSettingsPanelLayout.ts`。

### 可测试的布局判定

`settingsPanelBounds.ts` 新增设置窗口紧凑状态和安全滚动条判定，避免把临界尺寸散落在组件和 CSS 中。

## 当前仍值得继续优化的文件

### 1. `src/App.tsx`：约 746 行

目前仍同时处理全局快捷键、浮层、浏览器拖入、通知和贴边暂停。建议拆成独立 hooks，降低一个功能变动影响其他功能的风险。

### 2. `src/components/ImageBrowser/ImageBrowserPanel.tsx`：约 677 行

图片列表、分组、裁剪、重命名和拖出逻辑仍集中在同一组件。建议拆成控制器、裁剪层、缩略图列表和设置面板。

### 3. `src/components/Settings/DisplaySettings.tsx`：约 515 行

可以继续按项目显示、侧栏、顶栏、背景、缩放和滚动条拆分。

### 4. `src/components/Settings/GlobalSearchSettingsSection.tsx`：约 436 行

搜索、中转和图片预览设置虽然导出了多个组件，但仍位于一个大文件中，建议分成三个文件。

### 5. `src/components/ContentArea/NoteEditor/useNoteEditorController.ts`：约 430 行

便签光标定位、行号、自动保存和右键插入可以继续拆成独立 hooks，便于针对历史错行问题增加测试。

### 6. 贴边隐藏逻辑

贴边行为分散在前端 hooks 和 Rust 窗口控制中。建议下一版优先统一为状态机：

```text
正常显示 → 贴边检测 → 收起 → 边缘唤醒 → 展开保护 → 鼠标离开 → 再次收起
```

这样更容易解决底部贴边、任务栏唤醒、回弹和鼠标停留之间的冲突。
