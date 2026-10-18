# Yue launcher 右上角按钮（窗口控制按钮）代码速查

> 对应版本：`0.1.135`
>
> 涉及文件：
> - `src/components/TopBar/TopBar.tsx` —— 组件与逻辑（主文件）
> - `src/components/TopBar/TopBar.css` —— 按钮样式
> - `src/index.css` —— `.icon-button` 基础样式
> - `src/types.ts` —— 类型定义
> - `src/stores/appStore/defaults.ts` —— 默认顺序
> - `src/App.tsx` —— CSS 变量注入
> - `src/components/Settings/DisplaySettings.tsx` —— 设置面板里的对应配置项
> - `src/lib/settingsSearchIndex.ts` / `src/lib/settingsPinyinAliases.ts` —— 设置搜索索引与拼音别名

窗口是无边框窗口（`tauri.conf.json` 里 `decorations: false`），所以没有系统标题栏。
顶部 `<header class="topbar">` 同时充当标题栏（带 `data-tauri-drag-region` 可拖动），
**右侧那一组就是「右上角按钮」**，源码里叫 window controls，容器类名 `.topbar-actions`。

一共 12 个按钮，顺序可拖动调整、可单独隐藏：

| # | id | 默认图标 | 标题（tooltip） | 行为 |
|---|---|---|---|---|
| 1 | `search` | `Search` | 全局命令面板（Ctrl+K） | 打开全局搜索 |
| 2 | `transfer` | `Archive` | 文件中转站 | 打开中转站面板 |
| 3 | `image` | `Images` | 图片浏览 | 打开图片浏览器 |
| 4 | `profiles` | `Files` | 多配置 | 弹出配置档案菜单 |
| 5 | `multiAccount` | `UsersRound` | 多账号批量生成 | 打开多账号对话框 |
| 6 | `sortGroups` | `ArrowDownAZ` | 父目录按字母排列 | 按名称重排父目录 |
| 7 | `add` | `Plus` | 新增父目录 | 新建分组 |
| 8 | `settingsQuick` | `SlidersHorizontal` | 常用设置快捷入口 | 弹出快捷设置菜单 |
| 9 | `settings` | `Settings` | 设置 | 打开设置面板 |
| 10 | `pin` | `Pin` / `PinOff` | 窗口置顶 / 取消置顶 | 切换置顶 |
| 11 | `minimize` | `Minus` | 最小化 | 最小化窗口 |
| 12 | `close` | `X` | 关闭 | 关闭窗口 |

---

## 1. 渲染入口（TopBar.tsx）

两个 DndContext：左边一组给父目录标签排序，右边这一组就是给右上角按钮排序。

```tsx
<DndContext sensors={actionSensors} collisionDetection={closestCenter} onDragEnd={handleActionDragEnd}>
  <SortableContext items={visibleActionOrder} strategy={horizontalListSortingStrategy}>
    <div className={`topbar-actions topbar-actions-${display.windowControlStyle ?? 'round'}`} data-no-drag>
      {visibleActionOrder.map((id) => <SortableWindowAction key={id} {...actionMap[id]} />)}
    </div>
  </SortableContext>
</DndContext>
```

要点：

- `visibleActionOrder` 已经过滤掉被隐藏的按钮，所以「渲染什么、什么顺序」全由它决定。
- `topbar-actions-${style}` 决定四种外观：`round` / `square` / `bar` / `pad`。
- `data-no-drag` 是给窗口拖动区识别用的，避免点按钮时把窗口拖走。
- 菜单/对话框挂在这一层之后（`QuickSettingsMenu`、`ConfigProfilesMenu`、`MultiAccountDialog`），
  用 `usePresenceTransition` 做进出场动画。

## 2. 单个按钮：SortableWindowAction

让每个按钮既是 `<button>` 又是 dnd-kit 的可排序节点，指针按下时把事件交给 dnd-kit，
避免和窗口拖动 / 点击冲突。

