# Yue Launcher v0.1.117 — Floorp 拖入兼容与 Windows 构建修复固化

## 这版解决什么

v0.1.117 在 v0.1.116 的基础上处理两类问题：

1. 将此前每次更新容易被还原的 Windows / Rust 构建修复直接合入主源码，并增加构建前不变量检查。
2. 继续修复 Floorp / Firefox 系浏览器跨应用拖入网址的问题。v116 已经能解析 Gecko MIME，但仍可能在 `dragover` 阶段因为 MIME/数据尚未完整暴露而提前拒绝拖放，导致最终 `drop` 根本收不到。

## 1. Windows / Rust 构建修复已永久合入

### `src/stores/appStore.ts`

- `browserRouter: defaults.browserRouter!`

### `src-tauri/src/lib.rs`

- `MARGINS` 从 `windows_sys::Win32::UI::Controls` 导入。
- Win32 `HWND` 空值判断使用 `.is_null()`。
- `SetWindowPos` 的 `hWndInsertAfter` 空句柄使用 `null_mut()`。

### `src-tauri/src/edge_dock_native.rs`

- `HWND` / `HMONITOR` / cached handle 不再与整数 `0` 比较，统一使用 `.is_null()` / `!is_null()`。
- `cached_main`、`cached_strip` 使用 `std::ptr::null_mut()` 初始化。
- `Mode::AutoHidden` 的强制显示分支绑定 `edge`。

### `src-tauri/src/commands.rs`

- `HWND` 空值判断使用 `.is_null()`。

### `src-tauri/Cargo.toml`

- `windows-sys` features 增加 `Win32_UI_Controls`。

## 2. 防止以后更新再次还原

新增：

- `scripts/verify-source-fixes.mjs`
- `npm run verify:source-fixes`
- `package.json` 的 `prebuild` 自动执行源码修复检查。
- `src-tauri/build.rs` 在 Cargo 编译 Tauri 代码前检查同一批关键源码不变量。

因此：

- `npm run build` 前会自动检查。
- 直接运行 `cargo build --release` 也会自动检查。
- 如果后续源码合并又把这些写法还原，构建会立即明确报错，而不是静默带着旧问题继续构建。

## 3. 为什么 v116 仍可能拖不进 Floorp

v116 已加入 `text/x-moz-url`、`text/x-moz-url-data`、`text/x-moz-url-desc`、`application/x-moz-file-promise-url` 等 Gecko 格式的解析。

但旧流程仍然在 `dragenter/dragover` 阶段尝试判断“这是不是网址拖拽”，然后才决定是否 `preventDefault()`。

跨应用拖放在这个阶段处于受保护状态。Chromium 往往较早暴露 `text/uri-list` / `text/plain` 等标准格式，因此 Chrome 能工作；Floorp / Firefox 在 WebView2 接收端可能只暴露空的或不完整的 type 列表，真正字符串直到 `drop` 才可读。如果应用在 `dragover` 阶段先拒绝，浏览器就不会把最终 drop 交给页面。

## 4. v117 的 Floorp 拖入策略

### Dragover 不再依赖 MIME 白名单

主窗口现在：

- 对任何来自应用外部的拖拽先允许 `dragenter/dragover`。
- 立即 `preventDefault()` 并设置 copy feedback。
- 仅排除 Yue Launcher 自己的内部拖拽类型。
- 真正到了 `drop` 以后再读取并验证网址/文件内容。

这样 Floorp 即使在 dragover 阶段没有提供完整 MIME，也不会被提前挡掉。

### Drop 阶段增加异步 `DataTransferItem` 读取

新增 `extractDroppedWebLinkAsync()`：

1. 先走原有同步 `getData()` 解析。
2. 如果没有网址，再枚举 `DataTransfer.items`。
3. 对字符串 item 使用 `getAsString()` 读取。
4. 用读取到的 Gecko 数据重新解析 URL 和标题。

覆盖的格式包括：

- `text/x-moz-url`
- `text/x-moz-url-data`
- `text/x-moz-url-desc`
- `text/x-moz-url-priv`
- `text/x-moz-place`
- `application/x-moz-file-promise-url`
- Firefox/Floorp 虚拟 `.url` / `.website`
- 标准 `text/uri-list` / `text/plain` / `text/html`
- Chromium `DownloadURL`
- Windows `UniformResourceLocator` / `UniformResourceLocatorW`

### 防止图片被误判成网站

Gecko 拖图片时也可能附带来源 URL / file-promise URL。本版会检查 promised filename 和常见资源扩展名，普通图片/下载文件继续走文件拖入，不会因为带 URL 就被添加成网站。

### 无法读取时给出诊断

如果 Floorp 的拖放已经到达 Yue Launcher，但没有任何可读取网址，本版会显示提示，并把 DataTransfer type 摘要写入控制台。

如果检测到 `x-moz-tabbrowser-tab`，会明确提示：这是 Firefox/Floorp 的“标签页内部拖动”格式，外部 WebView 可能拿不到 URL。此时请拖：

- 地址栏左侧的站点图标；
- 地址栏里的网址；
- 网页中的普通链接。

这与“浏览器完全不支持拖入”是两回事。

## 5. 保持 `dragDropEnabled: false`

`src-tauri/tauri.conf.json` 继续保持 WebView 的原生网页拖放路径，而不是让 Tauri 的文件拖放控制器抢占 WebView drop target。浏览器网页 URL 需要由 WebView 的 HTML5 DataTransfer 路径接收。

## 6. 验证

本环境已执行：

- 持久 Windows/Rust 修复源码检查：通过。
- 旧式 handle `== 0 / != 0` 回归扫描：通过。
- 166 个 TS/TSX 文件语法转译检查：0 错误。
- `src/lib/browserDrop.ts` 单文件 TypeScript 语义编译：通过。
- 浏览器拖入运行时定向断言：8/8 通过。
- 版本号一致性检查：0.1.117。

当前执行环境没有 Cargo / rustc，因此不能在这里再次声称 `cargo build --release` 已实际完成；你上一轮列出的五类修复已经按对应形式合入，而且现在有自动防回退检查。

npm 依赖安装尝试受到当前环境 DNS / registry 网络失败影响，因此没有宣称完整 Vitest/Vite 构建通过。打包前已移除不完整的 `node_modules`。
