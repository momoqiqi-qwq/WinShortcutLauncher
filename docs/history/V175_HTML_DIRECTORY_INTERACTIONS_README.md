# V175 功能说明：HTML 目录的点击、拖入、右键与自动刷新

## 要点

v173 的 HTML 目录只能「看」：双击开、文件要自己去文件夹里放、卡片外观统一、加了新页面还得点刷新。
V175 把它补齐成一个能日常使用的入口：

| 能力 | 行为 |
| --- | --- |
| 单击 / 双击 | 跟随 设置 → 行为 → 左键启动方式，与普通项目一致 |
| 拖入复制 | `.html` / `.htm`（或整个页面文件夹）拖到 HTML 子目录上 → **复制**进该文件夹 |
| 右键菜单 | 打开 / 打开所在文件夹 / 重命名卡片 / 卡片颜色 / 恢复默认大小 / 复制名称 / 复制路径 |
| 相邻组合 | 卡片颜色参与「相邻颜色组合」与「同色相邻成组框」，规则同项目卡片 |
| 自动刷新 | 目录内容变化后 2 秒内自动重扫，不用再点刷新 |

## 交互细节

### 点击

- `pointerdown` 记起点，`pointerup` 位移 ≤ **6px** 才算点击；缩放卡片（8 个手柄）走另一条路，互不干扰。
- 单击模式下用系统双击间隔（`get_double_click_time_ms`）挡掉「一次双击开两个浏览器窗口」。
- 卡片头部的三个小按钮（重载预览 / 浏览器打开 / 资源管理器）不参与卡片点击判定。
- 预览 iframe 保持 `pointer-events: none`，所以点预览区等于点卡片。

### 拖入

- 原生拖拽（资源管理器 → 启动器）现在带上物理坐标：`useDragDrop` 透传 `position`，
  `resolvePointTarget` 只在鼠标真的压着某个子目录时才认目标；找不到就回落到当前打开的子目录。
  刻意不做「父目录没有普通子目录就自动建一个」的兜底，避免拖到空白处顺手建目录。
- 落点是 HTML 子目录 → `copy_html_into_folder`：只复制不移动；同名自动变 `xxx (2).html`；
  文件夹整目录递归复制（深度上限 8，隐藏文件跳过）。
- 网址拖到 HTML 子目录不会静默失败，会明确提示「只收 .html / .htm 文件」。

### 右键

- 新增 `ContextMenuState` 分支 `kind: 'htmlPage'`（带 `directoryId` + `pagePath`），
  由 `HtmlPageContextMenu` 渲染，沿用统一的 `.menu-surface` 与 `useSmartMenuPosition` 定位。
- **改名只改显示名**：写进 `Directory.htmlNames[绝对路径]`，磁盘上的文件名一动不动。
  清空输入即恢复文件名。
- 颜色写进 `Directory.htmlColors[绝对路径]`，与项目卡片共用同一套色板（默认 / 7 个预设 / 自定义）。

### 自动刷新

- 后端 `html_folder_signature`：复用扫描规则，只 stat（页面清单 + mtime + 大小）算一个哈希。
- 前端 2 秒轮询 + `focus` / `visibilitychange` 立即比对；指纹变了才 `refreshHtmlFolder`。
- 没用文件系统 watcher：避免新依赖、线程生命周期和递归监听的坑；几十个页面的目录一次 stat 是毫秒级。

## 代码位置

| 位置 | 内容 |
| --- | --- |
| `src-tauri/src/html_folder.rs` | `copy_html_into_folder`、`html_folder_signature`、`unique_target`、`copy_dir_recursive` |
| `src/lib/htmlFolder.ts` | `copyHtmlIntoFolder`、`htmlFolderSignature`、`resolveHtmlPageName`、`resolveHtmlPageColor` |
| `src/components/ContentArea/HtmlGallery/HtmlGallery.tsx` | 点击判定、颜色组合、成组框、轮询、右键回调 |
| `src/components/ContextMenu/HtmlPageContextMenu.tsx` | 卡片右键菜单 |
| `src/hooks/useWebsiteDropController.ts` | `copyDroppedHtml`、`resolvePointTarget`、HTML 子目录接收拖入 |
| `src/stores/appStore/slices/navigationSlice.ts` | `setHtmlPageName`、`setHtmlPageColor`、`clearHtmlCardSize`、`resetHtmlCardAppearance` |
| `src/stores/appStore/normalizers.ts` | `htmlNames` / `htmlColors` 的白名单规范化（空名、非法色丢弃，上限 4000 条） |

## 已知取舍

- 改名 / 颜色按**绝对路径**存：文件改名或移动后，那一条记录就失效（卡片回到文件名 + 跟随主题）。
  与 v173 的卡片尺寸是同一套约定。
- 轮询是「定时 stat」，不是事件驱动：极端情况下（文件内容变了但 mtime 没变）不会触发刷新。