```tsx
interface SortableWindowActionProps {
  id: WindowControlId;
  title: string;
  icon: ReactNode;
  className?: string;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  buttonRef?: (node: HTMLButtonElement | null) => void;
  ariaExpanded?: boolean;
  ariaHaspopup?: 'menu';
  ariaControls?: string;
}

function SortableWindowAction({ id, title, icon, className = '', onClick, buttonRef, ariaExpanded, ariaHaspopup, ariaControls }: SortableWindowActionProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  } as CSSProperties;
  const sortableListeners = listeners as Record<string, ((event: PointerEvent<HTMLButtonElement>) => void) | undefined>;

  return (
    <button
      ref={(node) => { setNodeRef(node); buttonRef?.(node); }}
      style={style}
      className={`icon-button window-control-button draggable-window-control ${className} ${isDragging ? 'dragging' : ''}`}
      data-no-drag
      data-window-control-id={id}
      title={`${title}（拖动可调整位置）`}
      aria-expanded={ariaExpanded}
      aria-haspopup={ariaHaspopup}
      aria-controls={ariaControls}
      onPointerDown={(event) => {
        event.stopPropagation();
        sortableListeners.onPointerDown?.(event);
      }}
      onClick={(event) => {
        event.stopPropagation();
        onClick(event);
      }}
      {...attributes}
    >
      {icon}
    </button>
  );
}
```

细节：

- `ref` 合并了两个用途：dnd-kit 的 `setNodeRef` + 外部的 `buttonRef`（菜单定位要用按钮位置）。
- `data-window-control-id={id}` 是「点外部关闭菜单」判断时用的锚点。
- `title` 统一追加了「（拖动可调整位置）」的提示。

## 3. 按钮定义表：actionMap

整个右上角就靠这一张表定义，改按钮基本只改这里。

```tsx
const actionMap: Record<WindowControlId, SortableWindowActionProps> = {
  search: { id: 'search', title: '全局命令面板（Ctrl+K）', icon: <Search size={16} />, onClick: onOpenGlobalSearch },
  transfer: { id: 'transfer', title: '文件中转站', icon: <Archive size={16} />, onClick: onOpenTransferStation },
  image: { id: 'image', title: '图片浏览', icon: <Images size={16} />, onClick: onOpenImageBrowser },
  profiles: { id: 'profiles', title: '多配置', icon: <Files size={16} />, className: configProfilesOpen ? 'config-profiles-active' : '', buttonRef: (node) => { configProfilesButtonRef.current = node; }, ariaExpanded: configProfilesOpen, ariaHaspopup: 'menu', ariaControls: 'topbar-config-profiles-menu', onClick: () => { setMultiAccountOpen(false); setQuickSettingsOpen(false); setConfigProfilesOpen((open) => !open); } },
  multiAccount: { id: 'multiAccount', title: '多账号批量生成', icon: <UsersRound size={16} />, className: multiAccountOpen ? 'multi-account-active' : '', ariaExpanded: multiAccountOpen, onClick: () => { setQuickSettingsOpen(false); setConfigProfilesOpen(false); setMultiAccountOpen((open) => !open); } },
  sortGroups: { id: 'sortGroups', title: '父目录按字母排列', icon: <ArrowDownAZ size={16} />, onClick: sortGroupsByName },
  add: { id: 'add', title: '新增父目录', icon: <Plus size={16} />, onClick: () => addGroup('新分组') },
  settingsQuick: { id: 'settingsQuick', title: '常用设置快捷入口', icon: <SlidersHorizontal size={16} />, className: quickSettingsOpen ? 'quick-settings-active' : '', buttonRef: (node) => { quickSettingsButtonRef.current = node; }, ariaExpanded: quickSettingsOpen, ariaHaspopup: 'menu', ariaControls: 'topbar-quick-settings-menu', onClick: () => { setMultiAccountOpen(false); setConfigProfilesOpen(false); if (quickSettingsOpen) closeQuickSettings(false); else setQuickSettingsOpen(true); } },
  settings: { id: 'settings', title: '设置', icon: <Settings size={16} />, onClick: () => setSettingsOpen(true) },
  pin: { id: 'pin', title: behavior.alwaysOnTop ? '取消置顶' : '窗口置顶', icon: behavior.alwaysOnTop ? <PinOff size={16} /> : <Pin size={16} />, className: behavior.alwaysOnTop ? 'window-pin-active' : '', onClick: toggleAlwaysOnTop },
  minimize: { id: 'minimize', title: '最小化', icon: <Minus size={16} />, onClick: minimizeWindow },
  close: { id: 'close', title: '关闭', icon: <X size={16} />, className: 'window-close-button', onClick: closeWindow }
};
```

