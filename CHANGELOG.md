# 更新日志

所有版本的重要改动都记录在此文件中，最新版本在最前面。

---

## V198（最新）— 图片卡片支持缩放手势，框不动只缩放里面的图片

- 鼠标悬停在图片卡片上，**Ctrl + 滚轮**（触控板双指捏合在 Chromium 里也就是带 `ctrlKey` 的 wheel）缩放框里的图片：往上滚放大、往下滚缩小，1.0× 到 6.0×，乘性步进 1.12，越放大步长手感越一致。
- 卡片的宽高（`imageSize`）完全不动 —— 框、排序位、邻居布局一个像素都不变，只有 `<img>` 自己 `transform: scale()`，超出部分仍被卡片原有的 `overflow: hidden` 裁掉。
- 缩放过程中卡片左上角浮出一个百分比小标签（1.1 秒后自动消失）；停手 220ms 才把倍数写进配置，连续滚不会每一下都写盘。
- 缩放值存进项目的新字段 `imageZoom`（只在图片卡片、且确实放大过时落盘；1 不写，旧配置不受影响）。读取时统一过 `clampImageCardZoom`，脏值回到 1，不会把卡片撑坏。
- 右键菜单新增「还原图片缩放（当前 xxx%）」：只在真的放大过时可点，一键回到 100%；卡片尺寸依旧不动。
- 全局「Ctrl + 滚轮缩放界面」给图片卡片让道：指针在图片卡片上时这次手势归卡片，界面 UI 比例不会被顺手改掉（`useCtrlWheelZoom` 里按 `.item-card.image-card` 判断）。
- 卡片提示文字同步改写，区分清楚「拖边框改卡片大小」和「Ctrl + 滚轮只缩图」两件事。
- 新增 5 条单元测试钉住倍数的夹取、边界（1× / 6× 封顶）、脏值兜底和乘性步进；全量 54 个测试文件 / 315 条用例全绿。

---

## V197 — 拖入网址时的中文标题几乎是立刻出现

- 翻译改成「两个服务赛跑」：Google 一发就跑，MyMemory 只等 700ms 补位；谁先给出结果就用谁，另一边立刻放弃、不再白等。以前是 Google 串行等满 3 秒、失败了才轮到 MyMemory，一条冷标题要 4 秒左右才出中文。
- 单次翻译的总等待从 3 秒压到 2 秒（`TRANSLATION_TOTAL`），单请求超时 1.5 秒。实测本机 Google 侧经常连不上（每次都在 1.5 秒被判超时），现在这条路最多只拖 700ms；连续两次不可达就把该服务暂时摘掉，MyMemory 直接起跑，实测 470–950ms 出结果。
- 拖动悬停阶段就预热标题：以前只有「拖的是纯网址、没有链接文字」才预取，拖带文字的链接反而不预热；现在两种都预热，松手时多半已经命中缓存。
- 翻译结果落盘到 `favicons\website_titles_translations.json`（只存成功的、按时间保留最新的），重启后热门站点标题不用再联网——以前只有内存缓存，关掉应用就清零。
- 标题缓存落盘改成后台线程写（临时文件 + rename），不再压在一次拖入的返回路径上。
- 新增两个单元测试钉住「翻译快照能跨重启读回」「超出上限时保留最新条目」；`--lib` 全量测试 39 passed / 1 failed，失败的是 `image_card::tests::trims_quotes_and_spaces`（往系统临时目录写测试文件被拒，与本次改动无关，改动前就是这样）。

---

## V196 — HTML 卡片可以隐藏，工具栏有「显示隐藏项目」开关

- HTML 子目录里右键任意卡片新增「隐藏这张卡片」：只把这张卡从卡片墙收起来，磁盘上的页面不动，扫描结果、卡片尺寸、改名、颜色全部原样保留；已隐藏的卡片在右键菜单里变成「取消隐藏」。
- 卡片墙工具栏新增「显示隐藏项目」开关（右侧带隐藏张数）：打开后被隐藏的卡片以虚线框 + 褪色 + 「已隐藏」徽标回到墙上，可以正常打开、右键取消隐藏；开关状态写在目录的 `htmlView.showHidden` 里，重启后延续上次的选择。
- 隐藏状态按页面绝对路径存在 `Directory.htmlHidden`，读取配置时做规范化（只认 `true`，脏值直接丢掉），旧配置不用迁移。
- 搜索、计数、相邻颜色组合与同色成组框都只按当前可见的卡片计算 —— 被隐藏的卡片不会把自己的颜色带给邻居。
- 卡片全被隐藏起来时，空状态会说明还有几张卡片收着，并直接给一个「显示隐藏项目」按钮，不用回头找工具栏。

---

## V195 — 修「在文件管理器中显示」定位不到文件

- 修了 HTML 目录里卡片右上角「在资源管理器里显示」点了以后落到「文档」文件夹、定位不到文件所在目录的问题（普通项目卡片的右键「打开所在文件夹」也是同一个毛病，一并修好）。
- 根因在 Rust 侧拼 explorer 参数：`/select,"C:\x y\index.html"` 交给 `Command::arg()` 后，标准库会再套一层引号并把内部引号转义成 `\"`，explorer 认不出 `/select` 前缀，就按「没有参数」处理、打开默认文件夹。改成 `raw_arg` 原样送进命令行，并去掉目录路径尾部的反斜杠（`"C:\dir\"` 的 `\"` 会被当成转义引号）。
- 「打开 HTML 文件夹」按钮走 `explorer_argument` 同一套拼法，两条路径不会再各修各的。
- 新增单元测试钉住「命令行只允许一层引号」，防止以后被改回 `arg()`。

---

## V194 — 单击启动模式下项目拖不动

- 修了「单击启动」模式下项目之间拖不动的问题：以前必须先按住不动等满长按时间（默认 220ms）才允许排序，直接按下就拖完全没有反应；现在只要指针拖出点击容差就立刻进入排序，和双击启动模式手感一致。
- 长按拖动仍然保留，按住再拖一样能用；只按不动松手依旧是单击启动/单击动作，不会被误判成拖拽。
- prebuild 守卫里补了两条断言，防止「拖出容差就接管排序」这层逻辑被后续改动悄悄改回去。

---

## V193 — 文本框卡片

- 空白处右键新增「添加文本框」：在当前子目录放一块文本卡片，双击卡片直接改字，Esc 放弃、Ctrl+Enter 或点开别处保存。
- 文本框和图片卡片一样带八向缩放手柄：拖边或四角改宽高，左侧/上侧拖动时被拖的那条边始终跟着光标，松手才落盘。
- 右键「编辑文本」可改内容、字号（12–48）和对齐方式；名称留空时自动取第一行文字，复制时按「复制文本内容」处理。
- 文本框参与排序、复制、剪切、副本、移动到目录这些原有项目操作；开始菜单/映射文件夹/HTML 目录里不提供添加（内容来自真实文件，配置里没有地方存）。

---

## V192 — 配置文件列表的多行显示

- 「配置文件」面板右上角新增「多行」开关（刷新按钮右边，开启时带强调色）：切到多行后名称不再截断、完整换行显示，来源、更新时间与创建时间各占一行，粘贴/使用按钮挪到单独一行，长配置名和导入来源都能看全。
- 单行紧凑布局保持原样；开关状态记在 localStorage，重启后延续上次的选择，切换布局时会自动收掉已展开的行菜单和色板，避免弹出层按旧行高错位。
- 多行模式下同色成组框、拖动排序、右键菜单和色板位置都跟随新的行高重新测量，原有交互不受影响。

---

## V191 — GitHub 配置备份

- 设置 → 数据新增 GitHub 备份配置：可连接私有仓库、保存加密令牌、手动备份、恢复历史版本并断开连接。
- 首次连接可按 `Backup-YueLauncher` 规则自动创建私有仓库；令牌仅以 Windows DPAPI 加密文件保存，不写入配置 JSON、日志或仓库地址。
- 备份内容使用版本化 `.yuebackup` 压缩包上传到 `.yue-launcher/backups/<device>/`，不覆盖本地自动保存和导入导出功能。

---

## V190 — 关机与退出时自动保存配置

- 自动保存支持在应用退出前再写入一次配置；开启后会在每次配置变更后及时更新文件，Windows 关机/注销时也能保留最近一次副本，减少关机前的配置丢失。
- 数据设置继续支持导入、导出、指定保存目录、保存文件名和定时保存。

---


## V189 — 配置行可以上色了，相邻同色自动圈成一组

- 「配置文件」面板每行左侧多了一个颜色圆点：点开就是 8 个预设色 + 「跟随主题」+「自定义…」。自定义支持 `#RGB` / `#RRGGBB` / `#RRGGBBAA`，格式不对会提示；留空等于跟随主题。色板在面板底部会自动朝上弹，不会被列表裁掉。
- 上色只改外观：行左边浮出一条色条，边框和底色朝这个色偏移；当前正在使用的那行也照样显示自己的颜色（不再一律用主题强调色）。
- 相邻同色的配置行自动圈成一个组框 —— 用跟父目录 / 子目录同一套规则（V138 / V156），但竖排列表**一组只画一个矩形**，不会在每行之间显出接缝。拖动排序时框先撤掉，松手再画。
- `⋯` 菜单里多了「给这个配置上色 / 更换颜色」，跟点圆点打开的是同一个色板。
- 颜色按 `color` 字段存进 IndexedDB，**不碰 `updatedAt`** —— 光改颜色不会被当成「这个配置刚编辑过」。挑色是乐观更新，写库失败会把界面回滚成库里的真实状态并提示。

---

## V188 — 右键菜单能「添加图片」了

