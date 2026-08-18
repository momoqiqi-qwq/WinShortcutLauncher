import { defaultExperience, normalizeExperience } from '../../../lib/experienceSettings';
import { defaultShortcutSettings, normalizeShortcutSettings } from '../../../lib/keyboardShortcuts';
import { defaultBrowserRouter, normalizeBrowserRouter } from '../../../lib/browserRouter';
import {
  DEFAULT_GLOBAL_SEARCH_SETTINGS,
  DEFAULT_IMAGE_BROWSER_SETTINGS,
  DEFAULT_TRANSFER_STATION_SETTINGS,
} from '../../../utils/v16Types';
import {
  defaultAutoSave,
  defaultBehavior,
  defaultDisplay,
  defaultNotes,
  defaultRainbow,
  defaultWindowState,
} from '../defaults';
import {
  cleanDisplayPatch,
  normalizeBehavior,
  normalizeDisplay,
  normalizeImageBrowserSettings,
  normalizeNoteSettings,
  normalizeRainbow,
} from '../normalizers';
import type { AppSliceCreator, SettingsSlice } from '../types';

export const createSettingsSlice: AppSliceCreator<SettingsSlice> = (set) => ({
  setTheme: (theme) => set({ theme }),
  updateDisplay: (settings) => set((state) => ({
    display: normalizeDisplay({ ...state.display, ...settings }),
  })),
  updateBehavior: (settings) => set((state) => ({
    behavior: normalizeBehavior({ ...state.behavior, ...settings }),
    windowState:
      settings.edgeAutoHide === undefined
        ? state.windowState
        : { ...state.windowState, edgeAutoHide: settings.edgeAutoHide },
  })),
  updateBrowserRouter: (settings) => set((state) => {
    const browserRouter = normalizeBrowserRouter({ ...state.browserRouter, ...settings }, state.behavior.urlOpenMode);
    return {
      browserRouter,
      behavior: normalizeBehavior({ ...state.behavior, urlOpenMode: browserRouter.mode }),
    };
  }),
  updateWindowState: (settings) => set((state) => {
    const behavior = settings.edgeAutoHide === undefined
      ? state.behavior
      : normalizeBehavior({ ...state.behavior, edgeAutoHide: settings.edgeAutoHide });
    return {
      behavior,
      windowState: { ...state.windowState, ...settings, edgeAutoHide: behavior.edgeAutoHide },
    };
  }),
  updateAutoSave: (settings) => set((state) => ({
    autoSave: { ...state.autoSave, ...settings },
  })),
  updateGlobalSearch: (settings) => set((state) => ({
    globalSearch: { ...DEFAULT_GLOBAL_SEARCH_SETTINGS, ...(state.globalSearch ?? {}), ...settings },
  })),
  updateTransferStation: (settings) => set((state) => ({
    transferStation: { ...DEFAULT_TRANSFER_STATION_SETTINGS, ...(state.transferStation ?? {}), ...settings },
  })),
  updateImageBrowser: (settings) => set((state) => ({
    imageBrowser: normalizeImageBrowserSettings({ ...(state.imageBrowser ?? {}), ...settings }),
  })),
  updateNoteSettings: (settings) => set((state) => ({
    notes: normalizeNoteSettings({ ...(state.notes ?? {}), ...settings }),
  })),
  updateRainbow: (settings) => set((state) => ({
    rainbow: normalizeRainbow({ ...(state.rainbow ?? defaultRainbow), ...settings }),
  })),
  updateExperience: (settings) => set((state) => ({
    experience: normalizeExperience({ ...(state.experience ?? defaultExperience), ...settings }),
  })),
  updateShortcuts: (settings) => set((state) => ({
    shortcuts: normalizeShortcutSettings({ ...(state.shortcuts ?? defaultShortcutSettings), ...settings }),
  })),
  updateDirectoryDisplay: (directoryId, settings) => set((state) => ({
    groups: state.groups.map((group) => ({
      ...group,
      directories: group.directories.map((dir) =>
        dir.id === directoryId
          ? { ...dir, display: cleanDisplayPatch({ ...(dir.display ?? {}), ...settings }) }
          : dir,
      ),
    })),
  })),
  clearDirectoryDisplay: (directoryId) => set((state) => ({
    groups: state.groups.map((group) => ({
      ...group,
      directories: group.directories.map((dir) =>
        dir.id === directoryId ? { ...dir, display: undefined } : dir,
      ),
    })),
  })),
  setDirectoryNote: (directoryId, note) => set((state) => ({
    groups: state.groups.map((group) => ({
      ...group,
      directories: group.directories.map((dir) => (dir.id === directoryId ? { ...dir, note } : dir)),
    })),
  })),
  setDirectoryNoteLineNumbers: (directoryId, show) => set((state) => ({
    groups: state.groups.map((group) => ({
      ...group,
      directories: group.directories.map((dir) =>
        dir.id === directoryId ? { ...dir, noteShowLineNumbers: show } : dir,
      ),
    })),
  })),
  resetSettingsOnly: () => set((state) => ({
    theme: 'dark-soft',
    display: { ...defaultDisplay },
    behavior: { ...defaultBehavior },
    browserRouter: { ...defaultBrowserRouter, customBrowsers: [], profileOverrides: {} },
    windowState: { ...defaultWindowState },
    autoSave: { ...defaultAutoSave },
    globalSearch: { ...DEFAULT_GLOBAL_SEARCH_SETTINGS },
    transferStation: { ...DEFAULT_TRANSFER_STATION_SETTINGS },
    imageBrowser: { ...DEFAULT_IMAGE_BROWSER_SETTINGS },
    notes: { ...defaultNotes },
    rainbow: { ...defaultRainbow },
    experience: { ...defaultExperience },
    shortcuts: { ...defaultShortcutSettings },
    groups: state.groups,
    transferItems: state.transferItems,
    imageBrowserItems: state.imageBrowserItems,
  })),
});
