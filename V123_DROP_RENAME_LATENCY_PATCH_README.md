# v0.1.123 网站拖入命名界面延迟修复补丁

## 问题根因

浏览器拖入网址后，如果拖拽数据没有直接携带标签页标题，`App.tsx` 会在打开“新建项目命名”界面之前执行：

- `fetch_website_title`
- Rust 端再同步启动 PowerShell `Invoke-WebRequest`
- 单次网页标题请求超时上限为 8 秒

同时旧逻辑会在用户确认添加之前就启动 favicon 获取，也会启动 PowerShell / 网络请求。

因此慢站点、DNS、网络、PowerShell 冷启动或 favicon 源响应较慢时，命名 UI 会被网络工作挡在后面，表现为拖入后短暂停顿甚至明显卡顿。

## 本补丁调整

### 1. 命名界面先显示，标题后台补齐

- 拖入网站后不再 `await` 网页标题再打开命名界面。
- 先使用已有拖拽标题；没有标题时先用网址默认名称立即打开命名界面。
- 命名界面完成首帧渲染后，再异步抓取网页标题。
- 如果标题抓取成功且用户尚未手动编辑“标签页标题命名”，自动补入真实网页标题。
- 如果用户已经开始编辑，后台标题不会覆盖用户输入。

### 2. 用户确认前不下载 favicon

- favicon 获取移动到用户确认添加网站之后。
- 取消命名时不再产生无意义的 favicon 网络请求。
- 添加完成后图标仍按原逻辑后台补齐。

### 3. PowerShell 网络任务移出 Tauri 阻塞执行路径

`fetch_website_title` 与 `fetch_website_favicon` 改为 async command，内部使用 `tauri::async_runtime::spawn_blocking` 执行现有阻塞 PowerShell 逻辑，减少阻塞运行时线程带来的界面卡顿风险。

### 4. 防回退检查同步更新

- `scripts/verify-source-fixes.mjs`
- `src-tauri/build.rs`

新增“命名界面先渲染、标题后加载”的静态保护。

## 建议 Windows 实机回归

1. Chrome / Edge：拖地址栏网址、站点图标、网页链接。
2. Firefox / Floorp：拖地址栏站点图标、地址栏网址、网页普通链接。
3. 分别测试标题返回快、返回慢、超时/断网的网站。
4. 弹窗出现后立即输入标题，确认后台标题不会覆盖手动输入。
5. 弹窗出现后立即点击“网站地址命名”确定，确认无需等待标题。
6. 弹窗直接取消，确认不会继续做 favicon 下载。
7. 关闭“拖入网站后显示命名选择界面”，确认网站仍能立即添加并在后台补标题/图标。

## 本环境校验说明

- `node scripts/verify-source-fixes.mjs`：通过。
- 当前容器没有 Rust/Cargo 工具链，无法在此执行 `cargo check` / Windows Tauri release 构建。
- 压缩包未携带 `node_modules`，本环境尝试安装依赖时受网络/执行时限影响未完成，因此没有声称完成 `npm test` / `npm run build`。
