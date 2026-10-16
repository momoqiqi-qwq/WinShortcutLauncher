# 更新日志

所有版本的重要改动都记录在此文件中，最新版本在最前面。

---

## V153（最新）— 右键菜单新增「显示完整名称」

- **子目录右键菜单**：管理区新增「显示完整名称」开关（位置在「子目录背景色」与「合并到子目录」之间），开启后左侧子目录名称完整换行显示，不再按行数省略。
- **项目右键菜单**：在「文字显示」子菜单下方新增「显示完整名称」开关，开启后项目卡片名称不再按最大显示行数截断，完整换行显示。
- 两处都直接切换既有的全局 display 设置（子目录 → `display.sidebarShowFullNames`，项目 → `display.showFullItemName`），与 设置-字体、空白处右键菜单**共用同一份状态**：任意一处改动，其它入口立刻同步显示 ✓，不必重启。
- 切换后弹出轻提示（`showLauncherNotice`）：开启提示「…将完整换行显示」，关闭提示「…恢复按行数省略」。
- 子目录菜单项已纳入右键菜单自定义体系：`DirectoryContextMenuItemId` 新增 `'fullNames'`，`DIRECTORY_CONTEXT_MENU_IDS` 与 设置-界面-右键菜单 的「子目录右键菜单」列表同步出现「显示完整名称」，可以像其它菜单项一样勾掉隐藏。
- 设置搜索：`item-name-full` / `sidebar-name-full` 两条结果补充「右键」「显示完整名称」关键词，搜「右键」即可找到这两个开关。
- **回归保护**：新增 `src/lib/__tests__/contextMenuFullNames.test.ts`（断言两个菜单都暴露该开关、且分别绑定到对应 display 字段）；`scripts/verify-source-fixes.mjs` 与 `src-tauri/build.rs` 各加 v153 断言；`src/lib/__tests__/experienceSettings.test.ts` 的目录菜单 id 数组同步插入 `'fullNames'`。
- 新增 GitHub Actions 回归工作流 `.github/workflows/regression.yml`：`npm run verify`（测试 + 前端构建）与 Windows 上的 `npm run test` + `cargo check`。
- 改动文件：`src/components/ContextMenu/DirectoryContextMenu.tsx`、`src/components/ContextMenu/ItemContextMenu.tsx`、`src/types.ts`、`src/lib/experienceSettings.ts`、`src/components/Settings/ContextMenuSettingsSection.tsx`、`src/lib/settingsSearchIndex.ts`、`src/lib/__tests__/contextMenuFullNames.test.ts`（新增）、`src/lib/__tests__/experienceSettings.test.ts`、`scripts/verify-source-fixes.mjs`、`src-tauri/build.rs`。

## V152 — AGENTS.md 写入「从 GitHub 检查更新并落地便捷版 exe」流程

- 纯文档改动，代码与构建产物不变；按规范照常升版本号（4 处版本号 + Cargo.lock 同步 0.1.152）。
- `AGENTS.md` 新增一节「更新：先看 GitHub 有没有新版，有就下载并落到便捷版 exe」：查 `releases/latest` → 取 `browser_download_url` 下载 NSIS 安装包 → 7z 解出裸 `shortcut-launcher.exe` → **替换便捷版 exe（改名换新，运行中也安全）** → sha256 校验 → 提醒重启生效。
- 🔴 明确**便捷版唯一有效位置**：`C:\Users\yile\DeskBox\DeskBox\Yue launcher.exe`；并把「不是桌面」写死 —— `C:\Users\yile\Desktop\Yue launcher.exe` 是 V135 前后的旧位置，本机已不存在。附三步核对法（全盘搜索 / 运行中进程 `ExecutablePath` / 开始菜单 `.lnk` 目标）。
- 本次实测证据：`releases/latest` = **v0.1.146**，本机工作树已 0.1.151（**Releases 落后于本地源码是常态**）；本地 `Yue launcher_0.1.151_x64-setup.exe` 解出 `shortcut-launcher.exe` 17,699,840 字节 ver=0.1.151；GitHub v0.1.146 资产（4,686,159 字节）解出 17,353,216 字节 ver=0.1.146。
- 顺带修正 `yue-launcher-build-release` 技能文档里残留的「部署到桌面」旧路径（改为 DeskBox），避免照着往桌面写文件。

## V151 — 启动恢复路径去掉重复的全树规范化

