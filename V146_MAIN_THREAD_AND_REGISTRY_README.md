# V146 — 主线程阻塞清零（第二批）

> 承接 V145（映射文件夹卡顿修复）。V145 修的是「**每个图标**起一个 PowerShell 进程 + 扫描后批量预取」，
> V146 继续按同一条判据排查：**没标 `async` 的 Tauri 命令跑在主线程上**，任何在这种命令里起
> PowerShell、扫盘、复制文件的都会把界面冻住。这一轮清掉四处，另修掉一个原生读取自己引入的真实缺陷。

## 一、四处问题与改动

### 1. 开机自启动状态用 PowerShell 查（330–400 ms / 次）
`get_auto_start` / `set_auto_start` 各起一个 `powershell.exe` 读写
`HKCU\Software\Microsoft\Windows\CurrentVersion\Run`。实测单次 **330–400 ms**，其中几乎全是进程启动与
模块加载的固定开销（连 `Write-Output 'x'` 空脚本都要 376 ms）。设置页一打开「操作行为」卡片就要卡
约 0.4 秒，切换开关是 `set` + `get` 连跑，接近 **0.8 秒**。

→ 新增 `src-tauri/src/windows_registry.rs`，直接用
`RegGetValueW` / `RegSetValueExW` / `RegDeleteValueW` / `RegOpenKeyExW` / `RegCreateKeyExW`。
本模块**不依赖 tauri**，所以能被独立基准工程用 `#[path]` 引进去直接测（见下）。

### 2. 浏览器探测兜底走 PowerShell
`find_browser_executable` 在候选路径都不存在时，会去 `App Paths\<exe>` 注册表项找真实安装路径 ——
原来是起 PowerShell 查的。本机实测候选路径的情况：Chrome 在 `Program Files\Google\Chrome\Application\chrome.exe`、
Edge 在 `Program Files (x86)\Microsoft\Edge\Application\msedge.exe`、Firefox **两个候选都不存在**、
Floorp 在 `Program Files\Ablaze Floorp\floorp.exe`。也就是说每轮浏览器目录构建，那个**没装**的 Firefox
都要白起一个 PowerShell 进程。而 `build_browser_catalog` 不只在启动时跑：`launch_item` 在
`url_open_mode == "specified"` 时也会用它拿目标浏览器 —— 即**每次「用指定浏览器打开网址」都白等 0.4 秒**。

→ 原生 `find_app_path`：先 `HKCU` 再 `HKLM`（与系统查找顺序一致），读到后去引号、trim。

### 3. 中转站拖拽复制跑在主线程
`copy_transfer_paths_to_folder`（`src-tauri/src/transfer_station.rs`）是同步命令，内部是
`fs::copy` 与递归的 `copy_dir_all`。拖一个几 GB 的文件夹进去，界面就冻几十秒。

→ 拆出 `copy_transfer_paths_to_folder_blocking`，命令改 `pub async fn` + `crate::blocking::offload`。
调用方（`ItemCard.drop-patch.tsx`、`TransferStationPanel.tsx`、`ImageBrowserPanel.tsx`）无需改动，
`await invoke(...)` 的写法不变。

### 4. 纯 I/O 命令仍在主线程
`scan_browsers`（扫浏览器配置目录）、`save_config` / `load_config`（读写整份配置 JSON，自动保存也走它）、
`import_legacy_db_config`（读旧版 sqlite 并转换）一并挪到阻塞线程池。

→ 都改 `pub async fn` + `crate::blocking::offload`。注意 `scan_browsers` 的返回值由裸 `Vec<DetectedBrowser>`
变成 `Result<...>`（内部 `?` 传播）；前端 `src/hooks/useBrowserCatalog.ts:36` 的
`invoke<DetectedBrowser[]>('scan_browsers', { customBrowsers })` 外面本来就有 `try/catch`，成功路径不受影响。

### 明确**没有**动的
- `background_media.rs::inspect_background_media`：只读文件元数据，不做解码，本来就快。
- `commands.rs::detect_foreground_browser`：纯原生窗口 API，没有 I/O。
- `commands.rs::open_file_location`：用 `.spawn()` 起资源管理器且不等它，够快。
- `folder_mirror.rs::create_shortcuts`：生成 `.lnk` 需要 `WScript.Shell` COM，保留 PowerShell（V145 已把
  「每个文件一个进程」合并成「一次一条脚本」）。

