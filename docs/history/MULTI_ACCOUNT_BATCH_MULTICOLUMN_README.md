# 多账号中心：界面放大 · 批次列表多列 · 关闭动画

对应版本 `0.1.135`（本次只改界面，未动版本号）。
涉及文件：

- `src/components/TopBar/MultiAccountDialog.tsx`
- `src/components/TopBar/MultiAccountDialog.css`

## 1. 界面放大，显示地方更多

改前：`width: min(980px, …)` + `max-height: min(860px, …)`，整块对话框 `overflow: auto`，
滚动时标题栏、页签、页脚会一起滚走。

改后：对话框变成 flex 纵向容器，**只有中间新增的 `.multi-account-body` 滚动**，
标题 / 页签 / 页脚常驻。

```css
.multi-account-dialog {
  width: min(1420px, calc(100vw - 32px));
  min-height: min(860px, calc(100vh - 32px));
  max-height: calc(100vh - 32px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.multi-account-body {
  flex: 1 1 auto;
  min-height: 0;          /* 关键：不加这句 flex 子项不会收缩，滚动条不出现 */
  overflow: auto;
  overscroll-behavior: contain;
}

.multi-account-header, .multi-account-tabs, .multi-account-footer { flex: 0 0 auto; }
```

实际效果（应用窗口默认 1180×880）：

| | 改前 | 改后 |
|---|---|---|
| 宽度 | 980px | 1148px |
| 高度 | 由内容撑开 | 848px（≈ 满高） |

外层 `padding` 也从 22px 收到 14px，把省下的空间全部给内容。
`min-height` 是「至少这么高」，内容更多时会长到 `max-height`，到顶后由 `.multi-account-body` 滚动，
所以短页签（如「模板」）不会留一大片空白。

## 2. 批次列表改成多列

改前：左侧固定 `220px` 单列，14 个批次要滚很久。

```css
.multi-account-batch-layout { grid-template-columns: minmax(360px, 42%) minmax(0, 1fr); gap: 12px; min-height: 560px; }

.multi-account-batch-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(142px, 1fr));
  align-content: start;
  gap: 6px;
  max-height: 560px;
  overflow: auto;
}
```

- 列表宽度从 220px 提到 42%（默认窗口下约 480px），配合 `auto-fill` 自动排成 **3 列**；
  窗口更宽时自动变 4 列，窄窗口（≤760px）退化为 2 列 / 单列。
- 批次名加了 `text-overflow: ellipsis`，避免长名字把格子撑开；完整信息挪到按钮 `title` 上。
- 详情区「这一批项目」的 `max-height` 从 260px 提到 460px。
- 页面最小高度：`.multi-account-feature-page` 420 → 460px。

## 3. 关闭（叉）相关动画

### 3.1 主对话框退场

TopBar 已经用 `usePresenceTransition(multiAccountOpen, 220ms)` 保住了卸载时机，
所以点右上角叉号 / 点遮罩 / 按 Esc 都会走同一套退场动画。这次把节奏对齐并加强：

- 遮罩：`180ms` 淡出 + 模糊收回
- 对话框：`200ms` 淡出 + 上移 `10px` + 缩到 `.975`

**约束：CSS 退场动画时长必须 ≤ presence 给的时长**，否则会被提前卸载截断
（改前是 220ms 对 220ms，正好卡在边界上，现在留出余量）。

### 3.2 新增：叉号按钮本身的动画

之前那个叉就是个普通 `.icon-button`，没有任何反馈；现在悬停旋转 90° 并放大，按下回弹：

```css
.multi-account-dialog .icon-button > svg { transition: transform 220ms cubic-bezier(.16, 1, .3, 1); }
.multi-account-dialog .icon-button:hover { background: color-mix(in srgb, var(--danger) 16%, var(--panel-2)); color: var(--danger); }
.multi-account-dialog .icon-button:hover > svg { transform: rotate(90deg) scale(1.1); }
.multi-account-dialog .icon-button:active > svg { transform: rotate(90deg) scale(.86); transition-duration: 80ms; }
```

选择器挂在 `.multi-account-dialog` 下，所以「编辑批次」浮窗里那个叉也一并生效。

### 3.3 新增：「编辑批次」浮窗的进出场

这个浮窗之前是 `{batchEditorOpen && ...}` 直接挂载/卸载，**完全没有动画**。
现在接上同一套 presence：

```tsx
const batchEditorPresence = usePresenceTransition(batchEditorOpen, experience.reduceMotion ? 0 : 200);
```

渲染条件改为 `batchEditorPresence.rendered`，并把 `closing` 透成 `.is-closing`。
CSS 那边补了 `multi-account-editor-in` / `-out` 与 backdrop 的进出场关键帧（退场 180ms）。

## 兼容与约束

- 全部动效都受「设置 → 体验 → 减少动画」约束：
  `.app-shell.reduce-motion` 下动画与 transition 一律关闭。
- 未改任何数据逻辑、批次生成规则或存储结构。

## 验证

- `npx tsc --noEmit` 通过
- `npm run test` 154 / 154 通过
- `npm run tauri:build` 构建通过，已部署到桌面 `Yue launcher.exe`
