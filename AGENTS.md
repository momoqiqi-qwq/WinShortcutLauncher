# AGENTS.md — Yue Launcher 代理开发规范

## ⚠️ 核心规则：任何改动必须升级版本号

每次修改本项目（代码、配置、文档、资源等任何内容），**必须先升级版本号，再开始改动**。不升级版本号的提交视为不完整、不允许提交。

### 版本号升级位置（全部同步修改，缺一不可）

| 文件 | 字段 |
| --- | --- |
| `package.json` | `"version"` |
| `src-tauri/tauri.conf.json` | `"version"` |
| `src-tauri/Cargo.toml` | `version = "..."`（`[package]` 下的那一行，不要动依赖的 version） |
| `README.md` | 第 1 行标题 `# Yue launcher v0.1.x` |

### 版本号递增规则

- 常规功能/修复：patch 位 +1（如 `0.1.136` → `0.1.137`）。
- 同一次改动保持四处版本号完全一致。

### 配套要求

1. **CHANGELOG.md**：在文件最顶部新增一个 `## V<新版本号>（最新）— 简述` 小节，写清本次改动要点（参照现有条目格式）。
2. **Git 提交信息**：使用 `V<版本号>: 中文描述` 格式，例如 `V137: 修复贴边隐藏偶发失灵`。
3. 如改动含新功能，可另建 `V<版本号>_<主题>_README.md` 说明文档，**放在 `docs/history/` 目录下**（参照该目录现有文件风格），不要再放到仓库根目录。

> 例外：纯格式化、无实质内容的改动也不允许跳过版本号——没有例外，改了就升。

---

## 构建后必须同步便捷版

本项目除了 NSIS 安装包，还有一个**免安装便捷版**（裸 exe），放在桌面收纳盒里供日常双击使用。
**每次构建出可运行产物后，都要把它同步过去** —— 否则用户日常点开的还是旧版本。

| | 路径 |
| --- | --- |
| 源（构建产物） | `src-tauri/target/release/shortcut-launcher.exe` |
| 目标（便捷版，🔴 唯一有效位置） | `C:\Users\yile\DeskBox\DeskBox\Yue Launcher.exe` |
| 备份 | `.workbuddy/portable-backup/Yue Launcher_<旧版本>.exe` |

❌ **不是 `C:\Users\yile\Desktop\Yue Launcher.exe`** —— 那是 V135 前后的旧位置，本机已经不存在。
位置对不上的话先看下一节的「三步核对」，别凭印象往桌面写文件。

> **exe 命名规则（V164 起固定）**：构建产物裸名仍是 `shortcut-launcher.exe`，**同步到 DeskBox 时文件名是 `Yue Launcher.exe`**（`Launcher` 首字母大写，不是 `Yue launcher.exe`）。
> 备份文件同样用 `Yue Launcher_<版本>.exe`。Windows 文件系统大小写不敏感，两种写法指向同一个文件，所以**改大小写不需要改快捷方式 / Run 注册表项**；但文档、脚本、快捷方式说明、Release 文案里一律写 `Yue Launcher.exe`，别再写小写 `l`。

一键同步（零依赖；自带版本探测 + 备份 + 校验 + 失败回滚）：

```bash
PYTHONIOENCODING=utf-8 python \
  ~/.workbuddy-ai/skills/yue-launcher-release-publish/scripts/sync-portable.py
```

### 注意点

- ⚠️ **便捷版经常正在运行**。Windows 上运行中的 exe **不能覆盖、不能删除，但可以重命名**
  （image section 已映射，改名不受影响）。所以脚本走「改名换新」：
  `rename(目标, 目标.old-<版本>)` → `copy2(新, 目标)`。
  用户当前窗口不受影响，**重启后生效** —— 同步完要提醒用户这一点。
