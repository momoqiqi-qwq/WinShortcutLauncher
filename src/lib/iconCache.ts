import { invoke } from '@tauri-apps/api/core';
import type { IconResolveMode } from '../utils/v16Types';

export type IconResolveCommand = 'get_file_icon' | 'read_icon_as_data_url';

const STORAGE_PREFIX = 'win-launcher-icon-cache-v3:';
const STORAGE_INDEX_KEY = 'win-launcher-icon-cache-v3:index';
const MAX_PERSISTED_ICONS = 180;
const DEFAULT_PARALLEL_ICON_TASKS = 6;
const SIZE_LIMIT = 2 * 1024 * 1024;
const IMAGE_ICON_FILE_RE = /\.(png|jpe?g|webp|gif|svg|ico)$/i;

const memoryCache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();
let maxParallelIconTasks = DEFAULT_PARALLEL_ICON_TASKS;
let activeTasks = 0;
const pendingTasks: Array<() => void> = [];

function safeLocalStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function hashKey(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function isImageIconFilePath(value: string) {
  return IMAGE_ICON_FILE_RE.test(value.trim());
}

export function setIconParallelTasks(value: number) {
  const next = Math.max(1, Math.min(8, Math.round(Number(value) || DEFAULT_PARALLEL_ICON_TASKS)));
  maxParallelIconTasks = next;
  while (activeTasks < maxParallelIconTasks && pendingTasks.length > 0) {
    const nextTask = pendingTasks.shift();
    if (!nextTask) break;
    nextTask();
  }
}

export function getIconParallelTasks() {
  return maxParallelIconTasks;
}

export function chooseIconResolveCommand(rawIcon: string, fromItemPath: boolean, mode: IconResolveMode = 'auto'): IconResolveCommand {
  if (mode === 'get_file_icon') return 'get_file_icon';
  if (mode === 'read_icon_as_data_url' && !fromItemPath) return 'read_icon_as_data_url';
  return !fromItemPath && isImageIconFilePath(rawIcon) ? 'read_icon_as_data_url' : 'get_file_icon';
}

function cacheKey(command: IconResolveCommand, path: string) {
  return `${command}:${path.trim()}`;
}

function storageKey(key: string) {
  return `${STORAGE_PREFIX}${hashKey(key)}`;
}

function readIndex(): string[] {
  const storage = safeLocalStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(STORAGE_INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function writeIndex(index: string[]) {
  const storage = safeLocalStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_INDEX_KEY, JSON.stringify(index));
  } catch {
    // Ignore quota / privacy-mode errors. Runtime cache still works.
  }
}

function touchIndex(storageKeyValue: string) {
  const storage = safeLocalStorage();
  if (!storage) return;
  const next = [storageKeyValue, ...readIndex().filter((item) => item !== storageKeyValue)];
  while (next.length > MAX_PERSISTED_ICONS) {
    const removed = next.pop();
    if (removed) {
      try {
        storage.removeItem(removed);
      } catch {
        // ignore
      }
    }
  }
  writeIndex(next);
}

function readPersistentIcon(key: string) {
  const storage = safeLocalStorage();
  if (!storage) return undefined;
  const keyInStorage = storageKey(key);
  try {
    const value = storage.getItem(keyInStorage) ?? undefined;
    if (value) touchIndex(keyInStorage);
    return value;
  } catch {
    return undefined;
  }
}

function writePersistentIcon(key: string, value: string) {
  if (!value.startsWith('data:image/')) return;
  if (value.length > SIZE_LIMIT) return;
  const storage = safeLocalStorage();
  if (!storage) return;
  const keyInStorage = storageKey(key);
  try {
    storage.setItem(keyInStorage, value);
    touchIndex(keyInStorage);
  } catch {
    // If the cache is full, evict older entries and retry once.
    const index = readIndex();
    const evictCount = Math.max(12, Math.ceil(index.length * 0.2));
    for (let i = 0; i < evictCount; i += 1) {
      const removed = index.pop();
      if (!removed) break;
      try {
        storage.removeItem(removed);
      } catch {
        // ignore
      }
    }
    writeIndex(index);
    try {
      storage.setItem(keyInStorage, value);
      touchIndex(keyInStorage);
    } catch {
      // Persistent cache unavailable. Runtime cache is still enough for this session.
    }
  }
}

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      activeTasks += 1;
      task()
        .then(resolve, reject)
        .finally(() => {
          activeTasks = Math.max(0, activeTasks - 1);
          const next = pendingTasks.shift();
          if (next) next();
        });
    };

    if (activeTasks < maxParallelIconTasks) run();
    else pendingTasks.push(run);
  });
}

export function getCachedIcon(command: IconResolveCommand, path: string) {
  const key = cacheKey(command, path);
  const memory = memoryCache.get(key);
  if (memory) return memory;
  const persisted = readPersistentIcon(key);
  if (persisted) {
    memoryCache.set(key, persisted);
    return persisted;
  }
  return undefined;
}

export async function resolveIconDataUrl(command: IconResolveCommand, path: string) {
  const trimmedPath = path.trim();
  if (!trimmedPath) return '';
  const key = cacheKey(command, trimmedPath);
  const cached = getCachedIcon(command, trimmedPath);
  if (cached) return cached;
  const running = inflight.get(key);
  if (running) return running;

  const promise = enqueue(async () => {
    const dataUrl = await invoke<string>(command, { path: trimmedPath }).catch(() => '');
    if (dataUrl?.startsWith('data:image/')) {
      memoryCache.set(key, dataUrl);
      writePersistentIcon(key, dataUrl);
    }
    return dataUrl || '';
  }).finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, promise);
  return promise;
}

export function preloadIconDataUrls(targets: Array<{ command: IconResolveCommand; path: string }>) {
  const unique = new Map<string, { command: IconResolveCommand; path: string }>();
  for (const target of targets) {
    const path = target.path.trim();
    if (!path) continue;
    unique.set(cacheKey(target.command, path), { ...target, path });
  }

  const start = () => {
    for (const target of unique.values()) {
      if (getCachedIcon(target.command, target.path)) continue;
      void resolveIconDataUrl(target.command, target.path);
    }
  };

  const idleCallback = (window as unknown as { requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number }).requestIdleCallback;
  if (typeof idleCallback === 'function') {
    idleCallback(start, { timeout: 900 });
  } else {
    window.setTimeout(start, 80);
  }
}

export function isDirectImageSource(value: string) {
  return value.startsWith('data:image/') || value.startsWith('http://') || value.startsWith('https://');
}
