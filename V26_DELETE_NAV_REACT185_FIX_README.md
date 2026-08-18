# V26 删除目录与 React #185 修复

本版修复：

1. 启动时偶发 Minified React error #185。
   - 修复 GroupContextMenu 中 `useAppStore((state) => state.groups.slice().sort(...))` 每次返回新数组的问题。
   - 迁移/合并旧配置时强制清理 `settingsOpen`、`selectedItemIds` 等旧运行态字段，避免旧 localStorage 把弹窗状态带入启动流程。

2. Delete 键删除父目录 / 子目录。
   - 新增运行态 `selectedNavTarget`。
   - 点击父目录后按 Delete：删除选中的父目录。
   - 点击子目录后按 Delete：删除选中的子目录。
   - 选中快捷项目时按 Delete：仍然删除选中的快捷项目。
   - 点击内容区空白处会清空目录选择，避免误删。

3. 保持原有拖拽排序、多选、右键菜单、贴边隐藏功能不变。

前端构建验证：

```powershell
npm run build
```

Windows 构建：

```powershell
npm run tauri:build
```
