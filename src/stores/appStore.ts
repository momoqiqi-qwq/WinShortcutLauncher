import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Directory, DisplaySettings, Group } from '../types';
import { cloneConfig } from './appStore/defaults';
import { getFirstDirectory } from './appStore/normalizers';
import { appPersistOptions } from './appStore/persistence';
import { createConfigSlice } from './appStore/slices/configSlice';
import { createCommandSlice } from './appStore/slices/commandSlice';
import { createItemSlice } from './appStore/slices/itemSlice';
import { createMediaSlice } from './appStore/slices/mediaSlice';
import { createNavigationSlice } from './appStore/slices/navigationSlice';
import { createSettingsSlice } from './appStore/slices/settingsSlice';
import type { AppState } from './appStore/types';

export type { AppState } from './appStore/types';
export {
  cloneConfig,
  defaultAutoSave,
  defaultBehavior,
  defaultDisplay,
  defaultNotes,
  defaultRainbow,
  defaultWindowState,
} from './appStore/defaults';
export {
  cleanDisplayPatch,
  getFirstDirectory,
  normalizeBehavior,
  normalizeDirectory,
  normalizeDisplay,
  normalizeGroups,
  normalizeImageBrowserSettings,
  normalizeNoteSettings,
  normalizeRainbow,
} from './appStore/normalizers';

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => {
      const defaults = cloneConfig();
      const first = getFirstDirectory(defaults.groups);
      return {
        ...createNavigationSlice(set, get),
        ...createItemSlice(set, get),
        ...createSettingsSlice(set, get),
        ...createMediaSlice(set, get),
        ...createConfigSlice(set, get),
        ...createCommandSlice(set, get),
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
        rainbow: defaults.rainbow!,
        experience: defaults.experience!,
        shortcuts: defaults.shortcuts!,
        browserRouter: defaults.browserRouter!,
        commandUsage: defaults.commandUsage ?? {},
      };
    },
    appPersistOptions,
  ),
);

export function selectGroups(state: AppState): Group[] {
  return state.groups;
}

export function getEffectiveDisplay(globalDisplay: DisplaySettings, directory?: Directory): DisplaySettings {
  return { ...globalDisplay, ...(directory?.display ?? {}) };
}
