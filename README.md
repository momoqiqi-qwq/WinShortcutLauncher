
## 贴边隐藏 V4 原生优化

这版贴边隐藏已从前端事件驱动改为 Rust + Win32 原生轮询控制器：

- 使用 `GetCursorPos` / `GetWindowRect` 每 8ms 检测鼠标与窗口边界。
- 使用 `AnimateWindow` 执行原生滑入/滑出动画。
- “立即”不再强制加 40/60/100ms 延迟，贴边松开鼠标后即可隐藏。
- 隐藏后需要鼠标离开触发条再进入才会展开，避免反复闪烁。

详细说明见 `EDGE_NATIVE_POLL_README.md`。


## 本版贴边隐藏优化

本版采用 Lucy 风格的快速滑入/滑出体验：主窗口与贴边触发条分离，触发条是独立 Tauri 窗口；主窗口滑动动画由 Rust 后端 `edge_animate_window` 执行，减少前端 JS 定时器和窗口事件互相抢状态导致的闪动。

在 设置 -> 操作 中可以调节：

- 贴边隐藏延迟
- 贴边动画速度，范围 60~220ms，推荐 80~110ms

# Win Shortcut Launcher

Windows 桌面快捷启动器，技术栈：Tauri 2.x + React 18 + TypeScript + Tailwind CSS + dnd-kit + Zustand。

## 已实现模块

- 顶部父目录标签：拖拽排序、双击改名、自动换行，最多 3 行后横向滚动。
- 左侧子目录标签：拖拽排序、双击改名，选中时高亮并显示全名。
- 内容区快捷项目：ShellX 风格图标 + 多行文字卡片，支持 1～5 行、字数宽度、字号设置和 tooltip 全名。
- 右键菜单：打开、管理员运行、打开所在文件夹、编辑、编辑图标、文字显示子菜单、复制/移动到目录、删除。
- 单项文字行数覆盖全局设置，并支持应用到全部项目。
- 设置面板：主题、透明度、文字显示、自动贴边隐藏、启动方式、导入/导出配置。
- Windows 系统工具内置分组。
- 文件/文件夹/.lnk 拖入添加：Tauri Webview drag-drop 获取真实路径，Rust 解析 `.lnk` 并提取 Windows 图标。
- 配置持久化：Zustand localStorage + JSON 导入导出。

## Windows 构建环境

请在 Windows 10/11 上安装：

1. Node.js 20+
2. Rust stable + Cargo
3. Microsoft Visual Studio Build Tools（Desktop development with C++）
4. WebView2 Runtime（Windows 11 通常自带）

## 本地运行

```powershell
npm install
npm run tauri:dev
```

## 构建 exe / 安装包

```powershell
npm run tauri:build
```

构建完成后通常会出现在：

```text
src-tauri\target\release\bundle\nsis\
```

如果你想生成 MSI，可以把 `src-tauri/tauri.conf.json` 里的 bundle targets 改为：

```json
"targets": ["msi"]
```

或者：

```json
"targets": ["all"]
```

## 关键文件

```text
src/
  App.tsx
  components/
    TopBar/
    Sidebar/
    ContentArea/
      ItemCard.tsx
      ItemCard.css
    ContextMenu/
      ItemContextMenu.tsx
      TextDisplaySubmenu.tsx
    Settings/
      DisplaySettings.tsx
      ThemePicker.tsx
      SettingsPanel.tsx
    DropImportDialog/
  stores/
    appStore.ts
    themeStore.ts
    displayStore.ts
  themes/index.ts
  hooks/
    useDragDrop.ts
    useEdgeSnap.ts
src-tauri/
  src/
    commands.rs
    icon.rs
    lib.rs
    main.rs
  tauri.conf.json
```

## 后续建议

- 开机自启动目前保存了 UI 配置，后端可继续接入 Windows 注册表或 Tauri autostart 插件。
- 自动贴边隐藏目前是窗口贴边检测 + CSS 收起；如需类似 ShellX 的精准边缘热区，可在 Rust 层接管窗口大小和位置。
- 图标提取使用 PowerShell + System.Drawing，适合 Windows 桌面应用；如果需要完全 Rust 原生实现，可改用 Win32 SHGetFileInfo + GDI 转 PNG。

## 空白窗口排查

如果窗口只显示透明边框、不显示顶部栏/侧边栏，请先确认：

```powershell
npm run build
```

本版本已修复两个会导致白屏/无法构建的问题：

1. `useEdgeSnap` 中错误调用了 `getCurrentWindow().currentMonitor()`，Tauri 2 的正确写法是从 `@tauri-apps/api/window` 导入 `currentMonitor()`。
2. 透明窗口背景原先使用 `calc(var(--window-opacity) * 100%)`，部分 WebView2 版本会把背景计算为透明。本版本改为 `--window-opacity-percent`，并保留纯色背景兜底。