几个约定：

- **三个弹出层互斥**：`profiles` / `multiAccount` / `settingsQuick` 任一打开时，另外两个会被关掉。
- **激活态靠 className 表达**：`config-profiles-active` / `multi-account-active` / `quick-settings-active` / `window-pin-active`。
- **只有按钮的对外 props 是 `onClick`**，内部事件都在 actionMap 里闭包掉了。

`sortGroupsByName` 用的是中文排序：`localeCompare(..., 'zh-Hans-CN', { numeric: true, sensitivity: 'base' })`。

## 4. 窗口操作 handler

```tsx
async function minimizeWindow(event?: MouseEvent<HTMLButtonElement>) {
  event?.preventDefault();
  event?.stopPropagation();
  await getCurrentWindow().minimize().catch((error) => console.warn('minimize failed', error));
}

async function closeWindow(event?: MouseEvent<HTMLButtonElement>) {
  event?.preventDefault();
  event?.stopPropagation();
  await getCurrentWindow().close().catch((error) => console.warn('close failed', error));
}

function toggleAlwaysOnTop(event?: MouseEvent<HTMLButtonElement>) {
  event?.preventDefault();
  event?.stopPropagation();
  updateBehavior({ alwaysOnTop: !behavior.alwaysOnTop });
}
```

置顶状态的真正落地在另一个 effect 里（状态变了才调用，带 Tauri 命令 + WebView 兜底）：

```tsx
useEffect(() => {
  const alwaysOnTop = Boolean(behavior.alwaysOnTop);
  void invoke('set_window_always_on_top', { alwaysOnTop }).catch((error) => {
    const win = getCurrentWindow() as unknown as { setAlwaysOnTop?: (value: boolean) => Promise<void> };
    win.setAlwaysOnTop?.(alwaysOnTop).catch((fallbackError) => console.warn('set always on top failed', error, fallbackError));
  });
}, [behavior.alwaysOnTop]);
```

## 5. 顺序与显隐

```tsx
const actionOrder = useMemo(() => normalizeControlOrder(display.windowControlOrder), [display.windowControlOrder]);
const hiddenControlIds = useMemo(() => new Set(display.windowControlHidden ?? []), [display.windowControlHidden]);
const visibleActionOrder = useMemo(() => actionOrder.filter((id) => !hiddenControlIds.has(id)), [actionOrder, hiddenControlIds]);
```

`normalizeControlOrder` 负责把用户存的顺序「补全」成一份合法顺序：先按用户顺序收下合法且不重复的 id，
再把剩下没出现的 id **按默认顺序插到它前面那个已存在 id 的后面**。这样以后新增按钮时，
老用户的配置不会丢按钮，也不会全被挤到最后。

