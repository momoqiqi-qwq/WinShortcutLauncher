import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { systemToolsGroup } from '../data/systemTools';
import type {
  AppConfig,
  AutoSaveSettings,
  BehaviorSettings,
  Directory,
  DirectoryDisplaySettings,
  DirectoryKind,
  DisplaySettings,
  Group,
  NoteSettings,
  ShortcutItem,
  TransferItem,
  SortMode,
  WindowControlId,
  WindowState
} from '../types';
import { makeId } from '../lib/id';
import { DEFAULT_GLOBAL_SEARCH_SETTINGS, DEFAULT_TRANSFER_STATION_SETTINGS, DEFAULT_IMAGE_BROWSER_SETTINGS, type GlobalSearchSettings, type TransferStationSettings, type ImageBrowserSettings, type ImageBrowserItem, type ImageBrowserGroup } from '../utils/v16Types';
import { byOrder, reindex, sortShortcutItemsForStorage } from '../lib/sort';

const DEFAULT_WINDOW_CONTROL_ORDER: WindowControlId[] = ['search', 'transfer', 'image', 'add', 'multi', 'settings', 'pin', 'minimize', 'close'];

const DEFAULT_RAINBOW_COLORS = ['#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#00C7FF', '#5856D6', '#FF2D55'];

