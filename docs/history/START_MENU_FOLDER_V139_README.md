# 开始菜单子目录 V139（直连系统开始菜单文件夹）

## 需求

右键菜单「新建子目录」里增加**第四类特殊子目录**：直接把应用拖进去，就在 Windows 开始菜单里生成快捷方式。

## 三类特殊子目录的差别

| 类型 | 内容来源 | 拖入的后果 |
| --- | --- | --- |
| `normal` | 配置（`items`） | 存进启动器配置 |
| `all` | 配置（全量视图） | 存进启动器配置 |
| `notes` | 配置（便签） | 存进启动器配置 |
| **`startMenu`** | **实时读系统开始菜单文件夹** | **在真实文件夹里生成 `.lnk` / `.url`** |

`startMenu` 是**唯一「内容不落盘」的类型**：条目由 Rust 实时扫描，只活在运行时 store 里，
配置文件里不存它的 `items`。

## 目录行为

- 路径：`%APPDATA%\Microsoft\Windows\Start Menu\Programs`（**仅当前用户**，读写都免管理员）
- 扫描：**只扫根目录一层**，认 `.lnk` / `.url` / `.exe` 三类文件，不递归子文件夹
- 镜像：**实时**。外面装了新软件，切回该子目录（或点刷新）即可看到，无需手动添加
- 每个父目录**最多一个**开始菜单子目录（和「全部」标签同规则）

## 拖入的写入规则

| 拖入的东西 | 结果 |
| --- | --- |
| `.lnk` / `.url` | **原样复制**到开始菜单文件夹 |
| `.exe` / 文件夹 / 其它文件 | 用 `WScript.Shell` 生成**指向它**的 `.lnk`（并设 `WorkingDirectory`） |
| 网址（拖链接） | 写成 `.url` 文件（`[InternetShortcut]` 格式） |
| 已在开始菜单文件夹内的路径 | 自动跳过，不重复写入 |
| 重名 | 自动加 ` (2)`、` (3)` 后缀 |

## 右键菜单行为

- **子目录上**：新增「刷新开始菜单」「打开开始菜单文件夹」；
  「清空子目录项目」「粘贴项目」「添加系统功能」禁用，「便签 / 普通切换」隐藏（该目录不参与合并）
- **条目上**：菜单作用于**真实文件** —— 重命名改真实 `.lnk` / `.url` 文件名，删除送**回收站**（可恢复）；
  固定、图标编辑、文字显示、复制/移动到目录等只影响配置的操作在该目录下隐藏

## 安全边界

删除 / 重命名前都会先校验目标确实位于开始菜单文件夹内，越界直接拒绝。
比较时统一小写、统一分隔符、剥掉 `canonicalize()` 带来的 `\\?\` 前缀，
并**带上路径分隔符比对** —— 否则 `…\Programs2\x.lnk` 会被误判成在 `…\Programs` 内。

## 关键文件

```text
src-tauri/src/start_menu.rs                        新增：6 个 tauri 命令
src/lib/startMenu.ts                               新增：invoke 封装 + 条目映射
src/stores/appStore/slices/startMenuSlice.ts        新增：运行时切片 + 图标异步补齐
src/lib/__tests__/startMenu.test.ts                新增：4 例
src/types.ts                                       DirectoryKind 加 'startMenu'
src/stores/appStore/normalizers.ts                 认这个 kind，并清空落盘的 items
（另有 18 个文件补齐 kind 判断点，见 CHANGELOG）
```

条目 id 用 `startmenu:<绝对路径>` 前缀 —— 稳定，且能反查真实文件。

## 已知限制

1. 只对接当前用户开始菜单；公共开始菜单 `%ProgramData%\Microsoft\Windows\Start Menu\Programs`
   需要管理员权限，未纳入
2. 扫描不递归子文件夹（真实目录里有 69 个子目录，本版只展示根级 79 个条目）
3. **内拖不生效**：把启动器里已有的项目拖到开始菜单子目录上，不会写入系统文件夹
   （只有从外部拖入的文件/文件夹/网址才会）

## 验证

- `npm run typecheck` — 0 错误
- `npm test` — 34 文件 / 159 用例全过
- `npm run tauri:build -- --no-bundle` — `Finished release profile`，产物版本 `0.1.139`
- 路径护栏 `is_inside` / `path_key` — 独立 `rustc` 编译跑 10 条边界断言全过
