import type { GlobalSearchSettings, TransferStationSettings, ImageBrowserSettings, ImageBrowserItem, IconResolveMode } from './utils/v16Types';
export type ShortcutType = 'file' | 'folder' | 'url' | 'command';
export type ViewMode = 'grid' | 'compact';
export type SortMode = 'custom' | 'name' | 'type' | 'recent' | 'frequent';
export type DirectoryKind = 'normal' | 'all' | 'notes' | 'startMenu' | 'mapped' | 'link' | 'html';
export type EdgeAnimationStyle =
  | 'animate-window'
  | 'setwindowpos'
  | 'setwindowpos-linear'
  | 'setwindowpos-cubic'
  | 'setwindowpos-back'
  | 'fade-slide'
  | 'fade'
  | 'instant';
export type WindowControlStyle = 'round' | 'square' | 'bar' | 'pad';
export type WindowControlId = 'search' | 'transfer' | 'image' | 'profiles' | 'multiAccount' | 'sortGroups' | 'add' | 'settingsQuick' | 'settings' | 'pin' | 'minimize' | 'close';
export type BackgroundFit = 'cover' | 'contain' | 'stretch' | 'tile';
export type BackgroundPosition = 'center' | 'top' | 'bottom' | 'left' | 'right';
export type BackgroundMediaKind = 'auto' | 'image' | 'video';
export type TransferItemType = 'file' | 'folder' | 'url' | 'command';
export type FaviconProviderId = 'auto' | 'page' | 'quicker' | 'faviconIm' | 'iowen' | 'google' | 'duckduckgo' | 'clearbit' | 'iconHorse' | 'faviconKit' | 'yandex' | 'direct';
export type RainbowBorderMode = 'rotate' | 'static' | 'fixed-flow';
export type RainbowCursorStyle = 'dot-ring' | 'windows-outline' | 'windows-full' | 'windows-inside' | 'mac-ring';
export type AfterLaunchAction = 'keep' | 'minimize' | 'hide';
export type ItemTooltipMode = 'off' | 'name' | 'details';
export type FontApplyArea = 'main' | 'settings' | 'menus' | 'notes';
export type BrowserEngine = 'chromium' | 'gecko' | 'generic';
export type BrowserRouteMode = 'default' | 'foreground-browser' | 'specified';
export type BrowserRouteOverrideMode = 'inherit' | BrowserRouteMode;
export type ItemClickAction = 'inherit' | 'open' | 'copy-name' | 'copy-path' | 'copy-name-path' | 'none';

export interface BrowserRouteOverride {
  mode: BrowserRouteOverrideMode;
  browserId?: string;
  profileId?: string;
}

export interface CustomBrowserConfig {
  id: string;
  name: string;
  executable: string;
  engine: BrowserEngine;
  /** 可选的浏览器用户数据/Profile 根目录；用于自定义或便携版浏览器自动扫描 Profile。 */
  profileRoot?: string;
}

export interface BrowserProfileOverride {
  name?: string;
  color?: string;
}

export type MultiAccountTargetMode = 'current' | 'selected' | 'new';
export type MultiAccountNameOrder = 'prefix-profile' | 'profile-prefix' | 'profile-only';

export interface MultiAccountTemplate {
  id: string;
  name: string;
  urlsText: string;
  batchName: string;
  projectPrefix: string;
  separator: string;
  nameOrder: MultiAccountNameOrder;
  lettersOnlyProfileName: boolean;
  includeBrowserName: boolean;
  targetMode: MultiAccountTargetMode;
  selectedDirectoryId: string;
  newDirectoryName: string;
  selectedTargetKeys: string[];
  skipDuplicates: boolean;
  autoFetchIcon: boolean;
  pinGenerated: boolean;
  activateTargetAfterCreate: boolean;
}

export interface MultiAccountBatchMeta {
  batchId: string;
  batchName: string;
  createdAt: number;
  sourceUrl: string;
  sourceLabel?: string;
  targetKey: string;
}

