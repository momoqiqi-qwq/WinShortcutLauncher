import { normalizeExperience } from '../../lib/experienceSettings';
import { normalizeShortcutSettings } from '../../lib/keyboardShortcuts';
import { normalizeCommandUsage } from '../../lib/commandUsage';
import { normalizeGlobalSearchSettings } from '../../lib/globalSearchSettings';
import { normalizeBrowserRouter } from '../../lib/browserRouter';
import type { AppConfig } from '../../types';
import {
  DEFAULT_GLOBAL_SEARCH_SETTINGS,
  DEFAULT_TRANSFER_STATION_SETTINGS,
} from '../../utils/v16Types';
import { cloneConfig, defaultAutoSave, defaultWindowState } from './defaults';
import {
  getFirstDirectory,
  normalizeBehavior,
  normalizeDisplay,
  normalizeGroups,
  normalizeImageBrowserSettings,
  normalizeNoteSettings,
  normalizeRainbow,
} from './normalizers';
import type { AppState } from './types';

export const APP_STORE_NAME = 'win-launcher-config';

const PERSIST_WRITE_DELAY_MS = 140;
type PersistEnvelope = { state: unknown; version?: number };

const pendingPersistWrites = new Map<string, PersistEnvelope>();
const lastPersistValues = new Map<string, PersistEnvelope>();
let persistWriteTimer: ReturnType<typeof setTimeout> | null = null;
let persistFlushListenersInstalled = false;


function samePersistEnvelope(left: PersistEnvelope | undefined, right: PersistEnvelope) {
  if (!left || left.version !== right.version) return false;
  if (Object.is(left.state, right.state)) return true;
  if (!left.state || !right.state || typeof left.state !== 'object' || typeof right.state !== 'object') return false;
  const leftState = left.state as Record<string, unknown>;
  const rightState = right.state as Record<string, unknown>;
  const leftKeys = Object.keys(leftState);
  const rightKeys = Object.keys(rightState);
  if (leftKeys.length !== rightKeys.length) return false;
  for (const key of leftKeys) {
    if (!Object.prototype.hasOwnProperty.call(rightState, key) || !Object.is(leftState[key], rightState[key])) return false;
  }
  return true;
}

