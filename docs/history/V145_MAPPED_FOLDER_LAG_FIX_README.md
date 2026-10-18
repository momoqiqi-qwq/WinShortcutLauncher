# V145 — 映射文件夹卡顿修复

## 现象

切到「映射文件夹子目录」、或往里面拖东西时，整个窗口（有时连带整机）卡住。
文件夹里的条目越多越明显；开始菜单子目录同样有，只是没这么严重。

## 根因：三条链路叠在一起

### 1. 取图标的命令跑在主线程上

Tauri 的官方文档写得很直白：

> Async commands are executed on a separate async task using `async_runtime::spawn`.
> **Commands without the _async_ keyword are executed on the main thread**
> unless defined with _`#[tauri::command(async)]`_.

而 `icon::get_file_icon` 当时是**同步命令**，函数体里 `Command::new("powershell.exe")`
并 `output()` 等它跑完。实测单次调用：

| 阶段 | 耗时 |
| --- | --- |
| `powershell.exe` 进程启动 + 模块加载 | ~400 ms |
| 脚本内 `Add-Type` 现场编译 C# | ~126 ms |
| `ExtractIconEx` + 编码 PNG + base64 | ~35 ms |
| **合计** | **~563 ms** |

映射文件夹用的是 `EntryFilter::All`（**文件与文件夹全部列出**），
开始菜单用的是 `EntryFilter::ShortcutsOnly`。所以同样是镜像目录，
映射文件夹的条目数通常高一个数量级 —— 这就是为什么卡的是它。

### 2. 扫描完就把所有图标全取一遍

`mappedSlice.ts` / `startMenuSlice.ts` 在 `refreshMappedFolder` / `refreshStartMenu`
里 `void hydrateIcons(...)`，对**每一个**条目各发一次 `get_file_icon`。
`iconCache` 的 `enqueue` 限了 6 路并发，但**命令本身在主线程串行**，
6 路并发形同虚设：N 个条目 ≈ N × 560 ms 的主线程占用。

100 个条目的映射文件夹 ≈ 56 秒界面冻结。

### 3. 每个图标一个进程

就算异步了、就算懒加载了，每个图标仍是一次 `powershell.exe` +
一次 `Add-Type` 现场编译。几十个图标同时挤 6 路并发，
CPU 与内存的尖峰本身也会让整机发顿。

## 修法

| # | 改动 | 位置 |
| --- | --- | --- |
| 1 | 重活命令全部 `async` + `spawn_blocking` | 新增 `src-tauri/src/blocking.rs`；`icon.rs`、`mapped_folder.rs`、`start_menu.rs`、`commands.rs` |
| 2 | 切片不再批量预取图标，交给 `ItemCard` 视口懒加载 | `mappedSlice.ts`、`startMenuSlice.ts` |
| 3 | 原生取图标（shell32 + gdi32 + PNG 编码），PowerShell 只兜底 | 新增 `src-tauri/src/icon_native.rs` |
| 4 | 拖入多个文件时合并成一次 PowerShell | `src-tauri/src/folder_mirror.rs` |

### 原生取图标的四步

```text
SHGetFileInfoW(SHGFI_ICON | SHGFI_LARGEICON)   → HICON（走系统关联，.lnk / 普通文件 / 文件夹都行）
GetIconInfo + GetObjectW                       → 彩色位图与真实尺寸
CreateDIBSection(32bpp, 负高度) + DrawIconEx    → 合成到顶向下 DIB（alpha 图标与 AND 掩码图标都对）
反预乘 + png 编码 + base64                      → data:image/png;base64,...
```

**为什么要反预乘**：`DrawIconEx` 在 32bpp 目标上是**按 alpha 混合**画的，
而目标 DIB 初始全 `(0,0,0,0)`，于是 `out = icon × alpha / 255` —— 被预乘了一次。
这种数据直接交给浏览器，半透明边缘会偏暗（浅色主题下能看到一圈暗边）。
逐像素反预乘即可还原。

## 实测数据

同一台机器，同一批路径：

| 指标 | 旧（PowerShell / 图标） | 新（原生） |
| --- | --- | --- |
| 单次耗时（含进程启动） | ~563 ms | 1.3 – 24 ms |
| 平均（13 个路径 × 20 轮 = 260 次） | ~146 s（外推） | **2.78 ms/图标**，合计 722 ms |
| 文件夹图标 | **取不到**（`ExtractIconEx` 对目录无效） | 正常返回 |
| 输出格式 | `data:image/png;base64,` | 完全一致 |