export interface MultiAccountSettings {
  /** v120 compatibility: mirrors the first parsed URL. */
  url: string;
  /** One URL per line. Optional syntax: Display name | https://example.com */
  urlsText: string;
  /** Human-readable name stored on all generated items in the same batch. */
  batchName: string;
  projectPrefix: string;
  separator: string;
  nameOrder: MultiAccountNameOrder;
  lettersOnlyProfileName: boolean;
  includeBrowserName: boolean;
  targetMode: MultiAccountTargetMode;
  selectedDirectoryId: string;
  newDirectoryName: string;
  selectedTargetKeys: string[];
  skipDuplicates: boolean;
  autoFetchIcon: boolean;
  pinGenerated: boolean;
  activateTargetAfterCreate: boolean;
  templates: MultiAccountTemplate[];
}

export interface BrowserRouterSettings {
  mode: BrowserRouteMode;
  specifiedBrowserId: string;
  specifiedProfileId: string;
  customBrowsers: CustomBrowserConfig[];
  /** key = browserId::profileId，只保存用户自定义显示名/颜色，不写浏览器 Profile 本身。 */
  profileOverrides: Record<string, BrowserProfileOverride>;
}

export interface DetectedBrowserProfile {
  id: string;
  name: string;
  path: string;
  /** Chromium 的目录名（Default/Profile 1）；Gecko 通常等于 profiles.ini 中 Name。 */
  profileKey: string;
  /** 自动修复乱码前的原始名称；仅在该 profile 名称被修复时返回。 */
  nameRaw?: string | null;
}

export interface DetectedBrowser {
  id: string;
  name: string;
  executable: string;
  engine: BrowserEngine;
  profileRoot?: string;
  source: 'auto' | 'custom';
  profiles: DetectedBrowserProfile[];
}

export interface NoteSettings {
  fontSize: number;
  lineHeight: number;
  padding: number;
  radius: number;
  autosaveDelayMs: number;
  wrap: boolean;
  showTitle: boolean;
  showLineNumbers: boolean;
  /** 行号开关生效范围：all=所有便签共用；current=每个便签单独保存。 */
  lineNumberScope: 'all' | 'current';
  separatorLength: number;
  dashSeparatorChar: string;
  starSeparatorChar: string;
}

export interface ShortcutItem {
  id: string;
  name: string;
  path: string;
  icon?: string;
  type: ShortcutType;
  order: number;
  labelLines?: number;
  /** 是否固定到项目列表前面。 */
  pinned?: boolean;
  /** 成功启动次数，用于“最常使用”排序。 */
  launchCount?: number;
  /** 最近一次成功启动时间戳，用于“最近启动”排序。 */
  lastLaunchedAt?: number;
  /** 仅网址项目使用。inherit 表示继承父目录，再继承全局浏览器路由。 */
  browserRoute?: BrowserRouteOverride;
  /** 左键单击动作。inherit 表示继续使用全局启动方式。 */
  singleClickAction?: ItemClickAction;
  /** 左键双击动作。inherit 表示继续使用全局启动方式。 */
  doubleClickAction?: ItemClickAction;
  /** v121: metadata for multi-account batch management. */
  multiAccountBatch?: MultiAccountBatchMeta;
  /** v147: 项目自定义颜色（彩色框）；未设置时跟随主题。 */
  color?: string;
  /**
   * v188: 图片卡片的显示尺寸。
   *
   * 有这个字段 = 这是「图片卡片」：卡片不再画成图标 + 名字，而是直接把图片本身
   * 铺满卡片，边框/四角可以拖拽改大小。没这个字段的项目一切照旧。
   */
  imageSize?: ImageCardSize;
  /** v188: 图片卡片的铺法。cover = 裁切铺满（默认），contain = 完整显示留白。 */
  imageFit?: 'cover' | 'contain';
}

export interface TransferItem {
  id: string;
  name: string;
  path: string;
  type: TransferItemType;
  icon?: string;
  createdAt: number;
}

