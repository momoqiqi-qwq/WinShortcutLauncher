import type { AreaContextMenuItemId, DirectoryContextMenuItemId, ExperienceSettings, GroupContextMenuItemId } from '../types';
import { normalizeAfterLaunchAction } from './itemExperience';

export const DIRECTORY_CONTEXT_MENU_IDS: DirectoryContextMenuItemId[] = ['rename', 'merge', 'switchToNotes', 'switchToNormal', 'clear', 'delete'];
export const GROUP_CONTEXT_MENU_IDS: GroupContextMenuItemId[] = ['create', 'merge', 'color', 'delete'];
export const AREA_CONTEXT_MENU_IDS: AreaContextMenuItemId[] = ['createDirectory', 'addFile', 'addFolder', 'addUrl', 'addSystem', 'iconSize', 'viewMode', 'sortMode', 'globalIconSize', 'globalViewMode', 'globalSortMode', 'refreshIcons'];

function normalizeHiddenMenuItems<T extends string>(value: unknown, allowed: readonly T[]): T[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is T => allowed.includes(item as T)).filter((item, index, list) => list.indexOf(item) === index);
}

export const defaultExperience: ExperienceSettings = {
  rememberLastPage: true,
  rememberSettingsTab: true,
  rememberSettingsScrollPosition: true,
  showEmptyGuide: true,
  showLaunchNotice: false,
  confirmDeleteItems: true,
  confirmDeleteNavigation: true,
  confirmClearDirectory: true,
  itemHoverAnimation: true,
  reduceMotion: false,
  pinnedItemsFirst: true,
  compactSettingsNav: false,
  showSettingsDescriptions: true,
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
    rememberSettingsTab: merged.rememberSettingsTab !== false,
    rememberSettingsScrollPosition: merged.rememberSettingsScrollPosition !== false,
    showEmptyGuide: merged.showEmptyGuide !== false,
    showLaunchNotice: merged.showLaunchNotice === true,
    confirmDeleteItems: merged.confirmDeleteItems !== false,
    confirmDeleteNavigation: merged.confirmDeleteNavigation !== false,
    confirmClearDirectory: merged.confirmClearDirectory !== false,
    itemHoverAnimation: merged.itemHoverAnimation !== false,
    reduceMotion: merged.reduceMotion === true,
    pinnedItemsFirst: merged.pinnedItemsFirst !== false,
    compactSettingsNav: merged.compactSettingsNav === true,
    showSettingsDescriptions: merged.showSettingsDescriptions !== false,
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
    compactContextMenus: merged.compactContextMenus === true,
    showContextMenuIcons: merged.showContextMenuIcons !== false,
    showContextMenuDirectoryHeader: merged.showContextMenuDirectoryHeader !== false,
    directoryContextMenuHiddenItems: normalizeHiddenMenuItems(merged.directoryContextMenuHiddenItems, DIRECTORY_CONTEXT_MENU_IDS),
    groupContextMenuHiddenItems: normalizeHiddenMenuItems(merged.groupContextMenuHiddenItems, GROUP_CONTEXT_MENU_IDS),
    areaContextMenuHiddenItems: normalizeHiddenMenuItems(merged.areaContextMenuHiddenItems, AREA_CONTEXT_MENU_IDS)
  };
}
