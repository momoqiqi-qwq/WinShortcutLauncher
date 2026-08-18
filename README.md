# Yue launcher v0.1.116

Yue launcher 是基于 Tauri 2、React 18、TypeScript 和 Vite 的 Windows 快捷启动器。



## v0.1.116 浏览器拖入网址兼容

- 修复 Floorp / Firefox 系浏览器拖网址时，`text/x-moz-url-data` 等 Gecko 数据格式已能解析但未被拖拽入口放行的问题。
- 新增 `text/x-moz-url-data / desc / priv / place`、Windows URL 别名、虚拟 `.url/.website` 文件等兼容路径。
- 虚拟 Internet Shortcut 同时支持 UTF-8 与 UTF-16LE/BE 内容。
- 保留 Chromium 常见的 `text/uri-list / text/plain / text/html / text/url / DownloadURL` 处理，并增加未知 `text/*url*` 格式的安全回退。
- 为避免副作用，Gecko 图片/普通文件的 file-promise 不会因为自带资源 URL 被误识别成“网站”。
- 兼容目标覆盖 Floorp、Firefox、Waterfox、LibreWolf，以及 Chrome、Edge、Brave、Vivaldi、Opera 和多数 Chromium 壳浏览器常见的网页拖拽格式。

详细说明见 `V116_BROWSER_DRAG_COMPATIBILITY_README.md`，验证结果见 `V116_TEST_RESULTS.txt`。


## v0.1.115 设置搜索精确定位

- 设置搜索结果支持“目标分组 + 目标控件”精确跳转。
- 点击结果时会自动展开被折叠的设置分组，再滚动到具体设置行并高亮/聚焦控件。
- `zqd` / “自启动”命中“开机自动启动”后会直接定位到“启动与关闭”里的“开机自启动”复选框。
- 同步覆盖便签行号/自动保存、全局搜索/防抖、中转站、图片浏览和彩虹总开关等折叠设置。

## v0.1.114 设置生效链路修复

- 修复 `rememberSettingsPanelBounds` / `settingsPanelAdaptiveSize`：设置面板不再硬编码，自适应关闭后恢复标题栏拖动和右下角缩放，并按开关决定是否记忆尺寸/位置。
- 文件中转站和图片浏览器的总开关现在会约束顶部入口、快捷键、贴边暂停和拖放状态，不再产生“界面没显示但内部 open=true”的隐藏状态。
- “允许外部拖入”同时约束 Tauri 原生拖放和面板 DOM drop 路径。
- “窗口置顶”在“设置 → 窗口”增加真实设置项，设置搜索会定位到该项；与右上角图钉、快捷键共享同一状态。
- 中央设置补齐搜索防抖、文件中转图标显示、清空前确认三个已有运行参数。
- 旧 `windowState.edgeAutoHide` 保留兼容，但加载和更新时都强制与 `behavior.edgeAutoHide` 同步，避免双状态漂移。

详细说明见 `V114_SETTINGS_EFFECT_FIXES_README.md`，验证结果见 `V114_TEST_RESULTS.txt`。

## v0.1.113 首次启动、搜索设置与网站拖入重命名

- 首次启动默认关闭彩虹总开关，窗口控制按钮默认使用四宫格样式；已有用户配置不被强制覆盖。
- “搜索框提示文字”同时作用于主界面项目搜索框和全局搜索框。
- 审计并修正搜索设置：路径/网址搜索独立生效，关闭系统工具后完整排除系统工具组，关闭便签后不再残留便签目录结果，关闭最近使用优先后不再叠加使用次数权重。
- “启用全局搜索”关闭后，Ctrl+K 和顶部入口不会再打开隐藏搜索状态。
- 从浏览器或 `.url/.website` 文件拖入网站时，默认先显示应用内重命名界面；可在“设置 → 拖动”关闭“拖入网站后显示重命名界面”。
- 设置搜索可直接搜索“网站 / 拖入 / 重命名”定位新开关。

详细说明见 `V113_FIRST_RUN_SEARCH_DROP_RENAME_README.md`，验证结果见 `V113_TEST_RESULTS.txt`。

## v0.1.110 拼音搜索扩展

- 主界面项目搜索支持中文、完整拼音、拼音片段和首字母。
- 全局搜索 / 命令面板统一支持运行时中文名称转拼音。
- 父目录和子目录可作为独立结果按拼音搜索，`搜索父目录` / `搜索子目录` 开关分别生效。
- 示例：`gongzuo / gz` → “工作”，`wenjianjia / wjj` → “文件夹”，`liulanqi / llq` → “浏览器”。
- 拼音表内置在前端，不新增 npm runtime dependency。

详细说明见 `V110_PINYIN_SEARCH_EXPANSION_README.md`，验证结果见 `V110_TEST_RESULTS.txt`。


