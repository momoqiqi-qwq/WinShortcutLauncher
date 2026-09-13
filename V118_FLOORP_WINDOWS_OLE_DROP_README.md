# Yue Launcher v0.1.118 - Floorp / Firefox Windows 原生网址拖放修复

## 问题现象

在 Floorp / Firefox 中把网址、地址栏站点图标或网页链接拖向 Yue Launcher 时，鼠标直接显示 Windows 的“红色禁止”符号，无法放下。

这个现象说明拖放在 Windows / WebView2 的原生 OLE 层就已经被拒绝，前端的 `dragover` / `drop` / `DataTransfer` 逻辑没有机会接收到最终 drop。v0.1.117 增强 Gecko MIME 解析是必要兼容，但无法处理这种“进入 HTML 事件之前已被拒绝”的情况。

## v0.1.118 的处理

### 1. 新增 Windows 原生 OLE `IDropTarget`

新增：

- `src-tauri/src/native_browser_drop.rs`

应用显示主窗口后，会为 Yue Launcher 主窗口和现有子 HWND 注册自己的 Windows OLE DropTarget。它在原生层先判断外部拖放是否包含可处理的数据，并在 `DragEnter` / `DragOver` 阶段返回允许的拖放效果，避免 Floorp / Firefox 的网址拖拽在到达前端之前被 WebView2/Windows 判成 `DROPEFFECT_NONE`。

### 2. 同时接受 LINK 和 COPY

浏览器拖网址时源端可能提供 `DROPEFFECT_LINK`，文件拖放通常提供 `DROPEFFECT_COPY`。v118 会根据源端允许的效果选择：

- URL 优先 `DROPEFFECT_LINK`
- URL / 文件也支持 `DROPEFFECT_COPY`
- 真正不支持的载荷才返回 `DROPEFFECT_NONE`

### 3. 原生读取 Firefox / Floorp / Windows URL 格式

原生 DropTarget 覆盖：

- `UniformResourceLocatorW`
- `UniformResourceLocator`
- `text/x-moz-url`
- `text/x-moz-url-data`
- `text/x-moz-url-desc`
- `text/x-moz-url-priv`
- `application/x-moz-file-promise-url`
- `application/x-moz-file-promise`
- `text/uri-list`
- `text/plain`
- `CF_UNICODETEXT`
- `CF_TEXT`
- `text/x-moz-tabbrowser-tab`（用于诊断）

其中 `text/x-moz-url` 会按 Firefox 常见的“第一行 URL、第二行标题”方式读取。

### 4. 文件拖入能力一起保留

因为 v118 会接管 Windows OLE DropTarget，所以同时实现 `CF_HDROP` 文件路径读取，并把文件路径通过统一事件发给前端，避免影响原有：

- 主界面文件/目录拖入
- 文件中转站
- 图片浏览器

### 5. 新增原生到前端的事件桥

新增：

- `src/lib/nativeExternalDrop.ts`
- `native-external-drop`
- `native-external-drag-state`

`src/App.tsx` 会优先消费原生 URL；Transfer Station / Image Browser 会消费原生文件路径。

如果 Windows 已经接受 drop，但没有提取到 URL/文件，仍会显示格式诊断。检测到 `text/x-moz-tabbrowser-tab` 时，会提示改拖地址栏左侧站点图标、地址栏网址或网页链接。

### 6. 继续保留 v117 的 HTML5 / Gecko 兼容逻辑

`dragDropEnabled` 仍保持 `false`，现有 HTML `dragover/drop` + Gecko `DataTransferItem.getAsString()` 逻辑继续作为兼容路径；但 Floorp 在 Windows 上不再依赖 HTML 层先获得 drop 才能工作。

### 7. 防回退检查扩展

`npm run build` 前的 `scripts/verify-source-fixes.mjs` 和 `src-tauri/build.rs` 已增加 v118 关键项检查，包括：

- Windows `windows = 0.61` 依赖
- `native_browser_drop::install(app.handle())`
- `RegisterDragDrop`
- `UniformResourceLocatorW`
- `text/x-moz-url`
- `DROPEFFECT_LINK`
- `native-external-drop`
- `dragDropEnabled: false`
- 主界面 / 文件中转站 / 图片浏览器原生事件桥

后续如果更新源码时意外还原这些关键修复，构建前会直接报出缺失项。

## 建议测试顺序

在 Windows 上编译 v118 后，用 Floorp 依次测试：

1. 拖地址栏左侧的网站图标到 Yue Launcher。
2. 选中地址栏完整 URL 后拖入。
3. 从网页正文拖一个普通超链接。
4. 从资源管理器拖一个普通文件到主界面。
5. 打开文件中转站后拖文件。
6. 打开图片浏览器后拖图片。

最关键的观察点是第 1 步：鼠标进入 Yue Launcher 窗口后不应再直接显示红色禁止符号。如果 Windows 已允许 drop 但仍无法提取 URL，应用现在会显示它实际检测到的拖放格式，用于继续定位。

## 构建说明

本次环境没有 Cargo / rustc，因此没有声称 v118 已在这里完成 Windows Rust release 编译。新增原生模块是按当前工程的 Tauri/Wry Windows 依赖线使用 `windows 0.61` 编写，并已完成源码级与前端语法级检查。最终仍需要在你的 Windows Rust 构建环境执行实际 `cargo` / Tauri release 编译。
