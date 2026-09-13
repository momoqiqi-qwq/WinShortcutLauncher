# Yue Launcher v0.1.119 - Medium Integrity / Floorp 拖放权限修复

## 这次为什么改权限模型

v116-v118 已经补过 Gecko MIME、HTML5 drop 时机和 Windows OLE URL DropTarget，但如果 Yue Launcher 主进程本身处在高于 Floorp / Firefox / Explorer 的 Integrity Level，Windows UIPI 会在应用拿到拖放数据之前阻止跨进程拖放，鼠标直接显示红色禁止符号。

实际测试已经证明：当 Yue Launcher 主进程恢复到标准 Medium Integrity 后，Floorp 拖放可以恢复。因此 v119 把“主进程保持标准 Medium”提升为应用级约束，而不是继续把 Floorp 格式兼容当成唯一解决方案。

## v0.1.119 已完成

### 1. Windows EXE manifest 固化为 asInvoker

新增：

- `src-tauri/windows-app-manifest.xml`

明确使用：

```xml
<requestedExecutionLevel level="asInvoker" uiAccess="false" />
```

并保留 Tauri 默认 Windows manifest 所需的 Common Controls v6 依赖。

这意味着 Yue Launcher 不主动请求永久管理员权限。正常从 Explorer / 开始菜单 / 自启动入口启动时，会沿用普通桌面用户的权限路径。

### 2. Tauri / WebView2 启动前检测真实 Integrity Level

新增：

- `src-tauri/src/process_integrity.rs`

程序在创建 Tauri / WebView2 窗口之前使用 Windows access token 的 `TokenIntegrityLevel` 读取真实完整性等级。

识别：

- Untrusted
- Low
- Medium
- Medium Plus
- High
- System

这里特别区分了 `Medium` 与 `Medium Plus`：只有标准 Medium 被视为正常目标状态；Medium Plus / High / System 都属于高于普通浏览器和 Explorer 的路径，会触发降权重启逻辑。

### 3. 如果仍被拉到高权限，自动用桌面 Shell token 重启

即使 manifest 是 `asInvoker`，如果用户从一个已提升的父进程启动、快捷方式被强制“以管理员身份运行”，或者其他外部启动方式把进程带到更高 Integrity Level，`asInvoker` 本身仍可能继承高权限。

因此 v119 在 `main.rs` 最早阶段执行：

```text
检测 Integrity Level
  -> 标准 Medium：正常继续
  -> Low / Untrusted：不提升，只显示诊断
  -> Medium Plus / High / System：尝试取得桌面 Shell 进程 token
       -> CreateProcessWithTokenW 重新启动 Yue Launcher
       -> 原高权限实例在 Tauri/WebView2 创建前退出
```

使用 `--yue-medium-relaunch` 作为一次性循环保护。如果桌面 Shell 自己也是高权限，或者 Windows 拒绝创建替代进程，不会无限重启；应用会继续启动并在诊断界面明确显示当前 Integrity Level。

### 4. 单个快捷项目的管理员运行能力保留

`src-tauri/src/commands.rs` 原有逻辑继续保留：

- 普通项目：`ShellExecuteW(..., "open", ...)`
- 设置为管理员运行的项目：`ShellExecuteW(..., "runas", ...)`

因此 v119 的权限模型是：

```text
Yue Launcher 主进程：标准 Medium
需要管理员权限的单个目标：按需 runas + UAC
```

不会为了运行一个管理员工具而把整个 Launcher 长期放在 High Integrity。

### 5. 设置 -> 诊断 增加 Windows 权限状态

诊断页会显示：

- 当前 Integrity Level
- RID（十六进制）
- 是否为标准 Medium
- 高于 Medium 时的 UIPI / 拖放风险提示
- 低于 Medium 时的功能受限提示

启动后如果仍不是标准 Medium，也会给出一次通知，不再让“红色禁止符号”变成无提示故障。

### 6. v118 原生 OLE 拖放保留为兼容兜底

v118 的 Windows `IDropTarget` 仍保留：

- `CF_HDROP`
- `UniformResourceLocatorW`
- `UniformResourceLocator`
- `text/x-moz-url`
- URL / file-promise / LINK / COPY 等路径

但架构定位已调整：

1. 先保证主进程权限正确；
2. 再由原生 OLE 层兼容不同浏览器的数据格式；
3. 前端 HTML/DataTransfer 逻辑继续作为业务识别层。

