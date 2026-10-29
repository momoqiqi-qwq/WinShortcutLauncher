# V188 图片卡片（右键「添加图片」）

## 这一版加了什么

空白处右键菜单里多了一项 **添加图片**，位置在「添加文件夹」下面：

- 一次可以选好几张（png / jpg / webp / gif / bmp / avif / svg / ico 等，见
  `src/lib/imageCard.ts` 的 `IMAGE_CARD_EXTENSIONS`）。
- 选进来的图片不再画成「系统图标 + 名字」，而是**图片本身铺满卡片**，名字压在
  底部一层渐变遮罩上。
- 卡片右下角这类手柄能拖大小：鼠标进卡片时边框与四角浮出淡淡的手柄，拖边只改
  一个方向、拖角两个方向一起改；松手才写进配置。

## 为什么做成「项目」而不是新目录类型

图片要能跟着项目一起排序、拖到别的子目录、跨配置带走，所以它是
`ShortcutItem` 的一个可选字段：

```ts
imageSize?: ImageCardSize;        // { width, height }
imageFit?: 'cover' | 'contain';   // 默认 cover
```

有任何一项带 `imageSize`，这张卡就走图片模式（`isImageCard`）。没有这个字段的
项目渲染和以前一模一样。

## 图片怎么显示出来的

**没有**用 `read_icon_as_data_url` 那套整文件 base64 —— 几 MB 的原图会直接吃内存，
还会顶满 localStorage（图标缓存上限 2MB / 180 张）。图片卡片走 Tauri 的 asset 协议：

1. 渲染前调用新命令 `allow_image_preview(path)`（`src-tauri/src/image_card.rs`），
   把**这一张图**加进 asset 协议作用域（失败时退回它所在文件夹、非递归）。
2. 前端拿 `convertFileSrc(path)` 得到 `http://asset.localhost/...` 塞进 `<img>`，
   按卡片尺寸由 WebView 自己解码缩放。

作用和 `html_folder::allow_html_preview` 完全一样：作用域是运行时的，重启就没了，
所以每张图卡片挂载时都授权一次（重复 add 幂等，成本只有一次路径比较）。

## 尺寸

| | 值 | 位置 |
| --- | --- | --- |
| 默认 | 240 × 180 | `defaultImageCardSize()` |
| 最小 | 96 × 96 | `clampImageCardSize` |
| 最大 | 960 × 960 | 同上 |

拖拽时尺寸只进 React 状态（`liveImageSize` + ref），`pointerup` 才
`updateItem(item.id, { imageSize })` 落盘；拖左边 / 上边时额外补一个
`translate` 让被拖的那条边黏住光标（flex 流里卡片位置本身不会动）。

手柄是 8 个透明 `<span>`（`.image-card-handle`），`pointerdown` 里
`preventDefault + stopPropagation`，否则会被卡片自己的单击/双击判定或 dnd-kit
拖拽吃掉。

## 顺手换掉网格

`.items-grid` 从 CSS Grid 换成了 `flex-wrap`。原因：grid 的列宽是
`minmax(var(--item-card-width), var(--item-card-width))` 固定的，图片卡片比普通
卡片大时只会溢出压住邻居。普通卡片宽度本来就是 `--item-card-width`，所以行观感
不变；`position: relative` 保留，同色成组框照旧按卡片 `offsetLeft/offsetTop` 定位。

## 镜像目录里的降级

开始菜单、映射文件夹这类镜像子目录的内容来自真实文件夹，配置里没有对应项目，
`imageSize` 没地方存 —— 在那里点「添加图片」按普通添加处理（系统图标 + 名字）。

## 设置项

设置 → 右键菜单 → 空白处，新增 **添加图片** 开关（`areaContextMenuHiddenItems`
体系，`AREA_CONTEXT_MENU_IDS` 已同步，测试断言也一起改了）。

## 改动文件

- `src/types.ts`（`ImageCardSize`、`ShortcutItem.imageSize/imageFit`、`addImage` id）
- `src/lib/imageCard.ts`（新建：扩展名、夹取、`allowImagePreview`）
- `src/components/ContentArea/ItemCard.tsx` / `ItemCard.css`（图片模式 + 8 手柄）
- `src/components/ContentArea/ContentArea.css`（`.items-grid` flex 化）
- `src/components/ContextMenu/AreaContextMenu.tsx`（菜单项 + 选图 + 生成带尺寸的项目）
- `src/stores/appStore/normalizers.ts`（读配置时校验 imageSize / imageFit）
- `src/lib/experienceSettings.ts`、`src/components/Settings/ContextMenuSettingsSection.tsx`
- `src-tauri/src/image_card.rs`（新建：`allow_image_preview`）、`src-tauri/src/lib.rs`（注册）
