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
3. 如改动含新功能，可另建 `V<版本号>_<主题>_README.md` 说明文档（参照根目录现有文件风格）。

> 例外：纯格式化、无实质内容的改动也不允许跳过版本号——没有例外，改了就升。

---

## 构建后必须同步便捷版

本项目除了 NSIS 安装包，还有一个**免安装便捷版**（裸 exe），放在桌面收纳盒里供日常双击使用。
**每次构建出可运行产物后，都要把它同步过去** —— 否则用户日常点开的还是旧版本。

| | 路径 |
| --- | --- |
| 源（构建产物） | `src-tauri/target/release/shortcut-launcher.exe` |
| 目标（便捷版） | `C:\Users\yile\DeskBox\DeskBox\Yue launcher.exe` |
| 备份 | `.workbuddy/portable-backup/Yue launcher_<旧版本>.exe` |

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
