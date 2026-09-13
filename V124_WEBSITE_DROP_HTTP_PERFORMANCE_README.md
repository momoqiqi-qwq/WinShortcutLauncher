# V124 网站拖入性能与目标命中重构

本版本针对浏览器网站拖入的延迟、元数据请求开销和两条拖放路径行为差异做了集中重构。

## 1. Rust 原生 HTTP 网站元数据

- 新增 `src-tauri/src/website_metadata.rs`，从 `commands.rs` 抽离网站标题、favicon 和 favicon 源测试。
- 标题/favicon 不再为每次请求启动 `powershell.exe + Invoke-WebRequest`。
- 使用进程级复用的 `reqwest::blocking::Client`，统一连接超时、总超时、重定向和连接池策略。
- Tauri command 继续通过 `spawn_blocking` 执行阻塞 HTTP，避免阻塞主异步运行时。

## 2. 缓存与重复请求去重

- favicon 继续落本地缓存，并按站点域名复用。
- 标题新增 `website_titles.json` 持久缓存，默认有效期 7 天。
- 标题和 favicon 各自增加进程内 in-flight 去重：同一请求正在进行时，后续调用等待并共享首个结果，不再重复发网路请求。
- favicon 强制刷新仍可绕过缓存并带 no-cache 请求。

## 3. 拖入立即弹命名框

- 网站命名框先渲染；标题获取和 favicon 获取延后到对话框首帧之后启动。
- 网络速度不会再阻塞命名框出现。
- 用户选择后先创建项目，再异步补齐图标或无需弹窗模式下的晚到标题。

## 4. HTML / 原生 OLE 目标选择统一

- 新增 `useWebsiteDropController`，统一 HTML 浏览器拖放、Windows 原生 OLE 事件和文件拖放处理。
- 原生 OLE drag/drop payload 现在带主窗口 client `x/y`。
- 前端通过 `document.elementFromPoint` 将原生坐标映射回实际 DOM，并兼容常见 DPI 缩放差异。
- 优先识别 `[data-directory-id]`，因此拖到指定普通子目录时会直接落到该目录；其次才按 `[data-group-id]` 选择父分组。
- 两条网站拖入路径最终使用同一套 `resolvePreferredTarget -> handleDroppedWebLink` 逻辑。

## 5. 拖入耗时诊断

每次网站拖入在控制台输出一条相对时间线，例如：

```text
[website-drop-timing:native] Drop received 3ms → Dialog shown 18ms → Title 146ms → Favicon 310ms
```

HTML 路径使用 `website-drop-timing:html`。浏览器直接提供标题时会显示 `Title supplied ...`；禁用命名弹窗时会显示 `Dialog skipped`。

## 6. 前端结构拆分

`App.tsx` 从约 803 行降至约 345 行，新增：

- `src/hooks/useWebsiteDropController.ts`
- `src/hooks/useGlobalShortcutRouter.ts`
- `src/hooks/useOverlayRouter.ts`

`commands.rs` 从约 1243 行降至约 871 行，网站元数据已经独立到 `website_metadata.rs`。浏览器命令/文件命令可在后续版本继续独立拆分，避免在没有 Rust 工具链验证时一次扩大过多原生代码迁移范围。

## 7. 验证

- `node scripts/verify-source-fixes.mjs`：通过。
- 本次修改的 TS/TSX 文件使用 TypeScript `transpileModule(reportDiagnostics)` 做语法诊断：通过。
- 当前执行环境无法从 npm registry 完整恢复依赖，因此未能运行完整 `tsc --noEmit` / Vitest / Vite build。
- 当前执行环境没有 `cargo` / `rustc`，因此未能执行 `cargo check`；Rust 部分需要在 Windows Rust/Tauri 开发环境再做最终编译和 Firefox/Floorp OLE 实机验证。
