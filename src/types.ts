import type { GlobalSearchSettings, TransferStationSettings, ImageBrowserSettings, ImageBrowserItem, IconResolveMode } from './utils/v16Types';
export type ShortcutType = 'file' | 'folder' | 'url' | 'command';
export type ViewMode = 'grid' | 'compact';
export type SortMode = 'custom' | 'name' | 'type';
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
export type WindowControlId = 'search' | 'transfer' | 'image' | 'add' | 'multi' | 'settings' | 'pin' | 'minimize' | 'close';
export type BackgroundFit = 'cover' | 'contain' | 'stretch' | 'tile';
export type BackgroundPosition = 'center' | 'top' | 'bottom' | 'left' | 'right';
export type TransferItemType = 'file' | 'folder' | 'url' | 'command';

export interface NoteSettings {
  fontSize: number;
  lineHeight: number;
  padding: number;
  radius: number;
  autosaveDelayMs: number;
  wrap: boolean;
  showTitle: boolean;
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
  labelLines: number;
  charsPerLine: number;
  fontSize: number;
  iconSize: number;
  itemIconResolveMode: IconResolveMode;
  iconParallelTasks: number;
  /** 添加/刷新网站图标时，是否把 favicon 下载保存到本地缓存。 */
  autoSaveWebsiteIcon: boolean;
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
  backgroundEnabled: boolean;
  backgroundImage: string;
  backgroundOpacity: number;
  backgroundDim: number;
  backgroundBlur: number;
  backgroundFit: BackgroundFit;
  backgroundPosition: BackgroundPosition;
  backgroundPanelOpacity: number;
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
}

export interface Group {
  id: string;
  name: string;
  order: number;
  directories: Directory[];
}

export interface BehaviorSettings {
  edgeAutoHide: boolean;
  edgeHideDelaySeconds: number;
  edgeAnimationMs: number;
  edgeAnimationStyle: EdgeAnimationStyle;
  autoEdgeHide: boolean;
  autoEdgeBounce: boolean;
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
  autoStart: boolean;
  closeAction: 'tray' | 'exit';
  alwaysOnTop: boolean;
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
  /** 彩虹总开关。 */
  rainbowEnabled: boolean;
  /** 鼠标彩虹拖尾开关。 */
  rainbowMouseTrailEnabled: boolean;
  /** 彩虹鼠标样式。 */
  rainbowCursorStyle: 'dot' | 'windows-border' | 'windows-full' | 'windows-inner' | 'macos-wheel';
  /** 鼠标拖尾停留时间。 */
  rainbowMouseTrailLifeMs: number;
  /** 鼠标拖尾点数量。 */
  rainbowMouseTrailCount: number;
  /** 鼠标拖尾大小。 */
  rainbowMouseTrailSize: number;
  /** 鼠标拖尾亮度。 */
  rainbowMouseTrailBrightness: number;
  /** 鼠标/拖尾使用的彩虹颜色。 */
  rainbowMouseColors: string[];
  /** 窗口边框炫彩开关。 */
  rainbowBorderEnabled: boolean;
  /** 窗口边框炫彩速度。 */
  rainbowBorderSpeedSeconds: number;
  /** 窗口边框炫彩模式：旋转或固定。 */
  rainbowBorderMode: 'rotate' | 'fixed';
  /** 窗口边框光亮强度。 */
  rainbowBorderGlow: number;
  /** 窗口边框宽度。 */
  rainbowBorderWidth: number;
  /** 窗口边框使用的彩虹颜色。 */
  rainbowBorderColors: string[];
  /** 文字彩虹渐变开关。 */
  rainbowTextEnabled: boolean;
  /** 文字彩虹渐变速度。 */
  rainbowTextSpeedSeconds: number;
  /** 文字渐变使用的彩虹颜色。 */
  rainbowTextColors: string[];
  /** 彩虹文字作用到父目录标签。 */
  rainbowTextParentEnabled: boolean;
  /** 彩虹文字作用到子目录标签。 */
  rainbowTextChildEnabled: boolean;
  /** 彩虹文字作用到设置界面。 */
  rainbowTextSettingsEnabled: boolean;
}


export interface WindowState {
  opacity: number;
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
  windowState: WindowState;
  autoSave: AutoSaveSettings;
  transferItems?: TransferItem[];
  imageBrowserItems?: ImageBrowserItem[];
  imageBrowser?: ImageBrowserSettings;
  globalSearch?: GlobalSearchSettings;
  transferStation?: TransferStationSettings;
  notes?: NoteSettings;
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