```tsx
function normalizeControlOrder(order?: WindowControlId[]): WindowControlId[] {
  const next: WindowControlId[] = [];
  for (const id of order ?? []) {
    if (DEFAULT_WINDOW_CONTROL_ORDER.includes(id) && !next.includes(id)) next.push(id);
  }
  for (const id of DEFAULT_WINDOW_CONTROL_ORDER) {
    if (next.includes(id)) continue;
    const defaultIndex = DEFAULT_WINDOW_CONTROL_ORDER.indexOf(id);
    const previous = DEFAULT_WINDOW_CONTROL_ORDER.slice(0, defaultIndex).reverse().find((candidate) => next.includes(candidate));
    if (previous) next.splice(next.indexOf(previous) + 1, 0, id);
    else next.push(id);
  }
  return next;
}
```

拖动排序的落点：

```tsx
function handleActionDragEnd(event: DragEndEvent) {
  const { active, over } = event;
  if (!over || active.id === over.id) return;
  const current = actionOrder;
  const oldIndex = current.indexOf(String(active.id) as WindowControlId);
  const newIndex = current.indexOf(String(over.id) as WindowControlId);
  if (oldIndex < 0 || newIndex < 0) return;
  updateDisplay({ windowControlOrder: arrayMove(current, oldIndex, newIndex) });
}
```

对应传感器（8px 才激活拖动，避免和点击打架）：

```tsx
const actionSensors = useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
);
```

## 6. 类型与默认值

```ts
// src/types.ts
export type WindowControlId = 'search' | 'transfer' | 'image' | 'profiles' | 'multiAccount'
  | 'sortGroups' | 'add' | 'settingsQuick' | 'settings' | 'pin' | 'minimize' | 'close';

export type WindowControlStyle = 'round' | 'square' | 'bar' | 'pad';
```

```ts
// src/stores/appStore/defaults.ts
export const DEFAULT_WINDOW_CONTROL_ORDER: WindowControlId[] = [
  'search', 'transfer', 'image', 'profiles', 'multiAccount', 'sortGroups',
  'add', 'settingsQuick', 'settings', 'pin', 'minimize', 'close',
];
```

`display` 里三个相关字段：

```ts
windowControlStyle: WindowControlStyle;   // 默认 'pad'
windowControlOrder: WindowControlId[];    // 默认 DEFAULT_WINDOW_CONTROL_ORDER
windowControlHidden: WindowControlId[];   // 默认 []
```

## 7. 样式

### 7.1 基础按钮（src/index.css）

```css
.icon-button {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--panel-2);
  color: var(--text);
  cursor: pointer;
}

.icon-button:hover {
  background: var(--accent-2);
  color: var(--accent);
}
```

### 7.2 窗口控制按钮（src/components/TopBar/TopBar.css）

尺寸来自 CSS 变量，不是写死的：

```css
/* 源码里 .topbar-actions 一共声明了三次（分散在文件不同位置），后面覆盖前面 */
.topbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.topbar-actions {
  gap: var(--window-control-gap, 8px);
}

.topbar-actions {
  touch-action: none;
}

.window-control-button {
  width: var(--window-control-size, 34px);
  height: var(--window-control-size, 34px);
  min-width: var(--window-control-size, 34px);
  position: relative;
  overflow: hidden;
  transition: background-color 160ms ease, border-color 160ms ease, color 160ms ease, box-shadow 180ms ease;
}

.window-control-button > svg {
  transition: transform 180ms cubic-bezier(.16, 1, .3, 1), filter 180ms ease;
}

.window-control-button:hover > svg {
  transform: translateY(-1px) scale(1.06);
}

.window-control-button:active > svg {
  transform: translateY(1px) scale(.86);
  filter: brightness(1.15);
  transition-duration: 70ms;
}

.window-control-button[aria-expanded="true"] {
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent), transparent 82%);
}

/* 减少动画时全部关掉 */
.app-shell.reduce-motion .window-control-button,
.app-shell.reduce-motion .window-control-button > svg {
  transition: none;
}

.app-shell.reduce-motion .window-control-button:hover > svg,
.app-shell.reduce-motion .window-control-button:active > svg {
  transform: none;
}
```

四种外观变体：

