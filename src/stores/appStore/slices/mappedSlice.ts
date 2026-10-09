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

/**
 * 映射文件夹子目录的运行时切片。
 *
 * **这里刻意不预取图标。** 早先的实现在每次扫描完之后，会对**全部**条目
 * 各发一次 `get_file_icon`；而那个命令以前是同步命令（跑在 Tauri 主线程上）
 * 且每个图标都要起一个 `powershell.exe`。映射目录列的是根目录里的
 * **全部文件与文件夹**，几十上百个条目就等于把界面冻结几十秒 —— 这就是
 * 「映射文件夹卡顿」的直接来源。
 *
 * 现在图标交给 `ItemCard` 自己按视口懒加载（IntersectionObserver + 320px 预取边距，
 * 走 `iconCache` 的内存 / 持久化两级缓存），只有真正滚到眼前的条目才会去取图标。
 */
export const createMappedSlice: AppSliceCreator<MappedActions> = (set, get) => {
  /** 取某个映射子目录的根路径；不是映射目录或还没配路径时返回空串。 */
  function rootOf(directoryId: string): string {
    const directory = findDirectory(get().groups, directoryId);
    return isMappedDirectory(directory) ? getMappedPath(directory) : '';
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
      // 已经有一轮在跑时直接复用，避免切目录时反复扫盘。
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