如果仍然白屏，请在开发模式按 `Ctrl + Shift + I` 打开开发者工具，把 Console 错误发给开发者。现在项目也内置了 React ErrorBoundary，前端渲染失败时会直接显示错误信息。

## 2026-06-18 修复：菜单、系统图标、自动保存

本版根据反馈继续修复：

- 右键父目录标签、顶部栏空白处：显示父目录菜单，第一项为“新建分组”。
- 右键子目录标签、左侧栏空白处：显示子目录菜单，不再出现浏览器默认菜单。
- 全局禁止浏览器默认右键菜单，避免出现“返回 / 刷新 / 打印”。
- “引用系统图标”支持输入 `/system/imageres.dll,0`、`/system/shell32.dll,3` 这类路径；数字为图标资源索引。
- “编辑图标”同样支持本地图片、data:image、`/system/*.dll,index`。
- 设置面板新增右键菜单大小：菜单字体大小、菜单行高、菜单最小宽度。
- 设置面板新增自动保存：可选择保存目录、保存文件名、保存间隔，并可立即保存一次。

示例系统图标输入：

```text
/system/imageres.dll,0
/system/shell32.dll,3
C:\Windows\System32\imageres.dll,15
C:\Windows\System32\shell32.dll,44
```

## 本次修复说明：菜单、托盘、编辑弹窗

- 父目录右键菜单精简为“新建分区 / 删除分区”。
- 右键二级菜单改成互斥显示：鼠标移到另一个二级菜单时，上一个二级菜单会自动关闭；菜单本身不会因为鼠标短暂移开就消失。
- 新增 Windows 系统托盘：左键托盘图标显示主窗口，右键托盘菜单包含“显示主窗口 / 隐藏到托盘 / 退出”。关闭窗口时默认隐藏到托盘。
- 快捷项目“编辑”改为统一编辑弹窗，一次显示名称、路径或命令、类型、图标，不再分段弹出多个 prompt。
- 增加全局右键拦截，避免子目录/父目录区域偶发出现浏览器默认菜单。

Tauri 2 的系统托盘需要 `tauri = { version = "2", features = ["tray-icon"] }`，本项目已在 `src-tauri/Cargo.toml` 中开启。

## 本版新增：拖入加速 / Del 删除 / 多选增强

- 拖入文件后现在会先用路径生成快捷项目并立即显示，再在后台异步解析真实路径和系统图标，避免大量文件拖入时等待图标提取卡住。
- 支持 `Delete` 删除：有选中项目时删除选中项目；没有选中项目时删除当前选中子目录，删除前会确认。
- 支持 `Ctrl + A` 选中当前页面全部项目。
- 支持 `Ctrl + 左键` 多选、`Ctrl + 右键` 切换多选。
- 项目右键菜单新增多选操作：加入多选、取消选择此项、选中本页全部、清除多选；复制/移动/删除会自动适配多选数量。

## 2026-06-19 菜单 / 图标 / 设置界面修复

- 二级菜单现在会根据窗口空间自动选择左右展开；如果右侧空间不足，会改到左侧展开，避免被窗口边界裁切。
- 项目图标支持填写相对路径，例如 `icons/app.png`、`./icons/app.png` 或 `/icons/app.png`。读取顺序会尝试当前工作目录和 exe 所在目录。
- 设置面板已改为左侧分类导航：常规、操作、界面、数据，避免所有设置堆在一个长页面中。

## 2026-06-19 edge-tabs-context 修复

- 修复自动贴边隐藏：边缘检测容差从 3px 扩大到 24px，支持靠近左/右/上边缘后隐藏；移除“窗口接近全屏高度时禁止顶部隐藏”的限制；鼠标停止操作一段时间后也可自动收起。
- 设置 > 界面 中新增父目录标签设置：父目录标签可等宽显示、可调等宽宽度、分组框形状可在圆角/方形之间切换。
- 增强空白区域右键：内容区、左侧栏空白、顶部栏空白和外层空白区域都会弹出对应菜单，不再落到浏览器默认右键菜单。

## 2026-06-19 slide-edge-icon-bounds 修复

- 自动贴边隐藏改为真实窗口位置动画：收起时滑出屏幕，只保留边缘触发条；鼠标悬停触发条时滑入恢复，滑进和滑出都有动画。
- 修复单击启动模式：单击启动现在使用 pointer up 判定，避免 dnd-kit 拖拽监听吞掉 click 事件导致无法启动。
- 已将 `src-tauri/icons` 下的 exe / 任务栏图标替换为用户提供的火箭星球图片，并重新生成 `32x32.png`、`128x128.png`、`128x128@2x.png`、`icon.ico`。
- 新增窗口越界回弹：拖动窗口后如果右边界、左边界、顶部或底部超出显示器边界，松开鼠标后会自动弹回显示器内；右侧越界时右边界会自动对齐屏幕右边界。

