import type { StoreApi } from 'zustand';
import type {
  AppConfig,
  AutoSaveSettings,
  BehaviorSettings,
  BrowserRouterSettings,
  Directory,
  DirectoryDisplaySettings,
  DirectoryKind,
  DirectoryLinkRef,
  HtmlCardSize,
  HtmlViewSettings,
  DisplaySettings,
  ExperienceSettings,
  Group,
  NoteSettings,
  MultiAccountSettings,
  RainbowSettings,
  ShortcutItem,
  ShortcutSettings,
  SortMode,
  TransferItem,
  WindowState,
  CommandUsage,
} from '../../types';
import type {
  GlobalSearchSettings,
  ImageBrowserItem,
  ImageBrowserSettings,
  TransferStationSettings,
} from '../../utils/v16Types';
import type { NavigationClipboard } from '../../lib/navigationClipboard';
import type { ClipboardMode } from '../../lib/clipboardMode';
import type { CreateShortcutsResult } from '../../lib/folderMirror';
import type { HtmlPage } from '../../lib/htmlFolder';

export interface NavigationSlice {
  activeGroupId: string;
  activeDirectoryId: string;
  selectedNavTarget: { kind: 'group' | 'directory'; id: string } | null;
  navigationClipboard: NavigationClipboard;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  setActiveGroup: (groupId: string) => void;
  setActiveDirectory: (directoryId: string) => void;
  renameGroup: (groupId: string, name: string) => void;
  setGroupColor: (groupId: string, color?: string) => void;
  setGroupColors: (colors: Record<string, string | undefined>) => void;
  /** v147: 给单个子目录设置 / 清除彩色框颜色。 */
  setDirectoryColor: (directoryId: string, color?: string) => void;
  /** v147: 批量设置子目录颜色；只处理 colors 里出现过的 id。 */
  setDirectoryColors: (colors: Record<string, string | undefined>) => void;
  /** v147: 给单个项目设置 / 清除彩色框颜色。 */
  setItemColor: (itemId: string, color?: string) => void;
  /** v147: 批量设置项目颜色；只处理 colors 里出现过的 id。 */
  setItemColors: (colors: Record<string, string | undefined>) => void;
  setGroupBrowserRoute: (groupId: string, route?: import('../../types').BrowserRouteOverride) => void;
  setGroupSidebarColumns: (groupId: string, columns?: number) => void;
  renameDirectory: (directoryId: string, name: string) => void;
  deleteGroup: (groupId: string) => void;
  deleteDirectory: (directoryId: string) => void;
  reorderGroups: (groupIds: string[]) => void;
  reorderDirectories: (groupId: string, directoryIds: string[]) => void;
  setSelectedNavTarget: (target: { kind: 'group' | 'directory'; id: string } | null) => void;
  copyDirectoryToClipboard: (directoryId: string) => boolean;
  /** v167: Ctrl+X 子目录 —— 粘贴时移动而不是复制。 */
  cutDirectoryToClipboard: (directoryId: string) => boolean;
  copyGroupToClipboard: (groupId: string) => boolean;
  /** v167: Ctrl+X 父目录 —— 粘贴到另一个父目录 = 合并（原父目录消失）。 */
  cutGroupToClipboard: (groupId: string) => boolean;
  clearNavigationClipboard: () => void;
  pasteDirectoryToGroup: (groupId: string) => string | null;
  pasteGroupFromClipboard: () => string | null;
  /** v167: 把剪贴板里的父目录（剪切模式）合并进目标父目录，返回目标 id。 */
  pasteGroupIntoGroupFromClipboard: (targetGroupId: string) => string | null;
  moveDirectoryToGroup: (directoryId: string, targetGroupId: string) => boolean;
  addDirectory: (groupId: string, name: string, kind?: DirectoryKind) => string;
  /** 设置 / 清除映射子目录被镜像的文件夹；传空串表示清除。 */
  setDirectoryMappedPath: (directoryId: string, mappedPath: string) => void;
  addGroup: (name: string) => void;
  mergeGroup: (sourceGroupId: string, targetGroupId: string) => void;
  mergeDirectory: (sourceDirectoryId: string, targetDirectoryId: string) => void;
  setDirectoryKind: (directoryId: string, kind: DirectoryKind) => void;
  /** v173: 设置 / 清除 HTML 子目录被扫描的文件夹；传空串表示清除。 */
  setDirectoryHtmlPath: (directoryId: string, htmlPath: string) => void;
  /** v173: 记住单个页面卡片被拖出来的尺寸（按文件绝对路径）。 */
  setHtmlCardSize: (directoryId: string, pagePath: string, size: HtmlCardSize) => void;
  /** v173: 清掉所有单卡尺寸，回到目录默认大小。 */
  resetHtmlCardSizes: (directoryId: string) => void;
  /** v175: 改单张卡片的显示名（不动真实文件名）；传空串恢复文件名。 */
  setHtmlPageName: (directoryId: string, pagePath: string, name: string) => void;
  /** v175: 忘掉单张卡片被拖出来的尺寸（回到目录默认值）。 */
  clearHtmlCardSize: (directoryId: string, pagePath: string) => void;
  /** v175: 给单张卡片上色；传空串回到跟随主题。 */
  setHtmlPageColor: (directoryId: string, pagePath: string, color: string) => void;
  /** v175: 清掉所有卡片的改名与颜色。 */
  resetHtmlCardAppearance: (directoryId: string) => void;
  /** v173: 改 HTML 子目录的显示设置（预览开关 / 默认卡片尺寸 / 是否递归）。 */
  updateHtmlView: (directoryId: string, patch: HtmlViewSettings) => void;
  getActiveGroup: () => Group | undefined;
  getActiveDirectory: () => Directory | undefined;
}

