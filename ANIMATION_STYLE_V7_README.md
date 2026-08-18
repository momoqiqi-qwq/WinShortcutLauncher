# 贴边隐藏 V7：动画方式可切换

本版在 V6 的 Rust 原生贴边隐藏基础上，新增 `edgeAnimationStyle` 设置项。

## 新增动画方式

设置路径：设置 -> 操作 -> 自动贴边隐藏 -> 动画方式

可选项：

- `animate-window`：AnimateWindow 系统滑动，默认值，速度快，但透明 WebView 窗口在部分系统上可能有残影。
- `setwindowpos`：SetWindowPos 无残影滑动，使用 Rust 后端逐帧移动窗口位置，推荐用于透明窗口。
- `fade`：AW_BLEND 淡入淡出。
- `instant`：直接显示/隐藏，无动画。选择后动画速度滑块会禁用。

## 改动文件

- `src/types.ts`
- `src/stores/appStore.ts`
- `src/hooks/useStableEdgeDock.ts`
- `src/App.tsx`
- `src/components/Settings/SettingsPanel.tsx`
- `src-tauri/src/edge_dock_native.rs`

## 构建

```powershell
npm install
npm run tauri:dev
npm run tauri:build
```

前端已通过 `npm run build`。
当前环境没有 Windows/Cargo，Rust Win32 部分需要在 Windows 上验证。