如果 Windows 仍显示旧图标，先关闭程序，再删除旧构建产物后重新打包：

```powershell
cd src-tauri
cargo clean
cd ..
npm run tauri:build
```

## 2026-06-19 patch: edge delay, sidebar layout, fullsize icon

- 自动贴边隐藏支持“立即隐藏”和 0.5～10 秒可调延迟。
- 设置 → 界面新增左侧子目录列表调节：左侧栏宽度、子目录文字大小、子目录项高度、间距和圆角。
- 应用 exe / 任务栏 / 托盘图标已使用 `src-tauri/icons/app-icon.png`，该文件来自用户提供的 `icon_fullsize.png`。
- 如果 Windows 仍显示旧图标，请执行 `cd src-tauri && cargo clean` 后重新 `npm run tauri:build`。

## 2026-06-19 更新：设置浮窗、贴边隐藏、图标稳定性

- 设置界面改成可拖动、可缩放的浮动窗口，不再全屏遮罩，调整界面参数时可以直接观察主界面变化。
- 贴边隐藏“立即”模式优化为更短轮询与零延迟触发；滑出 / 滑入动画更快。
- 项目没有自定义图标时，会按项目路径自动重新提取系统图标，避免更新新版或导入旧配置后图标全部变成默认图标。
- 应用图标替换为用户提供的 `app_icon.ico` 与 `app_icon_256.png`。`app_icon.ico` 内含 16/24/32/48/64/128/256px 多尺寸，适合 exe 图标和属性页；`app_icon_256.png` 用于高清 PNG 资源。

如果 Windows 仍缓存旧图标，请执行：

```powershell
cd src-tauri
cargo clean
cd ..
npm run tauri:build
```

## 本版更新：Ctrl 滚轮缩放 + 高清图标

- 按住 Ctrl 并滚动鼠标滚轮，可以对主界面和设置界面一起等比例缩放。
- 设置 → 界面 → 整体界面缩放，也可以直接调节缩放比例。
- 设置浮窗取消拖动，只保留右下角缩放大小，避免误拖动。
- 已替换为用户提供的高清图标：`icon_hd.ico`、`icon_hd_512.png`、`icon_hd_256.png`。
- Tauri 打包图标已指向 `src-tauri/icons/icon_hd.ico` 与高清 PNG 资源。

Windows 如果仍显示旧图标，请清理构建缓存后重建：

```powershell
cd src-tauri
cargo clean
cd ..
npm run tauri:build
```

## 本轮更新：独立缩放、设置窗边框拖动、新图标与体验优化

- 主界面缩放与设置界面缩放已分离：
  - 鼠标在主界面时按 `Ctrl + 滚轮` 只缩放主界面。
  - 鼠标在设置窗口时按 `Ctrl + 滚轮` 只缩放设置窗口。
  - `Ctrl + 0` 会重置鼠标所在区域的缩放。
  - 设置 → 界面 中也可以分别调节“主界面缩放”和“设置界面缩放”。
- 设置窗口：
  - 右下角继续支持调整大小。
  - 按住设置窗口边框可以拖动位置；内容区、按钮、输入框不会误触发拖动。
- 新应用图标：
  - 已重新绘制一套透明背景的火箭/快捷启动主题图标。
  - 新文件：`src-tauri/icons/launcher_new.ico`、`launcher_new_512.png`、`launcher_new_256.png`。
  - `tauri.conf.json` 已切换到新图标。
- 体验优化：
  - 内容区新增快速搜索条，支持 `Ctrl + F` 聚焦，`Esc` 清空。
  - 设置内增加缩放重置按钮。

如果 Windows 仍显示旧图标，请执行：

```powershell
cd src-tauri
cargo clean
cd ..
npm run tauri:build
```

## 本版修复记录：设置拖动 / 分区缩放 / 透明图标

- 设置窗口改为标题栏和四边拖动，避免被卡在左上角时无法移开。
- 设置窗口右下角增加关闭按钮，顶部关闭按钮和 Esc 仍然可用。
- Ctrl + 鼠标滚轮会按鼠标所在区域分别缩放：鼠标在设置窗口内只缩放设置窗口，鼠标在主界面只缩放主界面。
- 应用图标已替换为真正透明背景的 `launcher_new.ico` / `launcher_new_512.png` / `launcher_new_256.png`，不再使用带白底的图片。