## 二、顺手修掉的一个真实缺陷：`REG_EXPAND_SZ` 被读脏

原生读取第一版没加 `RRF_NOEXPAND`。`RegGetValueW` 会**自己**展开 `REG_EXPAND_SZ`，但它回报的
`pcbData` 仍是**未展开**口径的长度 —— 两个口径对不上，多读出来的字节就被当成字符串内容。

实测（把 `%SystemRoot%\System32` 用 PowerShell 写成 `ExpandString` 再原生读回）：

```
旧实现（PowerShell 展开）: "C:\\Windows\\System32"
新实现（修复前）        : "C:\\Windows\\System32\02"      ← 末尾多出一个 NUL 和类型数字 2
新实现（修复后）        : "C:\\Windows\\System32"          ✅ 逐字符一致
```

`2` 正是 `REG_EXPAND_SZ` 的类型值。影响面：任何用环境变量存的 `App Paths` / `Run` 值读回来都会带上
`NUL + 2` 的尾巴，浏览器探测拿到的路径会失效，自启动命令也会被写坏。

修复：`RRF_RT_ANY | RRF_NOEXPAND`，环境变量展开统一交给 `expand_environment`（不认识的名字保持
`%NAME%` 原样，与 `ExpandEnvironmentStringsW` 的行为一致）。

## 三、实测数据（独立基准工程，2000 次 / 5 次取样）

基准工程 `.workbuddy/registry-bench/` 用 `#[path = "../../../src-tauri/src/windows_registry.rs"] mod windows_registry;`
引入**要发布的那份实现**（不是另写一份等价代码），并逐字抄了改动前的 PowerShell 脚本做对照。

| 项 | 旧实现（PowerShell） | 新实现（原生注册表） | 倍数 |
| --- | --- | --- | --- |
| PowerShell 空脚本固定开销 | 351–811 ms | — | — |
| 读开机自启动 `get_auto_start` | 570–854 ms | **0.023 ms**（最快 0.011） | 约 3 万倍 |
| 查 `App Paths`（`find_registered_app_path`） | 435–762 ms | **0.023 ms**（最快 0.013） | 约 3 万倍 |

## 四、差分校验（原生 vs PowerShell，同一批键值）

| 键 | 旧实现 | 新实现 | |
| --- | --- | --- | --- |
| `Run\Yue launcher` | `"C:\Users\yile\DeskBox\DeskBox\Yue launcher.exe"` | 同左（**引号也一致**） | ✅ |
| `App Paths\chrome.exe` | `C:\Users\yile\AppData\Local\BrowserClaw\Application\chrome.exe` | 同左 | ✅ |
| `App Paths\msedge.exe` | `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe` | 同左 | ✅ |
| `App Paths\floorp.exe` | `C:\Users\yile\AppData\Local\Ablaze Floorp\floorp.exe` | 同左 | ✅ |
| `App Paths\firefox.exe` | （无） | （无） | ✅ |
| `App Paths\not-a-real-app-xyz.exe` | （无） | （无） | ✅ |
| `REG_EXPAND_SZ` 展开 | `C:\Windows\System32` | `C:\Windows\System32` | ✅ |

写入 / 读取 / 删除往返（`--rt` 模式，全程不碰 PowerShell）：
`write=Ok(())` → `read=Some("值-中文-%SystemRoot%")` → `first_delete=Ok(true)` → 读回 `None` →
`second_delete=Ok(false)`（幂等）。

## 五、关键文件

- 新增：`src-tauri/src/windows_registry.rs`（原生注册表读写，不含 tauri 依赖）
- `src-tauri/src/lib.rs`：`#[cfg(target_os = "windows")] mod windows_registry;`
- `src-tauri/src/commands.rs`：`find_registered_app_path` / `get_auto_start` / `set_auto_start` 改原生；
  `scan_browsers` / `save_config` / `load_config` 改 `async` + `offload`
- `src-tauri/src/transfer_station.rs`、`src-tauri/src/legacy_import.rs`：拆出 `_blocking` 函数体并改 `async`
- `src-tauri/Cargo.toml`：`windows-sys` features 增加 `Win32_System_Registry`
- `src-tauri/build.rs`、`scripts/verify-source-fixes.mjs`：新增 V146 一组不变量
- 版本号四处同步：`package.json` / `src-tauri/tauri.conf.json` / `src-tauri/Cargo.toml` / `README.md`

