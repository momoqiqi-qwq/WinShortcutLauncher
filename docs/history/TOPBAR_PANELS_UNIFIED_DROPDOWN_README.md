# 右上角三个面板统一为同款下拉

## 背景

右上角按钮打开的「常用设置」「多配置」「多账号中心」三个面板，之前是三种完全不同的形态和尺寸：

| 面板 | 改前形态 | 改前尺寸 | 改前位置 |
| --- | --- | --- | --- |
| 常用设置 | 下拉菜单 | 340 × 620 | 左上（异常） |
| 多配置 | 下拉菜单 | 430 × 650 | 左上（异常） |
| 多账号中心 | 全屏遮罩 + 居中模态 | 1420 × 860 | 居中但几乎撑满 |

「常用设置」「多配置」会跑到左上角，原因是面板的横向位置不是 CSS 决定的，而是 `TopBar.tsx` 里用 `getBoundingClientRect()` 测按钮坐标后算出来、再以行内 `style={{ left }}` 写进去：

```tsx
const preferred = buttonRect.right - topbarRect.left - menuWidth;
setQuickSettingsMenuLeft(Math.max(8, Math.min(preferred, topbarRect.width - menuWidth - 8)));
```

算法意图是「右对齐到按钮」，但只要测量拿到异常值，`Math.max(8, ...)` 就把结果夹成 8px，行内样式失效后回落到 CSS 兜底值 `left: 12px` —— 两个面板一起贴到左上角。

## 改动

### 1. 位置整块交给 CSS（根因修复）

- 删掉 `TopBar.tsx` 里两段 `measure()` 测位逻辑，以及 `quickSettingsMenuLeft` / `configProfilesMenuLeft` 两个 state
- `QuickSettingsMenu` / `ConfigProfilesMenu` 移除 `left` prop 与 `style={{ left }}`
- 两个组件里保留原有的「打开后聚焦第一个菜单项」行为，只去掉测量部分

现在三个面板都靠 CSS 右对齐到 `.topbar` 的内右边缘，不再依赖运行期测量，也就不会再出现「跑到左边」。

### 2. 尺寸契约统一

在 `.topbar` 上定义一组变量，三个面板共用（改一处三个一起变）：

```css
.topbar {
  --topbar-panel-top: calc(100% + 7px);
  --topbar-panel-right: 12px;
  --topbar-panel-width: min(760px, calc(100vw - 28px));
  --topbar-panel-height: min(720px, calc(100vh - 86px));
  --topbar-panel-radius: 16px;
  --topbar-panel-bg: color-mix(in srgb, var(--panel) 97%, transparent);
  --topbar-panel-shadow: 0 18px 46px rgba(0, 0, 0, .36), inset 0 1px 0 rgba(255, 255, 255, .08);
}
```

三个面板均为 **760 × 720**（窗口不足时按 `100vw` / `100vh` 收缩），统一的圆角、底色、阴影、`backdrop-filter` 模糊。

### 3. 多账号中心：从全屏模态改为下拉

- `.multi-account-backdrop`：由 `position: fixed; inset: 0` 全屏遮罩改为 `position: absolute` 的右上角锚点，去掉遮罩与遮罩模糊
- `.multi-account-dialog`：加入 `position: relative`，尺寸改用统一变量；`transform-origin` 从 `50% 18%` 改为 `top right`
- 进出场动画改为与另两个面板一致的 `translateY(-6px) scale(.975)`
- 因为不再有全屏遮罩，`TopBar.tsx` 新增「点面板外部关闭」监听（排除面板自身、三个触发按钮、以及 `.ui-dialog-backdrop`）
- 「编辑批次」浮窗：`position: fixed` → `absolute`，`z-index: 300` → `1300`（必须高于 1220 的面板层），宽度改为 `min(540px, 100%)` 以免溢出被面板裁剪

### 4. 内部布局跟着新尺寸收敛

| 规则 | 改前 | 改后 |
| --- | --- | --- |
| `.multi-account-feature-page` | `min-height: 460px` | `min-height: 0` |
| `.multi-account-batch-layout` | `minmax(360px, 42%)` / `min-height: 560px` | `minmax(300px, 44%)` / `min-height: 0` |
| `.multi-account-batch-list` | `max-height: 560px` | `max-height: 470px` |
| `.multi-account-batch-items` | `max-height: 460px` | `max-height: 340px` |
| `.quick-settings-view-list` | 固定 2 列 | `repeat(auto-fill, minmax(178px, 1fr))`，高度自适应撑满 |
| `.quick-settings-editor-list` | `max-height: min(490px, 100vh - 170px)` | `flex: 1 1 auto`，高度自适应撑满 |

宽 760 时「常用设置」自动排 4 列，「多配置」保持原有 flex 单列滚动结构，「多账号中心」批次列表在左列排 2 列。

## 验证

- `npm run typecheck` 通过
- `npm run test` → 33 个文件、154 / 154 用例通过
- `npm run tauri:build` 通过

## 需要注意

多账号中心不再有全屏遮罩，所以：

1. **点面板外部会直接关闭**，未提交的表单内容不会保留（和另外两个下拉面板行为一致）
2. 面板宽度从原来的近满宽收窄到 760px，批次管理页的左右分栏变窄，批次列表由 3 列变 2 列

如果希望多账号中心保留「全屏模态 + 居中」的形态，把 `.multi-account-backdrop` 还原为 `position: fixed; inset: 0; display: grid; place-items: center` 并恢复遮罩背景即可，`.multi-account-dialog` 的尺寸可以从 `--topbar-panel-*` 变量里摘出来单独给值。