- **问题**：`src/stores/appStore/normalizers.ts` 的 `getFirstDirectory()` 只是想读「第一个分组 → 该分组第一个子目录」的两个 id，却会先跑一遍 `normalizeGroups()` 把整棵分组树重新规范化；而它的四个热路径调用点**传进去的本来就是 `normalizeGroups()` 的输出**，等于对同一份数据连续规范化两次。
- **实测（4000 个快捷项，20 次平均）**：`normalizeGroups` 3.916 ms/次，`getFirstDirectory` 2.975 ms/次，`restorePersistedState` 全程 7.006 ms —— `getFirstDirectory` 单独占了启动恢复的 **42.5%**。
- **修法**：`getFirstDirectory(groups, options?)` 新增 `{ normalized: true }` 快速路径，直接读已规范化树的 `groups[0].directories[0].id`；不传该选项时行为与以前完全一致（仍先规范化，兼容未规范化的原始数据）。`normalizeGroups` 末尾走 `reindex(sort(byOrder))`，输出必定有序且 order 被重置为 0..n-1，所以下标 `[0]` 就是规范化意义上的第一个，取值与慢路径等价。
- **优化后（同一台机器、同一载荷）**：快速路径 **0.004 ms**（慢路径 4.095 ms，约千倍），`restorePersistedState` 由 7.006 ms 降到 **4.377 ms**（约 −37%）；启动恢复的开销此时几乎只剩那唯一一次 `normalizeGroups`（restore/normalize 比值 0.83x）。
- **生效范围**：`src/stores/appStore/persistence.ts`（启动恢复 `restorePersistedState`）、`src/stores/appStore/slices/navigationSlice.ts`（`deleteGroup` 删分组、`moveDirectoryToGroup` 移动子目录）、`src/stores/appStore/slices/configSlice.ts`（`importConfig` 导入配置）四处改走快速路径；`cloneConfig()` 那两个调用点（`configSlice.resetAll` / `appStore.ts` 初始化）只有 49 个默认项且各执行一次，保持原样不动。
- **回归保护**：新增 `src/stores/appStore/__tests__/perfBaseline.test.ts`，既锁住「快速路径与慢路径结果完全一致」（含空数组、缺字段等边界回退），也记录启动恢复的耗时基线。
- 改动文件：`src/stores/appStore/normalizers.ts`、`src/stores/appStore/persistence.ts`、`src/stores/appStore/slices/navigationSlice.ts`、`src/stores/appStore/slices/configSlice.ts`、`src/stores/appStore/__tests__/perfBaseline.test.ts`（新增）。

## V150 — 便签子目录可以直接拖入网址和文字

- **便签子目录现在能接收拖入**：以前拖拽只认普通子目录和镜像子目录（开始菜单 / 映射文件夹），拖到便签上没有任何反应；本版把便签也加入可接收目标，侧栏的便签项和内容区的便签编辑区都能落点。
- **文字（微信 / QQ 会话文本）直接进便签**：Windows 原生拖拽层新增原始文本读取（`CF_UNICODETEXT` → `text/unicode` → `text/plain` → `text/x-moz-text-internal`，ANSI 兜底放最后），WebView 内拖拽则走 `DataTransfer`（多来源时取最长的一段，只有 HTML 时先剥标签转纯文本）。
- **新内容自动隔一行**：`src/lib/noteDrop.ts` 的 `appendNoteText()` 会先把已有正文尾部的空白收干净，再以「空一行」拼接新内容；空便签直接落内容，空白内容不写入。统一换行、清掉 NUL、去首尾空行，单次最多写入 20000 字符。
- **网址也是文字**：拖进便签的网址按原样追加（不再弹「添加快捷项目」/ 改名对话框，也不会生成 `.url`），便签里就是一行可复制的地址。
- **不会覆盖正在输入的内容**：便签为性能把输入留在本地草稿、空闲 450ms 才落盘，拖拽是直接写 store，所以新增草稿桥 `src/lib/noteDraftBridge.ts`：写入前先 `flush` 打开中的草稿，写入后把 store 新正文同步回编辑器草稿（同步时清掉待执行的自动保存定时器）。
- 改动文件：`src-tauri/src/native_browser_drop.rs`（载荷新增 `text`）、`src/lib/nativeExternalDrop.ts`、`src/lib/browserDrop.ts`（`extractDroppedPlainText` / `extractDroppedPlainTextAsync`、`stripHtmlToText`）、`src/lib/noteDrop.ts`（新增）、`src/lib/noteDraftBridge.ts`（新增）、`src/hooks/useWebsiteDropController.ts`（便签目标判定与追加）、`src/stores/appStore/slices/settingsSlice.ts` + `types.ts`（`appendDirectoryNote`）、`src/components/ContentArea/ContentArea.tsx`（便签区挂 `data-directory-id`）、`src/components/ContentArea/NoteEditor/useNoteEditorController.ts`（草稿注册与外部同步）。
- 验证：`npx tsc --noEmit` 0 错误；`npx vitest run` **38 文件 / 196 用例全过**（含新增 `src/lib/__tests__/noteDrop.test.ts` 6 用例：换行归一、空白丢弃、空便签直接落、自动隔一行、空内容不写、超长截断）。

## V149 — 用安装包装更新时，更新包默认下到你上次放的地方