- 空白处右键 → 「添加图片」，可以一次选好几张。这类项目不再画系统图标 + 名字，而是**直接把图片本身铺满卡片**，名字压在底部一层渐变上，一眼就知道是哪张图。
- 卡片能拖大小：鼠标移到卡片上，边框和四个角会浮出淡淡的手柄，拖边只改一个方向、拖角两个方向一起改，松手才落盘（拖的过程中不发 IPC，不卡）。
- 尺寸按项目存（`imageSize`），跟着项目跑：排序、拖到别的子目录、换配置都还在；范围 96×96 ~ 960×960，默认 240×180，越界自动夹回来。
- 图片预览走 asset 协议（新增 Rust 命令 `allow_image_preview`，只授权这一张图），不像图标那样把整张原图 base64 进内存 —— 放几 MB 的大图也不吃内存。
- 顺手把项目网格从 CSS Grid 换成 flex 换行：不然固定列宽下大卡片只会溢出来压住邻居。普通卡片宽度本来就是固定值，行内观感不变。
- 设置 → 右键菜单 → 空白处，多了「添加图片」这一项开关；开始菜单 / 映射文件夹这类镜像目录里仍然按普通文件添加（那里没有项目可存尺寸）。

---
## V187 — 配置文件能拖动排序了

- 「多配置」面板的每一行左侧多了一根拖动手柄：按住上下拖，配置就能自由换位置，拖到列表边缘还会自动滚动到看不见的行。
- 顺序会记进 IndexedDB（新增 `order` 字段），关掉面板、重启程序都保持你排的次序；以前没排过序的老记录照旧按创建时间排，升级第一眼看到的列表和原来一样，不会突然乱掉。
- 手柄独占一行最左边那一条，行内的「使用 / 粘贴 / ···」照旧点得动 —— 跟 Sidebar 子目录拖动是同一套 dnd-kit（`PointerSensor` 5px 阈值 + 键盘排序），点一下不会误判成拖动。
- 新建或导入的配置仍然落在列表最后一行；写库失败会弹提示并把顺序回滚成数据库里的真实顺序。

---

## V186 — 权限可以自己切：标准 ↔ 高权限

- 「自检 → Windows 权限 / 拖放兼容」现在能双向切换：标准权限下多一个「切换到高权限模式」按钮（弹 UAC 以管理员身份重启），高于 Medium 时变成「切回标准权限」（用桌面 Shell 的普通令牌重启，不弹 UAC）。
- 手动切到高权限后，启动保护不再把你自动降回 Medium —— 之前那套「高权就自动重启成普通权限」的逻辑会尊重这次选择，只在你没有主动要求提权时才生效。
- 已经是标准 Medium 时显示绿色卡片，不会多一个没用的入口；重启失败（UAC 被取消等）会当场把原因写在卡片下方并弹提示。
- 单个快捷项目右键「以管理员身份运行」照旧单独提权，不必为了个别项目让整个 Launcher 长期处在 High。

---

## V185 — 设置搜索框回到侧边栏里，跟着分类一起滚

- 分类侧边栏改成整体滚动：搜索框不再单独钉在顶部，往下滚分类时它跟着一起滚走，不会再一直占着最上面那一块。
- 分类列表自己不再开滚动条，滚动条只出现在侧边栏右缘；窄屏（分类横排）仍保留横向滚动的列表，搜索框照常在上面。
- 搜索、清空、筛选联动、选中光标动画、宽度拖拽都没有动。

---

## V184 — 「定位到源子目录」跨配置也能一步跳过去

- 链接子目录右键的「定位到源子目录」不再只在同配置里生效：源子目录在别的配置档案里时，确认后自动把那个配置载入工作区并直接定位过去，切走前会先把当前配置存盘，不会丢改动。
- 源子目录已经被删掉时不再只弹一句提示，而是落到它原来所在的父目录并说明情况；只有当源配置整个不存在（或源父目录没了）时才提示去换源 / 解除链接。
- 切换配置失败（比如读不到那个配置的数据）会给出具体原因，不再静默什么都不做。
- 右键菜单设置里这一项的说明同步更新，不再写「同配置时」。

---

## V183 — 链接子目录/父目录可以随便改名，源目录保持原名

- 链接子目录、链接父目录（以及链接父目录里镜像出来的子目录）现在都能重命名：改的只是启动器里显示的名字，源配置那边一个字都不动。
- 以前每次链路同步都按源目录把名字重写一遍，刚改完的名字下一轮同步就被顶回去；现在显示名单独记一份（`linkNameOverride` / `linkDirectoryNames`），同步只搬内容，不再覆盖名字。
- 链接实体右键新增「跟随源名称」：只在你改过名之后出现，点一下丢掉显示名，名字重新跟着源目录走；右键菜单设置里可单独关掉这一项。
- 源目录之后再改名也不影响已经起好名字的链接；没改过名的链接照旧跟随源名字。

---

## V181 — 修复设置搜索框悬浮遮挡侧边栏

- 设置侧边栏拆分为顶部搜索区和独立滚动的分类列表，搜索框正常占位，滚动分类时不再覆盖按钮。
- 移除搜索区的吸顶定位和独立背景、毛玻璃效果，统一沿用侧边栏背景；保留搜索、清空、选中动画和宽度拖拽。
- 窄屏下搜索区仍独立占位，下方分类横向滚动；分类筛选后同步校正选中高亮位置。

---

## V180 — 设置页左上角替换为赛丽月光启动器 Logo

- 移除设置页左上角的标题、布局状态、简洁模式、滚动保护标签及说明文字，替换为用户提供的赛丽月光启动器 Logo。
- Logo 去除外围黑色留白并使用透明背景，保持图案比例，适配设置主题与背景；保留标题栏拖动和关闭按钮。

---

## V179 — 字体大小可调 + 设置分类光标动画 + 分类宽度可拖拽

> 想法：以前的字号是一个个数字散在各处，想整体调大只能挨个改；设置分类的选中态是一块死板色块，切换时没有方向感；分类栏宽度写死 150px，遇到「窗口行为」「右键菜单」这种长名字只能靠省略号。这一版把这三件事一起解决。

### 字体大小（设置 → 字体 → 字体大小）

- 新增「整体字号」滑杆（80%–150%，步进 5%）：等比缩放父目录、子目录、项目名称、右键菜单、便签正文与设置界面文字；只乘字号，不动卡片、侧栏与面板尺寸，拉到最大也不会把布局撑变形。
- 分项滑杆可单独微调：项目名称、左侧子目录、顶部父目录、右键菜单、设置界面、便签正文，互不覆盖。
- 「恢复默认」一键还原全部字号，不改字体名称与生效区域。
- 设置搜索支持「字号 / 字体大小 / 字太小」；整体字号与设置界面字号可直接在搜索结果里拖滑杆。

### 设置分类光标

- 选中态改由一块滑动高亮（光标）表现：位移走轻微回弹曲线、尺寸走平滑曲线，参考时间管理器的 `selectionGlow`，切换分类能看出方向。
- 收起再打开设置时，光标从上次停留的那一格滑回当前分类（3 秒内记忆），不再直接闪现。
- 开启「减少动效」时直接落位，不做动画。

### 设置分类宽度

- 分类栏右缘新增拖拽手柄：左右自由调宽（110–360px，面板太窄时按可用宽度自动收上限），松手写入 localStorage，下次打开保持。
- 双击手柄恢复默认 150px；窄屏（≤760px，分类横排）时手柄自动隐藏。

### 其它

- 字号缩放统一走 `normalizers` 归一化（0.8–1.5、两位小数），旧配置缺字段时按默认值补齐，不需要迁移。

---

## V178 — 网址英文标题自动翻译为中文，完善标题提取与异步保护

- 浏览器拖入自带的英文标题和网络抓取的英文标题统一自动翻译为简体中文；已有中文标题保持原样，翻译失败保留原标题。
- 优先请求中文网页；空白或缺失的 title 标签使用 Open Graph / Twitter 标题兜底，兼容编码声明、分块读取并排除脚本、注释中的伪标题。
- 翻译增加超时、备用服务、成功缓存、失败短期缓存和并发去重；只向翻译服务发送标题文本，中文网络标题沿用本地持久化缓存。
- 命名弹窗、免弹窗添加及映射文件夹 / 开始菜单均接入；晚到的标题和图标不会覆盖用户手动修改的名称或图标。

---

## V177 — HTML 拖入落盘后直接显示卡片，特殊子目录改用名称上标

- 拖入 HTML 文件或页面文件夹后，先复制到目标 HTML 子目录绑定的磁盘文件夹，再刷新并自动进入该子目录展示新增卡片；原文件保留，重名自动编号。
- 修正高 DPI 下原生拖拽落点识别；HTML 子目录优先处理真实文件，避免被文件携带的网址误判成网站快捷方式。
- 拖入文件夹时自动启用子文件夹扫描；复制完成后的刷新会等待旧扫描并重扫，避免新增卡片漏显。
- 特殊子目录统一在名称右上角显示 HTML、链接、映射、开始菜单、便签或全部的小字，移除旧描边 / 强调条 / 标签形式，保留显示开关和自定义配色。
- 阻止文件夹复制到自身或其子目录，避免递归自复制。

---

## V175 — HTML 目录当成真项目用：单击能开、拖进来就复制、右键改名上色、加文件自动刷新

> 想法：v173 的卡片墙只能双击开、文件得自己去文件夹里放、每张卡片长得一模一样。这一版把它按「项目」来用：跟着全局的单击/双击设置走，文件拖到子目录上就落盘，右键能改名和上色（相邻组合同样生效），往文件夹里加页面也不用再点刷新。

### 用法

1. **单击 / 双击跟随设置**：卡片点击行为跟 设置 → 行为 → 左键启动方式 一致。选「单击」时点一下就打开（预览区也能点，事件不会被 iframe 吃掉）；选「双击」时保持双击打开。
2. **拖进来就复制**：把 `.html` / `.htm` 文件（或整个页面文件夹，连同它的 css/js/图片）拖到左侧的 HTML 子目录上，文件会被**复制**进那个目录，卡片立刻出现。原件留在原处；重名不覆盖，自动变成 `xxx (2).html`。
3. **右键菜单**：用默认浏览器打开、打开所在文件夹、重命名卡片、卡片颜色（默认 / 7 个预设 / 自定义）、恢复默认大小、复制名称、复制路径。
4. **相邻组合**：卡片颜色同样参与 设置 → 界面 → 彩色框 的「相邻颜色组合」与「同色相邻成组框」，规则与内容区项目卡片完全一致。
5. **自动刷新**：往文件夹里加 / 删 / 改页面后，卡片墙 2 秒内自己更新，不用再点右上角刷新；从资源管理器复制完切回窗口也会立刻比对一次。

