import { cloneShortcutItemsForCopy, snapshotShortcutItems } from '../../../lib/itemCopy';
import { reindex, sortShortcutItemsForStorage } from '../../../lib/sort';
import type { Group, ShortcutItem } from '../../../types';
import type { AppSliceCreator, ItemActions } from '../types';
import { cleanDisplayPatch } from '../normalizers';

function collectItemsByIds(groups: readonly Group[], itemIds: readonly string[]): ShortcutItem[] {
  const uniqueIds = Array.from(new Set(itemIds.filter(Boolean)));
  if (!uniqueIds.length) return [];
  const wanted = new Set(uniqueIds);
  const found = new Map<string, ShortcutItem>();
  for (const group of groups) {
    for (const directory of group.directories) {
      for (const item of directory.items) {
        if (!wanted.has(item.id) || found.has(item.id)) continue;
        found.set(item.id, item);
        if (found.size === wanted.size) break;
      }
      if (found.size === wanted.size) break;
    }
    if (found.size === wanted.size) break;
  }
  return uniqueIds.map((id) => found.get(id)).filter(Boolean) as ShortcutItem[];
}

export const createItemSlice: AppSliceCreator<ItemActions> = (set, get) => ({
  reorderItems: (directoryId, itemIds) => set((state) => ({
    groups: state.groups.map((group) => ({
      ...group,
      directories: group.directories.map((dir) => {
        if (dir.id !== directoryId || (dir.kind ?? 'normal') !== 'normal') return dir;
        const items = itemIds
          .map((id, index) => {
            const item = dir.items.find((entry) => entry.id === id);
            return item ? { ...item, order: index } : undefined;
          })
          .filter(Boolean) as typeof dir.items;
        return { ...dir, items };
      }),
    })),
  })),
  selectItem: (itemId, append = false) => set((state) => {
    if (!append) return { selectedItemIds: [itemId], selectedNavTarget: null };
    const exists = state.selectedItemIds.includes(itemId);
    return {
      selectedItemIds: exists
        ? state.selectedItemIds.filter((id) => id !== itemId)
        : [...state.selectedItemIds, itemId],
      selectedNavTarget: null,
    };
  }),
  selectItems: (itemIds, append = false) => set((state) => {
    const cleanIds = Array.from(new Set(itemIds.filter(Boolean)));
    if (!append) return { selectedItemIds: cleanIds, selectedNavTarget: null };
    return {
      selectedItemIds: Array.from(new Set([...state.selectedItemIds, ...cleanIds])),
      selectedNavTarget: null,
    };
  }),
  beginMultiSelect: (itemId) => set((state) => ({
    multiSelectMode: true,
    selectedItemIds: itemId
      ? Array.from(new Set([...state.selectedItemIds, itemId]))
      : state.selectedItemIds,
    selectedNavTarget: null,
  })),
  finishMultiSelect: () => set({ multiSelectMode: false, selectedItemIds: [] }),
  clearSelection: () => set({ selectedItemIds: [], multiSelectMode: false }),
  setItemLabelLines: (itemId, lines) => set((state) => ({
    groups: state.groups.map((group) => ({
      ...group,
      directories: group.directories.map((dir) => ({
        ...dir,
        items: dir.items.map((item) => (item.id === itemId ? { ...item, labelLines: lines } : item)),
      })),
    })),
  })),
  applyDisplayToAllItems: (lines) => set((state) => {
    const nextLines = lines ?? state.display.labelLines;
    return {
      groups: state.groups.map((group) => ({
        ...group,
        directories: group.directories.map((dir) => ({
          ...dir,
          items: dir.items.map((item) => ({ ...item, labelLines: nextLines })),
        })),
      })),
    };
  }),
  addItems: (groupId, directoryId, items) => set((state) => ({
    groups: state.groups.map((group) =>
      group.id === groupId
        ? {
            ...group,
            directories: group.directories.map((dir) =>
              dir.id === directoryId
                ? { ...dir, kind: dir.kind ?? 'normal', items: reindex([...dir.items, ...items]) }
                : dir,
            ),
          }
        : group,
    ),
  })),
  clearDirectoryItems: (directoryId) => set((state) => ({
    selectedItemIds: [],
    groups: state.groups.map((group) => ({
      ...group,
      directories: group.directories.map((dir) => (dir.id === directoryId ? { ...dir, items: [] } : dir)),
    })),
  })),
  sortDirectoryItems: (directoryId, mode) => set((state) => ({
    groups: state.groups.map((group) => ({
      ...group,
      directories: group.directories.map((dir) =>
        dir.id === directoryId
          ? {
              ...dir,
              display: cleanDisplayPatch({ ...(dir.display ?? {}), sortMode: mode }),
              items: sortShortcutItemsForStorage(dir.items, mode),
            }
          : dir,
      ),
    })),
  })),
  deleteSelectedItems: () => set((state) => {
    const ids = new Set(state.selectedItemIds);
    return {
      selectedItemIds: [],
      groups: state.groups.map((group) => ({
        ...group,
        directories: group.directories.map((dir) => ({
          ...dir,
          items: reindex(dir.items.filter((item) => !ids.has(item.id))),
        })),
      })),
    };
  }),
  deleteItemsByIds: (itemIds) => {
    const ids = new Set(itemIds.filter(Boolean));
    if (!ids.size) return 0;
    let removed = 0;
    set((state) => ({
      selectedItemIds: state.selectedItemIds.filter((id) => !ids.has(id)),
      groups: state.groups.map((group) => ({
        ...group,
        directories: group.directories.map((dir) => {
          const next = dir.items.filter((item) => !ids.has(item.id));
          removed += dir.items.length - next.length;
          return next.length === dir.items.length ? dir : { ...dir, items: reindex(next) };
        }),
      })),
    }));
    return removed;
  },
  updateItem: (itemId, patch) => set((state) => ({
    groups: state.groups.map((group) => ({
      ...group,
      directories: group.directories.map((dir) => ({
        ...dir,
        items: dir.items.map((item) => (item.id === itemId ? { ...item, ...patch } : item)),
      })),
    })),
  })),
  copyItemToDirectory: (itemId, directoryId) => {
    get().copyItemsToDirectory([itemId], directoryId);
  },
  copyItemsToDirectory: (itemIds, directoryId) => {
    const sources = collectItemsByIds(get().groups, itemIds);
    if (!sources.length) return 0;
    let copied = 0;
    set((state) => ({
      groups: state.groups.map((group) => ({
        ...group,
        directories: group.directories.map((dir) => {
          if (dir.id !== directoryId || (dir.kind ?? 'normal') !== 'normal') return dir;
          const copies = cloneShortcutItemsForCopy(sources, dir.items.length);
          copied = copies.length;
          return { ...dir, items: reindex([...dir.items, ...copies]) };
        }),
      })),
    }));
    return copied;
  },
  moveItemToDirectory: (itemId, directoryId) => set((state) => {
    const item = get().getItemById(itemId);
    if (!item) return state;
    const sourceDirectory = state.groups
      .flatMap((group) => group.directories)
      .find((dir) => dir.items.some((entry) => entry.id === itemId));
    if (sourceDirectory?.id === directoryId) return state;
    return {
      selectedItemIds: state.selectedItemIds.filter((id) => id !== itemId),
      groups: state.groups.map((group) => ({
        ...group,
        directories: group.directories.map((dir) => {
          if (dir.items.some((entry) => entry.id === itemId)) {
            return { ...dir, items: reindex(dir.items.filter((entry) => entry.id !== itemId)) };
          }
          if (dir.id === directoryId) {
            return { ...dir, items: reindex([...dir.items, { ...item, order: dir.items.length }]) };
          }
          return dir;
        }),
      })),
    };
  }),
  duplicateItem: (itemId) => set((state) => {
    let duplicated = false;
    return {
      groups: state.groups.map((group) => ({
        ...group,
        directories: group.directories.map((dir) => {
          const index = dir.items.findIndex((item) => item.id === itemId);
          if (index < 0 || duplicated) return dir;
          duplicated = true;
          const source = dir.items[index];
          const [copy] = cloneShortcutItemsForCopy(
            [source],
            index + 1,
            (entry) => `${entry.name} - 副本`,
          );
          copy.pinned = false;
          const next = [...dir.items.slice(0, index + 1), copy, ...dir.items.slice(index + 1)];
          return { ...dir, items: reindex(next) };
        }),
      })),
    };
  }),
  copyItemsToClipboard: (itemIds) => {
    const sources = collectItemsByIds(get().groups, itemIds);
    const items = snapshotShortcutItems(sources);
    set({ itemClipboard: items, navigationClipboard: null });
    return items.length;
  },
  pasteItemsToDirectory: (directoryId) => {
    const clipboard = get().itemClipboard;
    if (!clipboard.length) return 0;
    let pasted = 0;
    set((state) => ({
      groups: state.groups.map((group) => ({
        ...group,
        directories: group.directories.map((dir) => {
          if (dir.id !== directoryId || (dir.kind ?? 'normal') !== 'normal') return dir;
          const copies = cloneShortcutItemsForCopy(clipboard, dir.items.length);
          pasted = copies.length;
          return { ...dir, items: reindex([...dir.items, ...copies]) };
        }),
      })),
      selectedItemIds: [],
    }));
    return pasted;
  },
  clearItemClipboard: () => set({ itemClipboard: [] }),
  recordItemLaunch: (itemId) => set((state) => ({
    groups: state.groups.map((group) => ({
      ...group,
      directories: group.directories.map((dir) => ({
        ...dir,
        items: dir.items.map((item) =>
          item.id === itemId
            ? {
                ...item,
                launchCount: Math.max(0, item.launchCount ?? 0) + 1,
                lastLaunchedAt: Date.now(),
              }
            : item,
        ),
      })),
    })),
  })),
  clearLaunchStats: () => set((state) => ({
    groups: state.groups.map((group) => ({
      ...group,
      directories: group.directories.map((dir) => ({
        ...dir,
        items: dir.items.map((item) => ({ ...item, launchCount: 0, lastLaunchedAt: undefined })),
      })),
    })),
  })),
  getItemById: (itemId) => {
    for (const group of get().groups) {
      for (const dir of group.directories) {
        const found = dir.items.find((item) => item.id === itemId);
        if (found) return found;
      }
    }
    return undefined;
  },
});