- 关于页新增「检查更新」区块：直接查 GitHub 最新 Release（`api.github.com/repos/momoqiqi-qwq/WinShortcutLauncher/releases/latest`），挑出 setup exe，下载完可以一键运行安装包并退出自身。
- **更新包的默认下载位置自动检测**（本版主线）：按「上次下载目录 → 当前程序所在目录 → 系统下载文件夹 → 临时目录」依次尝试，每一档都要求目录存在且**真的可写**（写探针文件实测，不是只看路径），不合适就往后顺延；界面上直接写明「本次默认位置取自哪里」。
- **软件装在哪也自动认**：读当前 exe 所在目录，同目录若存在 `uninstall.exe` 判为已安装版本；运行安装包时把该目录作为安装目标一起传给 NSIS（`/D=`）。
- 记住上次下载位置：`ExperienceSettings` 新增 `installerDownloadDir` 字段（localStorage 版本 24 → 25，`normalizeExperience` 会给旧配置补空值），另外可手动「更改下载位置…」（目录选择框）或「恢复自动检测」（清空该字段）。
- 不占住进程的安装方式：写一个临时 cmd 脚本，延迟几秒后 `start` 安装包再自删，随后本程序退出 —— 避免安装程序要覆盖一个正在运行的程序。
- 护栏与细节：文件名取自 Release 资产名并拒绝含 `/`、`\`、`..` 的名字；下载先写 `.part` 再删旧文件改名，失败不留半成品；进度事件 `updater-download-progress` 每读 128 KB 一块、按 512 KB 节流上报；检查和下载分用两个超时（15 秒 / 15 分钟）。
- 顺手修掉 release 构建链上一个依赖问题：`schemars 0.8.22` 开 `preserve_order` 后按三泛型写法用 `indexmap 1.9.3` 的 `IndexMap`，而该版本默认不带 `std` feature，会报 `error[E0107]: struct takes 3 generic arguments but 2 generic arguments were supplied`；已在 `src-tauri/Cargo.toml` 的 `[build-dependencies]` 显式打开 `indexmap/std`（resolver v2 下主依赖图不管用，必须落在 build 图）。
- 验证：`cargo check --release --lib` 0 错误；`npx tsc --noEmit` 0 错误；`npx vitest run` **37 文件 / 190 用例全过**（含新增 `src/lib/__tests__/updater.test.ts` 10 用例：版本比较、安装包挑选、字节格式化、来源说明）；`node scripts/verify-source-fixes.mjs` OK。

## V148 — 子目录与项目的相邻颜色可以并成一组

- 新增「相邻组合」模式：左侧子目录列表和内容区项目网格可以按显示顺序**每 N 项并成一组**，组内共用同一个色系，原来各自独立的彩色框能连成一条色带甚至一整块同色区域。
  - 取色规则：组内**第一个已上色的项**的颜色作基色，其余**已上色**成员取该基色的同色系浅色（向白色混）；**没上色的项不参与、也不会被凭空染色**，所以随时能回退到「只有我选过的才上色」。
  - 相邻指的是**视觉上相邻**：内容区按当前显示顺序（含搜索过滤后的结果）分组，左侧按子目录排列顺序分组。
- 界面设置新增一节（界面 → 「子目录与项目彩色框」）：
  - 「相邻颜色」二选一：**各自独立**（默认，与 v147 行为完全一致）/ **相邻组合**。
  - 「每组项数」2–6 项；「组内深浅落差」0%–60%：**0% 时组内完全同色**，相邻几项看起来就是一个整体色块；调大则同色系逐格变浅，形成色带。落差累计上限 80%，最深一格不会糊成白色。
- 实现落在 `src/lib/colorFrames.ts`（新增）：`resolveColorFrameColors()` 统一算出每个子目录/项目实际该用的渲染色，UI 只负责把结果注入 `--directory-accent` / `--item-accent`；新增 10 个单元测试覆盖分组、基色选择、未上色项跳过、落差上限与非法色值容错。
- 兼容性：三个新显示字段（`colorFrameBlend` / `colorFrameGroupSize` / `colorFrameGroupTint`）都带默认值并逐字段夹取，旧配置文件读入后行为与 v147 一致；已有颜色数据不受影响。

## V147 — 子目录与项目也能上色框起来

- 把父目录的彩色框能力下放到**子目录**和**项目**：两者各自新增 `color` 字段（`#RGB` / `#RRGGBB` / `#RRGGBBAA`，非法值一律丢弃），上色后左侧子目录标签、内容区项目卡片都会带上同款彩色描边 + 填充 + 高亮光晕，和父目录标签一套逻辑。
  - 子目录：`.side-tab.has-custom-color` 复用 `--directory-accent` 变量，激活态用实色描边 + 3px 光晕 + 彩色数字徽标，开始菜单/映射子目录的左侧强调条也跟着换成该颜色。
  - 项目：`.item-card.has-custom-color` 复用 `--item-accent`，选中时实色描边 + 光晕，图标颜色也随之变化。
- 右键入口补齐：**子目录右键 → 「子目录背景色」**、**项目右键 → 「项目背景色（N 项）」**（多选时批量生效），各有 8 个预设色 + 「自定义颜色…」（走输入框，正则校验后写入，非法值弹提示且不改动配置）。子目录右键菜单项同时进入「右键菜单项」设置项与搜索索引。
- 设置页新增两块：
  - **导航 → 「子目录与项目配色」**面板：列出全部父目录下的子目录（显示为 `父目录名 / 子目录名`），以及当前子目录/当前父目录下全部项目；每块都带「一键彩色 / 换一组颜色 / 全部跟随主题」三个批量按钮，逐行给单个子目录或项目选色。镜像子目录不属于本地配置，只给一行提示文案。
  - **界面 → 「子目录与项目彩色框」**：4 个外观预设（淡描边 / 标准 / 彩色卡片 / 醒目）+ 边框粗细（0–4px）、填充强度（4–55%）、圆角或方形三个滑杆，通过 `--color-frame-border-width` / `--color-frame-strength` / `--color-frame-shape-*` 三个 CSS 变量挂在应用根节点上，全局一次生效。