- 若 `rename` 也失败（被独占锁定），先让用户退出 Yue launcher 再重试。
- 删不掉的 `.old-*` 留着即可，**下次同步会自动清理**。
- 这一步**每次构建后都做**，不必等发 GitHub Release。
- 版本判断：源以 `package.json` 的版本号为准；目标文件版本从 PE 资源里探测（UTF-16LE 搜 `x.y.z`）。

---

## 更新：先看 GitHub 有没有新版，有就下载并**落到便捷版 exe**

用户说「看看 GitHub 有没有更新 / 有就下载下来更新版本」时走这条。**下载只是中间步骤 —— 最后一定要把新版本的便捷版 exe 替换掉老的便捷版 exe**，否则用户双击的还是旧版。

### 1. 查最新版本

- 接口：`https://api.github.com/repos/momoqiqi-qwq/WinShortcutLauncher/releases/latest`
  （应用内「关于 → 检查更新」用的就是它，见 `src-tauri/src/updater.rs` 的 `RELEASE_API`）
- 版本逐段比大小，**不做字符串比较**；本地版本以 `package.json` 与便捷版 exe 的 PE 资源为准

```powershell
$r = Invoke-RestMethod 'https://api.github.com/repos/momoqiqi-qwq/WinShortcutLauncher/releases/latest' -Headers @{ 'User-Agent' = 'yue' }
"latest = $($r.tag_name)"; $r.assets | ForEach-Object { "$($_.name)  $($_.size)  $($_.browser_download_url)" }
```

> 实测（2026-10-13）：`releases/latest` = **v0.1.146**，而本机工作树已是 **0.1.151**。
> **Releases 落后于本地源码是常态** —— 别看见「GitHub 有新 release」就当成比本地新，先比版本号。

### 2. 下载（资产只有安装包，没有裸 exe）

Release 里**只上传了 NSIS 安装包**：`Yue.launcher_<ver>_x64-setup.exe`（约 4.5 MB），**没有裸 exe 资产**。
URL 用 API 返回的 `browser_download_url`，不要手拼（拼也是这个形状）：

```
https://github.com/momoqiqi-qw/WinShortcutLauncher/releases/download/v<ver>/Yue.launcher_<ver>_x64-setup.exe
```

下载落点参考应用内的顺序（上次下载目录 → 程序所在目录 → 系统下载文件夹 → 临时目录，见 V149）。

### 3. 从安装包里解出裸 exe —— 这就是「新版本便捷版 exe」

NSIS 包里就一个 `shortcut-launcher.exe`，7z 直接解：

```powershell
$EX = "$env:TEMP\yue-extract"
& 'C:\Program Files\7-Zip\7z.exe' x "<下载的 setup.exe>" -o"$EX" -y
"$EX\shortcut-launcher.exe"        # ← 新的便捷版 exe
```

实测（两例都对得上）：

| 来源 | 大小 | 解出的 `shortcut-launcher.exe` |
| --- | --- | --- |
| 本地 `Yue launcher_0.1.151_x64-setup.exe` | 4,779,013 | 17,699,840 字节，ver=0.1.151 |
| GitHub `Yue.launcher_0.1.146_x64-setup.exe` | 4,686,159 | 17,353,216 字节，ver=0.1.146 |

**解出来的字节数应与该版本的便捷版 exe 一致**；对不上就别替换，先查是不是下错了资产。

⚠️ 解出来的 exe 和本地构建产物**只差 3 个字节**，别拿 sha256 直接判「是不是同一版」：

| 来源 | 内嵌标记 | 偏移 |
| --- | --- | --- |
| 安装包里解出的 | `__TAURI_BUNDLE_TYPE_VAR_NS`（NSIS 打包） | 13,984,074 |
| `target/release` 的裸产物 | `__TAURI_BUNDLE_TYPE_VAR_UNK`（未打包） | 13,984,074 |