export interface DisplaySettings {
  /** 使用更接近 Windows 11 / WinUI 3 的现代控件与层级样式。 */
  modernWinUI3Mode: boolean;
  /** 为不同界面文字启用主题派生的轻量色彩点缀。 */
  colorfulTextEnabled: boolean;
  /** 自定义字体名称或 CSS 字体栈；留空时跟随当前主题。 */
  fontFamily: string;
  /** 自定义字体生效区域。 */
  fontApplyAreas: FontApplyArea[];
  /** v179: 全局字号缩放系数（0.8–1.5），乘到主界面、侧栏、菜单、顶部标签、设置和便签的字号上。 */
  fontScale: number;
  /** v179: 设置界面字号（px，基线 12px），只影响设置窗口里的文字。 */
  settingsFontSize: number;
  /** 项目名称是否忽略最大显示行数并完整展示。 */
  showFullItemName: boolean;
  labelLines: number;
  charsPerLine: number;
  fontSize: number;
  iconSize: number;
  itemIconResolveMode: IconResolveMode;
  iconParallelTasks: number;
  /** 添加/刷新网站图标时，是否把 favicon 下载保存到本地缓存。 */
  autoSaveWebsiteIcon: boolean;
  /** favicon 获取源。auto 表示按内置顺序自动兜底。 */
  faviconProvider: FaviconProviderId;
  /** favicon 获取失败时是否自动尝试下一个来源。 */
  faviconProviderFallback: boolean;
  /** 底部提示气泡显示时长。 */
  toastDurationMs: number;
  itemWidth: number;
  itemHeight: number;
  gridGap: number;
  viewMode: ViewMode;
  sortMode: SortMode;
  menuFontSize: number;
  menuItemHeight: number;
  menuMinWidth: number;
  topTabEqualWidth: boolean;
  topTabWidth: number;
  topTabHeight: number;
  topTabGap: number;
  topTabFontSize: number;
  topTabBorderWidth: number;
  topTabColorStrength: number;
  topTabShape: 'round' | 'square';
  /** v147: 子目录与项目彩色框的边框粗细（0–4px）。 */
  colorFrameBorderWidth: number;
  /** v147: 子目录与项目彩色框的填充强度（0.04–0.55）。 */
  colorFrameColorStrength: number;
  /** v147: 子目录与项目彩色框的形状。 */
  colorFrameShape: 'round' | 'square';
  /**
   * v148: 相邻颜色是否组合。
   * - independent：每一项各自用自己选的颜色（v147 行为）。
   * - adjacent：同一容器里相邻的若干项并成一组，组内共用同一个基色系。
   */
  colorFrameBlend: 'independent' | 'adjacent';
  /** v148: 相邻组合时「几项并成一组」（2–6）。 */
  colorFrameGroupSize: number;
  /** v148: 相邻组合时组内每格的深浅落差；0 表示组内完全同色（0–0.6）。 */
  colorFrameGroupTint: number;
  /**
   * v156: 是否画「同色相邻成组框」（v166 起同时作用于内容区项目和左侧子目录）。
   * 与顶部父目录的成组框（v138）同一套画法：颜色相同且相邻的 2 个以上项目 / 子目录
   * 会被一个更鲜艳的框圈成一组；只影响外观，不改变点击与拖动。
   */
  colorFrameClusterFrame: boolean;
  sidebarWidth: number;
  sidebarItemHeight: number;
  sidebarItemGap: number;
  sidebarFontSize: number;
  sidebarItemRadius: number;
  /** 左侧子目录列表默认列数；父目录可单独覆盖。 */
  sidebarColumns: number;
  /** 左侧子目录名称最多显示的行数，超出部分省略。 */
  sidebarItemLines: number;
  /** 左侧子目录名称不截断，完整换行显示。 */
  sidebarShowFullNames: boolean;
  /** 旧配置兼容字段：新版用 mainUiScale/settingsUiScale */
  uiScale: number;
  mainUiScale: number;
  settingsUiScale: number;
  scrollbarSize: number;
  scrollbarRadius: number;
  scrollbarUseThemeColor: boolean;
  scrollbarThumbColor: string;
  scrollbarThumbHoverColor: string;
  scrollbarTrackColor: string;
  rememberInterfaceCollapseState: boolean;
  interfaceCollapsedSections: string[];
  windowControlStyle: WindowControlStyle;
  windowControlSize: number;
  windowControlGap: number;
  windowControlOrder: WindowControlId[];
  /** 右上角功能按钮隐藏列表；不在列表内即显示。 */
  windowControlHidden: WindowControlId[];
  /** 顶部父目录按字母排列前保存的原始顺序；null 表示当前不处于字母排序状态。 */
  sortGroupsSavedOrder: string[] | null;
  /**
   * 目录内项目切离「自定义排序」前保存的 id 序列；null 表示没有挂起的自定义顺序。
   * 切回自定义排序时按它还原（V165）。
   */
  sortItemsSavedOrder: string[] | null;
  backgroundEnabled: boolean;
  backgroundImage: string;
  backgroundMediaKind: BackgroundMediaKind;
  backgroundOpacity: number;
  backgroundDim: number;
  backgroundBlur: number;
  backgroundFit: BackgroundFit;
  /** 兼容旧版五向定位。新版以 X/Y 百分比为准。 */
  backgroundPosition: BackgroundPosition;
  backgroundPositionX: number;
  backgroundPositionY: number;
  backgroundMotionEnabled: boolean;
  backgroundPlaybackRate: number;
  backgroundPauseWhenHidden: boolean;
  backgroundContainAmbient: boolean;
  backgroundPanelOpacity: number;
  /** 设置面板使用独立背景，不与主界面背景互相覆盖。 */
  settingsBackgroundEnabled: boolean;
  settingsBackgroundImage: string;
  settingsBackgroundMediaKind: BackgroundMediaKind;
  settingsBackgroundOpacity: number;
  settingsBackgroundDim: number;
  settingsBackgroundBlur: number;
  settingsBackgroundFit: BackgroundFit;
  settingsBackgroundPosition: BackgroundPosition;
  settingsBackgroundPositionX: number;
  settingsBackgroundPositionY: number;
  settingsBackgroundMotionEnabled: boolean;
  settingsBackgroundPlaybackRate: number;
  settingsBackgroundPauseWhenHidden: boolean;
  settingsBackgroundContainAmbient: boolean;
  settingsBackgroundPanelOpacity: number;
  /** 设置窗口启用毛玻璃模糊、饱和、高光与玻璃边框；不修改面板透明度。 */
  settingsBackgroundGlassEffect: boolean;
  settingsBackgroundGlassBlur: number;
  settingsBackgroundGlassSaturation: number;
  settingsBackgroundGlassHighlight: number;
}




