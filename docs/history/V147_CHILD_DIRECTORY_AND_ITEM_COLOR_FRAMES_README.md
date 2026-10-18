# V147 版本说明：子目录与项目彩色框

> 承接 V106（父目录配色）与父目录标签的外观自由度。父目录早就能单独上色并被彩色框住
> （顶部标签 `.top-tab.has-custom-color` + 「父目录配色」面板），但**子目录**和**项目**一直没有这个能力。
> V147 把这套机制原样下放一级：两者各自拿到独立的 `color` 字段，配一套右键入口、一块配色面板、
> 一组全局外观滑杆。

## 一、数据与归一化

| 位置 | 改动 |
| --- | --- |
| `src/types.ts` | `ShortcutItem`、`Directory` 各新增 `color?: string`；`DisplaySettings` 新增 `colorFrameBorderWidth: number`、`colorFrameColorStrength: number`、`colorFrameShape: 'round' \| 'square'`；`DirectoryContextMenuItemId` 新增 `'color'` |
| `src/stores/appStore/defaults.ts` | `colorFrameBorderWidth: 1`、`colorFrameColorStrength: 0.17`、`colorFrameShape: 'round'` |
| `src/stores/appStore/normalizers.ts` | 新增 `normalizeAccentColor`（复用父目录那套 `#RGB` / `#RRGGBB` / `#RRGGBBAA` 正则）；`normalizeShortcutItem` 与 `normalizeDirectory` 只在合法时写入 `color`；`normalizeDisplay` 夹取三个新字段（边框 0–4、强度 0.04–0.55、形状非法回落 `round`） |
| `src/stores/appStore/types.ts` | `NavigationSlice` 新增 `setDirectoryColor` / `setDirectoryColors` / `setItemColor` / `setItemColors` |
| `src/stores/appStore/slices/navigationSlice.ts` | 原来的 `withGroupColor` 提成通用 `withColor<T extends { color?: string }>`（无颜色时**解构删掉字段**，不留空串）；新增 `mapDirectories(groups, mapper)`，只在命中时替换该 group 的引用；四个新动作都做了「先判断再改」——`setItemColor` / `setItemColors` 先 `items.some(...)` 快速跳过，避免改不存在的 id 时制造多余的对象替换 |

**为什么不用动持久化层**：`groups` 是整棵原样持久化、读回时统一走 `normalizeGroups`，所以 `Directory.color` /
`ShortcutItem.color` 自动存、自动还原；`display` 走 `normalizeDisplay`，新字段自动夹取。`persistence.ts`
里没有任何按字段枚举的清单，一行都不用改。

## 二、右键入口

- **子目录右键 → 「子目录背景色」**（`src/components/ContextMenu/DirectoryContextMenu.tsx`）：8 个预设色
  （默认 / 琥珀 / 青绿 / 天蓝 / 紫色 / 玫红 / 珊瑚 / 石墨）+ 最后一项「自定义颜色…」，走输入框 +
  正则校验，非法值弹提示且**不改动配置**。
- **项目右键 → 「项目背景色（N 项）」**（`src/components/ContextMenu/ItemContextMenu.tsx`）：同样 8 色 +
  自定义；多选时用 `Object.fromEntries(actionItemIds.map(...))` 一次批量写入，并弹出 `showLauncherNotice`
  告知影响了多少项。镜像项目分支不渲染该子菜单（开始菜单 / 映射条目来自真实文件夹，不在配置里）。
- 子目录右键菜单项同步进「右键菜单项」设置（`DIRECTORY_LABELS` 新增 `color`）与压缩预设；
  `experienceSettings.test.ts` 里的菜单项全量断言也一并补上 `'color'`。

## 三、设置页

### 导航 → 「子目录与项目配色」（`DirectoryItemColorSettings`）