function normalizeRainbowColors(value: unknown, fallback = DEFAULT_RAINBOW_COLORS): string[] {
  const input = Array.isArray(value) ? value : fallback;
  const seen = new Set<string>();
  const colors: string[] = [];
  for (const item of input) {
    const hex = String(item ?? '').trim().toUpperCase();
    if (!/^#[0-9A-F]{6}$/.test(hex) || seen.has(hex)) continue;
    seen.add(hex);
    colors.push(hex);
    if (colors.length >= 24) break;
  }
  return colors.length ? colors : [...fallback];
}

const defaultDisplay: DisplaySettings = {
  labelLines: 2,
  charsPerLine: 8,
  fontSize: 12,
  iconSize: 52,
  itemIconResolveMode: 'auto',
  iconParallelTasks: 6,
  autoSaveWebsiteIcon: true,
  itemWidth: 108,
  itemHeight: 116,
  gridGap: 14,
  viewMode: 'grid',
  sortMode: 'custom',
  menuFontSize: 14,
  menuItemHeight: 34,
  menuMinWidth: 210,
  topTabEqualWidth: false,
  topTabWidth: 104,
  topTabShape: 'round',
  sidebarWidth: 176,
  sidebarItemHeight: 38,
  sidebarItemGap: 8,
  sidebarFontSize: 14,
  sidebarItemRadius: 12,
  uiScale: 1,
  mainUiScale: 1,
  settingsUiScale: 1,
  scrollbarSize: 12,
  scrollbarRadius: 999,
  scrollbarUseThemeColor: true,
  scrollbarThumbColor: '#8A8F98',
  scrollbarThumbHoverColor: '#5B8DEF',
  scrollbarTrackColor: 'rgba(0, 0, 0, 0.08)',
  rememberInterfaceCollapseState: false,
  interfaceCollapsedSections: [],
  windowControlStyle: 'round',
  windowControlSize: 34,
  windowControlGap: 8,
  windowControlOrder: DEFAULT_WINDOW_CONTROL_ORDER,
  backgroundEnabled: false,
  backgroundImage: '',
  backgroundOpacity: 0.42,
  backgroundDim: 0.18,
  backgroundBlur: 0,
  backgroundFit: 'cover',
  backgroundPosition: 'center',
  backgroundPanelOpacity: 0.86
};

const defaultBehavior: BehaviorSettings = {
  edgeAutoHide: true,
  edgeHideDelaySeconds: 0,
  edgeAnimationMs: 90,
  edgeAnimationStyle: 'animate-window',
  autoEdgeHide: true,
  autoEdgeBounce: true,
  autoEdgeHideDelay: 1000,
  edgeVisiblePixels: 5,
  edgeGhostFrameFix: true,
  edgeMouseLeaveHideMs: 90,
  edgeUseMainWindowStrip: true,
  edgeStripSize: 10,
  edgeStripOpacity: 0.88,
  edgeStripUseThemeColor: true,
  edgeStripColor: '#C36A2D',
  launchMode: 'double',
  autoStart: false,
  closeAction: 'tray',
  alwaysOnTop: false,
  itemDragLongPressMs: 220,
  itemDragTolerance: 10,
  itemDragBackgroundColor: '#5b8def',
  itemDragGlowColor: '#5b8def',
  itemDragGlowBrightness: 0.72,
  rainbowEnabled: false,
  rainbowMouseTrailEnabled: true,
  rainbowCursorStyle: 'dot',
  rainbowMouseTrailLifeMs: 720,
  rainbowMouseTrailCount: 18,
  rainbowMouseTrailSize: 16,
  rainbowMouseTrailBrightness: 0.72,
  rainbowMouseColors: [...DEFAULT_RAINBOW_COLORS],
  rainbowBorderEnabled: true,
  rainbowBorderSpeedSeconds: 18,
  rainbowBorderMode: 'rotate',
  rainbowBorderGlow: 0.58,
  rainbowBorderWidth: 2,
  rainbowBorderColors: [...DEFAULT_RAINBOW_COLORS],
  rainbowTextEnabled: false,
  rainbowTextSpeedSeconds: 22,
  rainbowTextColors: [...DEFAULT_RAINBOW_COLORS],
  rainbowTextParentEnabled: true,
  rainbowTextChildEnabled: true,
  rainbowTextSettingsEnabled: true
};

const defaultWindowState: WindowState = {
  opacity: 0.96,
  edgeAutoHide: true
};

const defaultAutoSave: AutoSaveSettings = {
  enabled: false,
  directory: '',
  intervalMinutes: 10,
  fileName: 'win-launcher-config-autosave.json'
};

const defaultNotes: NoteSettings = {
  fontSize: 15,
  lineHeight: 1.7,
  padding: 16,
  radius: 16,
  autosaveDelayMs: 450,
  wrap: true,
  showTitle: true,
  separatorLength: 14,
  dashSeparatorChar: '—',
  starSeparatorChar: '*',
};

const userGroup: Group = {
  id: 'group_default',
  name: '我的快捷方式',
  order: 1,
  directories: [
    {
      id: 'dir_default',
      name: '常用',
      order: 0,
      kind: 'normal',
      items: []
    }
  ]
};

function cloneConfig(): AppConfig {
  return {
    groups: [systemToolsGroup, userGroup],
    theme: 'light-cloud',
    display: { ...defaultDisplay },
    behavior: { ...defaultBehavior },
    windowState: { ...defaultWindowState },
    autoSave: { ...defaultAutoSave },
    transferItems: [],
    imageBrowserItems: [],
    globalSearch: { ...DEFAULT_GLOBAL_SEARCH_SETTINGS },
    transferStation: { ...DEFAULT_TRANSFER_STATION_SETTINGS },
    imageBrowser: { ...DEFAULT_IMAGE_BROWSER_SETTINGS },
    notes: { ...defaultNotes }
  };
}


function normalizeWindowControlOrder(order?: unknown): WindowControlId[] {
  const allowed = new Set<WindowControlId>(DEFAULT_WINDOW_CONTROL_ORDER);
  const input = Array.isArray(order) ? order : [];
  const next: WindowControlId[] = [];
  for (const raw of input) {
    if (allowed.has(raw as WindowControlId) && !next.includes(raw as WindowControlId)) next.push(raw as WindowControlId);
  }
  for (const id of DEFAULT_WINDOW_CONTROL_ORDER) {
    if (!next.includes(id)) next.push(id);
  }
  return next;
}

function normalizeBehavior(settings?: Partial<BehaviorSettings>): BehaviorSettings {
  const merged = { ...defaultBehavior, ...(settings ?? {}) };
  const finiteOr = (value: unknown, fallback: number) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  return {
    ...merged,
    edgeHideDelaySeconds: Math.max(0, Math.min(10, finiteOr(merged.edgeHideDelaySeconds, 0))),
    edgeAnimationMs: Math.max(0, Math.min(1000, Math.round(finiteOr(merged.edgeAnimationMs, defaultBehavior.edgeAnimationMs)))),
    autoEdgeHideDelay: Math.max(0, Math.min(10000, Math.round(finiteOr(merged.autoEdgeHideDelay, defaultBehavior.autoEdgeHideDelay)))),
    edgeVisiblePixels: Math.max(1, Math.min(64, Math.round(finiteOr(merged.edgeVisiblePixels, defaultBehavior.edgeVisiblePixels)))),
    edgeMouseLeaveHideMs: Math.max(0, Math.min(1000, Math.round(finiteOr(merged.edgeMouseLeaveHideMs, defaultBehavior.edgeMouseLeaveHideMs)))),
    edgeStripSize: Math.max(2, Math.min(64, Math.round(finiteOr(merged.edgeStripSize, defaultBehavior.edgeStripSize)))),
    edgeStripOpacity: Math.max(0.05, Math.min(1, finiteOr(merged.edgeStripOpacity, defaultBehavior.edgeStripOpacity))),
    itemDragLongPressMs: Math.max(80, Math.min(1200, Math.round(finiteOr(merged.itemDragLongPressMs, defaultBehavior.itemDragLongPressMs)))),
    itemDragTolerance: Math.max(2, Math.min(28, Math.round(finiteOr(merged.itemDragTolerance, defaultBehavior.itemDragTolerance)))),
    itemDragBackgroundColor: /^#[0-9a-f]{6}$/i.test(String(merged.itemDragBackgroundColor)) ? String(merged.itemDragBackgroundColor) : defaultBehavior.itemDragBackgroundColor,
    itemDragGlowColor: /^#[0-9a-f]{6}$/i.test(String(merged.itemDragGlowColor)) ? String(merged.itemDragGlowColor) : defaultBehavior.itemDragGlowColor,
    itemDragGlowBrightness: Math.max(0, Math.min(1, finiteOr(merged.itemDragGlowBrightness, defaultBehavior.itemDragGlowBrightness))),
    rainbowEnabled: Boolean(merged.rainbowEnabled),
    rainbowMouseTrailEnabled: merged.rainbowMouseTrailEnabled !== false,
    rainbowCursorStyle: (['dot', 'windows-border', 'windows-full', 'windows-inner', 'macos-wheel'] as const).includes(merged.rainbowCursorStyle as any) ? merged.rainbowCursorStyle : defaultBehavior.rainbowCursorStyle,
    rainbowMouseTrailLifeMs: Math.max(180, Math.min(2400, Math.round(finiteOr(merged.rainbowMouseTrailLifeMs, defaultBehavior.rainbowMouseTrailLifeMs)))),
    rainbowMouseTrailCount: Math.max(4, Math.min(48, Math.round(finiteOr(merged.rainbowMouseTrailCount, defaultBehavior.rainbowMouseTrailCount)))),
    rainbowMouseTrailSize: Math.max(4, Math.min(42, Math.round(finiteOr(merged.rainbowMouseTrailSize, defaultBehavior.rainbowMouseTrailSize)))),
    rainbowMouseTrailBrightness: Math.max(0.1, Math.min(1, finiteOr(merged.rainbowMouseTrailBrightness, defaultBehavior.rainbowMouseTrailBrightness))),
    rainbowMouseColors: normalizeRainbowColors(merged.rainbowMouseColors, defaultBehavior.rainbowMouseColors),
    rainbowBorderEnabled: merged.rainbowBorderEnabled !== false,
    rainbowBorderSpeedSeconds: Math.max(3, Math.min(120, finiteOr(merged.rainbowBorderSpeedSeconds, defaultBehavior.rainbowBorderSpeedSeconds))),
    rainbowBorderMode: (['rotate', 'fixed'] as const).includes(merged.rainbowBorderMode as any) ? merged.rainbowBorderMode : defaultBehavior.rainbowBorderMode,
    rainbowBorderGlow: Math.max(0, Math.min(1, finiteOr(merged.rainbowBorderGlow, defaultBehavior.rainbowBorderGlow))),
    rainbowBorderWidth: Math.max(1, Math.min(8, Math.round(finiteOr(merged.rainbowBorderWidth, defaultBehavior.rainbowBorderWidth)))),
    rainbowBorderColors: normalizeRainbowColors(merged.rainbowBorderColors, defaultBehavior.rainbowBorderColors),
    rainbowTextEnabled: Boolean(merged.rainbowTextEnabled),
    rainbowTextSpeedSeconds: Math.max(8, Math.min(120, finiteOr(merged.rainbowTextSpeedSeconds, defaultBehavior.rainbowTextSpeedSeconds))),
    rainbowTextColors: normalizeRainbowColors(merged.rainbowTextColors, defaultBehavior.rainbowTextColors),
    rainbowTextParentEnabled: merged.rainbowTextParentEnabled !== false,
    rainbowTextChildEnabled: merged.rainbowTextChildEnabled !== false,
    rainbowTextSettingsEnabled: merged.rainbowTextSettingsEnabled !== false,
  };
}

function normalizeNoteSettings(settings?: Partial<NoteSettings>): NoteSettings {
  const merged = { ...defaultNotes, ...(settings ?? {}) };
  const cleanChar = (value: unknown, fallback: string) => {
    const str = String(value ?? '').trim();
    return str ? Array.from(str)[0] : fallback;
  };
  return {
    fontSize: Math.max(10, Math.min(32, Math.round(Number(merged.fontSize) || defaultNotes.fontSize))),
    lineHeight: Math.max(1, Math.min(3, Number(merged.lineHeight) || defaultNotes.lineHeight)),
    padding: Math.max(6, Math.min(48, Math.round(Number(merged.padding) || defaultNotes.padding))),
    radius: Math.max(0, Math.min(40, Math.round(Number(merged.radius) || defaultNotes.radius))),
    autosaveDelayMs: Math.max(120, Math.min(3000, Math.round(Number(merged.autosaveDelayMs) || defaultNotes.autosaveDelayMs))),
    wrap: merged.wrap !== false,
    showTitle: merged.showTitle !== false,
    separatorLength: Math.max(4, Math.min(80, Math.round(Number(merged.separatorLength) || defaultNotes.separatorLength))),
    dashSeparatorChar: cleanChar(merged.dashSeparatorChar, defaultNotes.dashSeparatorChar),
    starSeparatorChar: cleanChar(merged.starSeparatorChar, defaultNotes.starSeparatorChar),
  };
}

function normalizeImageBrowserSettings(settings?: Partial<ImageBrowserSettings>): ImageBrowserSettings {
  const merged = { ...DEFAULT_IMAGE_BROWSER_SETTINGS, ...(settings ?? {}) } as ImageBrowserSettings;
  const rawGroups = Array.isArray((merged as any).groups) && (merged as any).groups.length
    ? (merged as any).groups
    : DEFAULT_IMAGE_BROWSER_SETTINGS.groups;
  const groups: ImageBrowserGroup[] = rawGroups
    .map((group: any, index: number) => ({
      id: String(group?.id || (index === 0 ? 'default' : makeId('imggrp'))),
      name: String(group?.name || (index === 0 ? '默认' : `分组 ${index + 1}`)),
      order: Number.isFinite(Number(group?.order)) ? Number(group.order) : index,
    }))
    .sort(byOrder)
    .map((group: any, index: number) => ({ ...group, order: index }));
  const activeGroupId = groups.some((group) => group.id === merged.activeGroupId) ? merged.activeGroupId : groups[0].id;
  return {
    ...merged,
    panelWidth: Math.max(180, Math.min(10000, Math.round(Number(merged.panelWidth) || DEFAULT_IMAGE_BROWSER_SETTINGS.panelWidth))),
    thumbnailPaneWidth: Math.max(48, Math.min(10000, Math.round(Number(merged.thumbnailPaneWidth) || DEFAULT_IMAGE_BROWSER_SETTINGS.thumbnailPaneWidth))),
    thumbnailWidth: Math.max(32, Math.min(10000, Math.round(Number(merged.thumbnailWidth) || DEFAULT_IMAGE_BROWSER_SETTINGS.thumbnailWidth))),
    previewPadding: Math.max(0, Math.min(240, Math.round(Number(merged.previewPadding) || 0))),
    previewRadius: Math.max(0, Math.min(240, Math.round(Number(merged.previewRadius) || 0))),
    panelOpacity: Math.max(0.2, Math.min(1, Number(merged.panelOpacity) || DEFAULT_IMAGE_BROWSER_SETTINGS.panelOpacity)),
    previewFit: (['contain', 'cover', 'actual'] as const).includes(merged.previewFit as any) ? merged.previewFit : DEFAULT_IMAGE_BROWSER_SETTINGS.previewFit,
    dragExportAction: (['copy', 'move'] as const).includes(merged.dragExportAction as any) ? merged.dragExportAction : DEFAULT_IMAGE_BROWSER_SETTINGS.dragExportAction,
    imageNamePosition: (['inside', 'top', 'bottom', 'hidden'] as const).includes(merged.imageNamePosition as any) ? merged.imageNamePosition : DEFAULT_IMAGE_BROWSER_SETTINGS.imageNamePosition,
    groups,
    activeGroupId,
    showAddButton: merged.showAddButton !== false,
    showCopyAllButton: merged.showCopyAllButton !== false,
    showClearButton: merged.showClearButton !== false,
    showActiveActions: merged.showActiveActions !== false,
  };
}

function normalizeDirectory(dir: Directory): Directory {
  return {
    ...dir,
    kind: dir.kind ?? 'normal',
    display: dir.display && Object.keys(dir.display).length ? dir.display : undefined,
    note: dir.note ?? '',
    items: reindex((dir.items ?? []).slice().sort(byOrder))
  };
}

function normalizeGroups(groups: Group[]): Group[] {
  return reindex(groups.slice().sort(byOrder).map((group) => ({
    ...group,
    directories: reindex((group.directories?.length ? group.directories : ([{ id: makeId('dir'), name: '常用', order: 0, kind: 'normal', items: [] }] as Directory[]))
      .slice()
      .sort(byOrder)
      .map(normalizeDirectory))
  })));
}

function getFirstDirectory(groups: Group[]): { groupId: string; directoryId: string } {
  const sortedGroups = normalizeGroups(groups);
  const group = sortedGroups[0];
  const dir = group.directories[0];
  return { groupId: group.id, directoryId: dir.id };
}

function cleanDisplayPatch(patch: DirectoryDisplaySettings): DirectoryDisplaySettings | undefined {
  const next = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) as DirectoryDisplaySettings;
  return Object.keys(next).length ? next : undefined;
}

