import { resolveIconDataUrl } from '../../../lib/iconCache';
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
   * 补齐开始菜单条目的图标。走 iconCache（有内存 + 持久化两级缓存），
   * 全部解析完再一次性合并，避免几十次 setState 触发几十次重渲染。
   */
  async function hydrateStartMenuIcons(items: ShortcutItem[]) {
    if (!items.length) return;
    const resolved = await Promise.all(items.map(async (item) => ({
      id: item.id,
      icon: await resolveIconDataUrl('get_file_icon', item.path).catch(() => ''),
    })));
    const iconMap = new Map(resolved.filter((entry) => entry.icon).map((entry) => [entry.id, entry.icon]));
    if (!iconMap.size) return;
    const current = get().startMenuItems;
    const next = current.map((entry) => {
      const icon = iconMap.get(entry.id);
      if (!icon || entry.icon === icon) return entry;
      return { ...entry, icon };
    });
    if (next.some((entry, index) => entry !== current[index])) set({ startMenuItems: next });
  }

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
        void hydrateStartMenuIcons(items);
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