```css
.topbar-actions-round .window-control-button { border-radius: 999px; }
.topbar-actions-square .window-control-button { border-radius: 6px; }

.topbar-actions-bar .window-control-button {
  width: calc(var(--window-control-size, 34px) * 1.6);
  min-width: calc(var(--window-control-size, 34px) * 1.6);
  height: calc(var(--window-control-size, 34px) * 0.72);
  border-radius: 8px;
}

/* 四宫格：3 列网格 + 底板 */
.topbar-actions-pad {
  display: grid;
  grid-template-columns: repeat(3, var(--window-control-size, 34px));
  grid-auto-rows: var(--window-control-size, 34px);
  gap: var(--window-control-gap, 8px);
  padding: max(4px, calc(var(--window-control-size, 34px) * 0.18));
  border-radius: max(16px, calc(var(--window-control-size, 34px) * 0.45));
  background: color-mix(in srgb, var(--text), transparent 92%);
  box-shadow: inset 0 1px 0 color-mix(in srgb, white, transparent 82%), var(--shadow);
}

.topbar-actions-pad .window-control-button {
  width: var(--window-control-size, 34px);
  min-width: var(--window-control-size, 34px);
  height: var(--window-control-size, 34px);
  border-radius: max(10px, calc(var(--window-control-size, 34px) * 0.28));
  background: color-mix(in srgb, var(--panel-2), transparent 10%);
  border: 1px solid color-mix(in srgb, var(--border), transparent 20%);
}

.topbar-actions-pad .window-control-button:hover {
  background: color-mix(in srgb, var(--accent), transparent 75%);
  color: white;
}
```

> 注意：`.topbar-actions-pad .window-control-button:nth-child(1..12) { order: 1..12; }`
> 这 12 条规则在文件里是**分散穿插**写的（191-196、211、229-231、253-254），
> 不是连续一段，看代码时容易漏。它们只是把网格内的视觉顺序钉住。

状态类：

```css
.window-close-button:hover {
  background: color-mix(in srgb, var(--danger), transparent 82%);
  color: var(--danger);
}

.window-pin-active {
  background: color-mix(in srgb, var(--accent), transparent 72%);
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent), transparent 45%);
}

/* 两个独立规则块，声明完全相同 */
.quick-settings-active {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent), transparent 42%);
  background: color-mix(in srgb, var(--accent), transparent 80%);
}

.multi-account-active,
.config-profiles-active {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent), transparent 42%);
  background: color-mix(in srgb, var(--accent), transparent 80%);
}

.draggable-window-control.dragging {
  opacity: .65;
  z-index: 20;
  box-shadow: 0 10px 24px rgba(0,0,0,.28);
}
```

### 7.3 CSS 变量从哪来（src/App.tsx）

```tsx
'--window-control-size': `${display.windowControlSize ?? 34}px`,
'--window-control-gap': `${display.windowControlGap ?? 8}px`,
```

## 8. 设置面板里的对应项（DisplaySettings.tsx）

设置 → **界面** → 折叠分组 **「右上角功能按钮」**（组件 `DisplaySettings.tsx` 里
`id="controls"`，由 `InterfaceSettingsSection` 在 `activeTab === 'interface'` 时渲染），
提示语是「搜索 / 中转 / 图片 / A-Z / 加号 / 设置 / 置顶 / 最小化 / 关闭」。里面有四项：

| 控件 | 绑定字段 | 说明 |
|---|---|---|
| 按钮显示方式（4 个分段按钮） | `windowControlStyle` | 圆形 / 方形 / 横条 / 四宫格 |
| 「按钮大小」滑块 | `windowControlSize` | 24 ~ 48 px |
| 「按钮间距」滑块 | `windowControlGap` | 0 ~ 18 px |
| 「右上角功能是否显示」勾选列表 | `windowControlHidden` | 按 `WINDOW_CONTROL_LABELS` 逐个开关 |