### 与旧实现的逐像素差分

把「旧 PowerShell 实现」和「新原生实现」对同一批 8 个路径各出一张 PNG，
用 `System.Drawing` 逐像素比对：

| 路径 | 尺寸 | 可见像素（alpha ≥ 128）最大通道差 | 差 > 8 的可见像素 |
| --- | --- | --- | --- |
| `notepad.exe` | 35×35 | 3 | 0 |
| `explorer.exe` | 35×35 | 2 | 0 |
| `shell32.dll,3`（带下标） | 35×35 | 2 | 0 |
| `win.ini` | 35×35 | 2 | 0 |
| `drivers\etc\hosts` | 35×35 | 2 | 0 |
| `Administrative Tools.lnk` | 35×35 | 2 | 0 |

- **alpha 通道逐像素完全一致**（差异像素数 0）。
- 剩下 1–3 的通道差来自「预乘 → 反预乘」的取整，肉眼不可见。
- 大差异（最大 127）只出现在 alpha < 128 的近透明像素上，渲染时不可见。

## 关键文件

```text
src-tauri/src/icon_native.rs                        新增：SHGetFileInfoW + GDI + PNG 的原生取图标
src-tauri/src/blocking.rs                           新增：async 命令里把同步活扔进 spawn_blocking
src-tauri/src/icon.rs                               get_file_icon / read_icon_as_data_url 改 async，原生优先、PowerShell 兜底
src-tauri/src/mapped_folder.rs                      6 个命令全部 async
src-tauri/src/start_menu.rs                         6 个命令全部 async
src-tauri/src/commands.rs                           resolve_lnk / get_file_info 改 async（内部拆出 *_blocking）
src-tauri/src/folder_mirror.rs                      create_shortcuts 合并成一次 PowerShell
src/stores/appStore/slices/mappedSlice.ts           去掉批量预取图标
src/stores/appStore/slices/startMenuSlice.ts        去掉批量预取图标
src-tauri/build.rs                                  新增 V145 不变量检查（编译期就拦住回退）
scripts/verify-source-fixes.mjs                     同步的 prebuild 检查
src/stores/appStore/__tests__/mappedFolderPerformance.test.ts   新增：一次扫描只发一次 invoke
```

## 回归护栏

卡顿是「三个地方同时做对了才不卡」，所以每个点都钉了不变量：

- `build.rs`（编译期 panic）+ `verify-source-fixes.mjs`（prebuild 退出码）：
  - `icon.rs` 必须含 `pub async fn get_file_icon`，且**不许**再出现 `#[tauri::command]\npub fn get_file_icon`；
  - `icon.rs` 必须引用 `crate::icon_native::extract_icon_data_url`；
  - `icon_native.rs` 必须用 `SHGetFileInfoW` 与 `DrawIconEx`；
  - `Cargo.toml` 必须有 `png = "0.17"`；
  - `mapped_folder.rs` / `start_menu.rs` 的关键命令必须是 `pub async fn`；
  - `folder_mirror.rs` 必须有 `link_commands.join`（拖入合并）；
  - `mappedSlice.ts` / `startMenuSlice.ts` **不许**再出现 `resolveIconDataUrl`。
- vitest：`mappedFolderPerformance.test.ts` 断言一次 `refreshMappedFolder` 只发一次 invoke，
  且扫描出来的条目不带预置 `icon`。

## 验证

- `npm run typecheck` — 0 错误
- `npm test` — 35 文件 / 167 用例全过
- `cargo build --release --lib` — 通过（仅既有 5 条警告）
- 原生取图标：13 个路径 × 20 轮 = 260 次全部产出合法 PNG（唯一失败项是机器上并不存在的 `mspaint.exe`）
- 稳定性：同一批路径连跑 5 次，0 失败
- 与旧实现逐像素差分：可见像素最大差 ≤ 3/255

## 已知限制

1. 原生实现取的是**系统大图标**（32×32 一档），与旧实现一致；界面把图标放大到
   `display.iconSize` 时仍是放大显示，没有换成 jumbo（256×256）图标。
2. 原生拿不到图标时仍会回退到 PowerShell 脚本（现在是异步的，不会再冻界面），
   但那种情况下单个图标仍要 ~560 ms。
3. 扫描仍然只扫根目录一层（不递归子文件夹），与 V140 一致。