export interface ItemSlice {
  selectedItemIds: string[];
  multiSelectMode: boolean;
  itemClipboard: ShortcutItem[];
  /** v167: 项目剪贴板模式 —— copy 粘贴克隆，cut 粘贴移动。 */
  itemClipboardMode: ClipboardMode;
  reorderItems: (directoryId: string, itemIds: string[]) => void;
  selectItem: (itemId: string, append?: boolean) => void;
  selectItems: (itemIds: string[], append?: boolean) => void;
  beginMultiSelect: (itemId?: string) => void;
  finishMultiSelect: () => void;
  clearSelection: () => void;
  setItemLabelLines: (itemId: string, lines?: number) => void;
  applyDisplayToAllItems: (lines?: number) => void;
  addItems: (groupId: string, directoryId: string, items: ShortcutItem[]) => void;
  clearDirectoryItems: (directoryId: string) => void;
  sortDirectoryItems: (directoryId: string, mode: SortMode) => void;
  deleteSelectedItems: () => void;
  deleteItemsByIds: (itemIds: string[]) => number;
  updateItem: (itemId: string, patch: Partial<ShortcutItem>) => void;
  copyItemToDirectory: (itemId: string, directoryId: string) => void;
  copyItemsToDirectory: (itemIds: string[], directoryId: string) => number;
  moveItemToDirectory: (itemId: string, directoryId: string) => void;
  duplicateItem: (itemId: string) => void;
  copyItemsToClipboard: (itemIds: string[]) => number;
  /** v167: Ctrl+X 项目 —— 粘贴时移动而不是复制。 */
  cutItemsToClipboard: (itemIds: string[]) => number;
  pasteItemsToDirectory: (directoryId: string) => number;
  clearItemClipboard: () => void;
  recordItemLaunch: (itemId: string) => void;
  clearLaunchStats: () => void;
  getItemById: (itemId: string) => ShortcutItem | undefined;
}

