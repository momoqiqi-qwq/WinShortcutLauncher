import { makeId } from '../../../lib/id';
import { byOrder, reindex } from '../../../lib/sort';
import type { Directory } from '../../../types';
import { getFirstDirectory, normalizeGroups } from '../normalizers';
import type { AppSliceCreator, NavigationActions } from '../types';

function withGroupColor<T extends { color?: string }>(group: T, color?: string): T {
  if (color) return { ...group, color };
  const { color: _removed, ...rest } = group;
  return rest as T;
}

export const createNavigationSlice: AppSliceCreator<NavigationActions> = (set, get) => ({
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setActiveGroup: (groupId) => set((state) => {
    const group = state.groups.find((item) => item.id === groupId);
    return {
      activeGroupId: groupId,
      activeDirectoryId: group?.directories.slice().sort(byOrder)[0]?.id ?? state.activeDirectoryId,
      selectedItemIds: [],
      selectedNavTarget: { kind: 'group', id: groupId },
    };
  }),
  setActiveDirectory: (directoryId) => set({
    activeDirectoryId: directoryId,
    selectedItemIds: [],
    selectedNavTarget: { kind: 'directory', id: directoryId },
  }),
  renameGroup: (groupId, name) => set((state) => ({
    groups: state.groups.map((group) => (group.id === groupId ? { ...group, name } : group)),
  })),
  setGroupColor: (groupId, color) => set((state) => ({
    groups: state.groups.map((group) => group.id === groupId ? withGroupColor(group, color) : group),
  })),
  setGroupColors: (colors) => set((state) => ({
    groups: state.groups.map((group) => (
      Object.prototype.hasOwnProperty.call(colors, group.id)
        ? withGroupColor(group, colors[group.id])
        : group
    )),
  })),
  setGroupBrowserRoute: (groupId, route) => set((state) => ({
    groups: state.groups.map((group) => group.id === groupId ? { ...group, browserRoute: route } : group),
  })),
  renameDirectory: (directoryId, name) => set((state) => ({
    groups: state.groups.map((group) => ({
      ...group,
      directories: group.directories.map((dir) => (dir.id === directoryId ? { ...dir, name } : dir)),
    })),
  })),
  deleteGroup: (groupId) => set((state) => {
    if (state.groups.length <= 1) return state;
    const nextGroups = normalizeGroups(state.groups.filter((group) => group.id !== groupId));
    const firstNext = getFirstDirectory(nextGroups);
    return {
      groups: nextGroups,
      activeGroupId: state.activeGroupId === groupId ? firstNext.groupId : state.activeGroupId,
      activeDirectoryId: state.activeGroupId === groupId ? firstNext.directoryId : state.activeDirectoryId,
      selectedItemIds: [],
      selectedNavTarget: null,
    };
  }),
  deleteDirectory: (directoryId) => set((state) => {
    let nextActiveGroupId = state.activeGroupId;
    let nextActiveDirectoryId = state.activeDirectoryId;
    const groups = state.groups.map((group) => {
      if (!group.directories.some((dir) => dir.id === directoryId)) return group;
      if (group.directories.length <= 1) return group;
      const directories = normalizeGroups([
        { ...group, directories: group.directories.filter((dir) => dir.id !== directoryId) },
      ])[0].directories;
      if (state.activeDirectoryId === directoryId) {
        nextActiveGroupId = group.id;
        nextActiveDirectoryId = directories[0].id;
      }
      return { ...group, directories };
    });
    return {
      groups,
      activeGroupId: nextActiveGroupId,
      activeDirectoryId: nextActiveDirectoryId,
      selectedItemIds: [],
      selectedNavTarget: null,
    };
  }),
  reorderGroups: (groupIds) => set((state) => ({
    groups: groupIds
      .map((id, index) => {
        const group = state.groups.find((entry) => entry.id === id);
        return group ? { ...group, order: index } : undefined;
      })
      .filter(Boolean) as typeof state.groups,
  })),
  reorderDirectories: (groupId, directoryIds) => set((state) => ({
    groups: state.groups.map((group) => {
      if (group.id !== groupId) return group;
      return {
        ...group,
        directories: directoryIds
          .map((id, index) => {
            const dir = group.directories.find((entry) => entry.id === id);
            return dir ? { ...dir, order: index } : undefined;
          })
          .filter(Boolean) as typeof group.directories,
      };
    }),
  })),
  setSelectedNavTarget: (selectedNavTarget) => set({ selectedNavTarget, selectedItemIds: [] }),
  addDirectory: (groupId, name, kind = 'normal') => {
    const directoryId = makeId('dir');
    set((state) => ({
      groups: state.groups.map((group) =>
        group.id === groupId
          ? {
              ...group,
              directories: [
                ...group.directories,
                {
                  id: directoryId,
                  name,
                  order: group.directories.length,
                  kind,
                  items: [],
                  note: kind === 'notes' ? '' : undefined,
                },
              ],
            }
          : group,
      ),
    }));
    return directoryId;
  },
  addGroup: (name) => set((state) => ({
    groups: [
      ...state.groups,
      {
        id: makeId('group'),
        name,
        order: state.groups.length,
        directories: [{ id: makeId('dir'), name: '常用', order: 0, kind: 'normal', items: [] }],
      },
    ],
  })),
  mergeGroup: (sourceGroupId, targetGroupId) => set((state) => {
    if (sourceGroupId === targetGroupId || state.groups.length <= 1) return state;
    const source = state.groups.find((group) => group.id === sourceGroupId);
    const target = state.groups.find((group) => group.id === targetGroupId);
    if (!source || !target) return state;
    const movedDirectories = source.directories.map((dir, index) => ({
      ...dir,
      id: makeId('dir'),
      order: target.directories.length + index,
    }));
    const groups = normalizeGroups(
      state.groups
        .filter((group) => group.id !== sourceGroupId)
        .map((group) =>
          group.id === targetGroupId
            ? { ...group, directories: [...group.directories, ...movedDirectories] }
            : group,
        ),
    );
    const nextTarget = groups.find((group) => group.id === targetGroupId);
    const fallbackDir = nextTarget?.directories[0]?.id ?? getFirstDirectory(groups).directoryId;
    return {
      groups,
      activeGroupId: state.activeGroupId === sourceGroupId ? targetGroupId : state.activeGroupId,
      activeDirectoryId: source.directories.some((dir) => dir.id === state.activeDirectoryId)
        ? fallbackDir
        : state.activeDirectoryId,
      selectedItemIds: [],
    };
  }),
  mergeDirectory: (sourceDirectoryId, targetDirectoryId) => set((state) => {
    if (sourceDirectoryId === targetDirectoryId) return state;
    let sourceDirectory: Directory | undefined;
    let targetGroupId = '';
    let targetDirectory: Directory | undefined;
    for (const group of state.groups) {
      const maybeSource = group.directories.find((dir) => dir.id === sourceDirectoryId);
      const maybeTarget = group.directories.find((dir) => dir.id === targetDirectoryId);
      if (maybeSource) sourceDirectory = maybeSource;
      if (maybeTarget) {
        targetDirectory = maybeTarget;
        targetGroupId = group.id;
      }
    }
    if (
      !sourceDirectory ||
      !targetDirectory ||
      (sourceDirectory.kind ?? 'normal') === 'all' ||
      (targetDirectory.kind ?? 'normal') === 'all'
    ) return state;
    const sourceKind = sourceDirectory.kind ?? 'normal';
    const targetKind = targetDirectory.kind ?? 'normal';
    if (sourceKind !== targetKind) return state;
    return {
      groups: state.groups.map((group) => {
        if (!group.directories.some((dir) => dir.id === sourceDirectoryId || dir.id === targetDirectoryId)) {
          return group;
        }
        const directories = group.directories
          .map((dir) => {
            if (dir.id !== targetDirectoryId) return dir;
            if (targetKind === 'notes') {
              const mergedNote = [dir.note ?? '', sourceDirectory?.note ?? '']
                .filter((part) => part.trim())
                .join('\n\n--- 合并内容 ---\n\n');
              return { ...dir, note: mergedNote };
            }
            return {
              ...dir,
              items: reindex([
                ...(dir.items ?? []),
                ...(sourceDirectory?.items ?? []).map((item) => ({ ...item, id: makeId('item') })),
              ]),
            };
          })
          .filter((dir) => dir.id !== sourceDirectoryId);
        return { ...group, directories: reindex(directories) };
      }),
      activeGroupId: state.activeDirectoryId === sourceDirectoryId ? targetGroupId : state.activeGroupId,
      activeDirectoryId: state.activeDirectoryId === sourceDirectoryId ? targetDirectoryId : state.activeDirectoryId,
      selectedItemIds: [],
      selectedNavTarget: null,
    };
  }),
  setDirectoryKind: (directoryId, kind) => set((state) => ({
    groups: state.groups.map((group) => ({
      ...group,
      directories: group.directories.map((dir) =>
        dir.id === directoryId
          ? { ...dir, kind, note: kind === 'notes' ? dir.note ?? '' : dir.note }
          : dir,
      ),
    })),
  })),
  getActiveGroup: () => get().groups.find((group) => group.id === get().activeGroupId),
  getActiveDirectory: () => get().getActiveGroup()?.directories.find((dir) => dir.id === get().activeDirectoryId),
});
