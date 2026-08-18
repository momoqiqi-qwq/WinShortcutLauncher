# Edge Dock V3 稳定贴边隐藏补丁

## 根因
旧方案把“主窗口本体”缩成 12px 或移到屏幕外，同时这个主窗口还负责检测贴边、mouseenter、mouseleave。
Windows + WebView2 在窗口 resize / move / hide / show 过程中会连续触发 mousemove、mouseleave、moved 事件，导致：

1. 贴边检测触发隐藏
2. 窗口缩小或滑出后 mousemove 又触发展开
3. 展开动画后窗口仍然贴边，检测器再次触发隐藏
4. 循环闪烁

## 新方案
使用两个窗口：

- `main`：真正的启动器主界面
- `edge-strip`：单独的 12px 触发条窗口

隐藏时：

1. 显示 `edge-strip`
2. 主窗口滑出并 `hide()`
3. `edge-strip` 等鼠标离开一次后，才允许再次悬停展开

展开时：

1. 隐藏 `edge-strip`
2. 显示主窗口并滑入
3. 进入 `openedByStrip` 状态
4. 只有鼠标离开主窗口后，才重新开始隐藏倒计时

这样贴边检测和触发条不再抢同一个窗口状态，不会出现“展开后马上收回”。

## 接入步骤

### 1. 复制文件

把补丁里的文件复制到项目：

```text
edge-strip.html                  -> 项目根目录/edge-strip.html
src/edge-strip.tsx               -> src/edge-strip.tsx
src/edge-strip.css               -> src/edge-strip.css
src/hooks/useStableEdgeDock.ts   -> src/hooks/useStableEdgeDock.ts
```

### 2. 替换旧贴边 hook

在 `App.tsx` 或原先调用 `useEdgeSnap` 的地方：

```tsx
import { useStableEdgeDock } from './hooks/useStableEdgeDock';

useStableEdgeDock({
  enabled: settings.edgeHideEnabled,
  hideDelayMs: settings.edgeHideImmediate ? 0 : settings.edgeHideDelaySec * 1000,
  stripSize: settings.edgeStripSize ?? 12,
  edgeTolerance: settings.edgeTolerance ?? 24,
  animationMs: settings.edgeAnimationMs ?? 150,
});
```

然后删除或停用旧的 `useEdgeSnap()` / `useEdgeHide()`，不要两个贴边逻辑同时运行。

### 3. Vite 多页面

Vite 会把根目录的 `edge-strip.html` 一起打包。无需额外配置。
如果你的项目有自定义 `vite.config.ts`，确认没有把 HTML 输入限制死成仅 `index.html`。

### 4. Tauri 权限

如果你的 `src-tauri/capabilities/default.json` 限制很严，需要允许 window/webview/event 权限。
示例：

```json
{
  "identifier": "default",
  "description": "default capability",
  "windows": ["main", "edge-strip"],
  "permissions": [
    "core:default",
    "core:window:default",
    "core:webview:default",
    "core:event:default"
  ]
}
```

### 5. 测试

建议先设置：

- 贴边隐藏：开启
- 隐藏延迟：0.5 秒
- 触发条宽度：12px
- 动画时间：150ms

确认稳定后，再测试“立即”。