## v0.1.106 父目录配色、外观自由度与拖入体验

- 父目录颜色正式进入设置中心：支持每个父目录单独选色、色板快捷按钮、一键彩色分组、换一组颜色和全部跟随主题。
- 父目录标签新增高度、间距、文字大小、边框粗细、颜色填充强度设置，并提供紧凑 / 标准 / 彩色卡片 / 醒目四套外观预设。
- 外部文件、文件夹或网址拖到父目录标签时会突出显示目标并显示目标名称；目标父目录没有普通子目录时会自动创建“常用”用于接收。
- 父目录批量配色改为一次 store 更新，避免连续多次写状态。
- 将父目录外观、父目录配色拆成独立设置组件和独立 CSS；重复的设置开关卡片抽到 `SettingsPrimitives.tsx`。
- 设置搜索新增“父目录配色 / 高度 / 间距 / 边框 / 颜色强度”等关键词。

详细说明见 `V106_PARENT_GROUPS_FREEDOM_UX_README.md`，结构复查见 `V106_CODE_STRUCTURE_REVIEW.md`。

## v0.1.105 设置面板透明度与玻璃效果修复

- 修复开启「玻璃感」后 62% / 68% / 66% 固定透明度覆盖滑块的问题。
- 「设置面板不透明度」现在拥有最高优先级：100% 会生成真正不透明的面板。
- 对内置 `rgba(...)` 半透明主题增加实色表面色计算，避免主题自带 alpha 让 100% 仍然透。
- 玻璃感改为只控制模糊、饱和度、高光和边缘，新增轻柔 / 标准 / 强烈预设与独立滑块。
- 新增实色 100%、90%、75%、60% 面板快捷按钮，设置搜索也可搜「不透明度 / 饱和度 / 高光」。
- 将 DisplaySettings 中的防抖滑块和设置面板外观拆成独立组件，新增样式也不再继续堆入 2700+ 行的 `Settings.css`。

详细说明见 `V105_SETTINGS_OPACITY_GLASS_UX_README.md`。


## v0.1.104 性能优化

这一版重点优化“项目多、图标多、连续调整设置时”的主线程卡顿：配置持久化改为浅比较后合并写盘，快捷项目不再为每张卡片注册全局鼠标监听，离屏图标延迟到接近可视区域再解析，全局搜索缓存重复的中文归一化/拼音计算，彩虹鼠标位置更新改走 requestAnimationFrame + DOM 更新；图片浏览器也改成可视区域缩略图加载、读取请求去重，并对尺寸拖动与裁剪指针更新做逐帧节流。

详细说明见 `V104_PERFORMANCE_OPTIMIZATION_README.md`。

## v0.1.103 主要更新

### 导入中心

- Lucy DB、Maye/Maya JSON/JDB 导入改为“先预览再执行”。
- 智能合并会统计新增、重复和冲突，冲突可逐项选择“保留当前 / 使用导入 / 两个都保留”。
- 保留“完全覆盖”模式，并在执行前二次确认。
- 每次真正导入前自动保存一份“上次导入前”回滚快照；数据设置中可一键恢复。
- Windows 路径大小写和斜杠差异会按同一目标识别，Lucy/Maye 外部 ID 不再作为合并依据。
- Maye JDB 不再使用 `Function(...)` 执行；改为只解析静态对象字面量，函数调用、成员访问和可执行表达式会被拒绝。

### 自由快捷设置

- 右上角快捷设置由固定 6 项扩展为 20 项。
- 支持拖动排序、收藏、隐藏/恢复和一键恢复默认布局。
- 收藏项在普通视图中优先展示；配置持久化到本地。
- 快捷设置菜单拆成独立组件和独立样式文件，减少 `TopBar.tsx` 的职责。
- 动画优化为更轻的位移/缩放反馈，并尊重“减少界面动画”。

### 设置搜索与代码结构

- 设置搜索新增细粒度索引，可直接搜索“贴边、回滚导入、动态壁纸、快捷键、行号”等具体设置。
- 点击搜索结果会跳到对应分类/子区块，并滚动到相关设置后短暂高亮。
- 导入中心、快捷设置、设置搜索均拆分为独立模块和样式文件，避免继续扩张 `Settings.css`、`DisplaySettings.tsx` 和 `TopBar.tsx`。

详细说明：

- `V103_IMPORT_CENTER_QUICK_SETTINGS_UX_README.md`
- `V103_CODE_STRUCTURE_REVIEW.md`
- `V103_TEST_RESULTS.txt`

## 开发与构建

需要 Node.js `20.19+` 或 `22.12+`，以及 Rust stable、Cargo 和 Windows WebView2 构建环境。

```bash
npm ci
npm run verify
npm run tauri:build
```

常用命令：

```bash
npm run tauri:dev
npm run typecheck
npm run test
```

当前程序版本：`0.1.110`
