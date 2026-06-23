import { invoke } from '@tauri-apps/api/core';
import { makeId } from './id';
import { resolveIconDataUrl } from './iconCache';
import type { FileInfo, ShortcutItem } from '../types';

function fallbackNameFromPath(path: string): string {
  const clean = path.replace(/[\\/]+$/, '');
  const last = clean.split(/[\\/]/).pop()?.trim();
  if (!last) return path;
  return last.replace(/\.[^.]+$/i, '') || last;
}

function fallbackTypeFromPath(path: string): ShortcutItem['type'] {
  if (/^https?:\/\//i.test(path)) return 'url';
  if (/\.(exe|bat|cmd|ps1|msc|cpl)$/i.test(path)) return 'command';
  if (/\.[a-z0-9]{1,8}$/i.test(path)) return 'file';
  return 'folder';
}

export function createFastShortcutItemsFromPaths(paths: string[]): ShortcutItem[] {
  return paths.map((path, index) => ({
    id: makeId('item'),
    name: fallbackNameFromPath(path),
    path,
    type: fallbackTypeFromPath(path),
    order: index
  }));
}

export async function hydrateShortcutItemsFromPaths(
  paths: string[],
  itemIds: string[],
  updateItem: (itemId: string, patch: Partial<ShortcutItem>) => void
) {
  await Promise.allSettled(paths.map(async (path, index) => {
    const itemId = itemIds[index];
    if (!itemId) return;
    try {
      const info = await invoke<FileInfo>('get_file_info', { path });
      updateItem(itemId, {
        name: info.name || fallbackNameFromPath(path),
        path: info.resolvedPath || info.path || path,
        type: info.type
      });

      const icon = await resolveIconDataUrl('get_file_icon', info.resolvedPath || info.path || path).catch(() => '');
      if (icon) updateItem(itemId, { icon });
    } catch (error) {
      console.error('hydrate shortcut item failed', path, error);
      const icon = await resolveIconDataUrl('get_file_icon', path).catch(() => '');
      if (icon) updateItem(itemId, { icon });
    }
  }));
}

export async function createShortcutItemsFromPaths(paths: string[]): Promise<ShortcutItem[]> {
  const created = createFastShortcutItemsFromPaths(paths);
  await hydrateShortcutItemsFromPaths(paths, created.map((item) => item.id), (itemId, patch) => {
    const item = created.find((entry) => entry.id === itemId);
    if (item) Object.assign(item, patch);
  });
  return created;
}

export function createUrlShortcut(url: string, name?: string): ShortcutItem {
  let displayName = name?.trim();
  if (!displayName) {
    try {
      displayName = new URL(url).hostname.replace(/^www\./, '');
    } catch {
      displayName = url;
    }
  }
  return {
    id: makeId('item'),
    name: displayName,
    path: url,
    type: 'url',
    order: 0
  };
}