### 实现要点

- **改名只改显示名**：存在 `Directory.htmlNames[绝对路径]`，**绝不重命名磁盘文件**；颜色存在 `Directory.htmlColors[绝对路径]`。两者都由 `normalizers.ts` 做白名单规范化（空名丢弃、非法色丢弃、上限 4000 条），坏配置不会写进 CSS。
- **点击判定**：`pointerdown` 记起点，`pointerup` 位移 ≤6px 才算点击；单击模式下用系统双击间隔挡掉「一次双击开两次」，卡片头部的小按钮与缩放手柄不参与判定。
- **自动刷新不用新依赖**：`html_folder_signature` 只 stat（页面清单 + mtime + 大小）算指纹，前端 2 秒轮询 + 窗口 focus / visibilitychange 时立即比对，指纹变了才 `refreshHtmlFolder`。没用文件系统 watcher，避免多线程生命周期和递归监听的坑。
- **拖入落点定位**：原生拖拽事件现在带上物理坐标（`useDragDrop` 透传 `position`），`resolvePointTarget` 只在真的压着某个子目录时才认目标，找不到就回落到当前子目录 —— 不会因为拖到空白处就顺手建目录。
- 新增 `copy_html_into_folder`：只复制不移动，同名自动加序号，文件夹整目录递归复制（深度上限 8，隐藏文件跳过）。

---

## V174 — 特殊子目录加区分边框，形式可切换、可关闭

> 想法：侧栏里「HTML 目录」「链接目录」和普通子目录长得一模一样，扫一眼分不出来。现在它们各有一套边框，形式能换（描边 / 角标 / 强调条），不想要就整个关掉。

### 用法

1. 设置 → 导航 → **子目录侧栏显示** 里新增两项：
   - **区分特殊子目录**：总开关，默认开。关掉后所有子目录回到统一样式；
   - **区分形式**：`描边`（HTML 实线、链接虚线）/ `角标`（右侧 `HTML` / `LINK` 小标签）/ `强调条`（左侧竖条，和开始菜单、映射文件夹同一套语言）。开关关着时这一项自动收起。
2. 只作用于 `html` 和 `link` 两种子目录；普通、全部、便签、开始菜单、映射文件夹的样式一律不变。

### 实现要点

- `ExperienceSettings` 新增 `showSpecialDirectoryMarkers: boolean`（默认 `true`）与 `specialDirectoryStyle: SpecialDirectoryStyle`（`'outline' | 'ribbon' | 'bar'`，默认 `'outline'`）；`normalizeExperience` 里做白名单回落，非法值回到 `outline`。
- 形式靠侧栏容器上的 `kind-style-<style>` 类切换（`Sidebar.tsx` 的 `.sidebar-tabs`），关掉时挂 `kind-style-off`；子目录本身沿用已有的 `side-tab-<kind>` 类，CSS 全部集中在 `Sidebar.css` 末尾。
- 颜色走 `--kind-accent: var(--directory-accent, var(--kind-color))` —— **用户给这个子目录上过色就用用户的色**，没上色才用类型色（HTML 橙 `#e0862c`、链接紫 `#8b5cf6`）。这样「形式」永远能区分，同时不盖掉自定义配色。
- 设置项复用抽到 `SettingsPrimitives.tsx` 的 `ChoiceCard`（原来在 `ExperienceSettingsSection.tsx` 里是局部组件，这次提出来两边共用）。
- 设置搜索新增「特殊子目录区分边框」条目（关键词：HTML 目录 / 链接目录 / 描边 / 角标 / 强调条）。

---
## V173 — 新增「HTML 目录」：文件夹里的网页变成可拖拽的预览卡片墙

> 想法：手头那一堆 `index.html` 每次都要翻资源管理器。新建一个 HTML 子目录、指一个文件夹，它就把里面所有网页铺成一墙卡片，每张卡片直接显示那个页面的**首页真实样子**，边框还能用鼠标拖着改大小。

### 用法

1. 父目录空白处右键 → 新建子目录 → **HTML 目录子目录**（已存在时用子目录右键「重新选择文件夹」换一个）；
2. 选一个文件夹，自动递归认出里面的 `.html` / `.htm`（跳过 `node_modules`、`dist`、`.git` 等目录，最多 4 层、800 个页面）；
3. 卡片里是**实时首页预览**（真 iframe，不是截图）；双击卡片在浏览器里打开；
4. 鼠标移到卡片边框会变成双向箭头，拖一下就能改这张卡片的大小 —— 尺寸按文件路径记住，下次进来还是你调好的样子；
5. 工具栏可切换「首页预览」开关（关掉只显示文件名，省性能）、一键把卡片恢复默认大小、打开文件夹、重新扫描、换文件夹。

### 前端

- 新子目录类型 `html`（`DirectoryKind`），目录配置新增 `htmlPath` / `htmlCards`（单卡尺寸）/ `htmlView`（目录级默认尺寸、预览开关、是否递归）；`normalizers.ts` 负责清洗（尺寸夹在 160×120 ~ 1600×1200，最多记 4000 张卡）。
- 新组件 `src/components/ContentArea/HtmlGallery/`：8 向缩放手柄 + `n/ew/ns/ne/nw/se/sw-resize` 光标，拖拽过程中只改本地 state（不每帧落盘），松手才写进配置。
- 预览用 **iframe + Tauri asset 协议**（`convertFileSrc` → `http://asset.localhost/...`），页面里的相对路径图片/CSS 天然能解析；iframe 用 `IntersectionObserver` 懒挂载（滚到眼前才挂），避免几十个页面同时开 WebView。
- 子目录右键新增：刷新 HTML 页面 / 打开 HTML 文件夹 / 重新选择文件夹 / 首页预览开关 / 卡片恢复默认大小（都能在设置-右键菜单里隐藏）。
- 侧栏计数、命令面板副标题、右键菜单注册表、设置项文案全部接上；HTML 子目录不参与粘贴/添加项目（内容来自文件夹）。

### 后端（`src-tauri/src/html_folder.rs`，新增）

- `validate_html_folder` / `list_html_folder` / `allow_html_preview` / `open_html_folder_location` 四条命令，全部 `async` + `blocking::offload`（扫盘不进主线程）。
- `allow_html_preview` 调 `app.asset_protocol_scope().allow_directory(root, true)` 递归放开作用域 —— 否则 iframe 里的 `asset.localhost` 请求会被协议层拒掉、卡片白屏。

---
## V172 — 新增「添加EXE」：光标指哪拾哪，直接把正在运行的程序加进来

> 想法：加个程序不该先翻三层文件夹。子目录右键 →「添加EXE」，把光标移到那个程序的窗口上点一下，它就进来了。

### 用法

1. 子目录空白处右键 → **添加EXE**；
2. 点「开始拾取」后主窗口收起，并有 3 秒倒计时给你把光标挪到目标程序上；
3. 在目标程序窗口上**点一下左键**（或按住从启动器拖过去再松开）= 确认；**Esc** 取消；
4. 主窗口自动回来，弹窗显示拾到的程序名 / exe 路径 / 窗口标题，确认后写入当前子目录。

### 后端（`src-tauri/src/exe_pick.rs`，新增）

- 新增 `start_exe_pick` / `stop_exe_pick` 两条命令，外加 `ExePickState`（当前代号 + 停止旗标）—— 被取消的旧探测线程即使晚到，结果也会因代号对不上而作废。
- 探测线程每 90ms 一轮：`GetCursorPos` → `WindowFromPoint` → `GetWindowThreadProcessId` → `OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION)` + `QueryFullProcessImageNameW` 取 exe 全路径，`GetWindowTextW` 顺带取窗口标题。
- 判定沿用 easy-espanso 的「先看到按下、再看到松开」口径，避免主窗口刚隐藏时残留的鼠标状态造成误判；Esc = 取消；120 秒无动作自动结束；启动后 700ms 内的探测不采信（窗口层级还在变）。
- 拾取期间只**读**窗口：不注入、不拦截，目标程序照常收到那一次点击；本进程自己的窗口被排除。
- 收放窗口用 `hide()` / `show()`，不走「隐藏到托盘」语义（不动 `MAIN_HIDDEN_TO_TRAY`，也不动窗口几何记忆），拾取结束后不会把窗口位置搅乱。
- 复用 `commands::process_executable_path`（可见性改为 `pub(crate)`）。

### 前端

- `src/lib/exePick.ts`（新增）：`startExePick()` 先挂 `exe-pick-end` 监听再 `invoke`，避免探测线程结束太快、事件比监听先到；150 秒兜底超时并顺手 `stop_exe_pick`。
- `AreaContextMenu.tsx`：新增菜单项「添加EXE」（`Crosshair` 图标，排在「添加文件夹」之后）+ 拾取窗口（操作说明 / 3 秒倒计时 / 结果确认 / 重新拾取）。原「添加文件」里的写入逻辑抽成 `addPaths(paths)` 复用，所以开始菜单子目录、映射文件夹子目录这两条特殊通道同样有效。
- `types.ts` / `experienceSettings.ts` / `ContextMenuSettingsSection.tsx`：`AreaContextMenuItemId` 增加 `addExe`，可在「设置 → 右键菜单」里隐藏或恢复（默认显示）。
- `ContextMenu.css`：新增 `.exe-pick-*` 样式（倒计时大字、拾取结果卡片、等宽路径）。
- 测试：`experienceSettings.test.ts` 的菜单 id 清单同步加入 `addExe`（全量 270 条通过）。

