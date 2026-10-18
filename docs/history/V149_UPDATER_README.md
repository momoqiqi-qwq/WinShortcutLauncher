# V149 版本说明：安装包更新与下载位置自动检测

> 需求原文：「如果使用 setup exe 来更新，自动检测软件下载地方，默认下到之前下到的地方。」
> 本版在「关于」页补上完整的检查更新 / 下载安装包 / 运行安装包链路，
> 并让**更新包默认落到哪里**这件事由程序自己判断：先看你上次下到哪，再看程序装在哪，
> 再退到系统下载文件夹，最后用临时目录兜底。

## 一、默认下载位置是怎么定的

| 顺序 | 来源标记 | 取哪个目录 | 通过条件 |
| --- | --- | --- | --- |
| 1 | `remembered` | 用户上次下载更新包的位置（`experience.installerDownloadDir`） | 目录存在 + 实测可写 |
| 2 | `app` | **当前程序所在目录**（`current_exe_dir()`，即软件装在哪） | 目录存在 + 实测可写 |
| 3 | `downloads` | 系统下载文件夹（`%USERPROFILE%\Downloads`） | 目录存在 + 实测可写 |
| 4 | `temp` | 系统临时目录 | 最后兜底，不再往下退 |

「实测可写」不是看路径字符串，而是**在目录里真写一个探针文件**再删掉
（`.yue-launcher-write-probe-<pid>`）：装在 `Program Files` 里的版本、被策略锁住的目录会在这里被排出掉，
而不是等下载到一半才报错。界面上会直接说明本次默认位置**取自哪一档**
（`describeDownloadSource()`：上次下载的位置 / 软件所在目录 / 系统下载文件夹 / 临时目录）。

同时判断「是不是安装版」的另一条线索：exe 同目录存在 `uninstall.exe` 即视为安装版
（`looks_like_installed_build`），运行安装包时会把该目录作为安装目标传给 NSIS（`/D=`），
让更新装回原来的位置，而不是塞进默认目录。

## 二、后端

新增 `src-tauri/src/updater.rs`：

| 项 | 内容 |
| --- | --- |
| 版本来源 | `https://api.github.com/repos/momoqiqi-qwq/WinShortcutLauncher/releases/latest`（`RELEASE_API`），超时 15 秒 |
| 版本比较 | `parse_version()` → `(major, minor, patch)`，`is_newer_version()` 逐段比大小，不做字符串比较 |
| 资产挑选 | `installer_index()` / `reorder_assets()` 把 `*-setup.exe` 排到最前，前端 `pickInstallerAsset()` 用同一规则 |
| 下载 | `download_blocking()`：先建父目录，写 `<名字>.part`，读完删除旧文件再 `rename`，失败不留半成品；每 128 KB 读一块（`DOWNLOAD_BUFFER_BYTES`），进度事件按 512 KB 节流（`PROGRESS_MIN_BYTES`） |
| 文件名 | `sanitize_file_name()` 拒绝包含 `/`、`\`、`..` 的资产名 |
| 安装 | `launch_installer_blocking()`：写临时脚本 `yue-launcher-update-<ms>.cmd`（`ping -n 3` 延迟 → `start "" "<installer>"` → 自删），用 `cmd.exe /C start "" /min <script>` 分离启动；`exit_after` 时本程序退出 |
| 超时 | 检查 15 秒（`CHECK_TIMEOUT`），下载 15 分钟（`DOWNLOAD_TIMEOUT`） |

四个命令（全部 `async` + `offload()` 到阻塞线程，符合 V145/V146 定下的规范）：
`check_update(current_version)`、`get_update_locations(preferred_dir)`、
`download_installer(app, url, directory, file_name)`、`launch_installer(app, installer_path, install_dir, silent, exit_after)`。
`get_update_locations` **不联网**，只做本机目录探测，所以打开设置页就能立刻显示默认位置。

`reqwest` 未启用 `json` feature，版本接口用 `response.text()` + `serde_json::from_str` 解析，没有为此新增依赖特性。

## 三、前端

| 位置 | 改动 |
| --- | --- |
| `src/lib/updater.ts`（新增） | 类型 + `invoke` 封装 + 纯函数 `parseVersion` / `isNewerVersion` / `pickInstallerAsset` / `formatBytes` / `describeDownloadSource` |
| `src/components/Settings/AboutSettingsSection.tsx` | 新增「检查更新」区块：默认位置与来源说明、当前程序路径、检查更新、下载（带百分比进度）、打开所在文件夹、运行安装包并退出、更改下载位置…、恢复自动检测 |
| `src/components/Settings/Settings.css` | 追加 `.about-update-block` 系列样式（含进度条与加载转圈） |
| `src/types.ts` / `src/lib/experienceSettings.ts` | `ExperienceSettings` 新增 `installerDownloadDir: string`，默认 `''`，`normalizeExperience` 对非字符串回落空串 |
| `src/stores/appStore/persistence.ts` | `APP_STORE_VERSION` 24 → 25（新字段由 `normalizeExperience` 补默认，无需专门迁移分支） |
| `src/lib/__tests__/updater.test.ts`（新增） | 10 个用例：版本解析/比较、安装包挑选优先级、字节格式化、来源文案 |

「恢复自动检测」= 清空 `installerDownloadDir`，下次就重新按顺序探测；「更改下载位置…」走目录选择框写下该目录。

## 四、兼容与约束

- 旧配置（v24 及以前）读入后 `installerDownloadDir` 为空串，行为就是「按顺序自动检测」，与需求默认一致。
- 记忆的下载目录**不复用**于别的功能，只是更新包默认落点，不参与任何路径重写。
- 下载只从 Release 资产给的 `browser_download_url` 取文件，不另设镜像；文件名沿用资产名（已过安全字符校验）。
- 运行安装包时默认传 `/D=<当前程序目录>`；`silent` 为 true 才附加 `/S`，界面上默认走正常安装（可见界面）。

## 五、验证与构建

| 项目 | 结果 |
| --- | --- |
| `cargo check --release --lib` | 0 错误（仅既有的 `unused_import` / `unused_mut` 警告） |
| `npx tsc --noEmit` | 0 错误 |
| `npx vitest run` | **37 文件 / 190 用例全过** |
| `node scripts/verify-source-fixes.mjs` | `Persistent Windows/Rust source fixes: OK` |
| `tauri build` | 产出 `shortcut-launcher.exe` 与 NSIS 安装包 `Yue launcher_0.1.149_x64-setup.exe` |

顺带修掉构建链上一个依赖问题：`schemars 0.8.22` 开 `preserve_order` 后按三泛型写法引用 `indexmap 1.9.3` 的 `IndexMap`，
而该版本默认不带 `std` feature，会报 `error[E0107]: struct takes 3 generic arguments but 2 generic arguments were supplied`。
修法是在 `src-tauri/Cargo.toml` 的 `[build-dependencies]` 显式写 `indexmap = { version = "1.9", features = ["std"] }`
（resolver v2 下主依赖图与 build 图分开，写在 `[dependencies]` 不生效）。