- **子目录**区块：列出全部父目录下的全部子目录，行名显示为 `父目录名 / 子目录名`；
- **项目**区块：范围跟随当前所在子目录；若当前子目录的 `kind === 'all'`，改用当前父目录下各子目录项目的合集；
- 两个区块各有「一键彩色 / 换一组颜色 / 全部跟随主题」三个批量按钮（7 色循环，换一组 = 偏移 2）；
- 每行 = 名称 + `<input type="color">` + 6 个色块 + 「跟主题」；
- 镜像子目录只给一行提示文案，不给颜色控件；
- 单次最多渲染 `MAX_ROWS = 200` 行，避免配置很大时把设置页拖慢。

### 界面 → 「子目录与项目彩色框」（`ColorFrameAppearanceControls`）

4 个预设——淡描边（1px / 12% / 圆角）、标准（1px / 17% / 圆角）、彩色卡片（1px / 28% / 方形）、
醒目（2px / 38% / 方形）——外加三个手动滑杆：边框粗细 0–4px、自定义颜色填充强度 4–55%、
形状圆角/方形。预设命中判定沿用父目录那套 `Object.entries(patch).every(...)`。

## 四、渲染层

根节点（`src/App.tsx`）挂三个变量：

```
--color-frame-border-width    ← colorFrameBorderWidth（px）
--color-frame-strength        ← colorFrameColorStrength（百分数）
--color-frame-hover-strength  ← min(70, 强度 + 8)%
color-frame-shape-{round|square}   ← 根 class，用于切换圆角
```

- **子目录**（`Sidebar.tsx` / `Sidebar.css`）：有颜色时行节点写 `--directory-accent` 并加 `has-custom-color`。
  常态 44% 混色描边 + `--color-frame-strength` 填充；hover 提升到 62% 描边；激活态用实描边 +
  hover 强度填充 + 3px 光晕 + 彩色数字徽标；开始菜单 / 映射子目录的左侧 3px 强调条（`:before`）
  也跟着换成该颜色；方形模式下圆角收到 6px。
- **项目**（`ItemCard.tsx` / `ItemCard.css`）：有颜色时写 `--item-accent` 并加 `has-custom-color`。
  同款描边/填充/hover/选中光晕；选中时图标颜色跟随 `--item-accent`；方形模式下圆角收到 8px。

两者都复用父目录的 `color-mix(in srgb, ...)` 公式，所以「填充浓度、边框粗细、形状」三处调整对
父目录标签、子目录标签、项目卡片是**同一套语义、同一组滑杆**（父目录的那组在「界面 → 父目录标签」里）。

## 五、搜索与拼音

`settingsSearchIndex.ts` 新增两条：`color-frame`（界面 → 子目录与项目彩色框）、
`directory-item-colors`（导航 → 子目录与项目配色），关键词覆盖「子目录 / 项目 / 彩色框 / 色板 / 背景色」；
`settingsPinyinAliases.ts` 补 `zimuluyuxiangmucaisaikuang`、`zimuluyuxiangmupeise` 及各自的缩写。

## 六、验证与构建

- `npx tsc --noEmit`：**0 错误**（过程中先报了 `DisplaySettings.tsx` 的 `InterfaceSectionId` 缺 `'colorFrame'`，
  补进联合类型与 `ALL_SECTION_IDS` 后清零）。
- `npm test`：**35 个测试文件 / 170 个用例全过**。新增/扩展的断言：
  - `normalizers.test.ts` —— 合法色值保留、`javascript:bad` 丢弃、`#ABCDEF88` 保留；外观字段上下夹取（99→4、9→0.55、-3→0、0→0.04、`'weird'` → `'round'`）。
  - `appStoreSlices.test.ts` —— `setDirectoryColor(s)` 只改动点名的那几个子目录、`setItemColor(s)` 同理，副本项目可批量上色，`setItemColor('item-not-exist', ...)` 时 `getUserGroup()` 引用不变。
  - `experienceSettings.test.ts` —— 子目录右键菜单项全量断言加入 `color`。
- 构建：见 `AGENTS.md` 的便捷版同步流程。
