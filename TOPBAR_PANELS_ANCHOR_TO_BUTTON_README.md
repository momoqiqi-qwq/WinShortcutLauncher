# 右上角三个面板：锚定到「触发它的那个按钮」

> 承接 `TOPBAR_PANELS_UNIFIED_DROPDOWN_README.md`。上一版把三个面板统一成 760×720 的右上角下拉，
> 但**右边对齐的是按钮组整体的右边**；这一版改成**面板右上角 = 触发它的那个按钮的右下角**。

## 改前 / 改后

以默认窗口（内宽约 1255px）+ 四宫格按钮组（3 列 × 4 行）为例：

| | 改前 | 改后 |
|---|---|---|
| 对齐基准 | 按钮组最右边（`right: 12px`） | **触发它的那个按钮的右边** |
| 多账号（按钮在第 2 行第 2 列） | 面板右边 ≈ 按钮右边 +42px，看着「错位」 | 面板右边 = 按钮右边 |
| 顶边 | 顶栏底边 + 7px（离按钮组下沿 16px） | 按钮下沿 + 6px |
| 面板尺寸 | 760 × 720 | 760 × 720（不变） |

三个面板各自跟着自己的按钮走，所以位置不再统一，但尺寸、圆角、配色仍完全一致。

## 实现

### 1. 定位整块交给 CSS 变量，JS 只负责算值

`.topbar` 上新增了三个变量（`TopBar.css`），CSS 里只作为**兜底**：

```css
.topbar {
  --topbar-panel-left: 12px;                      /* 兜底：还没量到时 */
  --topbar-panel-top: calc(100% + 7px);
  --topbar-panel-width: min(760px, calc(100vw - 28px));
  --topbar-panel-height: min(720px, calc(100vh - 96px));
}
```

三个面板统一改成：

```css
top: var(--topbar-panel-top, calc(100% + 7px));
left: var(--topbar-panel-left, 12px);
right: auto;
```

### 2. `TopBar.tsx` 里的锚定计算

新增一个 `useLayoutEffect`（依赖 `quickSettingsOpen / configProfilesOpen / multiAccountOpen / visibleActionOrder`）：

1. 找出当前打开的面板和**触发它的按钮**（三个 ref 各自对应）；
2. `getBoundingClientRect()` 量按钮，`offsetWidth` 量面板宽度；
3. 算出面板左上角，写进 `.topbar` 的行内 CSS 变量。

关键公式：

```js
const zoom = topbarRect.width / bar.clientWidth;   // 见下方「UI 缩放」一节
const buttonRight  = (buttonRect.right  - topbarRect.left) / zoom;
const buttonBottom = (buttonRect.bottom - topbarRect.top)  / zoom;
const rawLeft = buttonRight - panelWidth;                      // 右边对齐按钮右边
const left    = clamp(rawLeft, 8, topbarWidth - panelWidth - 8);
const top     = buttonBottom + 6;                              // 顶边贴按钮下沿
```

**为什么宽度必须用 `offsetWidth`**：面板进场动画带 `scale(.975)`，
`getBoundingClientRect()` 会把宽度量成 `760 × 0.975 ≈ 741`，`left` 就会多偏 19px。
`offsetWidth` 是布局值，不受 transform 影响。

### 2.1 ⚠️ 必须除以 UI 缩放（`zoom`）—— 踩过的坑

第一版上线后实测偏了约 11%（面板既偏左又偏上），根因是**单位不统一**：

- `.app-main-layer` 上有 `zoom: var(--main-ui-scale, 1)`（本机设置 **0.9**）；
- `getBoundingClientRect()` 返回的是**已经过 zoom 的视口 CSS 像素**；
- 而面板的 `left / top` 和 `offsetWidth` 用的是**子树布局像素（未过 zoom）**。

两者相差正好一个 `zoom` 倍数（0.9 → 11%）。所以按钮坐标必须换算回布局像素：

```js
const zoom = topbarRect.width / bar.clientWidth;   // 实测 0.9；zoom=1 时为 1，无副作用
```

同理，可用高度也要换算，否则面板会比预期矮：

```js
const height = Math.max(260, Math.min(720, (window.innerHeight - topbarRect.top) / zoom - top - 10));
```

`zoom` 是用 `topbarRect.width / bar.clientWidth` **实测**出来的（同一元素的两个不同度量方式之比），
不依赖 `--main-ui-scale` 变量本身，UI 缩放改成别的值也自动成立。