- 配色不影响已有数据：`Directory.color` / `ShortcutItem.color` 走既有的 `normalizeGroups` 通道随配置一起持久化，无需迁移；新增的三个外观字段由 `normalizeDisplay` 逐项夹取（越界取边界值，非法枚举回落到 `round`）。
- 回归护栏：`normalizers.test.ts` 断言合法色值保留 / 畸形色值丢弃与外观字段的上下夹取；`appStoreSlices.test.ts` 断言 `setDirectoryColor(s)` / `setItemColor(s)` 只改动点名的那一个子目录或项目、不存在的 id 不制造多余对象替换；`experienceSettings.test.ts` 的菜单项全量断言同步加入 `color`。
- 验证：`npx tsc --noEmit` 0 错误；`npm test` **35 文件 / 170 用例全过**。

## V146 — 主线程阻塞清零（第二批）

- 接着 V145 的思路继续排查「主线程上跑耗时活儿」，又清掉四处，都是同一类问题：
  1. **开机自启动状态用 PowerShell 查**。`get_auto_start` / `set_auto_start` 各起一个 `powershell.exe` 读写注册表，实测单次 **330–400 ms**（进程启动占绝大部分）。打开设置 → 操作行为时会卡约 0.4 秒，切换开关要连续跑 `set` + `get`，接近 **0.8 秒**。现在改用 `RegGetValueW` / `RegSetValueExW` / `RegDeleteValueW` 直接读注册表（新增 `src-tauri/src/windows_registry.rs`），耗时降到微秒级。
  2. **浏览器探测兜底走 PowerShell**。`find_browser_executable` 在候选路径都找不到时，会去 `App Paths` 注册表项查（`App Paths\<exe>`），原来是用 PowerShell 查的 —— 每有一个没装的浏览器就多起一个进程。启动时扫一次浏览器目录、以及每次「用指定浏览器打开网址」，都会白白卡 **约 0.4 秒**。现在同样改走原生注册表。
  3. **中转站拖拽复制跑在主线程**。`copy_transfer_paths_to_folder` 是同步命令，复制/移动大文件或整个文件夹时整个界面冻住（几 GB 的文件夹能冻几十秒）。现在改成 `async` + `spawn_blocking`，界面全程可交互。
  4. **纯 I/O 命令仍在主线程**。`scan_browsers`（扫浏览器配置目录）、`save_config` / `load_config`（读写整份配置 JSON，含自动保存）、`import_legacy_db_config`（读旧版数据库并转换）一并挪到阻塞线程池。
- 顺手修掉一个原生读取引入的真实缺陷：最初没加 `RRF_NOEXPAND`，而 `RegGetValueW` 会**自己**展开 `REG_EXPAND_SZ`，却仍按未展开的长度回报 `pcbData` —— 实测把 `%SystemRoot%\System32` 读成「`C:\Windows\System32` 后面多一个 NUL 和类型数字 2」（那正是 REG_EXPAND_SZ 的类型值）。凡是走环境变量的 `App Paths` / `Run` 值都会被这个尾巴污染（路径带上 NUL 和 `2`，浏览器探测或自启动命令都会失效）。现在加 `RRF_NOEXPAND`，环境变量展开统一由 `expand_environment` 自己做，与 PowerShell 的差分比对恢复逐字符一致。
- 回归护栏：`src-tauri/build.rs` 与 `scripts/verify-source-fixes.mjs` 补了一组不变量 —— 必须存在原生注册表调用（`RegGetValueW` / `RegSetValueExW` / `RegDeleteValueW`）且必须带 `RRF_NOEXPAND`，`commands.rs` **不许**再出现 PowerShell 版自启动脚本与 `Test-Path $k` 式 App Paths 查询，中转站复制、浏览器扫描、配置读写、旧库导入必须都是 `async`。
- 验证：独立基准工程用 `#[path]` 直接引入**要发布的那份** `windows_registry.rs` 后实测 —— 旧 `get_auto_start`（PowerShell 读 Run 键）**570–854 ms**，旧 `find_registered_app_path`（PowerShell 查 App Paths）**435–762 ms**，新的 `read_run_entry` / `find_app_path` 各跑 2000 次平均 **0.023 ms**（最快 0.011 ms），约 **3 万倍**。六个键值与旧 PowerShell 路径差分比对**逐字符一致**（`Run\Yue launcher`、`App Paths` 的 chrome / msedge / floorp / 缺失项）；写入、读取、删除往返与「删除不存在的值」的幂等行为也都验证通过（`Ok(true)` → 值消失 → `Ok(false)`）。`node scripts/verify-source-fixes.mjs` / `npx tsc --noEmit`（0 错误）/ `npx vitest run`（35 文件 167 用例全过）/ `cargo build --release --lib`（仅既有警告）全绿。

## V145 — 映射文件夹卡顿修复