export interface SettingsSlice {
  setTheme: (theme: string) => void;
  updateDisplay: (settings: Partial<DisplaySettings>) => void;
  updateBehavior: (settings: Partial<BehaviorSettings>) => void;
  updateBrowserRouter: (settings: Partial<BrowserRouterSettings>) => void;
  updateMultiAccount: (settings: Partial<MultiAccountSettings>) => void;
  updateWindowState: (settings: Partial<WindowState>) => void;
  updateAutoSave: (settings: Partial<AutoSaveSettings>) => void;
  updateGlobalSearch: (settings: Partial<GlobalSearchSettings>) => void;
  updateTransferStation: (settings: Partial<TransferStationSettings>) => void;
  updateImageBrowser: (settings: Partial<ImageBrowserSettings>) => void;
  updateNoteSettings: (settings: Partial<NoteSettings>) => void;
  updateRainbow: (settings: Partial<RainbowSettings>) => void;
  updateExperience: (settings: Partial<ExperienceSettings>) => void;
  updateShortcuts: (settings: Partial<ShortcutSettings>) => void;
  updateDirectoryDisplay: (directoryId: string, settings: DirectoryDisplaySettings) => void;
  clearDirectoryDisplay: (directoryId: string) => void;
  setDirectoryNote: (directoryId: string, note: string) => void;
  /** v150: 把外部拖入的文字 / 网址追加到便签，已有内容时自动隔一行。 */
  appendDirectoryNote: (directoryId: string, text: string) => void;
  setDirectoryNoteLineNumbers: (directoryId: string, show: boolean) => void;
  resetSettingsOnly: () => void;
}

export interface MediaSlice {
  transferItems: TransferItem[];
  imageBrowserItems: ImageBrowserItem[];
  globalSearch: GlobalSearchSettings;
  transferStation: TransferStationSettings;
  imageBrowser: ImageBrowserSettings;
  notes: NoteSettings;
  rainbow: RainbowSettings;
  experience: ExperienceSettings;
  shortcuts: ShortcutSettings;
  setImageBrowserItems: (items: ImageBrowserItem[]) => void;
  addImageBrowserItems: (items: ImageBrowserItem[]) => void;
  removeImageBrowserItem: (itemId: string) => void;
  clearImageBrowserItems: () => void;
  addTransferItems: (items: Omit<TransferItem, 'id' | 'createdAt'>[]) => void;
  setTransferItems: (items: TransferItem[]) => void;
  removeTransferItem: (itemId: string) => void;
  clearTransferItems: () => void;
}

export interface StartMenuSlice {
  /** 开始菜单文件夹的实时条目；不写入配置，每次刷新重新扫描。 */
  startMenuItems: ShortcutItem[];
  startMenuLoading: boolean;
  startMenuError: string | null;
  startMenuFolder: string;
  startMenuLoadedAt: number;
  refreshStartMenu: () => Promise<number>;
  addToStartMenu: (paths: string[]) => Promise<CreateShortcutsResult>;
  addUrlToStartMenu: (url: string, name: string) => Promise<string>;
  removeFromStartMenu: (itemIds: string[]) => Promise<number>;
  renameStartMenuItem: (itemId: string, name: string) => Promise<boolean>;
  getStartMenuItemById: (itemId: string) => ShortcutItem | undefined;
}

export interface MappedSlice {
  /**
   * 映射子目录的实时条目，**按子目录 id 分组**；不写入配置。
   *
   * 每个映射子目录镜像的是各自选定的文件夹，所以必须分开存。
   */
  mappedItems: Record<string, ShortcutItem[]>;
  mappedLoading: Record<string, boolean>;
  mappedError: Record<string, string | null>;
  mappedLoadedAt: Record<string, number>;
  /** 重新扫描某个映射子目录；返回条目数。 */
  refreshMappedFolder: (directoryId: string) => Promise<number>;
  addToMappedFolder: (directoryId: string, paths: string[]) => Promise<CreateShortcutsResult>;
  addUrlToMappedFolder: (directoryId: string, url: string, name: string) => Promise<string>;
  removeFromMappedFolder: (directoryId: string, itemIds: string[]) => Promise<number>;
  renameMappedItem: (directoryId: string, itemId: string, name: string) => Promise<boolean>;
  /** 某个映射子目录的条目；未加载时返回稳定的空数组（避免每次新引用导致重渲染）。 */
  getMappedItems: (directoryId: string) => ShortcutItem[];
  /** 在所有映射子目录里按虚拟 id 找条目。 */
  findMappedItemById: (itemId: string) => ShortcutItem | undefined;
  /** 该虚拟条目属于哪个映射子目录。 */
  findMappedDirectoryIdByItemId: (itemId: string) => string | undefined;
}

/**
 * v173: HTML 子目录的运行时状态。
 *
 * 页面清单不落盘（扫出来的），所以这里全是 `Record<子目录 id, ...>`，
 * 和 `MappedSlice` 一个套路 —— 多个 HTML 子目录可以各自指向不同文件夹。
 */
