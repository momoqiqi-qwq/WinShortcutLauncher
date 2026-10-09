import {
  createStartMenuShortcuts,
  createStartMenuUrl,
  getStartMenuFolder,
  isStartMenuItemId,
  listStartMenuShortcuts,
  removeStartMenuShortcuts,
  renameStartMenuShortcut,
  startMenuEntriesToItems,
  type CreateStartMenuResult,
} from '../../../lib/startMenu';
import type { ShortcutItem } from '../../../types';
import type { AppSliceCreator, StartMenuActions } from '../types';

function pathsFromItemIds(itemIds: string[], items: ShortcutItem[]): string[] {
  const wanted = new Set(itemIds.filter(Boolean));
  return items.filter((item) => wanted.has(item.id)).map((item) => item.path);
}

export const createStartMenuSlice: AppSliceCreator<StartMenuActions> = (set, get) => {
  /**
   * 与映射文件夹同理：**这里不预取图标**。
   *
   * 批量预取会让每个条目各发一次 `get_file_icon`，而那个命令以前是同步命令
   * （跑在主线程）且每个图标要起一个 PowerShell 进程。图标现在由 `ItemCard`
   * 按视口懒加载，走 `iconCache` 的两级缓存。
   */
  return {
    refreshStartMenu: async () => {
      // 已经有一轮在跑时直接复用，避免切目录时反复起 PowerShell。
      if (get().startMenuLoading) return get().startMenuItems.length;
      set({ startMenuLoading: true, startMenuError: null });
      try {
        const [folder, entries] = await Promise.all([getStartMenuFolder(), listStartMenuShortcuts()]);
        const items = startMenuEntriesToItems(entries);
        set({
          startMenuItems: items,
          startMenuFolder: folder,
          startMenuLoadedAt: Date.now(),
          startMenuLoading: false,
          startMenuError: null,
        });
        return items.length;
      } catch (error) {
        set({ startMenuLoading: false, startMenuError: String(error) });
        return get().startMenuItems.length;
      }
    },

    addToStartMenu: async (paths: string[]): Promise<CreateStartMenuResult> => {
      const clean = paths.map((path) => path.trim()).filter(Boolean);
      if (!clean.length) return { created: [], skipped: [], errors: [] };
      const result = await createStartMenuShortcuts(clean);
      if (result.created.length) await get().refreshStartMenu();
      return result;
    },

    addUrlToStartMenu: async (url: string, name: string) => {
      const created = await createStartMenuUrl(url, name);
      await get().refreshStartMenu();
      return created;
    },

    removeFromStartMenu: async (itemIds: string[]) => {
      const paths = pathsFromItemIds(itemIds, get().startMenuItems);
      if (!paths.length) return 0;
      const removed = await removeStartMenuShortcuts(paths);
      if (removed > 0) await get().refreshStartMenu();
      return removed;
    },

    renameStartMenuItem: async (itemId: string, name: string) => {
      const item = get().startMenuItems.find((entry) => entry.id === itemId);
      if (!item) return false;
      await renameStartMenuShortcut(item.path, name);
      await get().refreshStartMenu();
      return true;
    },

    getStartMenuItemById: (itemId: string) => {
      if (!isStartMenuItemId(itemId)) return undefined;
      return get().startMenuItems.find((entry) => entry.id === itemId);
    },
  };
};
