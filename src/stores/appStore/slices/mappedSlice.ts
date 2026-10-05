import { resolveIconDataUrl } from '../../../lib/iconCache';
import {
  createMappedShortcuts,
  createMappedUrl,
  getMappedPath,
  isMappedDirectory,
  isMappedItemId,
  listMappedFolder,
  mappedEntriesToItems,
  removeMappedEntries,
  renameMappedEntry,
  type CreateMappedResult,
} from '../../../lib/mappedFolder';
import type { Directory, Group, ShortcutItem } from '../../../types';
import type { AppSliceCreator, MappedActions } from '../types';

/** 未加载时返回同一个空数组，避免每次调用都产生新引用导致重渲染。 */
const EMPTY_ITEMS: ShortcutItem[] = [];

function findDirectory(groups: Group[], directoryId: string): Directory | undefined {
  for (const group of groups) {
    const found = group.directories.find((directory) => directory.id === directoryId);
    if (found) return found;
  }
  return undefined;
}

function pathsFromItemIds(itemIds: string[], items: ShortcutItem[]): string[] {
  const wanted = new Set(itemIds.filter(Boolean));
  return items.filter((item) => wanted.has(item.id)).map((item) => item.path);
}

export const createMappedSlice: AppSliceCreator<MappedActions> = (set, get) => {
  /** 取某个映射子目录的根路径；不是映射目录或还没配路径时返回空串。 */
  function rootOf(directoryId: string): string {
    const directory = findDirectory(get().groups, directoryId);
    return isMappedDirectory(directory) ? getMappedPath(directory) : '';
  }

  /**
   * 补齐某个映射子目录的图标。走 iconCache（内存 + 持久化两级缓存），
   * 全部解析完再一次性合并，避免几十次 setState 触发几十次重渲染。
   */
  async function hydrateIcons(directoryId: string, items: ShortcutItem[]) {
    if (!items.length) return;
    const resolved = await Promise.all(items.map(async (item) => ({
      id: item.id,
      icon: await resolveIconDataUrl('get_file_icon', item.path).catch(() => ''),
    })));
    const iconMap = new Map(resolved.filter((entry) => entry.icon).map((entry) => [entry.id, entry.icon]));
    if (!iconMap.size) return;

    const current = get().mappedItems[directoryId];
    // 期间可能已经切目录 / 重新扫描，条目对不上就放弃这一轮。
    if (!current || current.length !== items.length) return;
    const next = current.map((entry) => {
      const icon = iconMap.get(entry.id);
      if (!icon || entry.icon === icon) return entry;
      return { ...entry, icon };
    });
    if (!next.some((entry, index) => entry !== current[index])) return;
    set({ mappedItems: { ...get().mappedItems, [directoryId]: next } });
  }

  return {
    refreshMappedFolder: async (directoryId: string) => {
      const root = rootOf(directoryId);
      if (!root) {
        set({
          mappedError: { ...get().mappedError, [directoryId]: '该映射子目录还没有选择文件夹' },
          mappedItems: { ...get().mappedItems, [directoryId]: EMPTY_ITEMS },
        });
        return 0;
      }
      // 已经有一轮在跑时直接复用，避免切目录时反复起 PowerShell。
      if (get().mappedLoading[directoryId]) return get().getMappedItems(directoryId).length;

      set({
        mappedLoading: { ...get().mappedLoading, [directoryId]: true },
        mappedError: { ...get().mappedError, [directoryId]: null },
      });
      try {
        const entries = await listMappedFolder(root);
        const items = mappedEntriesToItems(entries);
        set({
          mappedItems: { ...get().mappedItems, [directoryId]: items },
          mappedLoadedAt: { ...get().mappedLoadedAt, [directoryId]: Date.now() },
          mappedLoading: { ...get().mappedLoading, [directoryId]: false },
          mappedError: { ...get().mappedError, [directoryId]: null },
        });
        void hydrateIcons(directoryId, items);
        return items.length;
      } catch (error) {
        set({
          mappedLoading: { ...get().mappedLoading, [directoryId]: false },
          mappedError: { ...get().mappedError, [directoryId]: String(error) },
        });
        return get().getMappedItems(directoryId).length;
      }
    },

    addToMappedFolder: async (directoryId: string, paths: string[]): Promise<CreateMappedResult> => {
      const clean = paths.map((path) => path.trim()).filter(Boolean);
      const empty: CreateMappedResult = { created: [], skipped: [], errors: [] };
      if (!clean.length) return empty;
      const root = rootOf(directoryId);
      if (!root) return { created: [], skipped: [], errors: ['该映射子目录还没有选择文件夹'] };
      const result = await createMappedShortcuts(root, clean);
      if (result.created.length) await get().refreshMappedFolder(directoryId);
      return result;
    },

    addUrlToMappedFolder: async (directoryId: string, url: string, name: string) => {
      const root = rootOf(directoryId);
      if (!root) throw new Error('该映射子目录还没有选择文件夹');
      const created = await createMappedUrl(root, url, name);
      await get().refreshMappedFolder(directoryId);
      return created;
    },

    removeFromMappedFolder: async (directoryId: string, itemIds: string[]) => {
      const root = rootOf(directoryId);
      if (!root) return 0;
      const paths = pathsFromItemIds(itemIds, get().getMappedItems(directoryId));
      if (!paths.length) return 0;
      const removed = await removeMappedEntries(root, paths);
      if (removed > 0) await get().refreshMappedFolder(directoryId);
      return removed;
    },

    renameMappedItem: async (directoryId: string, itemId: string, name: string) => {
      const root = rootOf(directoryId);
      if (!root) return false;
      const item = get().getMappedItems(directoryId).find((entry) => entry.id === itemId);
      if (!item) return false;
      await renameMappedEntry(root, item.path, name);
      await get().refreshMappedFolder(directoryId);
      return true;
    },

    getMappedItems: (directoryId: string) => get().mappedItems[directoryId] ?? EMPTY_ITEMS,

    findMappedDirectoryIdByItemId: (itemId: string) => {
      if (!isMappedItemId(itemId)) return undefined;
      const groups = get().groups;
      for (const [directoryId, items] of Object.entries(get().mappedItems)) {
        // 子目录已被删掉时跳过，避免命中陈旧缓存。
        if (!findDirectory(groups, directoryId)) continue;
        if (items.some((entry) => entry.id === itemId)) return directoryId;
      }
      return undefined;
    },

    findMappedItemById: (itemId: string) => {
      if (!isMappedItemId(itemId)) return undefined;
      const directoryId = get().findMappedDirectoryIdByItemId(itemId);
      if (!directoryId) return undefined;
      return get().getMappedItems(directoryId).find((entry) => entry.id === itemId);
    },
  };
};