export type DirectoryDisplaySettings = Partial<DisplaySettings>;

/**
 * v169: 目录链接的源。
 *
 * `profileId` 为空串表示「当前配置」——同配置链接，改源目录立即同步；
 * 非空表示另一个配置档案（IndexedDB 里那份保存好的配置），可以跨配置生效。
 */
export interface DirectoryLinkRef {
  profileId: string;
  /** 源配置显示名快照，只用于界面提示（配置改名后不会自动更新）。 */
  profileName?: string;
  groupId: string;
  /** 子目录链接必填；父目录链接（Group.link）没有这个字段。 */
  directoryId?: string;
}

/** v188: 图片卡片的显示尺寸（px，拖拽边框改的就是它）。 */
export interface ImageCardSize {
  width: number;
  height: number;
}

/** v173: HTML 目录里单个页面卡片的大小（px，拖拽边框改的就是它）。 */
export interface HtmlCardSize {
  width: number;
  height: number;
}

/** v173: HTML 目录的显示设置（目录级默认值，单卡片可在 htmlCards 里覆盖）。 */
export interface HtmlViewSettings {
  /** 卡片默认宽度（px）；不设置时按内容区宽度自适应。 */
  cardWidth?: number;
  /** 卡片默认高度（px）；不设置时按宽度等比推算。 */
  cardHeight?: number;
  /** 是否显示首页实时预览（关掉就只显示文件名卡片，省性能）。 */
  preview?: boolean;
  /** fit = 把整页按卡片宽度等比缩放（默认）；actual = 1:1 只显示左上角。 */
  previewScale?: 'fit' | 'actual';
  /** 是否递归扫描子文件夹。 */
  recursive?: boolean;
}