### 验证

- `node scripts/verify-source-fixes.mjs` 通过；`npx tsc --noEmit` 通过；`cargo check` 通过（19.59s，无 warning）；vitest 全量 270 条通过。

---

## V171 — 修复深色主题下下拉列表「白底浅字」：原生弹层改为跟随主题

> 反馈：「太白，修复」。截的是「新建链接父目录」的来源配置下拉——弹层是刺眼的纯白，文字却还是深色主题的浅灰，几乎读不出来。

### 原因

`<select>` 的展开列表由系统（WebView2）绘制，不吃组件的 CSS 背景。以前只在控件上写了文字色，弹层却还是系统的纯白底，于是深色主题里就成了「白底 + 浅色字」。全项目 39 处原生 `<select>` 都受这个问题影响，只是这次在弹窗里最扎眼。

### 修复

- `src/lib/themeColors.ts`：新增 `pickNativeColorScheme(background, fallback?)`，按主题底色的相对亮度（WCAG 公式）判定该用 `dark` 还是 `light`，无法解析时回落到 `light`。
- `src/stores/themeStore.ts`：切主题时把 `document.documentElement.style.colorScheme` 设成 `dark` / `light` —— 原生控件（下拉弹层、滚动条、日期选择器）从此跟随主题明暗。
- `src/themes/moreThemes.ts`：`installThemePreset()`（设置里点主题卡片）同样同步 `colorScheme`，点下去当场生效，不用等重渲染。
- `src/index.css`：兜底再给 `select option` / `select optgroup` 明确配色（`--panel-solid` 底 + `--text` 字），`option:checked` 用主题强调色混出高亮。即使某些 WebView2 版本忽略 `color-scheme`，弹层也不会再出现浅字压白底。
- 测试：`src/lib/__tests__/themeColors.test.ts` 新增两条，覆盖常见深色/浅色主题底色与无法解析时的回落（全量 270 条通过）。

---

## V170 — 开发规范新增「关闭进程 → 干净替换便捷版」流程

> 以前更新便捷版只做「改名换新」：旧进程继续活着，新版要等下次启动才生效。本人要的是「关掉再替换」，那就得先把在跑的实例全关干净，替换才是真覆盖，替换完立刻生效、不留 `.old-*` 残渣。这套流程现在写进 `AGENTS.md`，以后照做。

### 规范（`AGENTS.md`）

- 「构建后必须同步便捷版 → 注意点」新增一条：用户说「关闭，然后替换」「关掉再更新」时，走下面的干净替换流程，别只做「改名换新」。
- 新增小节 **干净替换流程（要求「关闭，然后替换」/ 想立刻生效时）**，五步全带可复制命令：
  1. `Get-CimInstance Win32_Process -Filter "Name='Yue Launcher.exe'"` 确认进程数与 `ExecutablePath`（必须是 DeskBox 那个文件，不是就先停下问本人）；
  2. 先 `CloseMainWindow()` 温和关闭，2 秒后对残留 `Stop-Process -Force`，最后断言进程数为 **0**；
  3. 进程清空后再跑 `sync-portable.py`——这次是真覆盖，不会产生 `.old-*`；
  4. 收尾两步检查：`VersionInfo.FileVersion` 是新版本 + DeskBox 下没有 `Yue Launcher.exe.old-*` 残留；
  5. 汇报口径：关了几个进程 → 替换前后版本 → 校验结果 → 有无残留 → 告诉本人「已经生效，重新双击就是新版」。
- 同时点明两种说法的区别：「改名换新」= **重启后生效**；「关闭后替换」= **当场生效**。

---

## V169 — 右键菜单新增「链接子目录 / 链接父目录」：跨配置镜像，源变内容就变

> 以前想让两个配置共享同一批快捷方式，只能复制一份，改了一边另一边不知道。现在右键就能建「链接」：链接指向另一个子目录（或整个父目录，哪怕它在**别的配置档案**里），源里增删改，链接里的内容自动跟过来。

### 1. 两种链接

- **链接子目录**（`kind: 'link'`）：把这个子目录的项目列表镜像过来。入口有两处 —— 空白处右键「新建子目录 → 链接子目录…」、父目录右键「链接子目录…」（建在当前父目录里）。
- **链接父目录**：把另一个父目录（含它下面所有普通 / 便签子目录）整个镜像过来，名称也跟随源。入口：父目录右键「链接父目录…」、空白处右键「链接父目录…」。
- 选择弹窗都是三层：**来源配置**（默认「当前配置」，可切到其它配置档案）→ **父目录** → **子目录**（仅链接子目录需要）。

### 2. 跨配置怎么做到的

- 链接不在渲染时去别的配置里现读，而是把源内容**物化（镜像）进当前配置的 `groups`**：切配置、重启、断网都看得见；侧边栏 / 标签页 / 内容区 / 启动项目沿用原有逻辑，渲染层没有任何特判。
- 镜像出的子目录和项目用派生 id（`linkdir:` / `linkitem:` 前缀），既不与源配置撞 id，也能判断「这条是镜像来的」—— 用户自己在链接里追加的项目不会被同步删掉，排在镜像项目后面。
- 来源解析：当前配置直接读内存（源一改链接立刻跟上）；其它配置读 IndexedDB 里已保存的副本（800ms TTL 缓存）。`syncDirectoryLinks()` 幂等 —— 源没变时返回 `changed: false`，不写 store，不会和自动保存形成回环。
- 触发时机：启动 / 切配置后同步一次、`groups` 变化后 60ms 去抖同步、窗口重新获得焦点、可见状态下每 2s 轮询（跨配置的弱实时）。

### 3. 菜单命令

- 父目录右键：`链接父目录…`、`链接子目录…`，链接生效期间另有 `立即同步链接`、`解除链接`。
- 子目录右键（链接子目录）：`立即同步链接`、`更换链接源…`、`定位到源子目录`、`解除链接`，并显示一行「链接自：{配置} › {父目录} › {子目录}（内容自动同步）」。
- 解除链接后，已镜像过来的子目录 / 项目**保留**为普通内容，只是不再跟随源。
- 以上命令都可在「设置 → 右键菜单」里逐项隐藏 / 恢复。

### 4. 兼容与校验

- `Directory` / `Group` 新增可选 `link` 字段，链接来源随配置一起保存（`exportConfig` / `importConfig` / 切配置都不丢）；残缺记录在 `normalizeDirectory` / `normalizeGroups` 里降级成普通子目录，不会留下坏链接。
- 新增 17 条测试：镜像 id 派生、便签正文镜像、系统目录跳过、不重复镜像、幂等、源增删改名、本地追加项保留、跨配置创建与更新、父目录整组镜像、解除后脱离、`normalizeGroups` 往返保真、残缺记录降级。
- 测试与新源码门禁一起进 `npm run verify`。

## V168 — 把 Ctrl+X 的边界情况补严：不留重复 id、不复活、不假成功

> V167 把剪切粘贴做出来了，这一版专门对付它的边角：剪切之后东西又被删了/又被挪了怎么办、父目录合并到底成没成、合并后选中指针会不会悬空。全部配了测试和源码门禁。

### 1. 剪切后删掉的项目，粘贴不再“复活”

- `pasteItemsToDirectory()` 的剪切分支原先只排除「已经在目标子目录里」的项，其余一律按快照搬过去 —— 于是「剪切 → 删掉 → 粘贴」会把删掉的项目从快照里重新写回磁盘配置。
- 现在只搬**此刻还真实存在**的项目（先收集全库现有 id 再过滤）。已经删掉的直接丢弃，返回 0，提示改成「没有可移动的项目了（可能已经都在「X」里，或在粘贴前被删掉了）」。

### 2. 父目录合并必须确认真的合并了

- `pasteGroupIntoGroupFromClipboard()` 之前只要调完 `mergeGroup()` 就返回目标 id，而 `mergeGroup()` 在「只剩一个父目录」「源/目标不存在」时会原样返回 —— 结果是弹了「已合并」但其实什么都没发生，剪贴板还被清掉。
- 现在比对合并前后的父目录数量，没少就返回 `null`、**不清剪贴板**，用户可以换个父目录再粘。

### 3. 合并后选中指针归位

- `mergeGroup()` 会把源父目录删掉、把它的子目录换成新 id。原先 `selectedNavTarget` 不做处理，可能停在一个已经不存在的 id 上，之后 Ctrl+X / Ctrl+V 就对着空 id 空转。
- 选中项指向被合并掉的父目录（或它里面的子目录）时，合并后指针落到目标父目录上。

### 4. 菜单与校验

- `GroupContextMenu` 的「父目录已经在这里」拦截只在**剪切**模式下生效 —— 复制一个父目录后在自己的菜单里粘贴，仍然能克隆出一份（这是原有能力，V167 误伤了）。
- 补 5 条边界测试（合计 13 条）：删除后不复活、剪完又手动挪走不会产生重复 id、合并后选中归位、粘到不存在的父目录被拒且剪贴板保留、「全部」子目录搬不进已有「全部」的父目录。
- `scripts/verify-source-fixes.mjs` 增加 11 条 v167/v168 断言（快捷键三段顺序、剪切动作齐全、菜单项齐全、不复活守卫、合并校验、选中归位），`src-tauri/build.rs` 同步加两条断言并把 `clipboardMode.ts` 纳入重编触发。

## V167 — 项目、子目录、父目录都支持 Ctrl+X 剪切粘贴（移动）

> 之前只有「复制 → 粘贴」：Ctrl+C 一份、Ctrl+V 再多一份副本，想把东西挪个位置只能靠右键菜单里的「移动到父目录」，父目录本身根本没有移动的办法。这次把 Ctrl+X 补齐，三种对象一条规则：**Ctrl+X 之后 Ctrl+V 是移动，Ctrl+C 之后 Ctrl+V 还是复制。**

### 1. 一套模式标记，三种对象共用

