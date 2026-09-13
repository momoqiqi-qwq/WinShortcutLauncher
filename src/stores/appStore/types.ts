import type { StoreApi } from 'zustand';
import type {
  AppConfig,
  AutoSaveSettings,
  BehaviorSettings,
  BrowserRouterSettings,
  Directory,
  DirectoryDisplaySettings,
  DirectoryKind,
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
  setGroupBrowserRoute: (groupId: string, route?: import('../../types').BrowserRouteOverride) => void;
  setGroupSidebarColumns: (groupId: string, columns?: number) => void;
  renameDirectory: (directoryId: string, name: string) => void;
  deleteGroup: (groupId: string) => void;
  deleteDirectory: (directoryId: string) => void;
  reorderGroups: (groupIds: string[]) => void;
  reorderDirectories: (groupId: string, directoryIds: string[]) => void;
  setSelectedNavTarget: (target: { kind: 'group' | 'directory'; id: string } | null) => void;
  copyDirectoryToClipboard: (directoryId: string) => boolean;
  copyGroupToClipboard: (groupId: string) => boolean;
  clearNavigationClipboard: () => void;
  pasteDirectoryToGroup: (groupId: string) => string | null;
  pasteGroupFromClipboard: () => string | null;
  moveDirectoryToGroup: (directoryId: string, targetGroupId: string) => boolean;
  addDirectory: (groupId: string, name: string, kind?: DirectoryKind) => string;
  addGroup: (name: string) => void;
  mergeGroup: (sourceGroupId: string, targetGroupId: string) => void;
  mergeDirectory: (sourceDirectoryId: string, targetDirectoryId: string) => void;
  setDirectoryKind: (directoryId: string, kind: DirectoryKind) => void;
  getActiveGroup: () => Group | undefined;
  getActiveDirectory: () => Directory | undefined;
}

export interface ItemSlice {
  selectedItemIds: string[];
  multiSelectMode: boolean;
  itemClipboard: ShortcutItem[];
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

export type NavigationActions = Omit<NavigationSlice, 'activeGroupId' | 'activeDirectoryId' | 'selectedNavTarget' | 'navigationClipboard' | 'settingsOpen'>;
export type ItemActions = Omit<ItemSlice, 'selectedItemIds' | 'multiSelectMode' | 'itemClipboard'>;
export type MediaActions = Omit<MediaSlice, 'transferItems' | 'imageBrowserItems' | 'globalSearch' | 'transferStation' | 'imageBrowser' | 'notes' | 'rainbow' | 'experience' | 'shortcuts'>;


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

export type RequiredAppConfig = Omit<AppConfig, 'transferItems' | 'imageBrowserItems' | 'globalSearch' | 'transferStation' | 'imageBrowser' | 'notes' | 'rainbow' | 'experience' | 'shortcuts' | 'browserRouter' | 'multiAccount'> & Required<Pick<AppConfig, 'transferItems' | 'imageBrowserItems' | 'globalSearch' | 'transferStation' | 'imageBrowser' | 'notes' | 'rainbow' | 'experience' | 'shortcuts' | 'browserRouter' | 'multiAccount'>>;

export type AppState = RequiredAppConfig & NavigationSlice & ItemSlice & SettingsSlice & MediaSlice & CommandUsageSlice & ConfigSlice & {
  editItemId?: string;
};

export type AppSliceCreator<T> = (
  set: StoreApi<AppState>['setState'],
  get: StoreApi<AppState>['getState'],
) => T;