export interface Directory {
  id: string;
  name: string;
  order: number;
  items: ShortcutItem[];
  kind?: DirectoryKind;
  /** 仅 kind='mapped' 使用：被实时镜像的文件夹绝对路径。 */
  mappedPath?: string;
  /** v173: 仅 kind='html' 使用 —— 被自动扫描 html/htm 的文件夹绝对路径。 */
  htmlPath?: string;
  /** v173: 仅 kind='html' 使用 —— 单个页面卡片的尺寸覆盖，key 是文件绝对路径。 */
  htmlCards?: Record<string, HtmlCardSize>;
  /** v175: 仅 kind='html' 使用 —— 卡片自定义显示名（key 同上），只改显示，不动真实文件名。 */
  htmlNames?: Record<string, string>;
  /** v175: 仅 kind='html' 使用 —— 卡片颜色（key 同上），参与「相邻颜色组合」与成组框。 */
  htmlColors?: Record<string, string>;
  /** v173: 仅 kind='html' 使用 —— 目录级预览/卡片默认设置。 */
  htmlView?: HtmlViewSettings;
  /** v169: 仅 kind='link' 使用 —— 内容实时镜像自某个配置里的子目录。 */
  link?: DirectoryLinkRef;
  /**
   * v182: 仅 kind='link' 使用 —— 用户给链接子目录起的显示名。
   *
   * 链接的**内容**跟着源走，**名字**不跟：改名只写这个字段，同步时用它压过源子目录名，
   * 源子目录自己还是原来的名字。没设置（或清空）就是「跟随源名称」。
   */
  linkNameOverride?: string;
  display?: DirectoryDisplaySettings;
  note?: string;
  /** 当前便签是否显示行号，仅在 notes.lineNumberScope='current' 时生效。 */
  noteShowLineNumbers?: boolean;
  /** v147: 子目录自定义颜色（彩色框）；未设置时跟随主题。 */
  color?: string;
}

export interface Group {
  id: string;
  name: string;
  order: number;
  color?: string;
  /** 父目录默认网址路由；子项目可继续覆盖。 */
  browserRoute?: BrowserRouteOverride;
  /** 当前父目录下子目录列表的列数；未设置时继承 display.sidebarColumns。 */
  sidebarColumns?: number;
  /** v169: 父目录链接 —— 整个父目录（连同子目录）实时镜像自某个配置里的父目录。 */
  link?: DirectoryLinkRef;
  /** v182: 链接父目录的显示名覆盖（语义同 `Directory.linkNameOverride`）。 */
  linkNameOverride?: string;
  /**
   * v182: 链接父目录里镜像出来的子目录各自的显示名，key = **源**子目录 id。
   *
   * 镜像子目录每次同步都会整条重建（id 是派生的），改不到自己身上的字段，
   * 所以覆盖记在父目录这边；同步时按源 id 取出来压过源名字。
   */
  linkDirectoryNames?: Record<string, string>;
  directories: Directory[];
}

