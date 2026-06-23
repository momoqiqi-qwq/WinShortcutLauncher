# 自动回弹 V9

本版在现有 `useStableEdgeDock` / `edge_dock_native.rs` 原生贴边系统基础上新增“拖出屏幕自动隐藏并回弹”。

## 行为

- 主窗口被拖出当前显示器工作区超过 20px 时开始计时。
- 到达 `autoEdgeHideDelay` 后，窗口自动滑到屏幕外，只保留 `edgeVisiblePixels` 像素可见区域。
- 鼠标进入保留区域后，窗口用 200ms EaseOut 滑回屏幕内。
- 支持左、右、上、下四个方向。
- 使用 Win32 物理像素坐标，兼容多显示器和 DPI 缩放。

## 新增设置字段

```ts
autoEdgeHide: boolean;
autoEdgeBounce: boolean;
autoEdgeHideDelay: number;
edgeVisiblePixels: number;
```

默认值：

```ts
{
  autoEdgeHide: true,
  autoEdgeBounce: true,
  autoEdgeHideDelay: 1000,
  edgeVisiblePixels: 5
}
```

## 设置入口

设置面板新增“窗口行为”分类，包含：

- 自动回弹
- 隐藏延迟
- 保留边缘

## 兼容说明

- 普通贴边隐藏仍由 `edgeAutoHide` 控制。
- 拖出屏幕自动隐藏由 `autoEdgeHide` 控制。
- 原生控制器只有在 `edgeAutoHide || autoEdgeHide` 时启动。
- 未修改旧版备用 `src-tauri/src/edge_dock.rs`。