- 新增 `src/lib/clipboardMode.ts`：`ClipboardMode = 'copy' | 'cut'`。剪贴板里存的内容结构一点没变，只多带一个「这次是剪切还是复制」的标记。
- 项目走 `itemClipboardMode`（新状态，`src/stores/appStore/types.ts` 的 `ItemSlice`），子目录 / 父目录走 `navigationClipboard.mode`（`src/lib/navigationClipboard.ts`）。老剪贴板没有 `mode` 字段，一律按 `copy` 处理，所以升级不会改变已有行为。

### 2. 项目：剪切粘贴 = 移动

- `itemSlice` 新增 `cutItemsToClipboard(itemIds)`：和复制一样取快照，但标记 `itemClipboardMode: 'cut'`。
- `pasteItemsToDirectory()` 按模式分流：`cut` 时把项目**保留原 id** 搬到目标子目录（与既有的 `moveItemToDirectory` 一致，不会重置图标缓存/启动统计），并从原位置删掉；已经就在目标子目录里的那部分跳过。粘贴完剪贴板清空、模式回落 `copy`，不会一粘再粘。

### 3. 子目录：剪切粘贴 = 换父目录

- `navigationSlice` 新增 `cutDirectoryToClipboard(directoryId)`。剪贴板里的 `directory` 仍是快照，但**快照保留了原 id**，所以 `pasteDirectoryToGroup()` 在 `cut` 模式下直接按 id 找回真实子目录、交给既有的 `moveDirectoryToGroup()` 完成移动（空父目录自动补一个「常用」的逻辑一并复用），然后清掉剪贴板。粘回原来那个父目录时不动数据。

### 4. 父目录：剪切粘贴 = 合并到目标父目录

- 新增 `cutGroupToClipboard(groupId)` 与 `pasteGroupIntoGroupFromClipboard(targetGroupId)`：父目录没有「上级」可言，移动的唯一含义就是并进另一个父目录 —— 走既有的 `mergeGroup()`（子目录换新 id 搬过去、源父目录删除）。粘到自己身上、或只剩一个父目录时什么都不做。

### 5. 快捷键路由

- `src/hooks/useGlobalShortcutRouter.ts`：新增 Ctrl+X 分支，优先级与 Ctrl+C 完全一致 —— 先看选中的项目，再看侧栏选中的子目录，最后看父目录；每种都给出「已剪切…，切到目标后 Ctrl+V」的提示。
- Ctrl+V 在 `cut` 模式下把提示语从「已粘贴」改成**「已移动」**；父目录合并会先弹一次确认（会删掉原来的父目录，不能无声执行）。

### 6. 右键菜单

- `ItemContextMenu` 加「剪切项目」、`DirectoryContextMenu` 加「剪切子目录」、`GroupContextMenu` 加「剪切父目录」（父目录 / 子目录的剪切项跟随「复制」的显示开关，隐藏了复制就等于隐藏了剪切）。
- 粘贴项在剪切模式下说明自己会移动/合并：「粘贴父目录…（合并到此）」，粘贴完成后的通知也说「已把子目录移动到…」。

### 7. 测试

- 新增 `src/stores/appStore/__tests__/v167ClipboardCut.test.ts`（8 条）：项目剪切的移动语义与 id 保留、粘回原位不产生副本、复制的克隆语义未被破坏、子目录剪切换父目录 / 粘同组不动、父目录剪切合并 / 粘自己不动、复制子目录仍是新 id。

## V166 — 左侧子目录也用「同色相邻成组框」圈起来

> V156 只在内容区项目卡片上把同色相邻的几项圈成一组，左侧子目录虽然能各自上色，却没有这层「这是一组」的框。

### 1. 抽成通用组件，两处共用一套画法

- 新增 `src/components/ColorClusterFrames.tsx`：量与画的做法照搬 `ItemColorClusterFrames`，但去掉了对项目卡片的写死 —— 选择器（`itemSelector`）、读 id 的 data 属性（`dataKey`）、根/段 class、外扩像素、是否夹边全部由调用方给。
- `src/components/ContentArea/ItemColorClusterFrames.tsx` 退化成薄封装，只固定内容区的参数（`.item-card[data-item-id]`、`data-itemId`、外扩 5px、不夹边），行为与 v156 完全一致。

### 2. 侧栏接入

- `src/components/Sidebar/Sidebar.tsx`：用 `resolveColorFrameClusters()` 按显示顺序把「实际渲染色相同且相邻」的子目录并组（用相邻组合算完的 `frameColors`，所以组合模式下组内渐浅不会被硬框成一个色块），在 `.sidebar-tabs` 里插一层 `ColorClusterFrames`：`.side-tab[data-directory-id]`、外扩 4px、拖动排序时淡出。
- `src/components/Sidebar/Sidebar.css`：`.sidebar-tabs` 加 `position: relative` 当定位父级；新增 `.sidebar-color-clusters` / `.sidebar-color-cluster-segment`，圆角跟随「子目录圆角」（`--sidebar-item-radius + 4px`），方形模式 8px，带 `--reduce-motion` 开关。框 `pointer-events: none`，点击、右键、拖动排序照旧穿透。
- 因为 `.sidebar-tabs` 自己是滚动容器，框加 `clampInside`：左上外扩部分夹回 0，避免第一条框被裁掉一半。
- 开关沿用设置里既有的「同色相邻成组框」（`display.colorFrameClusterFrame`，默认开启，缺省即开），文案改为「左侧子目录和内容区项目」；`types.ts` 注释、设置搜索索引关键词（新增「侧栏」「左侧」「子目录成组」）一并对齐。

## V165 — 排序切回自定义时能还原原顺序

> 修「按名称排过一次，再切回自定义，顺序就再也回不来了」。

### 1. 根因：切换排序把 `order` 重写成了排序结果

- `sortDirectoryItems()` 里同时做了两件事：写 `display.sortMode`，以及用 `sortShortcutItemsForStorage()` 把 `items` 的 `order` 按名称/类型**重新编号**。
- 后果：`order` 就是用户的「自定义顺序」，被排一次就永久覆盖 —— 切回自定义时已经无据可依。
- 本机实证（读取 leveldb 历史快照对比）：`Lovely系列` 目录原本自定义顺序是 `LovelyCarve磁盘取证 → LovelyHawk_dev → …`，执行一次「按名称」后首项被换成 `LovelyHawk_dev`（文件夹优先），切回 `custom` 也没有还原。

### 2. 修法：排序只影响显示，另外留一份「自定义顺序」档

- `sortDirectoryItems()` 不再改写 `items` 的 `order`，也不再写目录级 `sortMode`（全局切换不再顺带给当前目录塞一个覆盖）。
- 新增 `display.sortItemsSavedOrder`（`string[] | null`，沿用 `sortGroupsSavedOrder` 的既有做法）：
  - 切**离**自定义排序时，把当前 `order` 的 id 序列存进去（已存过就保留最早那份，不被后续排序覆盖）；
  - 切**回**自定义排序时，按留档还原，留档之后新增的项目接在末尾，然后清空留档。
- 新增 `lib/sort.ts` 的 `orderIds()` / `restoreCustomOrder()`；删掉只被这条 bug 用到的 `sortShortcutItemsForStorage()`，避免以后又拿它重排 `order`。
- 顺带：`global` 作用域切换排序不再产生目录级 `sortMode` 覆盖（原来选「统一排序方式」会给当前目录留一个钉子，之后改全局都影响不到它）。

### 验证

- 新增 `src/stores/appStore/__tests__/v165SortOrderRestore.test.ts`（5 例）：切到按名称/按类型不改顺序、切走再切回原样恢复、`order` 被其它路径改过也能按留档还原、留档后新增项目接末尾、切排序不写目录级 `sortMode`。
- `npx tsc --noEmit` 通过；`npx vitest run` 44 个文件 / 234 例全绿；`scripts/verify-source-fixes.mjs` OK。

## V164 — 便捷版 exe 规范名统一为 `Yue Launcher.exe`

> 只改命名与文档，不改功能：`Launcher` 首字母大写，与安装包 / 开始菜单里的产品名对齐。

### 1. `AGENTS.md` 新增「exe 命名规则」

- 写死链路：构建产物裸名仍是 `shortcut-launcher.exe`，**同步到 DeskBox 时文件名是 `Yue Launcher.exe`**；备份名 `Yue Launcher_<版本>.exe`。
- 全文 7 处目标路径、备份路径、三步核对命令、替换脚本片段统一改成大写 `L`。
- 说明 Windows 大小写不敏感：改大小写**不影响**开始菜单 `.lnk` 的 `TargetPath` 与 `HKCU\...\Run` 注册表项，两者仍能解析。

### 2. 同步脚本与技能文档跟进

- `~/.workbuddy-ai/skills/yue-launcher-release-publish/scripts/sync-portable.py`：`DST_DEFAULT`、备份文件名、docstring 三处全改为 `Yue Launcher`。
- `yue-launcher-build-release` 技能文档：5 处便捷版路径说明同步为 `Yue Launcher.exe`。

### 3. 本机便捷版文件改名

- `C:\Users\yile\DeskBox\DeskBox\Yue launcher.exe` → `Yue Launcher.exe`（同一文件，仅改大小写；运行中的窗口不受影响）。

### 验证

- 四处版本号 + 两处 lock 版本全部 `0.1.164`。
- `sync-portable.py --dry-run` 能定位目标文件并读到旧版本号。
- 构建后便捷版同步到 v0.1.164，`Get-FileHash` 与构建产物一致。

## V163 — 网站自带图标优先：页面有专门图标就用专门的，不再被平台通用图标顶掉

> 修 `treapgogo.github.io/deepseek-whale-girl/` 这类「页面明明有自己的 logo，却显示 GitHub 图标」。

### 1. 新增 `page` 图标源并排在第一位（`src-tauri/src/website_metadata.rs`）