function normalizeDisplay(display?: Partial<DisplaySettings>): DisplaySettings {
  const legacyScale = display?.uiScale;
  const mainUiScale = display?.mainUiScale ?? legacyScale ?? defaultDisplay.mainUiScale;
  const settingsUiScale = display?.settingsUiScale ?? legacyScale ?? defaultDisplay.settingsUiScale;
  return {
    ...defaultDisplay,
    ...(display ?? {}),
    uiScale: legacyScale ?? mainUiScale,
    mainUiScale,
    settingsUiScale,
    itemIconResolveMode: (['auto', 'read_icon_as_data_url', 'get_file_icon'] as const).includes((display?.itemIconResolveMode ?? defaultDisplay.itemIconResolveMode) as any) ? (display?.itemIconResolveMode ?? defaultDisplay.itemIconResolveMode) : defaultDisplay.itemIconResolveMode,
    iconParallelTasks: Math.max(1, Math.min(8, Math.round(Number(display?.iconParallelTasks ?? defaultDisplay.iconParallelTasks) || defaultDisplay.iconParallelTasks))),
    autoSaveWebsiteIcon: display?.autoSaveWebsiteIcon !== false,
    windowControlStyle: (['round', 'square', 'bar', 'pad'] as const).includes((display?.windowControlStyle ?? defaultDisplay.windowControlStyle) as any) ? (display?.windowControlStyle ?? defaultDisplay.windowControlStyle) : defaultDisplay.windowControlStyle,
    windowControlOrder: normalizeWindowControlOrder(display?.windowControlOrder),
    backgroundFit: (['cover', 'contain', 'stretch', 'tile'] as const).includes((display?.backgroundFit ?? defaultDisplay.backgroundFit) as any) ? (display?.backgroundFit ?? defaultDisplay.backgroundFit) : defaultDisplay.backgroundFit,
    backgroundPosition: (['center', 'top', 'bottom', 'left', 'right'] as const).includes((display?.backgroundPosition ?? defaultDisplay.backgroundPosition) as any) ? (display?.backgroundPosition ?? defaultDisplay.backgroundPosition) : defaultDisplay.backgroundPosition
  };
}