export interface BehaviorSettings {
  edgeAutoHide: boolean;
  /** 贴边检测时忽略 Windows 工作区/任务栏边界，只以物理屏幕边缘为准。 */
  edgeIgnoreTaskbar: boolean;
  edgeHideDelaySeconds: number;
  edgeAnimationMs: number;
  edgeAnimationStyle: EdgeAnimationStyle;
  autoEdgeHide: boolean;
  autoEdgeBounce: boolean;
  /** 窗口被拖出屏幕一部分后，是否直接弹回屏幕内，而不是隐藏到边缘。 */
  autoEdgeSnapBack: boolean;
  /** 窗口拖出屏幕弹回时是否使用流畅动画。 */
  autoEdgeSnapBackAnimation: boolean;
  /** 窗口拖出屏幕弹回动画时长。 */
  autoEdgeSnapBackAnimationMs: number;
  autoEdgeHideDelay: number;
  edgeVisiblePixels: number;
  edgeGhostFrameFix: boolean;
  /** 鼠标离开已展开主界面后的隐藏动画速度。 */
  edgeMouseLeaveHideMs: number;
  /** 不创建独立 edge-strip 触发窗，直接保留主窗口边缘；可规避透明触发框/残影。 */
  edgeUseMainWindowStrip: boolean;
  edgeStripSize: number;
  edgeStripOpacity: number;
  edgeStripUseThemeColor: boolean;
  edgeStripColor: string;
  launchMode: 'single' | 'double';
  /** v107 兼容字段；v108 以后以 browserRouter.mode 为主。 */
  urlOpenMode: 'default' | 'foreground-browser' | 'specified';
  autoStart: boolean;
  closeAction: 'tray' | 'exit';
  alwaysOnTop: boolean;
  /** 兼容旧版：是否记住主窗口状态。v75 起由下面三个独立开关控制。 */
  rememberMainWindowBounds: boolean;
  /** 是否启用手动保存的主窗口大小和位置。 */
  manualWindowStateEnabled: boolean;
  /** 启动应用时是否恢复保存的窗口状态。 */
  restoreWindowStateOnLaunch: boolean;
  /** 退出应用或系统关机时是否保存当前窗口状态。 */
  saveWindowStateOnExit: boolean;
  /** 记住设置面板被鼠标拖动边框调整后的大小和位置。 */
  rememberSettingsPanelBounds: boolean;
  /** 设置面板是否自动适配当前主窗口可用大小。 */
  settingsPanelAdaptiveSize: boolean;
  /** 单击启动模式下，项目需要长按多久才进入拖动排序。 */
  itemDragLongPressMs: number;
  /** 单击启动模式下，长按拖动前允许的鼠标抖动距离。 */
  itemDragTolerance: number;
  /** 拖动项目时的背景颜色。 */
  itemDragBackgroundColor: string;
  /** 拖动项目时的发光颜色。 */
  itemDragGlowColor: string;
  /** 拖动项目时的发光亮度/强度。 */
  itemDragGlowBrightness: number;
  /** 从浏览器或 .url 文件拖入网站后，默认弹出应用内重命名界面。 */
  promptRenameDroppedWebsite: boolean;
}



export interface RainbowSettings {
  enabled: boolean;
  cursorEnabled: boolean;
  cursorStyle: RainbowCursorStyle;
  cursorSize: number;
  trailEnabled: boolean;
  trailCount: number;
  trailDurationMs: number;
  trailSize: number;
  trailBrightness: number;
  borderEnabled: boolean;
  borderMode: RainbowBorderMode;
  borderSpeedSeconds: number;
  borderWidth: number;
  borderBrightness: number;
  textEnabled: boolean;
  textOnGroups: boolean;
  textOnDirectories: boolean;
  textOnSettings: boolean;
  textSpeedSeconds: number;
  cursorColors: string[];
  borderColors: string[];
  textColors: string[];
}



export type ShortcutActionId =
  | 'openSettings'
  | 'openGlobalSearch'
  | 'openTransferStation'
  | 'openImageBrowser'
  | 'toggleAlwaysOnTop'
  | 'focusPageSearch'
  | 'selectAllItems'
  | 'launchSelectedItem'
  | 'deleteSelection'
  | 'closeOverlay';

export type ShortcutSettings = Record<ShortcutActionId, string>;

export type DirectoryRightClickMode = 'content' | 'manage';

export type DirectoryContextMenuItemId =
  | 'copyDirectory'
  | 'pasteDirectory'
  | 'moveToGroup'
  | 'paste'
  | 'rename'
  | 'color'
  | 'fullNames'
  | 'merge'
  | 'switchToNotes'
  | 'switchToNormal'
  | 'refreshStartMenu'
  | 'openStartMenuFolder'
  | 'refreshMappedFolder'
  | 'openMappedFolder'
  | 'changeMappedFolder'
  | 'refreshHtmlFolder'
  | 'openHtmlFolder'
  | 'changeHtmlFolder'
  | 'toggleHtmlPreview'
  | 'resetHtmlCardSizes'
  | 'linkRefresh'
  | 'linkLocate'
  | 'linkRetarget'
  | 'linkResetName'
  | 'linkDetach'
  | 'clear'
  | 'delete';