- 新增 `fetch_page_declared_icon`：抓一次页面 HTML，按优先级从 `<link rel="icon|shortcut icon">`、`apple-touch-icon`、`og:image` 中取图标地址（相对路径按页面 URL 解析，支持 `data:` 内联图标），都失败才继续 Quicker / favicon.im 等第三方来源。
- `favicon_provider_order` 的 `auto` 顺序改为 `page` → `quicker` → …；显式选了 `page` 就只抓页面，不会再让别的来源抢先。
- 页面级缓存键为 `page_<页面 URL 哈希>`（忽略 query），同一台主机下不同路径各有各的图标；域名级缓存在页面阶段不再短路，旧版本按域名猜的图标不会盖掉页面自带图标。
- 页面抓取失败会记入 `page_icon_misses`（10 分钟），期间不再重复抓同一个页面。

### 2. 托管平台保留完整子域（Rust `favicon_cache_domain` / 前端 `baseDomainFromHost`）

- `treapgogo.github.io` 以前被收敛成 `github.io`，按域名取图标自然只能拿到 GitHub 自己的。现在 `*.github.io`、`*.gitlab.io`、`*.gitee.io`、`*.netlify.app`、`*.vercel.app`、`*.pages.dev`、`*.readthedocs.io` 等「子域即站点」的托管后缀一律保留完整主机名。
- 普通站点仍收敛到主域（`www.example.com` → `example.com`），原有缓存共用逻辑不变。

### 3. 测速与设置

- 设置里的「favicon 源测速」保留完整网址：填 `treapgogo.github.io/deepseek-whale-girl/` 测的就是这个项目页，而不是 `github.io`；结果表新增「页面自带图标」一行。
- 图标来源下拉新增「页面自带图标」（直连组），说明文字改为「网站有专门图标时就是它」。
- 关闭「自动保存到本地」时，前端在线地址对 `page` 自动退回 Quicker（浏览器跨域读不到页面 HTML），不会生成空地址。

### 测试

- Rust 新增 8 个用例：托管平台保子域、页面图标候选排序、相对路径解析、页面缓存前缀、`auto` 顺序、标签属性解析、内联 `data:` 解码、抓取失败记忆。
- 前端新增 `hosted platform cache domains` 两个用例。

---

## V162 — 设置 / 搜索 / 中转站 / 图片浏览器按需加载，主包瘦身 38%；自动保存内容未变不再写盘

> 启动更轻，界面与功能不变。

### 1. 不在首屏的面板改为按需加载（`components/DeferredPanels.tsx`）

- 设置面板、全局搜索、中转站、图片浏览器、拖入导入对话框启动时都不可见，以前却全部打进主包。现在拆成独立 chunk：主 JS **788.8 KB → 489.5 KB**（gzip 231 → 153 KB），启动时要解析的脚本少了约 38%。
- 启动约 1.5 秒后在浏览器空闲时预加载这些面板，第一次打开基本感觉不到延迟；打开过一次后保持挂载，关闭动画、当前页签等行为与以前完全一致。
- 设置面板还会通过 `SETTINGS_TAB_EVENT` 接收"打开到某个页签 / 设置项"的请求（快捷设置菜单、命令面板、全局搜索）。面板代码尚未加载时先代收请求，等面板挂载、监听注册好后再原样重发，不会丢失。
- 这些面板的样式仍静态留在主 CSS（`components/deferredPanelStyles.ts`），并保持原来的先后顺序：打包出的主 CSS 与 V161 **逐字节相同**，主题覆盖规则和首次打开时的外观都不受影响。

### 2. 自动保存内容未变不再写盘（`hooks/useAutoSave.ts`）

- 以前每个间隔都把整份配置原样重写一遍，同步盘会因此反复上传。现在记住每个路径上次成功写入的内容，没变化就跳过；每次启动后的第一次自动保存仍会写。设置里的"立即保存"照常每次都写。

### 3. 其他

- 选中卡片后滚动定位改为按 `data-item-id` 直接查询，不再取出全部卡片逐个比对（`ShortcutGrid.tsx`）。
- `package-lock.json` 里停留在 0.1.146 的版本号同步为当前版本。

### 测试

- 新增 `v162AutoSaveSkip.test.ts`（3 个用例：未变跳过、变化后重写、手动保存始终写入）。
- `verify-source-fixes` 新增 3 条检查、1 条禁止项。

---

## V161 — 网站标题缓存不再持锁写盘、失败黑名单定期清理、clippy 清零

> 后端稳定性与代码整洁，界面与功能不变。

### 1. 标题缓存不再在锁里写盘（`website_metadata.rs`）

- 以前 `store_cached_titles` / `get_cached_title` 在持有 `title_cache()` 锁时直接 `fs::write` 整个缓存文件；磁盘慢（杀软扫描、网络盘、休眠硬盘）时，所有查标题的线程都要排队等这把锁。
- 现在锁内只改内存并拿一份快照，**放锁后再写盘**。写盘由单独的锁串行化，并带代号：旧快照永远不会覆盖新快照。
- 读到过期条目时只从内存删除，不再为此单独写一次盘；落盘时统一过滤过期 / 空标题条目，并把总数限制在 4000 条（保留最新）。

### 2. 抓标题失败黑名单定期清理

- 以前过期条目只有同一个网址再次被查询时才会删除，批量导入大量死链后会一直留在内存。现在每次记录失败时顺带清掉过期条目，并限制最多 512 条。

### 3. clippy 警告清零（25 → 0）

- 去掉无用导入和多余的 `mut`；手写的前缀剥离 / 区间判断 / 字符比较 / 重复迭代 / 定长分块 / 除零判断改为标准写法；`sort_by` 改 `sort_by_key`。
- 复杂元组类型提取为 `BrowserSpec` 类型别名。
- 确实需要保留的字段（前端传来但暂未使用的 `browser_id` / `profile_id`、旧库读出的整行字段）和 Tauri 命令的 8 个参数，显式标注 `allow` 并注明原因。
- 预热标题抓取不再写 `let _ = <JoinHandle>`，改为显式 `drop`。

### 测试

- 新增 3 个单元测试（缓存过期 / 容量裁剪、失败黑名单清理），`cargo test --lib` 14 个全部通过。
- `verify-source-fixes` 新增 2 条检查、1 条禁止项。

---

## V160 — 修复贴边隐藏用久后失效（出不来 / 不再隐藏 / 越界不回弹）

> 贴边状态机稳定性修复，设置项与界面不变。

### 现象

程序连续运行较久（或贴边隐藏较久）后，贴边功能会整体"失灵"：鼠标碰边缘窗口出不来、窗口不再自动贴边隐藏、拖出屏幕也不回弹。

### 根因

实机取证（运行 3 天的实例）：主窗口处于**最小化**状态，`GetWindowRect` 返回的是工作区左下角 176×30 的最小化小标题条，原本的位置贴在右边缘。

1. `edge_dock_native.rs` 完全没有处理最小化。Win+D / Win+M / 显示桌面 / 最小化按钮之后，状态机把小标题条当成窗口真实位置；`SetWindowPos` 和 `SW_SHOWNA` 都无法还原最小化窗口，于是"展开"无效；随后小标题条还被记成"上次正常位置"，之后每次"恢复"都恢复成小条。主窗口是工具窗口、不在任务栏，最小化后看起来就像消失了。
2. 进入"已隐藏"状态后从不再核对窗口真实位置。只要窗口被外部改变（从小标题条还原、显示器重排、DPI 变化等），状态机就一直以为窗口还藏着：隐藏与越界回弹逻辑只在"正常显示"状态运行，所以不再隐藏、也不回弹，直到鼠标碰巧进入那块过期的边缘区域。

### 修复

- **最小化感知**：每轮先判断主窗口是否最小化，最小化期间绝不读取 / 保存它的几何信息。
  - 已贴边（隐藏或刚展开）时被最小化：不激活地还原并放回贴边隐藏状态（"最小化"等同于"收回边缘"）；1.5 秒内再次被最小化则尊重用户意图，不来回抢。
  - 正常显示时被最小化：保持最小化，状态机休眠，窗口被还原后按真实位置重新接管。
- **状态与现实对账**：
  - `AutoHidden`：窗口不可见或位置与预期隐藏位置不符时，若仍藏在同一条边外则采用新位置；若已回到屏幕内则回到正常显示，隐藏 / 回弹立即恢复。
  - `Hidden`（独立触发条模式）：主窗口被外部显示时回到正常显示；触发条被外部隐藏时重新显示。
  - `OpenedByStrip`：主窗口不可见时回到正常显示。
- **"上次正常位置"过滤**：小于 260×180 的矩形（如最小化小标题条）一律不记录。
- **AnimateWindow 兜底**：`AnimateWindow` 只能由窗口所属线程调用，在动画线程上必然失败；失败时改为直接 `ShowWindow` 显示 / 隐藏，修复独立触发条模式下"从触发条出不来"的隐患。
- **加固**：
  - 动画标志改为 `Drop` 守卫清除（panic 展开也会复位），并加 3 秒看门狗，防止某次动画卡住让整个状态机永久停摆。
  - 挂起计时改用单调时钟，系统时间回拨（休眠唤醒、NTP 校准）不再影响。
  - 窗口句柄优先使用 Tauri 提供的真实 HWND，回退查找只匹配本进程窗口，不再误抓其它进程的同名窗口。
  - 主窗口条模式下缺少 `edge-strip` 窗口不再让贴边功能整体停摆。
  - 状态机线程 panic 后自动重启；配置锁中毒时继续使用数据。
- **诊断日志**：状态切换与异常写入应用日志目录的 `edge-dock.log`（超过 512 KB 轮转为 `.log.old`），以后再出问题可直接查看。
- 新增 7 个单元测试；`verify-source-fixes` 新增 7 条检查和 3 条禁止项。

---

## V159 — 阻塞命令移出主线程、发布构建开启 LTO、提交 Cargo.lock

> 后端稳定性 / 构建修复，界面与功能不变。