function getLocalStorageSafe(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function flushAppStorePersistence() {
  if (persistWriteTimer !== null) {
    clearTimeout(persistWriteTimer);
    persistWriteTimer = null;
  }
  const storage = getLocalStorageSafe();
  if (!storage || pendingPersistWrites.size === 0) return;
  for (const [name, value] of pendingPersistWrites) {
    try {
      storage.setItem(name, JSON.stringify(value));
      lastPersistValues.set(name, value);
      pendingPersistWrites.delete(name);
    } catch (error) {
      console.error('持久化配置失败', error);
    }
  }
}

function installPersistFlushListeners() {
  if (persistFlushListenersInstalled || typeof window === 'undefined') return;
  persistFlushListenersInstalled = true;
  window.addEventListener('pagehide', flushAppStorePersistence, { capture: true });
  window.addEventListener('beforeunload', flushAppStorePersistence, { capture: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushAppStorePersistence();
  });
}

function schedulePersistWrite(name: string, value: PersistEnvelope) {
  const previous = pendingPersistWrites.get(name) ?? lastPersistValues.get(name);
  if (samePersistEnvelope(previous, value)) return;
  pendingPersistWrites.set(name, value);
  installPersistFlushListeners();
  if (persistWriteTimer !== null) clearTimeout(persistWriteTimer);
  persistWriteTimer = setTimeout(() => {
    persistWriteTimer = null;
    flushAppStorePersistence();
  }, PERSIST_WRITE_DELAY_MS);
}

// The middleware supplies its own persisted-state generic; keep this storage adapter runtime-shaped
// so the buffering layer does not over-constrain Zustand's inferred partialized state type.
const bufferedPersistStorage: any = {
  getItem(name: string): PersistEnvelope | null {
    const pending = pendingPersistWrites.get(name);
    if (pending) return pending;
    const storage = getLocalStorageSafe();
    if (!storage) return null;
    try {
      const raw = storage.getItem(name);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as PersistEnvelope;
      lastPersistValues.set(name, parsed);
      return parsed;
    } catch {
      return null;
    }
  },
  setItem(name: string, value: PersistEnvelope) {
    schedulePersistWrite(name, value);
  },
  removeItem(name: string) {
    pendingPersistWrites.delete(name);
    lastPersistValues.delete(name);
    const storage = getLocalStorageSafe();
    try {
      storage?.removeItem(name);
    } catch {
      // Storage may be unavailable in privacy mode.
    }
  },
};
export const APP_STORE_VERSION = 21;

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function resolveActiveLocation(
  groups: AppConfig['groups'],
  requestedGroupId: unknown,
  requestedDirectoryId: unknown,
) {
  const directoryId = typeof requestedDirectoryId === 'string' ? requestedDirectoryId : '';
  const containingGroup = directoryId
    ? groups.find((group) => group.directories.some((directory) => directory.id === directoryId))
    : undefined;
  const requestedGroup = typeof requestedGroupId === 'string'
    ? groups.find((group) => group.id === requestedGroupId)
    : undefined;
  const group = requestedGroup ?? containingGroup ?? groups[0];
  const directory = group.directories.find((entry) => entry.id === directoryId) ?? group.directories[0];
  return { groupId: group.id, directoryId: directory.id };
}

export function restorePersistedState(savedValue: unknown, current?: AppState) {
  const saved = asRecord(savedValue);
  const browserRouterSource = Object.prototype.hasOwnProperty.call(saved, 'browserRouter')
    ? saved.browserRouter
    : Object.prototype.hasOwnProperty.call(saved, 'behavior')
      ? undefined
      : current?.browserRouter;
  const fallbackGroups = current?.groups ?? cloneConfig().groups;
  const groups = normalizeGroups(saved.groups, fallbackGroups);
  const first = getFirstDirectory(groups);
  const experience = normalizeExperience((saved.experience ?? current?.experience) as never);
  const remembered = experience.rememberLastPage
    ? resolveActiveLocation(groups, saved.activeGroupId ?? current?.activeGroupId, saved.activeDirectoryId ?? current?.activeDirectoryId)
    : first;
  const currentWindowState = asRecord(current?.windowState);
  const savedWindowState = asRecord(saved.windowState);
  const currentAutoSave = asRecord(current?.autoSave);
  const savedAutoSave = asRecord(saved.autoSave);
  const currentGlobalSearch = asRecord(current?.globalSearch);
  const savedGlobalSearch = asRecord(saved.globalSearch);
  const currentTransferStation = asRecord(current?.transferStation);
  const savedTransferStation = asRecord(saved.transferStation);

  const behavior = normalizeBehavior((saved.behavior ?? current?.behavior) as never);

  return {
    ...(current ?? {}),
    theme: asString(saved.theme, current?.theme || 'dark-soft'),
    groups,
    display: normalizeDisplay((saved.display ?? current?.display) as never),
    behavior,
    browserRouter: normalizeBrowserRouter(browserRouterSource, asRecord(saved.behavior ?? current?.behavior).urlOpenMode),
    windowState: { ...defaultWindowState, ...currentWindowState, ...savedWindowState, edgeAutoHide: behavior.edgeAutoHide },
    autoSave: { ...defaultAutoSave, ...currentAutoSave, ...savedAutoSave },
    transferItems: Array.isArray(saved.transferItems)
      ? saved.transferItems
      : Array.isArray(current?.transferItems) ? current.transferItems : [],
    imageBrowserItems: Array.isArray(saved.imageBrowserItems)
      ? saved.imageBrowserItems
      : Array.isArray(current?.imageBrowserItems) ? current.imageBrowserItems : [],
    globalSearch: normalizeGlobalSearchSettings({
      ...DEFAULT_GLOBAL_SEARCH_SETTINGS,
      ...currentGlobalSearch,
      ...savedGlobalSearch,
    }),
    transferStation: {
      ...DEFAULT_TRANSFER_STATION_SETTINGS,
      ...currentTransferStation,
      ...savedTransferStation,
    },
    imageBrowser: normalizeImageBrowserSettings((saved.imageBrowser ?? current?.imageBrowser) as never),
    notes: normalizeNoteSettings((saved.notes ?? current?.notes) as never),
    rainbow: normalizeRainbow((saved.rainbow ?? current?.rainbow) as never),
    experience,
    shortcuts: normalizeShortcutSettings((saved.shortcuts ?? current?.shortcuts) as never),
    commandUsage: normalizeCommandUsage({ ...asRecord(current?.commandUsage), ...asRecord(saved.commandUsage) }),
    activeGroupId: remembered.groupId,
    activeDirectoryId: remembered.directoryId,
    selectedItemIds: [],
    selectedNavTarget: null,
    settingsOpen: false,
  };
}

export const appPersistOptions = {
  name: APP_STORE_NAME,
  storage: bufferedPersistStorage,
  version: APP_STORE_VERSION,
  migrate: (persisted: unknown) => restorePersistedState(persisted),
  merge: (persisted: unknown, current: AppState) =>
    restorePersistedState(persisted, current) as AppState,
  partialize: (state: AppState) => ({
    groups: state.groups,
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
    activeGroupId: state.experience.rememberLastPage ? state.activeGroupId : undefined,
    activeDirectoryId: state.experience.rememberLastPage ? state.activeDirectoryId : undefined,
  }),
};