## 六、回归护栏

`src-tauri/build.rs`（编译期 panic）与 `scripts/verify-source-fixes.mjs`（prebuild 退出码）各加一组：

**require**：`windows_registry.rs` 出现 `RegGetValueW` / `RegSetValueExW` / `RegDeleteValueW` / `RRF_NOEXPAND`；
`Cargo.toml` 有 `Win32_System_Registry`；`commands.rs` 引用 `crate::windows_registry::{read_run_entry, write_run_entry, find_app_path}`；
`commands.rs` 有 `pub async fn scan_browsers` / `save_config` / `load_config`；`transfer_station.rs` 有
`pub async fn copy_transfer_paths_to_folder`；`legacy_import.rs` 有 `pub async fn import_legacy_db_config`。

**forbid**：`commands.rs` 再出现 `foreach($k in $keys)` / `Get-ItemProperty -Path $runKey` / `Remove-ItemProperty -Path $runKey`；
`transfer_station.rs`、`legacy_import.rs` 出现 `#[tauri::command]\npub fn ...`（同步版）。

## 七、验证

- `node scripts/verify-source-fixes.mjs` → OK（exit 0）
- `npx tsc --noEmit` → 0 错误
- `npx vitest run` → 35 文件 / 167 用例全过
- `cargo build --release --lib` → 通过（仅 5 条既有警告，新代码 0 警告）
- `npm run tauri:build` → `src-tauri/target/release/shortcut-launcher.exe` + NSIS 安装包

## 八、说明与限制

1. **本机基准时的环境伪像**：这台机器的 DSH 沙箱会给「镜像位于工作区 `E:\E-Develop-Project\...` 下」的
   进程套一个受限令牌，并**沿进程树继承**（连它拉起的 `powershell.exe` 子进程也一起被限制），
   表现为写 `HKCU\...\Run` 一律错误码 5。用三份字节相同的副本做路径对照实验（都经计划任务启动）：

   | 二进制位置 | 原生写真实 Run 键 |
   | --- | --- |
   | 工作区内 `.workbuddy\registry-bench\target\release\` | ❌ 错误码 5 |
   | `%TEMP%\v146probe-bench.exe` | ✅ 写入成功、全系统可见 |
   | `C:\Users\yile\DeskBox\DeskBox\v146probe-bench.exe`（**与便捷版同目录**） | ✅ 写入成功、全系统可见 |

   结论：这是工作区路径专属的沙箱伪像，**发布版 exe 所在的位置不受影响**，所以写入路径保留原生化、
   没有加 PowerShell 回退。同理，早先「写入被拒但读得到」的观察也归因于此，**读路径的等价性结论依然有效**。
2. **基准脚本自身踩的坑**：PowerShell 的 `New-Item -Path <已存在的项> -Force` 会**清空该项下已有的
   所有值**（实测 a/b/c 三个值全没了）。老版基准脚本用了它，导致「删除一个刚写成功的值却返回 false」
   的假报警 —— 实际是值已被清掉、`delete_value` 正确地返回了 `Ok(false)`。已改用
   `New-ItemProperty ... -Force`（只替换单个值），删除路径的正反用例都恢复通过。
3. `set_auto_start` 保持**同步**命令：原生写入是微秒级，不值得 async 化。`remove_run_entry` 在值本来
   不存在时返回 `Ok(false)`，调用处（`commands.rs:856`）用 `.map(|_| ())` 丢弃该布尔值，
   所以「关掉一个从没开过的自启动」仍然返回成功，行为与改动前的 PowerShell 版一致。
4. `find_app_path` 只查 `App Paths`（先 HKCU 再 HKLM），不查 `PATH` 等其他位置 —— 与旧 PowerShell 版语义一致。
5. **仍留在主线程的一处（已知，未改）**：`commands.rs:702 launch_item` 是同步命令，`url_open_mode == "specified"`
   时会经 `browser_launch_target_from_catalog`（`commands.rs:539`）**同步**构建浏览器目录。V146 已把其中的
   PowerShell 查询换成原生注册表（原来这里是每次 0.4 秒的元凶），剩下的只是配置文件目录扫描与文件系统检查。
   没有一并 async 化，是因为这个函数还要走 `shell_execute` / `find_foreground_browser` 这类窗口与 COM 相关调用，
   挪到线程池反而有风险；如后续想彻底瘦身，应单独评估。