- 定位到卡顿的三条链路，逐条修掉：
  1. **取图标的命令跑在主线程上**。Tauri 里没标 `async` 的命令在**主线程**执行（官方文档：*Commands without the async keyword are executed on the main thread unless defined with `#[tauri::command(async)]`*），而 `get_file_icon` 每次都要起一个 `powershell.exe`，实测单次约 **560 ms**。映射文件夹列的是根目录里**全部文件与文件夹**（开始菜单只列快捷方式），几十上百个条目就等于把界面冻结几十秒 —— 这就是卡顿的主因。现在 `get_file_icon` / `read_icon_as_data_url`，以及映射文件夹、开始菜单、`resolve_lnk`、`get_file_info` 等会扫盘或起 PowerShell 的命令全部改成 `async` + `spawn_blocking`（新增 `src-tauri/src/blocking.rs` 统一封装）。
  2. **扫描完就批量预取图标**。`mappedSlice` / `startMenuSlice` 以前在每次扫描结束后，对**每一个**条目各发一次取图标请求，把 `iconCache` 的 6 路并发在主线程上排成了长队。现在切片不再预取，图标交给 `ItemCard` 既有的 IntersectionObserver 视口懒加载（320px 预取边距 + 内存/持久化两级缓存），只有滚到眼前的条目才会去取。
  3. **每个图标一个 PowerShell 进程**。新增 `src-tauri/src/icon_native.rs`：直接 `SHGetFileInfoW` 取 `HICON` → `GetIconInfo` 问出真实尺寸 → `DrawIconEx` 合成到 32bpp 顶向下 DIB → 反预乘 alpha → `png` 编码成 data URL。实测 **2.78 ms/图标**，比原来快约 **200 倍**；PowerShell 脚本保留为兜底（原生拿不到图标时才走）。输出格式仍是 `data:image/png;base64,`，前端与持久化缓存无需改动。
- 顺带修掉的两个真实问题：
  - `DrawIconEx` 在 32bpp 目标上是**按 alpha 混合**画的，而目标 DIB 初始全透明，于是结果被**预乘**了一次（半透明边缘会偏暗，浅色主题下能看到一圈暗边）。现在逐像素反预乘还原；与旧实现逐像素比对：**可见像素（alpha ≥ 128）最大通道差 ≤ 3/255**，纯属取整误差。
  - 旧实现用 `ExtractIconEx` + `ExtractAssociatedIcon`，对**文件夹**根本取不到图标；`SHGetFileInfoW` 走系统关联，文件夹现在能拿到正常的文件夹图标。
- 拖入合并：往镜像目录拖多个文件时，`create_shortcuts` 以前**每个文件起一个 PowerShell 进程**（20 个文件 ≈ 12 秒）。现在合并成**一条脚本一次跑完**，成功与否在 Rust 侧用「目标文件是否存在」判定，不解析 PowerShell 的 stdout（本机是 GBK，解析输出容易出乱码）。
- 回归护栏：`src-tauri/build.rs` 与 `scripts/verify-source-fixes.mjs` 各加了一组不变量检查 —— 图标命令必须 `async`、必须优先走原生、镜像切片**不许**再出现 `resolveIconDataUrl`、映射/开始菜单命令必须 `async`、拖入必须合并成一次 PowerShell；新增 `src/stores/appStore/__tests__/mappedFolderPerformance.test.ts` 断言一次扫描只发一次 invoke。
- 验证：`npm run typecheck` 0 错误；`npm test` 35 文件 / 167 用例全过；`cargo build --release --lib` 通过（仅既有警告）；原生取图标与旧 PowerShell 实现做了逐像素差分（结论见上）。

## V144 — 按名称排序时文件夹优先分组

- 「按名称」排序改为**两级比较**：一级先按类型分组，二级再按名称排（中文/数字感知）。文件夹永远排在最前，其余类型（command / file / url）各自成组、组内按名称。
- 修掉的现象：镜像子目录（映射文件夹、开始菜单）以及含文件夹快捷方式的普通子目录，在「按名称」下会变成文件夹和文件按首字母交错混排；现在文件夹统一归到前面，文件类统一在后面。
- 「按类型」排序保持原有语义（纯类型名分组 command → file → folder → url），未做改动。

## V143 — 版本更新提示

- 应用启动时对比「当前构建版本」与「上次运行记录的版本」：不一致（含首次运行）就弹出提示 **「当前版本是 vX.Y.Z」**，随后记录本次版本；同版本重复启动不再打扰。
- 版本号唯一来源为 `package.json`：新增 `src/lib/appVersion.ts` 统一导出 `APP_PACKAGE_VERSION`，设置 → 关于页改为复用同一常量，不再各自读一份。
- 新增配置字段 `experience.lastSeenVersion`（随配置持久化）；store 版本号 `APP_STORE_VERSION` 23 → 24，旧配置经归一化后该字段为空，因此升级后首次启动会正常看到提示。

## V142 — 便捷版同步写进开发规范

- `AGENTS.md` 新增「构建后必须同步便捷版」一节：每次构建出可运行产物后，把免安装裸 exe 同步到桌面收纳盒里的便捷版位置，避免日常双击用的还是旧版本。
- 记录便捷版的源 / 目标路径、备份位置、一键同步脚本的调用方式，以及「便捷版正在运行时如何替换」的处理法 —— 运行中的 exe 不能覆盖、不能删除，但**可以重命名**，所以走「改名换新」，用户当前窗口不受影响、重启后生效。
- 本次为**纯文档改动**，不含代码与资源变化。

