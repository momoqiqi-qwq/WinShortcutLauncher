import type { GlobalSearchSettings, TransferStationSettings, ImageBrowserSettings, ImageBrowserItem, IconResolveMode } from './utils/v16Types';
export type ShortcutType = 'file' | 'folder' | 'url' | 'command';
export type ViewMode = 'grid' | 'compact';
export type SortMode = 'custom' | 'name' | 'type' | 'recent' | 'frequent';
export type DirectoryKind = 'normal' | 'all' | 'notes';
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
export type WindowControlId = 'search' | 'transfer' | 'image' | 'profiles' | 'sortGroups' | 'add' | 'settingsQuick' | 'settings' | 'pin' | 'minimize' | 'close';
export type BackgroundFit = 'cover' | 'contain' | 'stretch' | 'tile';
export type BackgroundPosition = 'center' | 'top' | 'bottom' | 'left' | 'right';
export type BackgroundMediaKind = 'auto' | 'image' | 'video';
export type TransferItemType = 'file' | 'folder' | 'url' | 'command';
export type FaviconProviderId = 'auto' | 'quicker' | 'faviconIm' | 'iowen' | 'google' | 'duckduckgo' | 'clearbit' | 'iconHorse' | 'faviconKit' | 'yandex' | 'direct';
export type RainbowBorderMode = 'rotate' | 'static' | 'fixed-flow';
export type RainbowCursorStyle = 'dot-ring' | 'windows-outline' | 'windows-full' | 'windows-inside' | 'mac-ring';
export type AfterLaunchAction = 'keep' | 'minimize' | 'hide';
export type ItemTooltipMode = 'off' | 'name' | 'details';
export type FontApplyArea = 'main' | 'settings' | 'menus' | 'notes';
export type BrowserEngine = 'chromium' | 'gecko' | 'generic';
export type BrowserRouteMode = 'default' | 'foreground-browser' | 'specified';
export type BrowserRouteOverrideMode = 'inherit' | BrowserRouteMode;

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
  /** 自定义字体名称或 CSS 字体栈；留空时跟随当前主题。 */
  fontFamily: string;
  /** 自定义字体生效区域。 */
  fontApplyAreas: FontApplyArea[];
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
  sidebarWidth: number;
  sidebarItemHeight: number;
  sidebarItemGap: number;
  sidebarFontSize: number;
  sidebarItemRadius: number;
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

export interface Directory {
  id: string;
  name: string;
  order: number;
  items: ShortcutItem[];
  kind?: DirectoryKind;
  display?: DirectoryDisplaySettings;
  note?: string;
  /** 当前便签是否显示行号，仅在 notes.lineNumberScope='current' 时生效。 */
  noteShowLineNumbers?: boolean;
}

export interface Group {
  id: string;
  name: string;
  order: number;
  color?: string;
  /** 父目录默认网址路由；子项目可继续覆盖。 */
  browserRoute?: BrowserRouteOverride;
  directories: Directory[];
}

export interface BehaviorSettings {
  edgeAutoHide: boolean;
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
  | 'rename'
  | 'merge'
  | 'switchToNotes'
  | 'switchToNormal'
  | 'clear'
  | 'delete';

export type GroupContextMenuItemId = 'create' | 'merge' | 'color' | 'delete';

export type AreaContextMenuItemId =
  | 'createDirectory'
  | 'addFile'
  | 'addFolder'
  | 'addUrl'
  | 'addSystem'
  | 'iconSize'
  | 'viewMode'
  | 'sortMode'
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

export interface ExperienceSettings {
  /** 重新打开程序时回到上次使用的父目录和子目录。 */
  rememberLastPage: boolean;
  /** 再次打开设置时回到上次设置分类。 */
  rememberSettingsTab: boolean;
  /** 每个设置分类分别记住上次滚动位置。 */
  rememberSettingsScrollPosition: boolean;
  /** 空目录中显示拖放和右键添加说明。 */
  showEmptyGuide: boolean;
  /** 项目成功启动后显示短提示。 */
  showLaunchNotice: boolean;
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
  | { kind: 'directory'; directoryId: string; x: number; y: number };

export interface DroppedPath {
  path: string;
}
