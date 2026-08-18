import { normalizeExperience } from '../../../lib/experienceSettings';
import { normalizeShortcutSettings } from '../../../lib/keyboardShortcuts';
import { normalizeCommandUsage } from '../../../lib/commandUsage';
import { normalizeGlobalSearchSettings } from '../../../lib/globalSearchSettings';
import { normalizeBrowserRouter } from '../../../lib/browserRouter';
import {
  DEFAULT_GLOBAL_SEARCH_SETTINGS,
  DEFAULT_TRANSFER_STATION_SETTINGS,
} from '../../../utils/v16Types';
import {
  cloneConfig,
  defaultAutoSave,
  defaultWindowState,
} from '../defaults';
import {
  getFirstDirectory,
  normalizeBehavior,
  normalizeDisplay,
  normalizeGroups,
  normalizeImageBrowserSettings,
  normalizeNoteSettings,
  normalizeRainbow,
} from '../normalizers';
import type { AppSliceCreator, ConfigSlice } from '../types';

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

export const createConfigSlice: AppSliceCreator<ConfigSlice> = (set, get) => ({
  importConfig: (configValue) => set(() => {
    const config = asRecord(configValue);
    const groups = normalizeGroups(config.groups, cloneConfig().groups);
    const first = getFirstDirectory(groups);
    return {
      groups,
      theme: typeof config.theme === 'string' && config.theme.trim() ? config.theme.trim() : 'dark-soft',
      display: normalizeDisplay(config.display as never),
      behavior: normalizeBehavior(config.behavior as never),
      browserRouter: normalizeBrowserRouter(config.browserRouter, asRecord(config.behavior).urlOpenMode),
      windowState: { ...defaultWindowState, ...asRecord(config.windowState) },
      autoSave: { ...defaultAutoSave, ...asRecord(config.autoSave) },
      transferItems: Array.isArray(config.transferItems) ? config.transferItems : [],
      imageBrowserItems: Array.isArray(config.imageBrowserItems) ? config.imageBrowserItems : [],
      globalSearch: normalizeGlobalSearchSettings({ ...DEFAULT_GLOBAL_SEARCH_SETTINGS, ...asRecord(config.globalSearch) }),
      transferStation: { ...DEFAULT_TRANSFER_STATION_SETTINGS, ...asRecord(config.transferStation) },
      imageBrowser: normalizeImageBrowserSettings(config.imageBrowser as never),
      notes: normalizeNoteSettings(config.notes as never),
      rainbow: normalizeRainbow(config.rainbow as never),
      experience: normalizeExperience(config.experience as never),
      shortcuts: normalizeShortcutSettings(config.shortcuts as never),
      commandUsage: normalizeCommandUsage(asRecord(config.commandUsage)),
      activeGroupId: first.groupId,
      activeDirectoryId: first.directoryId,
      selectedItemIds: [],
      selectedNavTarget: null,
      settingsOpen: get().settingsOpen,
    };
  }),
  exportConfig: () => {
    const state = get();
    return {
      groups: normalizeGroups(state.groups),
      theme: state.theme,
      display: state.display,
      behavior: state.behavior,
      browserRouter: state.browserRouter,
      windowState: state.windowState,
      autoSave: state.autoSave,
      transferItems: state.transferItems,
      imageBrowserItems: state.imageBrowserItems,
      globalSearch: state.globalSearch,
      transferStation: state.transferStation,
      imageBrowser: state.imageBrowser,
      notes: state.notes,
      rainbow: state.rainbow,
      experience: state.experience,
      shortcuts: state.shortcuts,
      commandUsage: state.commandUsage,
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
      settingsOpen: false,
    });
  },
});