> 一般规律：只要祖先节点上有 `zoom` / `transform: scale()`，
> 在同一个定位上下文里混用 `getBoundingClientRect()` 和 `offsetWidth` 一定会错位，
> 必须先把 rect 值除回布局像素。

**为什么不再出现「跑到左边」**：老代码的 `clamp` 下限是 `Math.max(8, …)`，
一旦测到异常值就被夹成 8px，面板直接贴左上角。现在面板宽度固定 760，
默认窗口下可用空间充足（left ≈ 400~460），根本不会触发下限；
窄窗口时才夹到 8，且宽度本身也跟着 `100vw - 28px` 缩。

### 3. 多账号中心的包装层

`.multi-account-backdrop` 已经不是遮罩，是个定位包装层。它必须**显式声明宽度**：

```css
.multi-account-backdrop {
  position: absolute;
  top: var(--topbar-panel-top, …);
  left: var(--topbar-panel-left, 12px);
  right: auto;
  width: var(--topbar-panel-width, min(760px, calc(100vw - 28px)));
}
```

否则绝对定位的 block 会收缩成 shrink-to-fit，空间不够时把弹窗挤出窗口右边。

## 改动的文件

| 文件 | 改动 |
|---|---|
| `src/components/TopBar/TopBar.tsx` | 新增 `multiAccountButtonRef` / `multiAccountPanelRef`；新增锚定 `useLayoutEffect`；`actionMap.multiAccount` 补 `buttonRef` |
| `src/components/TopBar/MultiAccountDialog.tsx` | 新增 `panelRef` 属性，挂到根 `<form>` 上 |
| `src/components/TopBar/TopBar.css` | `--topbar-panel-right` → `--topbar-panel-left`；高度兜底改 `100vh - 96px` |
| `src/components/TopBar/QuickSettingsMenu.css` | `right` → `left: var(--topbar-panel-left, 12px)` |
| `src/components/TopBar/ConfigProfilesMenu.css` | 同上 |
| `src/components/TopBar/MultiAccountDialog.css` | 同上 + 包装层显式宽度 |

## 已知取舍

面板顶边贴到按钮下沿，意味着**它会盖住按钮组下面几行**（这正是「贴到按钮上」的代价）：

- 多账号（第 2 行第 2 列）打开时，第 3、4 行的**前两列**被盖住；**第 3 列仍可用**（齿轮、置顶、最小化、关闭）。
- 想切换面板：先点面板外面关掉（会关闭），或点没被盖住的第 3 列按钮。

如果想收紧 / 放松和按钮的间距，改 `TopBar.tsx` 里的 `const gap = 6;` 一处即可。

## 验证

### 构建与测试

- `npm run typecheck` 通过
- `npm run test` 154/154 通过
- `npm run tauri:build` 通过
- 未升版本号（仍是 0.1.135，覆盖刷新）

### 像素级实测（窗口 1271×1167 @ 屏幕 150,60，UI 缩放 0.9 / DPI 1.104）

按截图逐像素扫描亮度跳变定位边界，图片坐标如下：

| 量 | 实测值 |
|---|---|
| 按钮组内边距外框 | x 1124 … 1252（宽 129，与 3×33.8 + 2×7.95 + 2×6.08 吻合） |
| 列间隙 | x 1164–1171、1205–1212 |
| **多账号按钮（第 2 行第 2 列）** | x **1173–1204**，y **60–93**（34×34 物理像素） |
| **面板右缘** | x = **1204** ✅ 与按钮右缘重合 |
| **面板顶缘** | y = **99** ✅ = 按钮底缘 93.5 + 5.5（6 × 0.9 × 1.104 = 5.96） |
| 旧版右缘（按钮组外缘） | x = 1252，比按钮右缘多 **42px**（= 一格 34 + 间隙 8） |

对照图见 `TOPBAR_PANEL_ANCHOR_VERIFY.png`。

> 排查手段备忘：WebView2 的 UI Automation 树只暴露了 24 个 Pane，**拿不到按钮**，
> 所以改成「关/开面板各截一张 → 逐像素扫亮度跳变」来定位网格与面板边缘。
> 另外 `GetWindowRect` 拿到的是 `TAURI_DRAG_RESIZE_WINDOW` 那个 176×30 的辅助窗口，
> 真实窗口尺寸要用 UIA 的 `BoundingRectangle`（或给 `SetWindowPos` 带上 `SWP_NOSIZE`，
> 否则 `cx=cy=0` 会把窗口缩成 0×0）。
