import { invoke } from '@tauri-apps/api/core';

const memoryIconCache = new Map<string, string>();
const STORAGE_KEY = 'win-launcher-icon-cache-v4';
let persistentLoaded = false;

function loadPersistent() {
  if (persistentLoaded) return;
  persistentLoaded = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, string>;
    Object.entries(parsed).forEach(([k, v]) => {
      if (typeof v === 'string' && v) memoryIconCache.set(k, v);
    });
  } catch {
    // ignore corrupted cache
  }
}

function savePersistentSoon() {
  window.clearTimeout((savePersistentSoon as any).timer);
  (savePersistentSoon as any).timer = window.setTimeout(() => {
    try {
      const obj = Object.fromEntries(memoryIconCache.entries());
      localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    } catch {
      // localStorage may be full; cache is optional
    }
  }, 300);
}

export function getCachedIcon(key?: string) {
  if (!key) return undefined;
  loadPersistent();
  return memoryIconCache.get(key);
}

export function putCachedIcon(key: string, icon?: string) {
  if (!key || !icon) return;
  loadPersistent();
  memoryIconCache.set(key, icon);
  savePersistentSoon();
}

export function isImageLike(icon?: string) {
  if (!icon) return false;
  return icon.startsWith('data:image/') || /\.(png|jpe?g|webp|gif|bmp|svg|ico)$/i.test(icon);
}

export async function resolveItemIcon(item: { icon?: string; path?: string; name?: string; type?: string }) {
  loadPersistent();
  if (item.icon) return item.icon;
  const key = item.path || item.name || '';
  const cached = getCachedIcon(key);
  if (cached) return cached;
  if (!item.path) return undefined;
  try {
    const icon = await invoke<string>('get_file_icon', { path: item.path });
    if (icon) putCachedIcon(key, icon);
    return icon;
  } catch {
    return undefined;
  }
}