interface AppState extends AppConfig {
  activeGroupId: string;
  activeDirectoryId: string;
  selectedItemIds: string[];
  selectedNavTarget: { kind: 'group' | 'directory'; id: string } | null;
  settingsOpen: boolean;
  editItemId?: string;
  transferItems: TransferItem[];
  globalSearch: GlobalSearchSettings;
  transferStation: TransferStationSettings;
  imageBrowserItems: ImageBrowserItem[];
  imageBrowser: ImageBrowserSettings;
  notes: NoteSettings;

  setTheme: (theme: string) => void;
  setSettingsOpen: (open: boolean) => void;
  setActiveGroup: (groupId: string) => void;
  setActiveDirectory: (directoryId: string) => void;
  renameGroup: (groupId: string, name: string) => void;
  renameDirectory: (directoryId: string, name: string) => void;
  deleteGroup: (groupId: string) => void;
  deleteDirectory: (directoryId: string) => void;
  reorderGroups: (groupIds: string[]) => void;
  reorderDirectories: (groupId: string, directoryIds: string[]) => void;
  reorderItems: (directoryId: string, itemIds: string[]) => void;
  selectItem: (itemId: string, append?: boolean) => void;
  selectItems: (itemIds: string[], append?: boolean) => void;
  clearSelection: () => void;
  setSelectedNavTarget: (target: { kind: 'group' | 'directory'; id: string } | null) => void;
  updateDisplay: (settings: Partial<DisplaySettings>) => void;
  updateBehavior: (settings: Partial<BehaviorSettings>) => void;
  updateWindowState: (settings: Partial<WindowState>) => void;
  updateAutoSave: (settings: Partial<AutoSaveSettings>) => void;
  updateGlobalSearch: (settings: Partial<GlobalSearchSettings>) => void;
  updateTransferStation: (settings: Partial<TransferStationSettings>) => void;
  updateImageBrowser: (settings: Partial<ImageBrowserSettings>) => void;
  updateNoteSettings: (settings: Partial<NoteSettings>) => void;
  setImageBrowserItems: (items: ImageBrowserItem[]) => void;
  addImageBrowserItems: (items: ImageBrowserItem[]) => void;
  removeImageBrowserItem: (itemId: string) => void;
  clearImageBrowserItems: () => void;
  updateDirectoryDisplay: (directoryId: string, settings: DirectoryDisplaySettings) => void;
  clearDirectoryDisplay: (directoryId: string) => void;
  setDirectoryNote: (directoryId: string, note: string) => void;
  setItemLabelLines: (itemId: string, lines?: number) => void;
  applyDisplayToAllItems: (lines?: number) => void;
  addDirectory: (groupId: string, name: string, kind?: DirectoryKind) => void;
  addGroup: (name: string) => void;
  mergeGroup: (sourceGroupId: string, targetGroupId: string) => void;
  mergeDirectory: (sourceDirectoryId: string, targetDirectoryId: string) => void;
  setDirectoryKind: (directoryId: string, kind: DirectoryKind) => void;
  addTransferItems: (items: Omit<TransferItem, 'id' | 'createdAt'>[]) => void;
  setTransferItems: (items: TransferItem[]) => void;
  removeTransferItem: (itemId: string) => void;
  clearTransferItems: () => void;
  addItems: (groupId: string, directoryId: string, items: ShortcutItem[]) => void;
  clearDirectoryItems: (directoryId: string) => void;
  sortDirectoryItems: (directoryId: string, mode: SortMode) => void;
  deleteSelectedItems: () => void;
  updateItem: (itemId: string, patch: Partial<ShortcutItem>) => void;
  copyItemToDirectory: (itemId: string, directoryId: string) => void;
  moveItemToDirectory: (itemId: string, directoryId: string) => void;
  importConfig: (config: AppConfig) => void;
  exportConfig: () => AppConfig;
  resetAll: () => void;
  getActiveGroup: () => Group | undefined;
  getActiveDirectory: () => Directory | undefined;
  getItemById: (itemId: string) => ShortcutItem | undefined;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => {
      const defaults = cloneConfig();
      const first = getFirstDirectory(defaults.groups);
      return {
        ...defaults,
        activeGroupId: first.groupId,
        activeDirectoryId: first.directoryId,
        selectedItemIds: [],
        selectedNavTarget: null,
        settingsOpen: false,
        transferItems: defaults.transferItems ?? [],
        imageBrowserItems: defaults.imageBrowserItems ?? [],
        globalSearch: defaults.globalSearch!,
        transferStation: defaults.transferStation!,
        imageBrowser: defaults.imageBrowser!,
        notes: defaults.notes!,

        setTheme: (theme) => set({ theme }),
        setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
        setActiveGroup: (groupId) => set((state) => {
          const group = state.groups.find((item) => item.id === groupId);
          return {
            activeGroupId: groupId,
            activeDirectoryId: group?.directories.slice().sort(byOrder)[0]?.id ?? state.activeDirectoryId,
            selectedItemIds: [],
            selectedNavTarget: { kind: 'group', id: groupId }
          };
        }),
        setActiveDirectory: (directoryId) => set({ activeDirectoryId: directoryId, selectedItemIds: [], selectedNavTarget: { kind: 'directory', id: directoryId } }),
        renameGroup: (groupId, name) => set((state) => ({
          groups: state.groups.map((group) => group.id === groupId ? { ...group, name } : group)
        })),
        renameDirectory: (directoryId, name) => set((state) => ({
          groups: state.groups.map((group) => ({
            ...group,
            directories: group.directories.map((dir) => dir.id === directoryId ? { ...dir, name } : dir)
          }))
        })),
        deleteGroup: (groupId) => set((state) => {
          if (state.groups.length <= 1) return state;
          const nextGroups = normalizeGroups(state.groups.filter((group) => group.id !== groupId));
          const firstNext = getFirstDirectory(nextGroups);
          return {
            groups: nextGroups,
            activeGroupId: state.activeGroupId === groupId ? firstNext.groupId : state.activeGroupId,
            activeDirectoryId: state.activeGroupId === groupId ? firstNext.directoryId : state.activeDirectoryId,
            selectedItemIds: [],
            selectedNavTarget: null
          };
        }),
        deleteDirectory: (directoryId) => set((state) => {
          let nextActiveGroupId = state.activeGroupId;
          let nextActiveDirectoryId = state.activeDirectoryId;
          const groups = state.groups.map((group) => {
            if (!group.directories.some((dir) => dir.id === directoryId)) return group;
            if (group.directories.length <= 1) return group;
            const directories = normalizeGroups([{ ...group, directories: group.directories.filter((dir) => dir.id !== directoryId) }])[0].directories;
            if (state.activeDirectoryId === directoryId) {
              nextActiveGroupId = group.id;
              nextActiveDirectoryId = directories[0].id;
            }
            return { ...group, directories };
          });
          return { groups, activeGroupId: nextActiveGroupId, activeDirectoryId: nextActiveDirectoryId, selectedItemIds: [], selectedNavTarget: null };
        }),
        reorderGroups: (groupIds) => set((state) => ({
          groups: groupIds.map((id, index) => ({ ...state.groups.find((group) => group.id === id)!, order: index })).filter(Boolean)
        })),
        reorderDirectories: (groupId, directoryIds) => set((state) => ({
          groups: state.groups.map((group) => group.id === groupId
            ? {
                ...group,
                directories: directoryIds.map((id, index) => ({ ...group.directories.find((dir) => dir.id === id)!, order: index })).filter(Boolean)
              }
            : group)
        })),
        reorderItems: (directoryId, itemIds) => set((state) => ({
          groups: state.groups.map((group) => ({
            ...group,
            directories: group.directories.map((dir) => dir.id === directoryId && (dir.kind ?? 'normal') === 'normal'
              ? { ...dir, items: itemIds.map((id, index) => ({ ...dir.items.find((item) => item.id === id)!, order: index })).filter(Boolean) }
              : dir)
          }))
        })),
        selectItem: (itemId, append = false) => set((state) => {
          if (!append) return { selectedItemIds: [itemId], selectedNavTarget: null };
          const exists = state.selectedItemIds.includes(itemId);
          return { selectedItemIds: exists ? state.selectedItemIds.filter((id) => id !== itemId) : [...state.selectedItemIds, itemId], selectedNavTarget: null };
        }),
        selectItems: (itemIds, append = false) => set((state) => {
          const cleanIds = Array.from(new Set(itemIds.filter(Boolean)));
          if (!append) return { selectedItemIds: cleanIds, selectedNavTarget: null };
          return { selectedItemIds: Array.from(new Set([...state.selectedItemIds, ...cleanIds])), selectedNavTarget: null };
        }),
        clearSelection: () => set({ selectedItemIds: [] }),
        setSelectedNavTarget: (selectedNavTarget) => set({ selectedNavTarget, selectedItemIds: [] }),
        updateDisplay: (settings) => set((state) => ({
          display: { ...state.display, ...settings }
        })),
        updateBehavior: (settings) => set((state) => ({
          behavior: { ...state.behavior, ...settings },
          windowState: settings.edgeAutoHide === undefined ? state.windowState : { ...state.windowState, edgeAutoHide: settings.edgeAutoHide }
        })),
        updateWindowState: (settings) => set((state) => ({
          windowState: { ...state.windowState, ...settings }
        })),
        updateAutoSave: (settings) => set((state) => ({
          autoSave: { ...state.autoSave, ...settings }
        })),
        updateGlobalSearch: (settings) => set((state) => ({
          globalSearch: { ...DEFAULT_GLOBAL_SEARCH_SETTINGS, ...(state.globalSearch ?? {}), ...settings }
        })),
        updateTransferStation: (settings) => set((state) => ({
          transferStation: { ...DEFAULT_TRANSFER_STATION_SETTINGS, ...(state.transferStation ?? {}), ...settings }
        })),
        updateImageBrowser: (settings) => set((state) => ({
          imageBrowser: normalizeImageBrowserSettings({ ...(state.imageBrowser ?? {}), ...settings })
        })),
        updateNoteSettings: (settings) => set((state) => ({
          notes: normalizeNoteSettings({ ...(state.notes ?? {}), ...settings })
        })),
        setImageBrowserItems: (items) => set({ imageBrowserItems: items }),
        addImageBrowserItems: (items) => set((state) => {
          const exists = new Set((state.imageBrowserItems ?? []).map((item) => item.path.toLowerCase()));
          const next = [...(state.imageBrowserItems ?? [])];
          for (const item of items) {
            if (!item.path || exists.has(item.path.toLowerCase())) continue;
            next.push(item);
            exists.add(item.path.toLowerCase());
          }
          return { imageBrowserItems: next };
        }),
        removeImageBrowserItem: (itemId) => set((state) => ({
          imageBrowserItems: (state.imageBrowserItems ?? []).filter((item) => item.id !== itemId)
        })),
        clearImageBrowserItems: () => set({ imageBrowserItems: [] }),
        updateDirectoryDisplay: (directoryId, settings) => set((state) => ({
          groups: state.groups.map((group) => ({
            ...group,
            directories: group.directories.map((dir) => {
              if (dir.id !== directoryId) return dir;
              return { ...dir, display: cleanDisplayPatch({ ...(dir.display ?? {}), ...settings }) };
            })
          }))
        })),
        clearDirectoryDisplay: (directoryId) => set((state) => ({
          groups: state.groups.map((group) => ({
            ...group,
            directories: group.directories.map((dir) => dir.id === directoryId ? { ...dir, display: undefined } : dir)
          }))
        })),
        setDirectoryNote: (directoryId, note) => set((state) => ({
          groups: state.groups.map((group) => ({
            ...group,
            directories: group.directories.map((dir) => dir.id === directoryId ? { ...dir, note } : dir)
          }))
        })),
        setItemLabelLines: (itemId, lines) => set((state) => ({
          groups: state.groups.map((group) => ({
            ...group,
            directories: group.directories.map((dir) => ({
              ...dir,
              items: dir.items.map((item) => item.id === itemId ? { ...item, labelLines: lines } : item)
            }))
          }))
        })),
        applyDisplayToAllItems: (lines) => set((state) => {
          const nextLines = lines ?? state.display.labelLines;
          return {
            groups: state.groups.map((group) => ({
              ...group,
              directories: group.directories.map((dir) => ({
                ...dir,
                items: dir.items.map((item) => ({ ...item, labelLines: nextLines }))
              }))
            }))
          };
        }),
        addDirectory: (groupId, name, kind = 'normal') => set((state) => ({
          groups: state.groups.map((group) => group.id === groupId
            ? { ...group, directories: [...group.directories, { id: makeId('dir'), name, order: group.directories.length, kind, items: [], note: kind === 'notes' ? '' : undefined }] }
            : group)
        })),
        addGroup: (name) => set((state) => ({
          groups: [...state.groups, { id: makeId('group'), name, order: state.groups.length, directories: [{ id: makeId('dir'), name: '常用', order: 0, kind: 'normal', items: [] }] }]
        })),
        mergeGroup: (sourceGroupId, targetGroupId) => set((state) => {
          if (sourceGroupId === targetGroupId || state.groups.length <= 1) return state;
          const source = state.groups.find((group) => group.id === sourceGroupId);
          const target = state.groups.find((group) => group.id === targetGroupId);
          if (!source || !target) return state;
          const movedDirectories = source.directories.map((dir, index) => ({
            ...dir,
            id: makeId('dir'),
            order: target.directories.length + index
          }));
          const groups = normalizeGroups(state.groups
            .filter((group) => group.id !== sourceGroupId)
            .map((group) => group.id === targetGroupId ? { ...group, directories: [...group.directories, ...movedDirectories] } : group));
          const nextTarget = groups.find((group) => group.id === targetGroupId);
          const fallbackDir = nextTarget?.directories[0]?.id ?? getFirstDirectory(groups).directoryId;
          return {
            groups,
            activeGroupId: state.activeGroupId === sourceGroupId ? targetGroupId : state.activeGroupId,
            activeDirectoryId: source.directories.some((dir) => dir.id === state.activeDirectoryId) ? fallbackDir : state.activeDirectoryId,
            selectedItemIds: []
          };
        }),
        mergeDirectory: (sourceDirectoryId, targetDirectoryId) => set((state) => {
          if (sourceDirectoryId === targetDirectoryId) return state;
          let sourceDirectory: Directory | undefined;
          let targetGroupId = '';
          let targetDirectory: Directory | undefined;
          for (const group of state.groups) {
            const maybeSource = group.directories.find((dir) => dir.id === sourceDirectoryId);
            const maybeTarget = group.directories.find((dir) => dir.id === targetDirectoryId);
            if (maybeSource) sourceDirectory = maybeSource;
            if (maybeTarget) { targetDirectory = maybeTarget; targetGroupId = group.id; }
          }
          if (!sourceDirectory || !targetDirectory || (sourceDirectory.kind ?? 'normal') === 'all' || (targetDirectory.kind ?? 'normal') === 'all') return state;
          const sourceKind = sourceDirectory.kind ?? 'normal';
          const targetKind = targetDirectory.kind ?? 'normal';
          if (sourceKind !== targetKind) return state;
          return {
            groups: state.groups.map((group) => {
              if (!group.directories.some((dir) => dir.id === sourceDirectoryId || dir.id === targetDirectoryId)) return group;
              const directories = group.directories.map((dir) => {
                if (dir.id !== targetDirectoryId) return dir;
                if (targetKind === 'notes') {
                  const mergedNote = [dir.note ?? '', sourceDirectory?.note ?? ''].filter((part) => part.trim()).join('\n\n--- 合并内容 ---\n\n');
                  return { ...dir, note: mergedNote };
                }
                return { ...dir, items: reindex([...(dir.items ?? []), ...(sourceDirectory?.items ?? []).map((item) => ({ ...item, id: makeId('item') }))]) };
              }).filter((dir) => dir.id !== sourceDirectoryId);
              return { ...group, directories: reindex(directories) };
            }),
            activeGroupId: state.activeDirectoryId === sourceDirectoryId ? targetGroupId : state.activeGroupId,
            activeDirectoryId: state.activeDirectoryId === sourceDirectoryId ? targetDirectoryId : state.activeDirectoryId,
            selectedItemIds: [],
            selectedNavTarget: null
          };
        }),
        setDirectoryKind: (directoryId, kind) => set((state) => ({
          groups: state.groups.map((group) => ({
            ...group,
            directories: group.directories.map((dir) => dir.id === directoryId ? { ...dir, kind, note: kind === 'notes' ? (dir.note ?? '') : dir.note } : dir)
          }))
        })),
        addTransferItems: (items) => set((state) => ({
          transferItems: [
            ...state.transferItems,
            ...items.map((item) => ({ ...item, id: makeId('transfer'), createdAt: Date.now() }))
          ]
        })),
        setTransferItems: (items) => set({ transferItems: items }),
        removeTransferItem: (itemId) => set((state) => ({
          transferItems: state.transferItems.filter((item) => item.id !== itemId)
        })),
        clearTransferItems: () => set({ transferItems: [] }),
        addItems: (groupId, directoryId, items) => set((state) => ({
          groups: state.groups.map((group) => group.id === groupId
            ? {
                ...group,
                directories: group.directories.map((dir) => dir.id === directoryId
                  ? { ...dir, kind: dir.kind ?? 'normal', items: reindex([...dir.items, ...items]) }
                  : dir)
              }
            : group)
        })),
        clearDirectoryItems: (directoryId) => set((state) => ({
          selectedItemIds: [],
          groups: state.groups.map((group) => ({
            ...group,
            directories: group.directories.map((dir) => dir.id === directoryId ? { ...dir, items: [] } : dir)
          }))
        })),
        sortDirectoryItems: (directoryId, mode) => set((state) => ({
          groups: state.groups.map((group) => ({
            ...group,
            directories: group.directories.map((dir) => dir.id === directoryId ? { ...dir, display: cleanDisplayPatch({ ...(dir.display ?? {}), sortMode: mode }), items: sortShortcutItemsForStorage(dir.items, mode) } : dir)
          }))
        })),
        deleteSelectedItems: () => set((state) => {
          const ids = new Set(state.selectedItemIds);
          return {
            selectedItemIds: [],
            groups: state.groups.map((group) => ({
              ...group,
              directories: group.directories.map((dir) => ({
                ...dir,
                items: reindex(dir.items.filter((item) => !ids.has(item.id)))
              }))
            }))
          };
        }),
        updateItem: (itemId, patch) => set((state) => ({
          groups: state.groups.map((group) => ({
            ...group,
            directories: group.directories.map((dir) => ({
              ...dir,
              items: dir.items.map((item) => item.id === itemId ? { ...item, ...patch } : item)
            }))
          }))
        })),
        copyItemToDirectory: (itemId, directoryId) => set((state) => {
          const item = get().getItemById(itemId);
          if (!item) return state;
          return {
            groups: state.groups.map((group) => ({
              ...group,
              directories: group.directories.map((dir) => dir.id === directoryId
                ? { ...dir, items: reindex([...dir.items, { ...item, id: makeId('item'), order: dir.items.length }]) }
                : dir)
            }))
          };
        }),
        moveItemToDirectory: (itemId, directoryId) => set((state) => {
          const item = get().getItemById(itemId);
          if (!item) return state;
          const sourceDirectory = state.groups.flatMap((group) => group.directories).find((dir) => dir.items.some((entry) => entry.id === itemId));
          if (sourceDirectory?.id === directoryId) return state;
          return {
            selectedItemIds: state.selectedItemIds.filter((id) => id !== itemId),
            groups: state.groups.map((group) => ({
              ...group,
              directories: group.directories.map((dir) => {
                if (dir.items.some((entry) => entry.id === itemId)) {
                  return { ...dir, items: reindex(dir.items.filter((entry) => entry.id !== itemId)) };
                }
                if (dir.id === directoryId) {
                  return { ...dir, items: reindex([...dir.items, { ...item, order: dir.items.length }]) };
                }
                return dir;
              })
            }))
          };
        }),
        importConfig: (config) => set(() => {
          const groups = normalizeGroups(config.groups?.length ? config.groups : cloneConfig().groups);
          const first = getFirstDirectory(groups);
          return {
            groups,
            theme: config.theme || 'light-cloud',
            display: normalizeDisplay(config.display),
            behavior: normalizeBehavior(config.behavior),
            windowState: { ...defaultWindowState, ...config.windowState },
            autoSave: { ...defaultAutoSave, ...config.autoSave },
            transferItems: config.transferItems ?? [],
            imageBrowserItems: config.imageBrowserItems ?? [],
            globalSearch: { ...DEFAULT_GLOBAL_SEARCH_SETTINGS, ...(config.globalSearch ?? {}) },
            transferStation: { ...DEFAULT_TRANSFER_STATION_SETTINGS, ...(config.transferStation ?? {}) },
            imageBrowser: normalizeImageBrowserSettings(config.imageBrowser),
            notes: normalizeNoteSettings(config.notes),
            activeGroupId: first.groupId,
            activeDirectoryId: first.directoryId,
            selectedItemIds: [],
            selectedNavTarget: null,
            settingsOpen: false
          };
        }),
        exportConfig: () => {
          const state = get();
          return {
            groups: normalizeGroups(state.groups),
            theme: state.theme,
            display: state.display,
            behavior: state.behavior,
            windowState: state.windowState,
            autoSave: state.autoSave,
            transferItems: state.transferItems,
            imageBrowserItems: state.imageBrowserItems,
            globalSearch: state.globalSearch,
            transferStation: state.transferStation,
            imageBrowser: state.imageBrowser,
            notes: state.notes
          };
        },
        resetAll: () => {
          const fresh = cloneConfig();
          const firstFresh = getFirstDirectory(fresh.groups);
          set({
            ...fresh,
            activeGroupId: firstFresh.groupId,
            activeDirectoryId: firstFresh.directoryId,
            selectedItemIds: [],
            selectedNavTarget: null,
            settingsOpen: false
          });
        },
        getActiveGroup: () => get().groups.find((group) => group.id === get().activeGroupId),
        getActiveDirectory: () => get().getActiveGroup()?.directories.find((dir) => dir.id === get().activeDirectoryId),
        getItemById: (itemId) => {
          for (const group of get().groups) {
            for (const dir of group.directories) {
              const found = dir.items.find((item) => item.id === itemId);
              if (found) return found;
            }
          }
          return undefined;
        }
      };
    },
    {
      name: 'win-launcher-config',
      version: 3,
      migrate: (persisted) => {
        const saved = persisted as Partial<AppConfig> & { activeGroupId?: string; activeDirectoryId?: string };
        const groups = normalizeGroups(saved.groups?.length ? saved.groups : cloneConfig().groups);
        const first = getFirstDirectory(groups);
        return {
          ...saved,
          theme: saved.theme || 'light-cloud',
          groups,
          display: normalizeDisplay(saved.display),
          behavior: normalizeBehavior(saved.behavior),
          windowState: { ...defaultWindowState, ...(saved.windowState ?? {}) },
          autoSave: { ...defaultAutoSave, ...(saved.autoSave ?? {}) },
          transferItems: saved.transferItems ?? [],
          imageBrowserItems: saved.imageBrowserItems ?? [],
          globalSearch: { ...DEFAULT_GLOBAL_SEARCH_SETTINGS, ...(saved.globalSearch ?? {}) },
          transferStation: { ...DEFAULT_TRANSFER_STATION_SETTINGS, ...(saved.transferStation ?? {}) },
          imageBrowser: normalizeImageBrowserSettings(saved.imageBrowser),
          notes: normalizeNoteSettings(saved.notes),
          activeGroupId: saved.activeGroupId ?? first.groupId,
          activeDirectoryId: saved.activeDirectoryId ?? first.directoryId,
          selectedItemIds: [],
          selectedNavTarget: null,
          settingsOpen: false
        };
      },
      merge: (persisted, current) => {
        const saved = persisted as Partial<AppConfig> & { activeGroupId?: string; activeDirectoryId?: string };
        const groups = normalizeGroups(saved.groups?.length ? saved.groups : current.groups);
        const first = getFirstDirectory(groups);
        return {
          ...current,
          ...saved,
          groups,
          display: normalizeDisplay(saved.display ?? current.display),
          behavior: normalizeBehavior(saved.behavior ?? current.behavior),
          windowState: { ...defaultWindowState, ...(saved.windowState ?? current.windowState) },
          autoSave: { ...defaultAutoSave, ...(saved.autoSave ?? current.autoSave) },
          transferItems: saved.transferItems ?? (current as any).transferItems ?? [],
          imageBrowserItems: saved.imageBrowserItems ?? (current as any).imageBrowserItems ?? [],
          globalSearch: { ...DEFAULT_GLOBAL_SEARCH_SETTINGS, ...(saved.globalSearch ?? (current as any).globalSearch ?? {}) },
          transferStation: { ...DEFAULT_TRANSFER_STATION_SETTINGS, ...(saved.transferStation ?? (current as any).transferStation ?? {}) },
          imageBrowser: normalizeImageBrowserSettings(saved.imageBrowser ?? (current as any).imageBrowser),
          notes: normalizeNoteSettings(saved.notes ?? (current as any).notes),
          activeGroupId: saved.activeGroupId ?? current.activeGroupId ?? first.groupId,
          activeDirectoryId: saved.activeDirectoryId ?? current.activeDirectoryId ?? first.directoryId,
          selectedItemIds: [],
          selectedNavTarget: null,
          settingsOpen: false
        };
      },
      partialize: (state) => ({
        groups: state.groups,
        theme: state.theme,
        display: state.display,
        behavior: state.behavior,
        windowState: state.windowState,
        autoSave: state.autoSave,
        transferItems: state.transferItems,
        imageBrowserItems: state.imageBrowserItems,
        globalSearch: state.globalSearch,
        transferStation: state.transferStation,
        imageBrowser: state.imageBrowser,
        notes: state.notes,
        activeGroupId: state.activeGroupId,
        activeDirectoryId: state.activeDirectoryId
      })
    }
  )
);

export function selectGroups(state: AppState): Group[] {
  return state.groups;
}

export function getEffectiveDisplay(globalDisplay: DisplaySettings, directory?: Directory): DisplaySettings {
  return { ...globalDisplay, ...(directory?.display ?? {}) };
}