export type GroupContextMenuItemId =
  | 'copyGroup'
  | 'pasteGroup'
  | 'pasteDirectory'
  | 'create'
  | 'linkDirectory'
  | 'linkGroup'
  | 'linkRefresh'
  | 'linkResetName'
  | 'linkDetach'
  | 'merge'
  | 'color'
  | 'delete';

export type AreaContextMenuItemId =
  | 'paste'
  | 'createDirectory'
  | 'linkDirectory'
  | 'linkGroup'
  | 'addFile'
  | 'addFolder'
  | 'addImage'
  | 'addExe'
  | 'addUrl'
  | 'addSystem'
  | 'iconSize'
  | 'viewMode'
  | 'sortMode'
  | 'directoryColumns'
  | 'sidebarFullNames'
  | 'globalIconSize'
  | 'globalViewMode'
  | 'globalSortMode'
  | 'refreshIcons';


export type SettingsTabId =
  | 'general'
  | 'behavior'
  | 'drag'
  | 'window'
  | 'interface'
  | 'font'
  | 'experience'
  | 'navigation'
  | 'contextMenus'
  | 'shortcuts'
  | 'diagnostics'
  | 'icons'
  | 'rainbow'
  | 'notes'
  | 'search'
  | 'transfer'
  | 'image'
  | 'about'
  | 'sponsor'
  | 'data';

export interface CommandUsage {
  count: number;
  lastUsedAt: number;
}

/**
 * v174: 侧栏特殊子目录（HTML / 链接）的区分边框形式。
 * - `outline`：整圈描边，HTML 实线、链接虚线
 * - `ribbon`：右侧小角标（HTML / LINK），带一圈淡淡的描边
 * - `bar`：左侧强调条，HTML 实线、链接虚线（与开始菜单、映射文件夹同一套语言）
 */
export type SpecialDirectoryStyle = 'superscript';