还有一行 `.window-control-preview` 静态预览（用 `⌕ ⇅ ▤ A-Z ＋ ⚙ 📌 － ×` 这类字符模拟），
以及两个快捷按钮：

```tsx
<button className="btn-secondary" onClick={showAllWindowControls}>全部显示</button>
<button className="btn-secondary" onClick={hideNonEssentialWindowControls}>只留基础按钮</button>
```

- `showAllWindowControls()` → `windowControlHidden: []`
- `hideNonEssentialWindowControls()` → 隐藏
  `['search','transfer','image','profiles','multiAccount','sortGroups','add','settingsQuick','pin']`，
  只留 `settings` / `minimize` / `close`。

设置页里的中文名和 `actionMap` 的 tooltip 不完全一致（比如 `image` 这里是「图片预览」、
按钮上叫「图片浏览」），改文案时注意两处。

### 8.1 设置搜索怎么找到它

设置搜索索引里已经登记了这一项，所以搜「右上角」能直接跳过来：

```ts
// src/lib/settingsSearchIndex.ts
{ id: 'window-controls', label: '右上角功能按钮', description: '按钮大小、样式、显示和排序',
  tab: 'interface', section: 'controls', focusText: '功能按钮',
  keywords: ['右上角', '隐藏按钮', '设置快捷入口'] },
```

拼音别名（`src/lib/settingsPinyinAliases.ts`）：

```ts
"右上角": ["youshangjiao", "ysj"],
"右上角功能按钮": ["youshangjiaogongnenganniu", "ysjgnan"],
```

所以 `ysj` / `ysjgnan` 也能命中。改分组标题时记得同步这两处，否则搜索会失效。

另外 `src/types.ts` 里 `windowControlHidden` 的注释也提到了右上角：

```ts
/** 右上角功能按钮隐藏列表；不在列表内即显示。 */
windowControlHidden: WindowControlId[];
```


```tsx
const WINDOW_CONTROL_LABELS: Array<{ id: WindowControlId; label: string; hint?: string }> = [
  { id: 'search', label: '全局搜索' },
  { id: 'transfer', label: '文件中转站' },
  { id: 'image', label: '图片预览' },
  { id: 'profiles', label: '多配置', hint: '管理多个独立配置并切换当前配置' },
  { id: 'multiAccount', label: '多账号', hint: '把同一网址批量分配到 Chrome / Floorp 等浏览器 Profile' },
  { id: 'sortGroups', label: '父目录 A-Z 排列', hint: '点击后把顶部父目录按名称排序' },
  { id: 'add', label: '新增父目录' },
  { id: 'settingsQuick', label: '设置快捷入口', hint: '打开常用子设置菜单' },
  { id: 'settings', label: '设置' },
  { id: 'pin', label: '置顶钉子' },
  { id: 'minimize', label: '最小化' },
  { id: 'close', label: '关闭' },
];
```

## 9. 数据流小结

```
display.windowControlOrder  ──normalizeControlOrder()──►  actionOrder
display.windowControlHidden ──filter──────────────────►  visibleActionOrder ──► 渲染
                                                                                    │
拖动排序  handleActionDragEnd ──► updateDisplay({ windowControlOrder }) ─────────────┘
勾选显隐  DisplaySettings    ──► updateDisplay({ windowControlHidden })
外观/尺寸 DisplaySettings    ──► display.windowControlStyle / Size / Gap ──► CSS 变量
```

想加一个新按钮，通常只要改三处：
1. `src/types.ts` 的 `WindowControlId` 加 id；
2. `defaults.ts` 的 `DEFAULT_WINDOW_CONTROL_ORDER` 插入默认位置；
3. `TopBar.tsx` 的 `actionMap` 补一条（图标来自 `lucide-react`），
   需要的话再在 `DisplaySettings.tsx` 的 `WINDOW_CONTROL_LABELS` 里加一项，
   让它出现在「右上角功能按钮」的显隐勾选列表里。
