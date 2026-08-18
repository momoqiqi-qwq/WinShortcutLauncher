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

export interface NavigationSlice {
  activeGroupId: string;
  activeDirectoryId: string;
  selectedNavTarget: { kind: 'group' | 'directory'; id: string } | null;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  setActiveGroup: (groupId: string) => void;
  setActiveDirectory: (directoryId: string) => void;
  renameGroup: (groupId: string, name: string) => void;
  setGroupColor: (groupId: string, color?: string) => void;
  setGroupColors: (colors: Record<string, string | undefined>) => void;
  setGroupBrowserRoute: (groupId: string, route?: import('../../types').BrowserRouteOverride) => void;
  renameDirectory: (directoryId: string, name: string) => void;
  deleteGroup: (groupId: string) => void;
  deleteDirectory: (directoryId: string) => void;
  reorderGroups: (groupIds: string[]) => void;
  reorderDirectories: (groupId: string, directoryIds: string[]) => void;
  setSelectedNavTarget: (target: { kind: 'group' | 'directory'; id: string } | null) => void;
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
  reorderItems: (directoryId: string, itemIds: string[]) => void;
  selectItem: (itemId: string, append?: boolean) => void;
  selectItems: (itemIds: string[], append?: boolean) => void;
  clearSelection: () => void;
  setItemLabelLines: (itemId: string, lines?: number) => void;
  applyDisplayToAllItems: (lines?: number) => void;
  addItems: (groupId: string, directoryId: string, items: ShortcutItem[]) => void;
  clearDirectoryItems: (directoryId: string) => void;
  sortDirectoryItems: (directoryId: string, mode: SortMode) => void;
  deleteSelectedItems: () => void;
  updateItem: (itemId: string, patch: Partial<ShortcutItem>) => void;
  copyItemToDirectory: (itemId: string, directoryId: string) => void;
  moveItemToDirectory: (itemId: string, directoryId: string) => void;
  duplicateItem: (itemId: string) => void;
  recordItemLaunch: (itemId: string) => void;
  clearLaunchStats: () => void;
  getItemById: (itemId: string) => ShortcutItem | undefined;
}

export interface SettingsSlice {
  setTheme: (theme: string) => void;
  updateDisplay: (settings: Partial<DisplaySettings>) => void;
  updateBehavior: (settings: Partial<BehaviorSettings>) => void;
  updateBrowserRouter: (settings: Partial<BrowserRouterSettings>) => void;
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

export type NavigationActions = Omit<NavigationSlice, 'activeGroupId' | 'activeDirectoryId' | 'selectedNavTarget' | 'settingsOpen'>;
export type ItemActions = Omit<ItemSlice, 'selectedItemIds'>;
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

export type RequiredAppConfig = Omit<AppConfig, 'transferItems' | 'imageBrowserItems' | 'globalSearch' | 'transferStation' | 'imageBrowser' | 'notes' | 'rainbow' | 'experience' | 'shortcuts' | 'browserRouter'> & Required<Pick<AppConfig, 'transferItems' | 'imageBrowserItems' | 'globalSearch' | 'transferStation' | 'imageBrowser' | 'notes' | 'rainbow' | 'experience' | 'shortcuts' | 'browserRouter'>>;

export type AppState = RequiredAppConfig & NavigationSlice & ItemSlice & SettingsSlice & MediaSlice & CommandUsageSlice & ConfigSlice & {
  editItemId?: string;
};

export type AppSliceCreator<T> = (
  set: StoreApi<AppState>['setState'],
  get: StoreApi<AppState>['getState'],
) => T;
