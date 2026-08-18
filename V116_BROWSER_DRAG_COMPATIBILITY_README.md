# Yue launcher v0.1.116 - 浏览器拖入网址兼容

## 问题原因

v0.1.115 的网页拖入逻辑存在一个入口/解析不一致的问题：

- `extractDroppedWebLink()` 已经尝试读取部分 Firefox / Gecko 格式，例如 `text/x-moz-url-data`；
- 但 `hasDroppedWebLinkType()` 的 dragenter / dragover 放行列表只包含少数类型，例如 `text/x-moz-url`；
- 当 Floorp 只暴露 `text/x-moz-url-data`、`text/x-moz-url-desc` 或 Gecko 虚拟 URL 文件格式时，应用不会在 dragover 阶段 `preventDefault()`，因此 drop 根本无法进入真正的 URL 解析逻辑。

这也是 Floorp 看起来“拖不进来”的直接原因之一。

## 本版修改

### 1. 把浏览器拖拽解析拆成独立兼容层

新增：

- `src/lib/browserDrop.ts`
- `src/lib/__tests__/browserDrop.test.ts`

`App.tsx` 不再自己维护一大段浏览器格式解析，统一调用兼容层。

### 2. Gecko / Floorp / Firefox 系格式

新增或补全：

- `text/x-moz-url`
- `text/x-moz-url-data`
- `text/x-moz-url-desc`
- `text/x-moz-url-priv`
- `text/x-moz-place`
- `text/x-moz-text-internal`
- Gecko 虚拟 `.url/.website` 文件
- `application/x-moz-file-promise-url` + `.url/.website` 目标文件名组合

`text/x-moz-place` 会读取其中的 `uri/url` 和 `title/name`。

### 3. Windows / Chromium 常见格式

继续支持并补强：

- `text/uri-list`
- `text/plain`
- `text/html`
- `text/url`
- `text/x-url`
- `application/x-url`
- `URL`
- `UniformResourceLocator`
- `UniformResourceLocatorW`
- `DownloadURL`（只在明显是网页/Internet Shortcut 时按网站处理）

另外增加 `text/*url*` 类型的安全回退，降低浏览器更新或 Chromium 壳浏览器自定义 MIME 名称造成再次失效的概率。

### 4. 虚拟 Internet Shortcut 文件

某些浏览器在 Windows 上不是直接给目标应用文本 URL，而是交给系统一个虚拟 `.url/.website` 文件。

本版会直接读取 DataTransfer 中的 File 内容：

- 支持 `[InternetShortcut]` + `URL=...`
- 支持 UTF-8
- 支持 UTF-16LE BOM / 常见 NUL 交错文本
- 支持 UTF-16BE BOM

如果 WebView 无法读取虚拟文件内容，仍会回退到原来的真实路径 `.url` 读取逻辑。

### 5. 防止把图片拖入误当网站

Firefox/Gecko 拖图片时也可能带 `text/x-moz-url-data` 或 `application/x-moz-file-promise-url`，内容是图片资源 URL。

v0.1.116 会检查：

- DataTransfer 中是否存在非 `.url/.website` 文件；
- Gecko file-promise 的目标文件名是否为普通图片/文件。

如果是普通文件资源，保持走文件拖入，不会因为附带 URL 就错误创建网站快捷方式。

## 兼容目标

本版不是按浏览器进程名硬编码，而是按拖拽数据格式兼容，因此主要覆盖：

- Gecko / Firefox 系：Floorp、Firefox、Waterfox、LibreWolf 等；
- Chromium 系：Chrome、Edge、Brave、Vivaldi、Opera，以及多数使用 Chromium 拖拽格式的浏览器壳；
- Windows Internet Shortcut / URL clipboard alias。

不同浏览器版本、扩展或浏览器自身的标签页拖动交互仍可能改变它最终暴露给 Windows/WebView 的格式，但本版已经把当前常见格式和通用 URL fallback 集中到一个兼容层，后续扩展不再需要改 `App.tsx` 主逻辑。

## 版本

- Yue launcher: `0.1.116`
- 基于：`0.1.115`
