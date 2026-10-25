# V172 功能说明：「添加EXE」光标拾取

## 要点

子目录右键菜单新增 **添加EXE**：不用翻文件夹，把光标移到正在运行的目标程序窗口上点一下，
就把它所属的 exe 抓进来，加为当前子目录的项目。

参考实现：`E:\E-Develop-Project\easy-espanso` 的 `cursor_executable` 系列
（`GetCursorPos` + `WindowFromPoint` + `GetWindowThreadProcessId` + `QueryFullProcessImageNameW`，
「松开即确认」判定 + Esc 取消 + 最长时长）。本版本只搬这套只读探测逻辑，
**不搬**它的图标缓存（`iconprobe.exe` / appinfo）；图标沿用本项目的 `icon` 模块。

## 交互流程

| 阶段 | 界面 | 说明 |
| --- | --- | --- |
| 说明 | 「添加 EXE（光标拾取）」窗口 | 讲清「点开始后窗口会收起」+ Esc / 120 秒超时 |
| 倒计时 | 3 → 2 → 1（每档 700ms） | 给用户挪光标的时间；拾取一旦开始就没有第二次准备机会 |
| 拾取 | 主窗口已隐藏 | 后端每 90ms 探一次光标下的窗口 |
| 确认 | 程序名 + exe 全路径 + 窗口标题 | 「添加」写入当前子目录，「重新拾取」再来一次 |

确认方式两种都收：

- **点一下**：把光标停在目标程序窗口上，按一下左键（按下 → 松开）。
- **拖动**：按住左键从启动器窗口拖到目标上再松开（开始时按钮已按下也认）。

取消：拾取中按 **Esc**，或点窗口里的「取消」；120 秒无动作自动结束。

## 后端（`src-tauri/src/exe_pick.rs`）

- 命令：`start_exe_pick`、`stop_exe_pick`。
- 状态：`ExePickState { generation, stop }` —— 每次 start 递增代号并换新的停止旗标；
  被取消的旧线程即使晚到，`finish()` 也会因代号不匹配而丢弃结果（不会把旧结果推给新一次拾取）。
- 探测（仅 Windows）：`GetCursorPos` → `WindowFromPoint` → `IsWindowVisible`
  → `GetWindowThreadProcessId` → `OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION)`
  → `QueryFullProcessImageNameW`；窗口标题用 `GetWindowTextW`。
  复用 `commands::process_executable_path`（可见性由私有改为 `pub(crate)`）。
- 判定：先看到按下、再看到松开才算确认（`down_seen && !down`）；
  进入时按钮已按下则直接进入「等松开」状态。启动后 **700ms** 内不采信探测结果
  （刚隐藏窗口时窗口层级还在变，避免拾到自己）。松开那一刻光标不在任何窗口上
  （桌面 / 任务栏）则这一下不算数，继续等。
- 排除本进程自己的窗口（`GetCurrentProcessId`）。
- 收放窗口用 `hide()` / `show()` + `unminimize()` + `set_focus()`：
  **不走** `hide_main_window`（那是「隐藏到托盘」语义，会改 `MAIN_HIDDEN_TO_TRAY`、
  记窗口几何、牵动贴边控制器），拾取结束后窗口位置/尺寸不受影响。
- 事件：结束后 `emit("exe-pick-end", { status, target?, message? })`，
  `status` 为 `picked` / `cancelled` / `timeout` / `failed`。

## 前端

- `src/lib/exePick.ts`（新增）：`startExePick()` **先挂监听再 invoke** —— 探测线程可能在
  `invoke` 返回后才刚起来就结束，事件不能漏；`withTimeout` 150 秒兜底并在超时时调用
  `stop_exe_pick`，避免对话框永远转圈。`cancelExePick()` 给取消按钮用。
- `AreaContextMenu.tsx`：
  - 菜单项「添加EXE」（`Crosshair` 图标）排在「添加文件夹」之后；
  - 原 `addPickedPaths` 的写入逻辑抽成 `addPaths(paths)`，供「添加文件/文件夹」和拾取结果共用，
    因此开始菜单子目录、映射文件夹子目录两条特殊通道照样生效（写快捷方式而不是写配置）；
  - 拾取窗口四态：`idle` / `counting` / `picking` / `done`（`done` 再分成功与失败两种排版）。
  - 拾取成功走 `createShortcutItemsFromPaths([path])`，与「添加文件」选中 exe 的行为完全一致
    （图标、类型 `command`、启动方式都复用现有逻辑）。
- `types.ts`：`AreaContextMenuItemId` 增加 `addExe`。
- `experienceSettings.ts`：`AREA_CONTEXT_MENU_IDS` 增加 `addExe`（默认显示，设置项可隐藏）。
- `ContextMenuSettingsSection.tsx`：`AREA_LABELS.addExe` 标签与说明。
- `ContextMenu.css`：`.exe-pick-dialog` / `.exe-pick-countdown` / `.exe-pick-result` /
  `.exe-pick-name` / `.exe-pick-path` / `.exe-pick-window`。

## 边界与已知取舍

- **点击会落到目标程序上**：拾取只读窗口、不拦截输入，所以那一下左键目标程序照常收到
  （和用户自己点它一样）。想避开就用「按住从启动器拖过去再松开」。
- 管理员权限的程序：本启动器非管理员时 `OpenProcess` 可能被拒（返回「没拾取到程序」），
  属预期；以同权限运行启动器即可。
- UWP / Store 应用：光标下窗口可能属于 `ApplicationFrameHost.exe`，
  拾到的是宿主进程而不是真正的应用 exe —— 弹窗会把窗口标题一并显示出来，便于用户判断。
- 只支持 Windows；非 Windows 分支 `target_under_cursor` 恒为 `None`（走超时/取消路径）。

## 验证

- `node scripts/verify-source-fixes.mjs`：OK
- `npx tsc --noEmit`：通过
- `cargo check`：通过（`Finished dev profile ... in 19.59s`，无 warning）
- `npx vitest run`：48 个文件 / 270 条全部通过（`experienceSettings.test.ts` 的菜单 id 清单同步加入 `addExe`）
- 版本号：`package.json` / `src-tauri/tauri.conf.json` / `src-tauri/Cargo.toml` / `README.md` 首行
  均为 `0.1.172`；`package-lock.json`（顶层 + `packages[""]`）与 `src-tauri/Cargo.lock` 同步。