### 1. 四个同步命令移出主线程

Tauri 里不带 `async` 的命令跑在**主线程**上（见 `src-tauri/src/blocking.rs` 的说明）。以下命令以前是同步的，会在主线程上做可能卡住的事：

| 命令 | 可能卡住的地方 |
| --- | --- |
| `launch_item` | `Path::exists()` 碰到断开的网络盘 / 休眠硬盘可能卡数秒到数十秒；以管理员身份启动时 `ShellExecuteW("runas")` 要等 UAC 确认框关掉才返回 |
| `open_file_location` | `is_dir()` 同上 |
| `get_path_kind`（`transfer_station.rs`） | `is_dir()` / `is_file()` 同上 |
| `test_browser_target` | 实际拉起浏览器进程 |

- 全部改成 `async`，原函数体改名为 `*_blocking`，经 `crate::blocking::offload` 放到阻塞线程池执行；前端 `invoke` 调用方式不变。
- `ShellExecuteW` 可能经 COM 激活 shell 扩展，阻塞线程池默认没有 COM 公寓，所以 `shell_execute` 进来先建 STA 公寓。
- 原来 `icon_native.rs` 私有的 `ComApartment` 守卫挪到 `blocking.rs` 共用，并按 `ShellExecute` 文档加上 `COINIT_DISABLE_OLE1DDE`。

### 2. 发布构建开启 LTO

- `Cargo.toml` 新增 `[profile.release]`：`lto = true`、`codegen-units = 1`、`strip = true`。产物更小、运行更快，代价是 release 编译变慢。
- 刻意**不**设 `panic = "abort"`：命令里万一 panic，只让那一次调用失败，不会带走整个程序（`verify-source-fixes` 加了禁止断言）。

### 3. 提交 `Cargo.lock`

- `.gitignore` 去掉 `Cargo.lock`，`src-tauri/Cargo.lock` 纳入版本管理。应用程序应该锁定依赖版本 —— `Cargo.toml` 里已经有一段专门为 indexmap 版本组合打的补丁，说明依赖一漂就会编译失败；V153 新增的 GitHub Actions 每次都会重新解析依赖，迟早踩坑。

### 验证

- `cargo clippy --all-targets` 通过，无新增 warning（仍是既有的 25 条）；`cargo test --lib`、`npx tsc --noEmit`、`npx vitest run`（42 个文件 / 224 个用例）通过。
- `node scripts/verify-source-fixes.mjs` 新增 7 条必须 / 2 条禁止断言（四个命令必须 async、`ShellExecuteW` 必须在 COM 公寓内、release 必须 LTO、必须提交 `Cargo.lock`；`.gitignore` 不得忽略 `Cargo.lock`、不得 `panic = "abort"`），输出 `OK`。
- `npx tauri build --no-bundle` 通过：release 编译 8 分 12 秒，`shortcut-launcher.exe` 从 17,693,184 字节降到 **16,046,080 字节（-1.57 MB，约 -9.3%）**。

---

## V158 — 去掉触发条轮询、收紧根组件订阅、修正 Vite 的 Tauri v2 环境变量

> 纯性能 / 构建修复，界面与功能不变。

### 1. 贴边触发条不再每 250ms 解析整份配置

- **问题**：`src/edge-strip.tsx` 用 `setInterval(installStripStyle, 250)` 每秒 4 次从 `localStorage` 读出并 `JSON.parse` 整份配置（含全部分组与项目，可能几百 KB），只为拿触发条的颜色 / 透明度 / 尺寸 4 个值；只要开着贴边就一直跑。
- **修复**：
  - 新增 `src/lib/edgeStripStyle.ts`：`resolveEdgeStripStyle` / `sameEdgeStripStyle` / `applyEdgeStripStyle`，主窗口与触发条共用同一套换算。
  - 新增 `src/hooks/useEdgeStripStyleSync.ts`（在 `App.tsx` 调用）：只订阅 `theme` 与 4 个触发条字段，值变化时 `emit('edge-strip-style')`。
  - `edge-strip.tsx`：启动时读一次 `localStorage` 打底 → 监听 `edge-strip-style` 更新；监听挂好后发 `edge-strip-ready`，主窗口收到即补发当前外观（触发条窗口可能比主窗口晚创建）。`storage` 事件保留兜底，且只在 `win-launcher-config` 变化时处理；值未变化时不重复写 CSS 变量。

### 2. 根组件不再订阅整棵 `groups`

- **问题**：`App.tsx` 用 `useAppStore((state) => state.groups)` 订阅整棵分组树，只为查「外部拖入目标分组」的名字；改任何项目的颜色、名称、顺序都会让根组件连同整棵组件树重新渲染。
- **修复**：改为只选出那个分组名（字符串），分组树其他变化不再触发根组件渲染。

### 3. Vite 配置改用 Tauri v2 环境变量

- **问题**：`vite.config.ts` 读的是 v1 的 `TAURI_PLATFORM` / `TAURI_DEBUG`，Tauri v2 CLI 只设置 `TAURI_ENV_*`。结果编译目标永远是 `es2020`，调试构建也永远压缩、没有 sourcemap；`envPrefix: 'TAURI_'` 还可能把 `TAURI_SIGNING_PRIVATE_KEY` 之类的变量暴露进前端产物。
- **修复**：改读 `TAURI_ENV_PLATFORM` / `TAURI_ENV_DEBUG === 'true'`，`envPrefix` 收窄为 `TAURI_ENV_`（前端代码没有任何 `import.meta.env` 引用，不受影响）。

### 4. 删除未使用的 `src/hooks/useEdgeSnap.ts`

- 该 hook 在全项目没有任何引用（贴边早已由 `useStableEdgeDock` + Rust 原生 `edge_dock_native` 接管），删除 290 行死代码；它原本每 80–180ms 轮询窗口位置的逻辑从未实际运行。

### 验证

- `npx tsc --noEmit` 通过；`npx vitest run` 42 个测试文件 / 224 个用例全绿（新增 `src/lib/__tests__/edgeStripStyle.test.ts` 4 条：默认值、自定义色仅在关闭主题色时生效、空色回退、按值比较）。
- `npm run build` 通过；`node scripts/verify-source-fixes.mjs` 新增 3 条必须 / 3 条禁止断言（触发条不得再 `setInterval`、App 不得订阅整棵 `groups`、Vite 不得再读 v1 变量名），输出 `OK`。

---

## V157 — 根目录历史说明文档归档到 docs/history

纯整理，不涉及任何代码与功能改动。

- 根目录下 179 个历史文档（`*_README.md`、`*_TEST_RESULTS.txt`、`*_CODE_STRUCTURE_REVIEW.md`、`V114_SETTINGS_EFFECT_AUDIT.md`、`TOPBAR_ACTIONS_CODE.md`、`TOPBAR_PANEL_ANCHOR_VERIFY.png`）用 `git mv` 移到 `docs/history/`，文件历史保留（`git log --follow` 可追溯）。
- 根目录只保留 `README.md`、`CHANGELOG.md`、`AGENTS.md`、`LICENSE`、构建脚本与工程配置。
- `README.md` 中引用这些文档的路径同步改为 `docs/history/...`；文档之间互相引用（如 `TOPBAR_PANEL_ANCHOR_VERIFY.png`）仍在同一目录，不受影响。
- `AGENTS.md` 配套要求第 3 条更新：今后新增的 `V<版本号>_<主题>_README.md` 放在 `docs/history/`。
- 新增 `docs/history/README.md` 说明该目录用途。

---

## V156 — 项目同色相邻自动成组框 + 拖入网站标题秒出

> **版本号说明**：本版从 0.1.154 直接升到 0.1.156，**没有单独的 V155**。下面两项改动（同色相邻成组框、拖入网站标题提速）合并在 V156 一起提交，Git 历史中不存在 0.1.155 版本。

> 本版两件事：内容区项目卡片补上「同色相邻成组框」，以及拖入网站后标签页标题的获取提速（`src-tauri/src/website_metadata.rs`、`src-tauri/src/native_browser_drop.rs`、`src/hooks/useWebsiteDropController.ts`）。

### 需求

顶部同色相邻的父目录会自动被一个更鲜艳的框圈成一组（v138），内容区的项目卡片没有这个效果。本次让项目卡片也具备同样的行为。

### 实现

- 把 v138 的分组规则抽成纯函数 `resolveColorFrameClusters`（`src/lib/colorFrames.ts`），父目录与项目共用同一套语义。
- 内容区复用同一套画法：新增 `src/components/ContentArea/ItemColorClusterFrames.tsx`，样式 `.item-color-clusters` / `.item-color-cluster-segment` 写在 `src/components/ContentArea/ContentArea.css`（`.items-grid` 补 `position: relative`，框才有正确的定位父级）。
- **分组**：按显示顺序（含搜索过滤后的顺序）把「颜色相同且相邻」的项目并成一组，**数量 ≥2 才画框**（单个已上色项目不额外加框）；颜色比较忽略大小写（`#FF0000` 与 `#ff0000` 视为同色），框色用组内第一项的写法。
- **用实际渲染色判断**：分组输入是 `resolveColorFrameColors` 之后的结果，所以「相邻颜色 = 相邻组合」模式下组内逐格渐浅时不会被硬框成一个色块 —— 屏幕上看着同色才框。
- **测量**：按卡片 `offsetLeft / offsetTop` 算出每组覆盖的区域，外扩 5px 后描边 + 发光；一组被换行拆开时**按行分段**，跨行也能分别框住（与父目录跨行时的分段行为一致）。
- **不干扰交互**：框 `pointer-events: none`，点击、双击、右键、拖入、拖拽排序全部照旧穿透到卡片；排序拖动开始时框淡出（`suppressed`），松手后按新位置重新测量。
- **设置**：设置 → 界面 → 子目录与项目彩色框 新增「同色相邻成组框」开关（`colorFrameClusterFrame`，默认开启），不需要时可以单独关掉；全局搜索关键词补了「成组 / 成组框 / 同色 / 同色相邻 / 圈起来」。