## V141 — 界面文字色彩点缀开关

- 设置 → 界面新增「文字色彩点缀」开关，可随时开启/关闭主界面和设置界面的文字色彩变化。
- 开启后为父目录、子目录、项目标题、设置分组标题等不同界面文字使用主题派生色，减轻纯单色文字的单调感，同时保留原有主题的可读性。

## V140 — 映射文件夹子目录（自选文件夹实时镜像）

- 空白处右键 →「新建子目录」新增第五类**映射文件夹子目录**：创建时先选一个文件夹，之后该子目录实时镜像这个文件夹的内容（扫根目录一层，文件与文件夹全部显示）。它与「开始菜单子目录」同源——都是「不落盘、实时读、写回真实文件夹」的镜像目录，区别只在根目录由用户自选、且条目不做类型过滤。
- 拖入应用/文件/文件夹即写回所选文件夹：`.lnk` / `.url` 原样复制，`.exe` 与文件夹用 `WScript.Shell` 生成指向它的 `.lnk`（带 `WorkingDirectory`），网址写成 `.url`；重名自动加「(2)」后缀，已在目标文件夹内的路径自动跳过。
- 条目右键菜单作用于**真实文件**：重命名改真实文件名（保留原扩展名），删除送**回收站**（可恢复）；固定、图标编辑、文字显示、复制/移动到目录等只影响配置的操作在该目录下隐藏。
- 子目录右键菜单新增「刷新映射文件夹」「打开映射文件夹」「重新选择文件夹」（重新选完立即重扫）；「清空子目录项目」「粘贴项目」「添加系统功能」禁用，「便签/普通切换」隐藏，且不参与「合并到全部」。
- 侧栏用虚线强调条与开始菜单子目录区分（实线 vs 虚线），并显示实时条目数；内容区顶部有刷新按钮，未选文件夹时空态提示「右键 → 重新选择文件夹」。
- **可建多个**：与开始菜单子目录（每个父目录唯一）不同，映射文件夹子目录不限数量，各镜像各自的文件夹（条目按 `directoryId` 分组存储）。所选路径随配置持久化（`directory.mappedPath`），条目本身仍只在运行时，不落盘。
- 安全边界：删除/重命名前校验目标确实位于所选文件夹内，越界拒绝；比较时统一小写、统一分隔符、剥掉 `\\?\` 前缀，并**带上路径分隔符比对**（否则 `…\Prog2\x` 会被误判成在 `…\Prog` 内）。
- 重构：镜像逻辑抽成 `folder_mirror.rs` 共享核心（`EntryFilter::ShortcutsOnly` / `All` 区分两类镜像语义），`start_menu.rs` 与新增的 `mapped_folder.rs` 都是薄封装，后续再加镜像类目录只需加一个薄封装。
- 已知限制：只扫根目录一层，不递归子文件夹；内拖（把启动器已有项目拖进映射子目录）不生效，只有从外部拖入才写回；`WScript.Shell` 建 `.lnk` 与回收站删除两条分支**未做运行时验证**（本沙箱硬拦 COM 实例化 / Add-Type / 回收站 API，仅做静态审查 + 路径护栏独立 `rustc` 编译验证）。

## V139 — 开始菜单子目录（直连系统开始菜单）

- 空白处右键 →「新建子目录」新增第四类**开始菜单子目录**：直接连到当前用户的开始菜单文件夹 `%APPDATA%\Microsoft\Windows\Start Menu\Programs`，内容实时镜像该文件夹（只扫根目录一层的 `.lnk` / `.url` / `.exe`），外面装了新软件切回该子目录即可看到，无需手动添加。
- 把应用、文件或文件夹拖到这个子目录上，就在系统开始菜单文件夹里生成对应快捷方式：`.lnk` / `.url` 原样复制，`.exe` 及文件夹用 WScript.Shell 生成指向它的 `.lnk`；重名自动加「(2)」后缀，已在开始菜单里的路径自动跳过。网址拖入则写成 `.url` 快捷方式。
- 子目录右键菜单新增「刷新开始菜单」「打开开始菜单文件夹」两项；「清空子目录项目」「粘贴项目」「添加系统功能」在开始菜单子目录下禁用，「便签/普通切换」隐藏（该子目录每个父目录唯一，且不参与合并）。
- 条目右键菜单改为作用于真实文件：重命名改真实 `.lnk` / `.url` 文件名，删除送入**回收站**（可恢复），并保留打开、以管理员身份运行、打开所在文件夹、复制名称/路径；固定、图标编辑、文字显示、复制/移动到目录等只影响配置的操作在该目录下隐藏。
- 侧栏开始菜单子目录用左侧强调条区分并显示实时条目数；内容区顶部有刷新按钮，空态给出拖入引导；图标走既有 iconCache 异步补齐，不阻塞列表渲染。
- 安全边界：删除/重命名都会先校验目标确实位于开始菜单文件夹内，越界直接拒绝；比较时统一小写、统一分隔符、剥掉 `\\?\` 前缀，并**带上路径分隔符比对**（否则 `…\Programs2\x.lnk` 会被误判成在 `…\Programs` 内）；扫描结果只存在于运行时，不写入配置（`normalizeDirectory` 会丢弃该类型子目录落盘的 items）。
- 已知限制：只对接当前用户开始菜单（公共开始菜单 `%ProgramData%` 需要管理员权限，未纳入）；扫描不递归子文件夹。

## V138 — 同色标签成组框 · 折叠动画优化

- 顶栏父目录标签：颜色相同且相邻（顺序上紧挨着）的标签 ≥2 个时，自动在外面画一个颜色更鲜艳的描边发光框，把同色标签框成一组；标签换行时框按行分段描边，仍是同一组。
- 抓住框的四条边框即可整组拖动：整组标签跟随框一起移动，落点处显示插入指示条，松手后整组插到目标标签前/后；Esc 可取消。框中间镂空，不影响标签本身的单击、双击重命名、右键和单独拖动排序。
- 成组框实时跟随标签尺寸与换行变化（ResizeObserver 测量），窗口缩放（UI 缩放 zoom）下拖动位移已做换算；拖动单个标签排序时成组框自动隐藏避免遮挡。
- 设置面板折叠区块动画优化：箭头从「▸/▾ 字符切换」改为常驻 ▾ 旋转 90° 过渡，展开/收起内容新增 0fr ↔ 1fr 高度过渡——收起不再瞬间消失，而是平滑收回；内容常驻挂载，折叠时通过 visibility 保证不可聚焦、不可交互。
- 「减少动画」开启时（体验设置或系统级），折叠与成组框动画全部禁用。

## V137（最新）— 主题画廊迷你界面预览

- 主题卡片预览从抽象色条改为应用界面迷你模拟图：顶栏（accent 圆点 + 搜索条）、侧边栏、图标格与高亮块，一眼可辨主题装上后的真实观感。
- 预览配色直接取自主题 `vars`（`--bg` / `--panel` / `--panel-2` / `--text` / `--border` / `--accent`），浅色与深色主题均按自身边框与底色渲染。
- 移除 31 个主题中与 `vars` 重复维护的 `preview` 字段及 `ThemePreset` 类型定义，预览与主题数据不再两处维护。

## V136（最新）— 父目录字母排序 · 一键还原

- 顶部「父目录按字母排列」按钮改为切换式：点击先把当前父目录顺序保存到配置（`display.sortGroupsSavedOrder`），再按名称排序。
- 再次点击时按钮显示「还原排列顺序」（图标切换为撤销样式），点击恢复之前保存的顺序并清除保存状态。
- 保存的顺序随配置持久化，重启应用后仍可还原；排序后删除的父目录还原时自动跳过，新增的父目录接在末尾。
- 新增字段归一化：非法值/空数组按未保存处理；补充归一化测试。

---

## V10（最新）— 滚动条设置 · 设置分组折叠

- 设置 → 界面 新增「滚动条 / 滑动条」设置：可调整宽度、圆角、滑块颜色、悬停颜色、轨道颜色，支持跟随当前主题 accent 色。
- 设置 → 界面 各设置块新增展开/收起箭头，方便在设置项很多时快速折叠。
- 滚动条设置同步作用到左侧子目录、设置面板和其他可滚动区域。

---

## V8 — 窗口越界弹回修复

修复 `useWindowBoundsGuard.ts` 的触发时机：

- 移除旧的 `onMoved + 180ms` 防抖逻辑，改为 `mouseup` 后才检查窗口是否超出屏幕。
- 只有「窗口确实超出屏幕边界 + 用户已经松开鼠标」两个条件同时满足时，才执行弹回动画。
- 贴边隐藏原生模式启用时跳过边界弹回，避免和隐藏/展开动画抢窗口位置。

---

## V6 — 贴边隐藏 Rust 原生即时模式

- 贴边隐藏由 Rust 后端原生控制，轮询周期 8ms。
- 使用 Win32 `GetCursorPos / GetWindowRect` 判断鼠标和窗口位置，不依赖前端事件。
- 隐藏和展开使用 Win32 `AnimateWindow`，动画速度可在设置中调节，默认 90ms。
- 默认贴边隐藏延迟改为「立即」。

---

## V5（2026-06）— 贴边体验优化

- 贴边触发条支持在「设置 → 操作」中调节宽度、透明度、是否跟随主题 accent 色、自定义颜色。
- 关闭按钮行为可选「隐藏到系统托盘」或「直接退出应用」。
- 贴边滑入/滑出改为 Rust 后端 `SetWindowPos` 原生位置动画，避免透明窗口出现半透明框残影。
- 从触发条展开后，如果用户将主窗口拖离屏幕边缘，会退出贴边模式，不会再自动吸回边缘。

推荐参数：隐藏延迟「立即」或 0.3s，动画速度 70～100ms，触发条宽度 8～12px。

---

## V4 — 贴边隐藏 Rust 原生轮询

从前端事件驱动改为 Rust + Win32 原生轮询控制器：

- `GetCursorPos / GetWindowRect` 每 8ms 检测鼠标与窗口边界。
- `AnimateWindow` 执行原生滑入/滑出动画。
- 「立即」模式不再强制加 40/60/100ms 延迟。
- 隐藏后需要鼠标离开触发条再进入才会展开，避免反复闪烁。

---

## V3 — 贴边隐藏双窗口稳定版

- 改成双窗口架构：主窗口 `main` 负责完整界面，独立的 `edge-strip` 触发条窗口负责悬停展开。
- 隐藏时主窗口滑出后真正 `hide()`，触发条单独保留在屏幕边缘。
- 不再出现「展开后马上收回 / 一贴边就闪烁」的同窗口事件循环问题。

---

## 2026-06-19 — 独立缩放 · 设置拖动 · 新图标 · 内容搜索

**缩放**
- 主界面与设置界面缩放完全分离，`Ctrl + 滚轮` 只缩放鼠标所在区域，`Ctrl + 0` 重置。
- 设置 → 界面 可分别调节「主界面缩放」和「设置界面缩放」。

**设置窗口**
- 按住设置窗口边框可拖动位置；内容区、按钮、输入框不会误触发拖动。
- 右下角调整大小，顶部和右下角均有关闭按钮。

**新应用图标**
- 透明背景火箭/快捷启动主题图标：`launcher_new.ico / launcher_new_512.png / launcher_new_256.png`。

**内容区搜索**
- 新增快速搜索栏，`Ctrl + F` 聚焦，`Esc` 清空。

---

## 2026-06-19 — 贴边滑出屏幕动画 · 单击启动修复 · 越界弹回

- 贴边隐藏改为真实位置动画：收起时滑出屏幕，只保留边缘触发条。
- 修复单击启动模式：使用 `pointer up` 判定，避免 dnd-kit 拖拽吞掉 click 事件。
- 新增窗口越界回弹：拖动超出显示器边界后松开鼠标自动弹回。

---

## 2026-06-19 — edge-tabs-context 修复

- 边缘检测容差从 3px 扩大到 24px，支持靠近左/右/上边缘后隐藏。
- 设置 → 界面 新增父目录标签设置：等宽显示、等宽宽度可调、分组框形状（圆角/方形）。
- 增强空白区域右键：内容区、左侧栏、顶部栏、外层空白区域均弹出对应菜单，不再出现浏览器默认右键菜单。

---

## 2026-06-19 — 设置浮窗 · 贴边优化 · 图标自动恢复

- 设置界面改成可拖动、可缩放的浮动窗口，不再全屏遮罩。
- 贴边隐藏「立即」模式优化为更短轮询与零延迟触发。
- 项目没有自定义图标时，按项目路径自动重新提取系统图标。

---

## 2026-06-19 — 贴边延迟调节 · 左侧栏细化

- 自动贴边隐藏支持「立即隐藏」和 0.5～10 秒可调延迟。
- 设置 → 界面 新增左侧子目录列表调节：宽度、文字大小、项高度、间距、圆角。

---

## 2026-06-19 — 菜单 · 图标路径 · 设置面板重组

- 右键二级子菜单根据窗口空间自动选择左右展开。
- 项目图标支持相对路径，如 `icons/app.png`、`./icons/app.png` 或 `/icons/app.png`。
- 设置面板改为左侧分类导航：**常规、操作、界面、数据**。

---

## 2026-06-18 — 系统图标路径 · 菜单修复 · 自动保存

- 「引用系统图标」支持 `/system/imageres.dll,0`、`/system/shell32.dll,3` 等路径（数字为图标资源索引）。
- 全局禁止浏览器默认右键菜单。
- 设置面板新增右键菜单大小：菜单字体大小、行高、最小宽度。
- 设置面板新增自动保存：可选择保存目录、文件名、保存间隔，并可立即保存一次。

---

## 早期版本 — 核心模块

**菜单与托盘**
- 新增 Windows 系统托盘：左键显示主窗口，右键菜单含显示/隐藏/退出。
- 关闭窗口时默认隐藏到托盘。
- 快捷项目「编辑」改为统一弹窗（名称、路径、类型、图标一次显示）。
- 右键二级菜单改成互斥显示。
- 父目录右键菜单精简为「新建分区 / 删除分区」。

**多选操作**
- `Delete` 键删除选中项目；无选中时删除当前子目录（删除前确认）。
- `Ctrl + A` 选中当前页面全部项目。
- `Ctrl + 左键` 多选，`Ctrl + 右键` 切换多选。
- 右键菜单新增多选操作：加入多选、取消选择、选中全部、清除多选。

**拖入加速**
- 拖入文件后先用路径立即显示项目，再后台异步解析真实路径和系统图标，避免大量文件拖入时卡住。

**初始版本**
- 顶部父目录标签：拖拽排序、双击改名、自动换行，最多 3 行后横向滚动。
- 左侧子目录标签：拖拽排序、双击改名，选中时高亮并显示全名。
- 内容区快捷项目：ShellX 风格图标 + 多行文字卡片，支持 1～5 行、字号设置、tooltip 全名。
- 右键菜单：打开、管理员运行、打开所在文件夹、编辑、编辑图标、文字显示子菜单、复制/移动/删除。
- 设置面板：主题、透明度、文字显示、自动贴边隐藏、启动方式、导入/导出配置。
- Windows 系统工具内置分组。
- 文件/文件夹/`.lnk` 拖入添加，Rust 解析 `.lnk` 并提取 Windows 图标。
- 配置持久化：Zustand localStorage + JSON 导入导出。