export interface ExperienceSettings {
  /** 重新打开程序时回到上次使用的父目录和子目录。 */
  rememberLastPage: boolean;
  /** 开启后再次打开设置回到上次分类；默认关闭，打开设置时回到常规分类。 */
  rememberSettingsTab: boolean;
  /** 每个设置分类分别记住上次滚动位置。 */
  rememberSettingsScrollPosition: boolean;
  /** 空目录中显示拖放和右键添加说明。 */
  showEmptyGuide: boolean;
  /** 项目成功启动后显示短提示。 */
  showLaunchNotice: boolean;
  /** 上次运行时的版本号；与当前构建版本不一致时提示「当前版本是 …」。 */
  lastSeenVersion: string;
  /** 上次下载更新安装包的位置；下次更新默认还下到这里（留空则自动检测程序所在目录）。 */
  installerDownloadDir: string;
  /** 删除快捷项目前询问确认。 */
  confirmDeleteItems: boolean;
  /** 删除父目录或子目录前询问确认。 */
  confirmDeleteNavigation: boolean;
  /** 清空当前标签全部项目之前询问确认。 */
  confirmClearDirectory: boolean;
  /** 项目悬停时使用上浮和缩放动画。 */
  itemHoverAnimation: boolean;
  /** 减少界面动画，适合低性能设备或偏好稳定显示的用户。 */
  reduceMotion: boolean;
  /** 被固定的项目始终优先显示在普通项目之前。 */
  pinnedItemsFirst: boolean;
  /** 设置左侧分类使用更紧凑的布局。 */
  compactSettingsNav: boolean;
  /** 在设置页显示辅助描述与解释文字。 */
  showSettingsDescriptions: boolean;
  /** 切换设置分类时使用淡入和上滑过渡动画。 */
  settingsTabAnimation: boolean;
  /** 使用方向键/Home/End 在当前项目之间移动，Enter 启动选中项目。 */
  keyboardNavigation: boolean;
  /** 在项目页面直接输入文字时自动聚焦当前页搜索框。 */
  typeToSearch: boolean;
  /** 当前页搜索是否同时匹配项目路径或网址。 */
  searchIncludesPath: boolean;
  /** 项目启动成功后是否清除选中状态。 */
  clearSelectionAfterLaunch: boolean;
  /** 项目启动成功后主窗口执行的动作。 */
  afterLaunchAction: AfterLaunchAction;
  /** 鼠标悬停项目时原生提示显示的内容。 */
  itemTooltipMode: ItemTooltipMode;
  /** 在项目右下角显示启动次数。 */
  showLaunchCountBadge: boolean;
  /** 旧配置兼容字段：子目录现在始终打开独立管理菜单。 */
  directoryRightClickMode: DirectoryRightClickMode;
  /** 新建子目录前弹出名称输入框。 */
  promptDirectoryNameOnCreate: boolean;
  /** 新建子目录后立即切换到该目录。 */
  activateNewDirectoryAfterCreate: boolean;
  /** 新建重名子目录时自动添加编号。 */
  autoNumberDuplicateDirectories: boolean;
  /** 在左侧子目录后显示项目或便签行数。 */
  showDirectoryItemCount: boolean;
  /** 双击左侧子目录空白区域时新建子目录。 */
  doubleClickSidebarToCreate: boolean;
  /**
   * v176: 是否在特殊子目录名称右上角显示类型小字。
   * 关掉之后所有子目录长得一样（最省视觉噪音）。
   */
  showSpecialDirectoryMarkers: boolean;
  /** v176: 特殊子目录统一使用名称右上角的小字；旧形式加载时自动迁移。 */
  specialDirectoryStyle: SpecialDirectoryStyle;
  /** 使用更紧凑的右键菜单间距。 */
  compactContextMenus: boolean;
  /** 在右键菜单中显示功能图标。 */
  showContextMenuIcons: boolean;
  /** 在添加项目菜单顶部显示当前子目录名称。 */
  showContextMenuDirectoryHeader: boolean;
  /** 子目录右键菜单中隐藏的项目。 */
  directoryContextMenuHiddenItems: DirectoryContextMenuItemId[];
  /** 父目录右键菜单中隐藏的项目。 */
  groupContextMenuHiddenItems: GroupContextMenuItemId[];
  /** 空白处右键菜单中隐藏的项目。 */
  areaContextMenuHiddenItems: AreaContextMenuItemId[];
}

export interface WindowState {
  opacity: number;
  /** @deprecated 兼容旧配置；运行时以 behavior.edgeAutoHide 为唯一真值，并自动同步到此字段。 */
  edgeAutoHide: boolean;
}

export interface AutoSaveSettings {
  enabled: boolean;
  directory: string;
  intervalMinutes: number;
  fileName: string;
}

export interface AppConfig {
  groups: Group[];
  theme: string;
  display: DisplaySettings;
  behavior: BehaviorSettings;
  browserRouter?: BrowserRouterSettings;
  multiAccount?: MultiAccountSettings;
  windowState: WindowState;
  autoSave: AutoSaveSettings;
  transferItems?: TransferItem[];
  imageBrowserItems?: ImageBrowserItem[];
  imageBrowser?: ImageBrowserSettings;
  globalSearch?: GlobalSearchSettings;
  transferStation?: TransferStationSettings;
  notes?: NoteSettings;
  rainbow?: RainbowSettings;
  experience?: ExperienceSettings;
  shortcuts?: ShortcutSettings;
  commandUsage?: Record<string, CommandUsage>;
}

export interface FileInfo {
  name: string;
  path: string;
  resolvedPath: string;
  exists: boolean;
  isDir: boolean;
  extension: string;
  type: ShortcutType;
}

export type ContextMenuState =
  | { kind: 'item'; itemId: string; x: number; y: number }
  | { kind: 'area'; x: number; y: number }
  | { kind: 'group'; groupId: string; x: number; y: number }
  | { kind: 'directory'; directoryId: string; x: number; y: number }
  /** v175: HTML 目录里的单张页面卡片（改名 / 上色 / 恢复尺寸）。 */
  | { kind: 'htmlPage'; directoryId: string; pagePath: string; x: number; y: number };

export interface DroppedPath {
  path: string;
}