这样不会再把 Windows 权限阻断误判成 Floorp MIME 问题。

## 代码优化

### Integrity 状态模型精简

前后端只保留真正需要的派生状态：

- `isMedium`
- `isAboveMedium`

删除重复的 `isHighOrSystem`、`dragDropCompatible` 等容易产生判断分叉的字段。

### Windows 命令行参数改成 UTF-16 原生转义

自动重启时不再先把 `OsStr` 转成 lossy UTF-8 字符串，而是直接对 Windows UTF-16 参数执行引号 / 反斜杠转义，避免非常规 Windows 路径或参数在重启过程中被替换字符破坏。

### build.rs 防回退检查改进

之前一旦 build script 输出 `cargo:rerun-if-changed`，Cargo 会只监听声明的输入。v119 现在把所有参与持久修复检查的关键源码都加入 `VERIFIED_INPUTS`，包括：

- `appStore.ts`
- `lib.rs`
- `edge_dock_native.rs`
- `commands.rs`
- `Cargo.toml`
- `native_browser_drop.rs`
- `tauri.conf.json`
- `process_integrity.rs`
- `windows-app-manifest.xml`
- `main.rs`

以后直接执行 `cargo build` 时，这些文件任一变更都会重新触发持久修复检查。

## v119 建议测试顺序

Windows release 编译后建议依次测试：

1. 普通双击启动 Yue Launcher，打开 设置 -> 诊断，确认显示 `Medium · RID 0x2000`。
2. Floorp 地址栏左侧站点图标 -> Yue Launcher，确认红色禁止符号消失并可以创建网址项目。
3. Floorp 网页链接 -> Yue Launcher。
4. Firefox 同样测试。
5. Chrome / Edge / Brave 原有网址拖入回归。
6. Explorer 文件 -> 主界面 / 中转站 / 图片浏览器。
7. 将某个快捷项目设置为“管理员运行”，确认点击时仍出现 UAC，目标程序提升，而 Yue Launcher 自身诊断仍为 Medium。
8. 故意右键“以管理员身份运行”启动 Yue Launcher：观察高权限实例是否快速退出并由 Medium 实例替换；诊断最终应回到 Medium。
9. 如果自动降权失败，检查诊断显示的实际等级，并确认没有进入反复重启循环。

## 下一版本 v0.1.120 建议

### A. Protected-operation broker（优先级高）

把未来真正需要管理员权限的操作做成独立、短生命周期 helper，例如：

- 向 `Program Files` / `Windows` 等受保护目录复制或移动文件；
- 修改 HKLM；
- 安装系统级组件。

主 Launcher 永远 Medium，只在特定操作上通过 UAC 启动 helper。这样既保留拖放兼容，也把高权限代码面缩到最小。

### B. 拖放诊断记录器（优先级高）

增加一个可开关的诊断日志，记录一次外部拖入的：

- 当前 Integrity Level；
- OLE format 列表；
- source effect / selected effect；
- URL / file 解析走了哪条路径；
- 最终前端消费组件。

以后遇到 Floorp / Firefox / Zen / 新 Chromium 变体时，不需要再次凭现象猜是哪一层失败。

### C. Windows 权限与拖放自动回归矩阵（优先级中）

在 Windows CI 或本机测试脚本中固定检查：

- manifest 必须是 `asInvoker`；
- release EXE 的 Integrity Level 启动路径；
- 普通启动 vs 强制管理员启动后的自我降权；
- `runas` 单项目能力不回退；
- OLE 文件 / URL 两类基础 payload。

### D. 原生 Windows 依赖收敛（优先级中）

当前项目同时使用 `windows-sys 0.59` 与 `windows 0.61`。后续可以评估把新增 Windows 模块逐步统一到一套绑定，以减少依赖体积和 API 风格混用。但这项不建议为了“整洁”仓促重写 v118 OLE 层，应以 Windows release 回归稳定为前提。

## 构建说明

当前交付环境没有 `cargo` / `rustc`，因此本说明不声称 v119 已完成 Windows Rust release 编译。

已完成的检查记录见 `V119_TEST_RESULTS.txt`。最终必须在你的 Windows Rust / Tauri 构建环境执行实际 release build，并以“设置 -> 诊断显示标准 Medium + Floorp 红色禁止符号消失”作为关键验收。
