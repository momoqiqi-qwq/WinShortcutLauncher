import type { AreaContextMenuItemId, DirectoryContextMenuItemId, ExperienceSettings, GroupContextMenuItemId, SpecialDirectoryStyle } from '../types';
import { normalizeAfterLaunchAction } from './itemExperience';

/** v174: 特殊子目录边框形式白名单，非法值统一回落到 `outline`。 */
export const SPECIAL_DIRECTORY_STYLES: SpecialDirectoryStyle[] = ['outline', 'ribbon', 'bar'];

export function normalizeSpecialDirectoryStyle(value: unknown): SpecialDirectoryStyle {
  return SPECIAL_DIRECTORY_STYLES.includes(value as SpecialDirectoryStyle) ? value as SpecialDirectoryStyle : 'outline';
}

export const DIRECTORY_CONTEXT_MENU_IDS: DirectoryContextMenuItemId[] = ['copyDirectory', 'pasteDirectory', 'moveToGroup', 'paste', 'refreshStartMenu', 'openStartMenuFolder', 'refreshMappedFolder', 'openMappedFolder', 'changeMappedFolder', 'refreshHtmlFolder', 'openHtmlFolder', 'changeHtmlFolder', 'toggleHtmlPreview', 'resetHtmlCardSizes', 'rename', 'color', 'fullNames', 'merge', 'switchToNotes', 'switchToNormal', 'clear', 'delete', 'linkRefresh', 'linkLocate', 'linkRetarget', 'linkDetach'];
export const GROUP_CONTEXT_MENU_IDS: GroupContextMenuItemId[] = ['copyGroup', 'pasteGroup', 'pasteDirectory', 'create', 'merge', 'color', 'delete', 'linkDirectory', 'linkGroup', 'linkRefresh', 'linkDetach'];
export const AREA_CONTEXT_MENU_IDS: AreaContextMenuItemId[] = ['paste', 'createDirectory', 'addFile', 'addFolder', 'addExe', 'addUrl', 'addSystem', 'iconSize', 'viewMode', 'sortMode', 'directoryColumns', 'sidebarFullNames', 'globalIconSize', 'globalViewMode', 'globalSortMode', 'refreshIcons', 'linkDirectory', 'linkGroup'];

function normalizeHiddenMenuItems<T extends string>(value: unknown, allowed: readonly T[]): T[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is T => allowed.includes(item as T)).filter((item, index, list) => list.indexOf(item) === index);
}

export const defaultExperience: ExperienceSettings = {
  rememberLastPage: true,
  rememberSettingsTab: false,
  rememberSettingsScrollPosition: true,
  showEmptyGuide: true,
  showLaunchNotice: false,
  lastSeenVersion: '',
  installerDownloadDir: '',
  confirmDeleteItems: true,
  confirmDeleteNavigation: true,
  confirmClearDirectory: true,
  itemHoverAnimation: true,
  reduceMotion: false,
  pinnedItemsFirst: true,
  compactSettingsNav: false,
  showSettingsDescriptions: true,
  settingsTabAnimation: true,
  keyboardNavigation: true,
  typeToSearch: true,
  searchIncludesPath: true,
  clearSelectionAfterLaunch: true,
  afterLaunchAction: 'keep',
  itemTooltipMode: 'details',
  showLaunchCountBadge: false,
  directoryRightClickMode: 'content',
  promptDirectoryNameOnCreate: false,
  activateNewDirectoryAfterCreate: true,
  autoNumberDuplicateDirectories: true,
  showDirectoryItemCount: false,
  doubleClickSidebarToCreate: false,
  showSpecialDirectoryMarkers: true,
  specialDirectoryStyle: 'outline',
  compactContextMenus: false,
  showContextMenuIcons: true,
  showContextMenuDirectoryHeader: true,
  directoryContextMenuHiddenItems: [],
  groupContextMenuHiddenItems: [],
  areaContextMenuHiddenItems: []
};

export function normalizeExperience(settings?: Partial<ExperienceSettings>): ExperienceSettings {
  const merged = { ...defaultExperience, ...(settings ?? {}) };
  return {
    rememberLastPage: merged.rememberLastPage !== false,
    rememberSettingsTab: merged.rememberSettingsTab === true,
    rememberSettingsScrollPosition: merged.rememberSettingsScrollPosition !== false,
    showEmptyGuide: merged.showEmptyGuide !== false,
    showLaunchNotice: merged.showLaunchNotice === true,
    lastSeenVersion: typeof merged.lastSeenVersion === 'string' ? merged.lastSeenVersion.trim() : '',
    installerDownloadDir: typeof merged.installerDownloadDir === 'string' ? merged.installerDownloadDir.trim() : '',
    confirmDeleteItems: merged.confirmDeleteItems !== false,
    confirmDeleteNavigation: merged.confirmDeleteNavigation !== false,
    confirmClearDirectory: merged.confirmClearDirectory !== false,
    itemHoverAnimation: merged.itemHoverAnimation !== false,
    reduceMotion: merged.reduceMotion === true,
    pinnedItemsFirst: merged.pinnedItemsFirst !== false,
    compactSettingsNav: merged.compactSettingsNav === true,
    showSettingsDescriptions: merged.showSettingsDescriptions !== false,
    settingsTabAnimation: merged.settingsTabAnimation !== false,
    keyboardNavigation: merged.keyboardNavigation !== false,
    typeToSearch: merged.typeToSearch !== false,
    searchIncludesPath: merged.searchIncludesPath !== false,
    clearSelectionAfterLaunch: merged.clearSelectionAfterLaunch !== false,
    afterLaunchAction: normalizeAfterLaunchAction(merged.afterLaunchAction),
    itemTooltipMode: merged.itemTooltipMode === 'off' || merged.itemTooltipMode === 'name' ? merged.itemTooltipMode : 'details',
    showLaunchCountBadge: merged.showLaunchCountBadge === true,
    directoryRightClickMode: merged.directoryRightClickMode === 'manage' ? 'manage' : 'content',
    promptDirectoryNameOnCreate: merged.promptDirectoryNameOnCreate === true,
    activateNewDirectoryAfterCreate: merged.activateNewDirectoryAfterCreate !== false,
    autoNumberDuplicateDirectories: merged.autoNumberDuplicateDirectories !== false,
    showDirectoryItemCount: merged.showDirectoryItemCount === true,
    doubleClickSidebarToCreate: merged.doubleClickSidebarToCreate === true,
    showSpecialDirectoryMarkers: merged.showSpecialDirectoryMarkers !== false,
    specialDirectoryStyle: normalizeSpecialDirectoryStyle(merged.specialDirectoryStyle),
    compactContextMenus: merged.compactContextMenus === true,
    showContextMenuIcons: merged.showContextMenuIcons !== false,
    showContextMenuDirectoryHeader: merged.showContextMenuDirectoryHeader !== false,
    directoryContextMenuHiddenItems: normalizeHiddenMenuItems(merged.directoryContextMenuHiddenItems, DIRECTORY_CONTEXT_MENU_IDS),
    groupContextMenuHiddenItems: normalizeHiddenMenuItems(merged.groupContextMenuHiddenItems, GROUP_CONTEXT_MENU_IDS),
    areaContextMenuHiddenItems: normalizeHiddenMenuItems(merged.areaContextMenuHiddenItems, AREA_CONTEXT_MENU_IDS)
  };
}