### 验证

- `npx tsc --noEmit` 通过；`npx vitest run` 41 个测试文件 / 220 个用例全绿（新增 5 条分组规则用例：相邻同色成组、大小写不敏感、单个不上色的不成组、异色打断、空列表）。
- 无头 Chrome 加载真实 CSS（`ContentArea.css` + `ItemCard.css` + 全局 `border-box`）渲染 8 张卡片实测：3 列布局下 `i1..i4` 跨行组被拆成 2 段、`i5/i6` 与 `i7/i8` 各 1 段；每段框完整包住成员卡片（外扩 5px），且不误圈同行其他颜色的卡片，断言输出 `problems: []`。

---

## V156 之二 — 拖入网站后，标签页标题秒出

### 需求

从浏览器把标签页拖进窗口，命名对话框里「标签页标题」那一项总要先转一会儿。慢在四处：前端要等对话框画完第一帧才发请求；Rust 端把整页（最多 512KB）**读完**才去解析 `<title>`；超时 8 秒；Chrome / Edge 的原生拖拽数据里根本不给标题，只能等网络。顺带还有国内 GBK 站点标题乱码的问题。

### 实现（七层，任一层缺失都会退化成「等」）

1. **前端提前起跑**（`src/hooks/useWebsiteDropController.ts`）：`if (!droppedName) void loadTitle();` 提到 `if (shouldPromptRename)` **之前**，标题请求与对话框首帧并行；传给 `uiWebsiteNameChoice` 的仍是同一个 in-flight promise，不会重复请求。
2. **流式早退解析**（`src-tauri/src/website_metadata.rs`）：`read_title_stream` 按 `TITLE_CHUNK_BYTES`（8KB）分块读，凑齐 `</title>` 立刻返回，不再等整页下完。
3. **字节级查找**：新增 `find_ascii_ci`，大小写不敏感地扫原始字节，省掉「整页复制成小写」那一次分配。
4. **按页面声明解码**：`resolve_encoding` 依次看 `Content-Type` 的 `charset=` → `<meta charset>` → UTF-8，再用 `encoding_rs` 解码，GBK / GB18030 站点标题不再乱码。
5. **连接与超时**：`connect_timeout` 4s→3s、总超时 8s→6s、`pool_idle_timeout` 90s→300s、`pool_max_idle_per_host` 8→16、`tcp_keepalive(60s)`、`tcp_nodelay(true)` —— 同一站点第二次拖入省掉 TCP + TLS 握手。
6. **缓存增强**：重定向后的**最终网址**也写进标题缓存（下次拖同一入口直接命中）；新增 `TITLE_FAILURE` 失败黑名单（60s），死站不会每次拖入都吃满 6 秒；`image/` `video/` `audio/` `application/pdf` `octet-stream` `zip` 这类非网页直链直接判失败，不读正文。
7. **悬停预热 + 原生标题**（`src-tauri/src/native_browser_drop.rs`）：`DragEnter` 阶段就把 URL 交给 `website_metadata::prefetch_title`（`spawn_blocking`）去抓，用户拖到落点松手时标题往往已在缓存里；同时新增 `title_from_html_payload`，从 Chrome / Edge 的 `text/html`、`HTML Format` 载荷里取 `<title>` 或 `<a href>` 的文字（CF_HTML 头按 `StartFragment:` 字节偏移剥离），有本地标题就完全不走网络。

### 验证

- `npx tsc --noEmit` 通过；`npx vitest run` 41 个测试文件 / 220 个用例全绿；`node scripts/verify-source-fixes.mjs` 输出 `Persistent Windows/Rust source fixes: OK`。
- `cargo check` 通过（仅剩既有的 4 条无关 warning）。
- `src-tauri/build.rs` 与 `scripts/verify-source-fixes.mjs` 各补 7 条 V156 断言（`read_title_stream`、`TITLE_CHUNK_BYTES`、`encoding_rs::Encoding`、`TITLE_FAILURE`、`prefetch_title`、`title_from_html_payload`、前端「先发请求再开对话框」的顺序），任一被删都会在构建期 panic。

---

## V154 — 修复「每行字数」换行失效与全局搜索搜不到设置项

### 1. 「每行字数（换行）」在 8 以上完全没反应

- **现象**：设置 → 字体 → 项目名称显示 里的滑块「每行字数（换行）」（范围 4–20，默认 8）从 8 往右拉到 20，卡片上的名称换行位置一动不动，看起来就是「多字（更大字数）换行没有效果」。
- **根因**：`.item-label` 的换行只靠 `max-width: calc(var(--label-chars, 8) * 1em)`。默认卡片宽 108px、内边距 `8px 6px`，名称可用宽只有 96px，而 12px 字号下一个汉字正好 1em = 12px，**物理上限约 8 个字**；字号更大时更少。于是 charsPerLine ≥ 8 之后 max-width 永远被卡片内容宽夹住，滑块后 13/17 的行程（8 → 20）全部无效。用无头 Chrome 复刻真实 CSS 实测：4 → 48px、6 → 72px 生效；8/10/12/16 全部被夹到 84px（实际只排 7 个字）。
- **修复**：新增 `src/lib/cardMetrics.ts`，把「每行字数」换算成卡片最小宽度，再与用户设置的占位宽度、视图模式最小宽度取最大值：
  - `getLabelDrivenCardWidth(display)` = `charsPerLine × fontSize + 12`（卡片左右内边距）；「完整显示项目名称」开启（`labelLines < 1`）时返回 0，不参与计算。
  - `getEffectiveCardWidth(display)` = `max(itemWidth, 视图模式最小宽度, 每行字数所需宽度)`，`getEffectiveCardMinHeight()` 同理。
  - 内容区网格（`ShortcutGrid` 注入 `--item-card-width` / `--item-card-min-height`）与 设置 → 显示 的实时预览卡片（`DisplaySettings`）共用这两个函数，预览与实际完全一致；`.preview-card` 内边距同步为 `8px 6px`，与 `.item-card` 对齐。
- **效果**：4–20 每一档都真实生效（20 字 → 卡片 252px），长名称按设定字数换行，不再被卡片宽度悄悄夹断。

### 2. 右上角搜索搜不到「设置里的搜索」能搜到的内容

- **现象**：设置面板里搜「换行」「完整显示项目名称」「窗口贴边隐藏」能搜到具体开关；界面右上角的搜索（全局命令面板，Ctrl+K）搜同样的词什么都搜不到。
- **根因**：两套索引各自独立。设置面板用 `src/lib/settingsSearchIndex.ts` 的 `SETTINGS_SEARCH_ITEMS`（49 条细粒度设置项，带 label / description / keywords / focusText / targetId）；命令面板只用 `src/lib/settingsCatalog.ts` 的 `SETTINGS_CATALOG`（20 条「打开设置：xx」分类条目）。而且命中后只能打开分类标签页，无法定位到具体设置项 —— `SettingsPanel` 收到外部请求时会把 `focusText` / `targetId` 强制清空。
- **修复**：
  - `commandPalette.ts`：`includeSettings` 分支在原有分类条目之外，并入 `SETTINGS_SEARCH_ITEMS` 生成细粒度条目（`setting-item:<id>`，标题为设置项名、副标题为「设置 · 分类」、detail 为描述、keywords 追加 `focusText`）；`PaletteEntry` 新增 `settingSection` / `settingFocusText` / `settingTargetId` 三个跳转字段。
  - `settingsCatalog.ts`：新增 `requestSettingsItem(request)`；`SettingsOpenRequest` 增加 `focusText` / `targetId`。
  - `GlobalSearch.tsx`：新增 `openSettingsEntry(entry)`，回车与点击都带着 section / focusText / targetId 打开设置。
  - `SettingsPanel.tsx`：监听设置打开请求时不再清空 `focusText` / `targetId`，改为沿用请求里的值，于是命中后会自动展开对应折叠区、滚动到并高亮那个控件（复用设置页内搜索的同一套定位机制）。
- **附带**：「每行字数」的滑块标题原本不在设置页的可搜字段里（只搜 label / description / keywords），命令面板已把 `focusText` 并入 keywords，搜「每行字数」也能直达。

### 回归保护与验证

- 新增 `src/lib/__tests__/cardMetrics.test.ts`：断言字数换算、视图模式最小宽度、`max(itemWidth, …)` 取舍，并逐档校验 **4–20 每一档的标签可用宽都 ≥ 字数 × 字号**（这条断言就是「8 以上失效」的回归网）。
- `src/lib/__tests__/commandPalette.test.ts` 新增一组用例：细粒度设置条目带正确跳转字段；设置页前几条带锚点的命中项，命令面板都能搜到（覆盖「换行 / 完整显示项目名称 / 贴边隐藏 / 右键」）；粗粒度的「打开设置：xx」条目保持不变。
- `scripts/verify-source-fixes.mjs` 增加 5 条 v154 断言（卡片宽度换算、命令面板并入设置索引、面板携带跳转锚点、设置面板沿用 focusText）。
- `npx tsc --noEmit` 0 错误；`npx vitest run` 41 个文件 / 215 个用例全通过。
- 改动文件：`src/lib/cardMetrics.ts`（新增）、`src/lib/__tests__/cardMetrics.test.ts`（新增）、`src/components/ContentArea/ShortcutGrid/ShortcutGrid.tsx`、`src/components/Settings/DisplaySettings.tsx`、`src/components/Settings/Settings.css`、`src/lib/commandPalette.ts`、`src/lib/settingsCatalog.ts`、`src/components/GlobalSearch/GlobalSearch.tsx`、`src/components/Settings/SettingsPanel.tsx`、`src/lib/settingsSearchIndex.ts`、`src/lib/__tests__/commandPalette.test.ts`、`scripts/verify-source-fixes.mjs`。

## V153 — 右键菜单新增「显示完整名称」

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
