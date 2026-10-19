# V164 版本说明：便捷版 exe 规范名统一为 `Yue Launcher.exe`

## 新增

- `AGENTS.md` 增加「exe 命名规则」小节，写死链路：
  - 构建产物裸名 `src-tauri/target/release/shortcut-launcher.exe`；
  - 同步到 DeskBox 后的**规范文件名 `Yue Launcher.exe`**（`Launcher` 首字母大写）；
  - 备份名 `Yue Launcher_<版本>.exe`。
- 全文 7 处路径说明（目标表、三步核对命令、替换脚本片段、备份路径）统一为大写 `L`。

## 兼容与约束

- Windows 文件系统大小写不敏感：`Yue launcher.exe` 与 `Yue Launcher.exe` 是**同一个文件**，
  因此改名**不需要**动开始菜单 `.lnk` 的 `TargetPath`，也不需要改
  `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` 里的路径，两者照旧能解析。
- 由于只是大小写，**不改** `productName`（`tauri.conf.json` 仍是 `Yue launcher`）：
  NSIS 安装包文件名 `Yue launcher_<ver>_x64-setup.exe`、开始菜单快捷方式名
  `Yue launcher.lnk` 都保持原样，避免改成「新应用」导致快捷方式/注册表重复。
- 同步脚本 `sync-portable.py` 的 `DST_DEFAULT`、备份文件名、docstring 三处同步改为
  `Yue Launcher`；`yue-launcher-build-release` 技能文档 5 处路径说明同步。
- 本机 `C:\Users\yile\DeskBox\DeskBox\Yue launcher.exe` 已就地改名为 `Yue Launcher.exe`
  （同一文件，仅大小写；运行中的窗口不受影响）。

## 验证与构建

- 四处版本号（`package.json` / `src-tauri/tauri.conf.json` / `src-tauri/Cargo.toml` /
  `README.md` 首行）+ 两处 lock（`package-lock.json` ×2、`src-tauri/Cargo.lock`）全部 `0.1.164`。
- `sync-portable.py --dry-run` 能定位 `Yue Launcher.exe` 并读出旧版本号。
- 构建后便捷版同步到 v0.1.164，`Get-FileHash` 与 `target/release/shortcut-launcher.exe` 一致。