如果 Windows 仍显示旧图标，通常是系统图标缓存或 Cargo 缓存导致。请执行：

```powershell
cd src-tauri
cargo clean
cd ..
npm run tauri:build
```

## 本版修复：贴边隐藏 hover 稳定性

- 修复隐藏条在鼠标悬停时不展开或展开后马上又滑走的问题。
- 隐藏状态不再只依赖 `mouseenter` 触发展开，鼠标在隐藏条上移动也会触发展开。
- 通过隐藏条展开后，只要鼠标仍在窗口内，自动隐藏轮询不会再次把窗口收起。
- 鼠标离开窗口后才重新进入贴边隐藏倒计时，避免视频中出现的边缘卡住/抖动。


## 本版贴边隐藏修复

- 隐藏态不再把完整窗口移动到屏幕外。
- 现在会把真实窗口收缩成屏幕边缘 12px 的触发条，隐藏动画本身就是界面的一部分。
- 鼠标移到触发条即可稳定展开；展开后不会因为仍贴在屏幕边缘而马上再次收回。
- 为了支持真实收缩，`src-tauri/tauri.conf.json` 的 `minWidth/minHeight` 已改为 8。


## 贴边隐藏闪烁修复说明

本版本把贴边隐藏逻辑改为稳定状态机：

- 隐藏动画期间忽略 `mouseleave` / `mousemove` 造成的重复触发。
- 窗口收缩成 12px 触发条后，如果鼠标还停在触发条上，不会立刻重新展开。
- 必须等鼠标真正离开触发条后，下一次悬停才会展开。
- 展开后加入 650ms 冷却，避免再次被贴边检测立即收回。
- 鼠标按下或窗口拖动刚结束时不会触发隐藏，避免一贴边就闪。

如果你想测试最稳定效果，建议设置：设置 → 操作 → 贴边隐藏延迟 = 0.5 秒。


## 贴边隐藏 V3 稳定版

本版本已把贴边隐藏改成双窗口架构：主窗口 `main` 只负责完整启动器界面，独立的 `edge-strip` 触发条窗口只负责悬停展开。隐藏时主窗口滑出后会真正 `hide()`，触发条单独保留在屏幕边缘，因此不会再出现旧版本“展开后马上收回 / 一贴边就闪烁”的同窗口事件循环。

如果你还看到旧闪烁，请确认没有同时启用旧的 `useEdgeSnap` 逻辑；本包中 App 已改用 `useStableEdgeDock`。

## 2026-06 V5 贴边体验修复

本版重点优化贴边隐藏：

- 贴边触发条支持在“设置 → 操作”中调节宽度、透明度、是否跟随主题 accent 色、自定义颜色。
- 关闭按钮行为可选“隐藏到系统托盘”或“直接退出应用”。
- 贴边滑入/滑出改为 Rust 后端 SetWindowPos 原生位置动画，不再使用 AnimateWindow，避免透明窗口出现额外半透明框缩放残影。
- 从触发条展开后，如果用户把主窗口拖离屏幕边缘，会退出贴边模式，不会再自动吸回边缘或自动隐藏。

推荐贴边参数：隐藏延迟“立即”或 0.3 秒，动画速度 70～100ms，触发条宽度 8～12px。


## 贴边隐藏 V6：Rust 原生即时模式

- 贴边隐藏由 Rust 后端原生控制。
- 后端轮询周期为 8ms，使用 Win32 GetCursorPos / GetWindowRect 判断鼠标和主窗口位置。
- 不依赖前端 mouseenter / mouseleave，也不再使用前端 JS 逐帧 setPosition。
- 隐藏和展开使用 Win32 AnimateWindow，动画速度可在设置中调节，默认 90ms。
- 默认贴边隐藏延迟改为“立即”。

## V8 边界弹回修复

本版修复 `useWindowBoundsGuard.ts` 的窗口弹回触发时机：

- 移除旧的 `onMoved + 180ms` 防抖逻辑。
- 改为 `mouseup` 后才检查窗口是否超出屏幕。
- 只有“窗口确实超出屏幕边界 + 用户已经松开鼠标”两个条件同时满足时，才执行弹回动画。
- 贴边隐藏原生模式启用时跳过边界弹回，避免和隐藏/展开动画抢窗口位置。


## V10 更新：滚动条设置 + 设置分组折叠

- 设置 → 界面 中新增「滚动条 / 滑动条」设置，可调整滚动条宽度、圆角、滑块颜色、悬停颜色、轨道颜色，并支持跟随当前主题 accent。
- 设置 → 界面 中的各个设置块新增展开 / 收起箭头，方便在设置项很多时快速折叠。
- 滚动条设置会同步作用到左侧子目录、设置面板和其他可滚动区域。
