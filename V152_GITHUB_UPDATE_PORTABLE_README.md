# V152 版本说明：从 GitHub 下载新版本后，直接替换老的便捷版 exe

> 需求原文：「agent.md 写入「看看 GitHub 有没有更新，如果有则从 GitHub 上下载下来更新版本」时
> 把新版本便捷版 exe 替换老的便捷版 exe【你要找对位置替换】」
>
> 版本号 0.1.151 → 0.1.152。**本版是纯文档改动**（`AGENTS.md` + `CHANGELOG.md` + 版本号），
> 代码与构建产物不变；按仓库规范「改了就升」，照常升版本号。

## 一、写进 AGENTS.md 的流程

`AGENTS.md` 末尾新增一节「更新：先看 GitHub 有没有新版，有就下载并**落到便捷版 exe**」，
把这句话固化成五步可执行流程：

| 步骤 | 做什么 | 关键点 |
| --- | --- | --- |
| 1 | 查 `releases/latest` | 逐段比版本，**不做字符串比较**；本地以 `package.json` / PE 资源为准 |
| 2 | 下载资产 | Release 里**只有 NSIS 安装包**（`Yue.launcher_<ver>_x64-setup.exe`，约 4.5 MB），没有裸 exe；URL 取 API 的 `browser_download_url` |
| 3 | 从安装包解出裸 exe | `7z x` 出来就一个 `shortcut-launcher.exe` —— 这才是「新版本便捷版 exe」 |
| 4 | **替换便捷版 exe** | 位置只有一个，见下节；替换前先备份、替换后校验 sha256 |
| 5 | 提醒 | 运行中的窗口仍是旧版，**重启后生效** |

## 二、🔴 便携版 exe 的「对的位置」

| 角色 | 路径 |
| --- | --- |
| **便捷版（唯一有效目标）** | `C:\Users\yile\DeskBox\DeskBox\Yue launcher.exe` |
| 开始菜单快捷方式 | `C:\ProgramData\Microsoft\Windows\Start Menu\Programs\Yue launcher.lnk` → 目标就是上面那个文件 |
| 备份 | `E:\E-Develop-Project\tauri-shortcut-launcher\.workbuddy\portable-backup\Yue launcher_<旧版本>.exe` |

**❌ 不是 `C:\Users\yile\Desktop\Yue launcher.exe`** —— 那是 V135 前后的旧位置，本机已经不存在这个文件
（`yue-launcher-build-release` 技能文档里残留的「桌面」说法是过期的，本版一并改正为 DeskBox）。

### 怎么「找对位置」——三步核对，三者必须指向同一个文件

```powershell
& 'C:\Users\yile\.workbuddy-ai\bin\es.exe' 'Yue launcher.exe'                          # 1) 全盘找
Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'Yue launcher.exe' } |
  Select-Object -ExpandProperty ExecutablePath                                          # 2) 正在跑的实例
(New-Object -ComObject WScript.Shell).CreateShortcut(
  'C:\ProgramData\Microsoft\Windows\Start Menu\Programs\Yue launcher.lnk').TargetPath   # 3) 开始菜单指向
```

本机 2026-10-13 实测三者一致：`C:\Users\yile\DeskBox\DeskBox\Yue launcher.exe`（v0.1.151，4 个进程在跑）。

## 三、替换动作（便捷版正在运行也安全）

Windows 上运行中的 exe **不能覆盖、不能删除，但可以重命名**（image section 已映射），
所以走「改名换新」：备份旧版 → `Move-Item` 改名 → `Copy-Item` 写入新版 → sha256 比对 → 清理 `.old-*`。
用户当前那个窗口不受影响，**重启后生效**。

走本地构建流程时不用手工敲，直接跑现成脚本（默认目标就是上面那个唯一位置）：

```bash
PYTHONIOENCODING=utf-8 python \
  ~/.workbuddy-ai/skills/yue-launcher-release-publish/scripts/sync-portable.py
```

## 四、本版留下的实测证据

| 项 | 结果 |
| --- | --- |
| `releases/latest` | **v0.1.146**（本机工作树已 0.1.151）—— **Releases 落后于本地源码是常态** |
| 本地 `Yue launcher_0.1.151_x64-setup.exe` | 4,779,013 字节 → 7z 解出 `shortcut-launcher.exe` **17,699,840 字节 ver=0.1.151** |
| GitHub `Yue.launcher_0.1.146_x64-setup.exe` | 4,686,159 字节 → 7z 解出 `shortcut-launcher.exe` **17,353,216 字节 ver=0.1.146** |

两例都说明：**从安装包能解出可直接当便捷版用的裸 exe**，解出的字节数与该版本便捷版一致；
对不上就是下错资产，不要替换。

### 顺带查清的一件事：解出的 exe 与裸产物只差 3 字节

实测把 0.1.151 的安装包解出的 exe 与本机便捷版（即 `target/release/shortcut-launcher.exe`）逐字节对比：
**长度都是 17,699,840，只有偏移 13,984,074 起的 3 个字节不同** ——

| 来源 | 内嵌标记 |
| --- | --- |
| 安装包解出的 | `__TAURI_BUNDLE_TYPE_VAR_NS`（NSIS 打包） |
| `target/release` 裸产物 | `__TAURI_BUNDLE_TYPE_VAR_UNK`（未打包） |

结论写进了 `AGENTS.md`：**判「是不是同一版本」要比 PE 版本号 + 字节数，不要直接比 sha256**；
代码里没有任何地方读 bundle type，只有「同目录有没有 `uninstall.exe`」区分安装版与便捷版
（`src-tauri/src/updater.rs:209` 的 `looks_like_installed_build`），所以这两种 exe 当便捷版用行为一致。

## 五、验证与影响

| 项目 | 结果 |
| --- | --- |
| 版本号四处 + `Cargo.lock` | 全部 0.1.152（`package.json` / `src-tauri/tauri.conf.json` / `src-tauri/Cargo.toml` / `src-tauri/Cargo.lock` / `README.md` 首行与末尾） |
| 代码 / 产物 | **未改**；无需重新构建（下次构建会带上 0.1.152） |
| 便捷版 exe | 保持 v0.1.151 不变 —— 本次不涉及产物替换，只把「以后怎么换」写进规范 |