export interface HtmlSlice {
  htmlPages: Record<string, HtmlPage[]>;
  htmlLoading: Record<string, boolean>;
  htmlError: Record<string, string | null>;
  htmlLoadedAt: Record<string, number>;
  /** 重新扫描某个 HTML 子目录（顺带授权预览作用域）；返回页面数。 */
  refreshHtmlFolder: (directoryId: string) => Promise<number>;
  /** 某个 HTML 子目录的页面清单；未加载时返回稳定的空数组。 */
  getHtmlPages: (directoryId: string) => HtmlPage[];
  /** 子目录被删除 / 换文件夹时清掉缓存。 */
  clearHtmlFolder: (directoryId: string) => void;
}

export type NavigationActions = Omit<NavigationSlice, 'activeGroupId' | 'activeDirectoryId' | 'selectedNavTarget' | 'navigationClipboard' | 'settingsOpen'>;
export type ItemActions = Omit<ItemSlice, 'selectedItemIds' | 'multiSelectMode' | 'itemClipboard' | 'itemClipboardMode'>;
export type MediaActions = Omit<MediaSlice, 'transferItems' | 'imageBrowserItems' | 'globalSearch' | 'transferStation' | 'imageBrowser' | 'notes' | 'rainbow' | 'experience' | 'shortcuts'>;
export type StartMenuActions = Omit<StartMenuSlice, 'startMenuItems' | 'startMenuLoading' | 'startMenuError' | 'startMenuFolder' | 'startMenuLoadedAt'>;
export type MappedActions = Omit<MappedSlice, 'mappedItems' | 'mappedLoading' | 'mappedError' | 'mappedLoadedAt'>;
export type HtmlActions = Omit<HtmlSlice, 'htmlPages' | 'htmlLoading' | 'htmlError' | 'htmlLoadedAt'>;


export interface CommandUsageSlice {
  commandUsage: Record<string, CommandUsage>;
  recordCommandUsage: (commandKey: string) => void;
  clearCommandUsage: () => void;
}

export interface ConfigSlice {
  importConfig: (config: unknown) => void;
  exportConfig: () => AppConfig;
  resetAll: () => void;
}

/** v169: 链接作用域 —— 父目录链接或子目录链接。 */
export type LinkScope = { kind: 'group' | 'directory'; id: string };

/** v169: 「链接子目录 / 链接父目录」的写操作。 */
export interface LinkSlice {
  /** 在 groupId 里新建一个链接子目录，返回新子目录 id。 */
  addLinkedDirectory: (groupId: string, ref: DirectoryLinkRef) => string | null;
  /** 新建一个链接父目录，返回新父目录 id。 */
  addLinkedGroup: (ref: DirectoryLinkRef) => string | null;
  /** 换链接源（保留链接本身，内容下一次同步整替换）。 */
  setLinkedSource: (scope: LinkScope, ref: DirectoryLinkRef) => boolean;
  /** 解除链接：保留当前镜像出来的内容，变成普通父目录 / 普通子目录。 */
  detachLink: (scope: LinkScope) => boolean;
  /** 立刻同步所有链接（清缓存后重跑）。 */
  syncLinks: () => Promise<void>;
}

export type LinkActions = LinkSlice;

export type RequiredAppConfig = Omit<AppConfig, 'transferItems' | 'imageBrowserItems' | 'globalSearch' | 'transferStation' | 'imageBrowser' | 'notes' | 'rainbow' | 'experience' | 'shortcuts' | 'browserRouter' | 'multiAccount'> & Required<Pick<AppConfig, 'transferItems' | 'imageBrowserItems' | 'globalSearch' | 'transferStation' | 'imageBrowser' | 'notes' | 'rainbow' | 'experience' | 'shortcuts' | 'browserRouter' | 'multiAccount'>>;

export type AppState = RequiredAppConfig & NavigationSlice & ItemSlice & SettingsSlice & MediaSlice & CommandUsageSlice & StartMenuSlice & MappedSlice & HtmlSlice & ConfigSlice & LinkSlice & {
  editItemId?: string;
};

export type AppSliceCreator<T> = (
  set: StoreApi<AppState>['setState'],
  get: StoreApi<AppState>['getState'],
) => T;