除此之外逐字节一致（实测 0.1.151：两文件都是 17,699,840 字节，仅这 3 字节不同）。
**判同一版本要比「PE 版本号 + 字节数」**；代码里没有任何地方读 bundle type，
只有「同目录有没有 `uninstall.exe`」区分安装版/便捷版（`src-tauri/src/updater.rs:209` 的
`looks_like_installed_build`），所以解出来的 exe 丢到 DeskBox 当便捷版用，行为与裸产物一致。
（有本地构建产物时优先用它同步，省得纠结这 3 字节。）

### 4. 🔴 替换便捷版 —— 位置只有一个，别替换错

| 角色 | 路径 |
| --- | --- |
| **便捷版（唯一有效目标）** | `C:\Users\yile\DeskBox\DeskBox\Yue Launcher.exe` |
| 开始菜单快捷方式 | `C:\ProgramData\Microsoft\Windows\Start Menu\Programs\Yue launcher.lnk` → 目标就是上面那个文件 |
| 备份 | `E:\E-Develop-Project\tauri-shortcut-launcher\.workbuddy\portable-backup\Yue Launcher_<旧版本>.exe` |

**❌ 不要往 `C:\Users\yile\Desktop\Yue Launcher.exe` 替换** —— 那是历史路径，本机**不存在**该文件；
`yue-launcher-build-release` 技能文档里残留的「部署到桌面」是过期的（本次已一并改正）。

位置不确定时**三步核对**，三者必须指向同一个文件：

```powershell
& 'C:\Users\yile\.workbuddy-ai\bin\es.exe' 'Yue Launcher.exe'                                        # 1) 全盘找
Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'Yue Launcher.exe' } |
  Select-Object -ExpandProperty ExecutablePath                                                        # 2) 正在跑的实例
(New-Object -ComObject WScript.Shell).CreateShortcut(
  'C:\ProgramData\Microsoft\Windows\Start Menu\Programs\Yue launcher.lnk').TargetPath                 # 3) 开始菜单指向
```

### 5. 替换动作（便捷版在运行中也安全）

便捷版**几乎总在运行**（实测同时 4 个进程）。运行中的 exe 不能覆盖、不能删除，**但可以重命名**，
所以走「改名换新」（`.old-*` 文件就是这么来的）：

```powershell
$NEW = "$env:TEMP\yue-extract\shortcut-launcher.exe"                                   # 第 3 步解出的裸 exe
$DST = 'C:\Users\yile\DeskBox\DeskBox\Yue Launcher.exe'                                # 🔴 唯一位置
$BAK = 'E:\E-Develop-Project\tauri-shortcut-launcher\.workbuddy\portable-backup'

$OLD = (Get-Item $DST).VersionInfo.FileVersion                                          # 先记下旧版本，例如 0.1.151
Copy-Item $DST "$BAK\Yue Launcher_$OLD.exe" -Force                                      # 1) 备份旧版
Move-Item $DST "$DST.old-$OLD" -Force                                                   # 2) 改名（运行中也成功）
Copy-Item $NEW $DST -Force                                                              # 3) 写入新版
(Get-FileHash $NEW).Hash -eq (Get-FileHash $DST).Hash                                   # 4) 必须 True
Remove-Item "$DST.old-$OLD" -Force -ErrorAction SilentlyContinue                        # 5) 被占用就留着，下次自动清理
```

- **只替换比当前新的版本**；GitHub 比本地旧就如实说明，别降级。
- 替换完**必须提醒用户：重启后生效**（当前那个窗口还是旧版）。
- 走**本地构建**流程时不用这套，直接跑脚本（它的默认目标就是上面那个唯一位置）：

```bash
PYTHONIOENCODING=utf-8 python \
  ~/.workbuddy-ai/skills/yue-launcher-release-publish/scripts/sync-portable.py
```

### 汇报口径

GitHub 最新版本号 → 是否比本地新 → 下载到的资产名与字节数 → 解出的便捷版 exe 大小/版本 →
替换前后的便捷版版本（含备份文件路径）→ 是否已提醒重启生效。

