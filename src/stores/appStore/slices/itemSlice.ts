import { makeId } from '../../../lib/id';
import { reindex, sortShortcutItemsForStorage } from '../../../lib/sort';
import type { AppSliceCreator, ItemActions } from '../types';
import { cleanDisplayPatch } from '../normalizers';

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
  clearSelection: () => set({ selectedItemIds: [] }),
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
  updateItem: (itemId, patch) => set((state) => ({
    groups: state.groups.map((group) => ({
      ...group,
      directories: group.directories.map((dir) => ({
        ...dir,
        items: dir.items.map((item) => (item.id === itemId ? { ...item, ...patch } : item)),
      })),
    })),
  })),
  copyItemToDirectory: (itemId, directoryId) => set((state) => {
    const item = get().getItemById(itemId);
    if (!item) return state;
    return {
      groups: state.groups.map((group) => ({
        ...group,
        directories: group.directories.map((dir) =>
          dir.id === directoryId
            ? { ...dir, items: reindex([...dir.items, { ...item, id: makeId('item'), order: dir.items.length }]) }
            : dir,
        ),
      })),
    };
  }),
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
          const copy = {
            ...source,
            id: makeId('item'),
            name: `${source.name} - 副本`,
            pinned: false,
            launchCount: 0,
            lastLaunchedAt: undefined,
            order: index + 1,
          };
          const next = [...dir.items.slice(0, index + 1), copy, ...dir.items.slice(index + 1)];
          return { ...dir, items: reindex(next) };
        }),
      })),
    };
  }),
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
