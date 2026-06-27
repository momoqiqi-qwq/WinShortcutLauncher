<div align="center">
  <h1>🚀 Yue Launcher</h1>
  <p>Windows 桌面快捷启动器 — 贴边隐藏 · 拖拽排序 · 系统图标 · 多主题</p>

  <a href="./LICENSE"><img src="https://img.shields.io/github/license/momoqiqi-qwq/YueLauncher" alt="License"/></a>
  <a href="https://github.com/momoqiqi-qwq/YueLauncher/releases"><img src="https://img.shields.io/github/v/release/momoqiqi-qwq/YueLauncher" alt="Release"/></a>
  <img src="https://img.shields.io/badge/platform-Windows%2010%2F11-0078D4?logo=windows" alt="Platform"/>
  <img src="https://img.shields.io/badge/Tauri-2.x-FFC131?logo=tauri" alt="Tauri"/>
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react" alt="React"/>
</div>

---

## 简介

Yue Launcher 是一款基于 **Tauri 2 + React 18 + Rust Win32** 的 Windows 桌面快捷启动器，专注于打造流畅的快捷方式管理体验。

**技术栈**：Tauri 2.x · React 18 · TypeScript · Tailwind CSS · dnd-kit · Zustand · Rust Win32

---

## 功能特性

### 📁 分组管理

- 顶部父目录标签 + 左侧子目录标签，均支持**拖拽排序**、**双击改名**
- 父目录最多 3 行，超出后横向滚动；子目录选中高亮并显示全名

### 🗂️ 快捷项目

- ShellX 风格图标卡片，支持 1～5 行文字显示、字号/宽度调节、tooltip 全名
- 直接将文件/文件夹/`.lnk` **拖入添加**，Rust 自动解析快捷方式并提取 Windows 系统图标
- `Ctrl + 左键` 多选，`Ctrl + A` 全选，批量复制/移动/删除

### 🖱️ 右键菜单

- 打开、管理员运行、打开所在文件夹、编辑、编辑图标
- 文字显示行数覆盖、复制/移动到分组、删除
- 右键二级子菜单根据窗口空间自动选择左右展开

### 🔍 搜索与缩放

- `Ctrl + F` 聚焦内容区搜索栏，`Esc` 清空
- `Ctrl + 滚轮` 等比例缩放（主界面与设置界面**独立缩放**，`Ctrl + 0` 重置）

### 📌 贴边隐藏（Rust 原生 V6）

- Rust 后端 **8ms 轮询**，Win32 `GetCursorPos / GetWindowRect` 原生检测
- `AnimateWindow` 原生滑入/滑出动画（默认 90ms）
- 可调节：隐藏延迟（立即 / 0.3s～10s）、动画速度、触发条宽度/透明度/颜色

### 🎨 界面与主题

- 多主题 + 透明度调节
- 设置面板：左侧分类导航（常规、操作、界面、数据），可拖动/缩放的浮动窗口
- 滚动条样式可自定义（宽度、颜色、圆角）

### 🗄️ 系统托盘

- 左键托盘图标：显示主窗口
- 右键托盘菜单：显示主窗口 / 隐藏到托盘 / 退出
- 关闭窗口默认隐藏到托盘（可在设置中改为直接退出）

### 💾 数据与配置

- Zustand + localStorage 持久化
- JSON 一键导入/导出配置
- 可配置自动保存（目录、文件名、保存间隔）

---

## 环境要求

> ⚠️ 仅支持 **Windows 10 / 11**

| 工具 | 版本要求 | 说明 |
|------|---------|------|
| Node.js | 20+ | [nodejs.org](https://nodejs.org) |
| Rust | stable | [rustup.rs](https://rustup.rs) |
| Visual Studio Build Tools | 最新版 | 勾选「Desktop development with C++」 |
| WebView2 Runtime | — | Windows 11 自带；Windows 10 请[手动安装](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) |

---

## 快速开始

```powershell
# 安装依赖
npm install

# 启动开发服务（热重载）
npm run tauri:dev
```

---

## 构建发布包

```powershell
npm run tauri:build
```

构建完成后，安装包位于：

```
src-tauri\target\release\bundle\
├── nsis\     <- NSIS 安装包（默认）
└── msi\      <- MSI 安装包（需在 tauri.conf.json 中开启）
```

如需 MSI，在 `src-tauri/tauri.conf.json` 中修改：

```json
"targets": ["msi"]
```

或同时生成所有格式：

```json
"targets": ["all"]
```

---

## 文件结构

```
src/
├── components/
│   ├── TopBar/              # 顶部父目录标签
│   ├── Sidebar/             # 左侧子目录标签
│   ├── ContentArea/         # 快捷项目卡片（ItemCard.tsx）
│   ├── ContextMenu/         # 右键菜单（含二级子菜单）
│   └── Settings/            # 设置面板
├── stores/
│   ├── appStore.ts          # 应用状态
│   ├── themeStore.ts        # 主题状态
│   └── displayStore.ts      # 显示设置状态
└── hooks/
    ├── useDragDrop.ts        # 拖拽逻辑
    └── useEdgeSnap.ts        # 贴边隐藏（前端部分）

src-tauri/
├── src/
│   ├── commands.rs           # Tauri 命令（含贴边原生控制器）
│   ├── icon.rs               # 系统图标提取（Win32 SHGetFileInfo）
│   ├── lib.rs
│   └── main.rs
└── tauri.conf.json
```

---

## 常见问题

### 窗口只显示透明边框 / 白屏

1. 先执行 `npm run build` 确认前端可以正常编译
2. 开发模式按 `Ctrl + Shift + I` 打开 DevTools 查看 Console 报错
3. 项目内置 React ErrorBoundary，前端渲染失败时会直接显示错误信息

### Windows 任务栏仍显示旧图标

系统图标缓存或 Cargo 缓存导致，执行以下命令清理后重新构建：

```powershell
cd src-tauri
cargo clean
cd ..
npm run tauri:build
```

---

## 更新日志

完整版本历史见 [CHANGELOG.md](./CHANGELOG.md)。

---

## 许可证

[GPL-3.0](./LICENSE) © momoqiqi-qwq
