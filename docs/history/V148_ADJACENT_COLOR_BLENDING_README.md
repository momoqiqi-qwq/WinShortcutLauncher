# V148 版本说明：相邻颜色组合

> 承接 V147（子目录与项目彩色框）。V147 之后每个子目录、每个项目都能各自选色并被彩色框住，
> 但**相邻两项的颜色互不影响**——混色只发生在「单项颜色 × 主题底色/边框」之间（CSS `color-mix`）。
> V148 补上跨项组合：同一容器内相邻的若干项可以并成一组，组内共用同一个色系，
> 于是「相邻同色成块」和「同色系色带」都只需要一个滑杆。

## 一、行为定义

| 模式 | 行为 |
| --- | --- |
| `independent`（默认） | 与 V147 完全一致：每项用自己的 `color`，互不影响 |
| `adjacent` | 同一容器内按**显示顺序**每 `groupSize` 项切一组；组内取**第一个已上色的项**的颜色作基色，其余**已上色**成员按序取该基色的同色系浅色 |

三条不可动摇的规则：

1. **未上色的项不参与、也不会被凭空染色**。组里没有有色项就整组保持主题色，绝不猜颜色。
2. **相邻 = 视觉相邻**。内容区按当前显示顺序分组（含搜索过滤后的结果），左侧按子目录排列顺序分组。
   分组永远跟着眼睛看到的顺序走，不跟底层数组顺序走。
3. **落差可归零**。`groupTint = 0` 时组内完全同色——相邻几项在视觉上就是一个整体色块。

同色系浅色是**向白色混**（`tintColor`），不是向主题底色混，所以深浅关系在任何主题下都保持一致；
累计落差上限 `MAX_CUMULATIVE_TINT = 0.8`，最深的成员不会糊成纯白。

## 二、数据与归一化

| 位置 | 改动 |
| --- | --- |
| `src/types.ts` | `DisplaySettings` 新增 `colorFrameBlend: 'independent' \| 'adjacent'`、`colorFrameGroupSize: number`（2–6）、`colorFrameGroupTint: number`（0–0.6） |
| `src/stores/appStore/defaults.ts` | `colorFrameBlend: 'independent'`、`colorFrameGroupSize: 3`、`colorFrameGroupTint: 0.22` |
| `src/stores/appStore/normalizers.ts` | `normalizeDisplay` 夹取三个字段：非法 blend 回落 `independent`、组数 `Math.round(clamp(2,6))`、落差 `clamp(0,0.6)` |
| `src/lib/colorFrames.ts`（新增） | `isHexColor`、`tintColor`、`clampGroupSize`、`clampGroupTint`、`resolveColorFrameColors` |
| `src/lib/__tests__/colorFrames.test.ts`（新增） | 10 个用例 |

**为什么不用动持久化层**：`display` 走 `normalizeDisplay` 逐字段夹取，新字段自动有默认值；
旧配置文件读入后 `colorFrameBlend` 落回 `independent`，也就是 V147 的行为。`Directory.color` /
`ShortcutItem.color` 的数据结构和持久化一个字都没改。

## 三、渲染接线

新增的 `resolveColorFrameColors()` 是唯一的颜色决策点，UI 只负责把结果注入 CSS 变量：

| 位置 | 改动 |
| --- | --- |
| `src/components/Sidebar/Sidebar.tsx` | `EditableDirectory` 新增 `frameColor?: string` prop；style 注入 `--directory-accent`、className 判定 `has-custom-color`（**不再直接读 `directory.color`**）；Sidebar 主体用 `frameColors` memo 一次算完整列 |
| `src/components/ContentArea/ShortcutGrid/ShortcutGrid.tsx` | 同款 `frameColors` memo，基于 `filteredItems`；`<ItemCard frameColor={...} />` |
| `src/components/ContentArea/ItemCard.tsx` | `ItemCardProps` 新增 `frameColor?: string`；style 注入 `--item-accent`；`areItemCardPropsEqual` 增加 `frameColor` 比较（否则 memo 会吃掉颜色变化） |

CSS 一行没改：`.side-tab.has-custom-color` 与 `.item-card.has-custom-color` 本来就只认
`--directory-accent` / `--item-accent`，换色源是透明的。

## 四、界面入口

**界面 → 「子目录与项目彩色框」**（`src/components/Settings/ColorFrameAppearanceControls.tsx`）：

- 「相邻颜色」二选一：`各自独立` / `相邻组合`。
- 选「相邻组合」后展开两个滑杆：**每组项数** 2–6 项、**组内深浅落差** 0%–60%（提示文案明确写出 0% = 整体色块）。
- 既有的「外观预设 / 边框粗细 / 填充强度 / 彩色框形状」不受影响，两个模式共用。

## 五、验证

- `npx tsc --noEmit`：0 错误。
- `npx vitest run`：**36 个文件 / 180 个用例全过**（其中 `colorFrames.test.ts` 10 个）。
- 测试覆盖：合法/非法色值、alpha 保留（`#8b5cf680` → `#c5aefb80`）、参数夹取与 NaN、独立模式透传、
  相邻分组与基色选择、未上色项跳过（`Object.keys(colors)` 只含上色项）、落差 0 的同色块、
  边界换组、落差上限（`colors.i5 === tintColor(AMBER, 0.8)` 且 `!== '#ffffff'`）、空列表返回 `{}`。
