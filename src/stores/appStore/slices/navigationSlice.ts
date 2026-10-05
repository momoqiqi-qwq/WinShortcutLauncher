import { makeId } from '../../../lib/id';
import { byOrder, reindex } from '../../../lib/sort';
import {
  canPasteDirectoryIntoGroup,
  cloneDirectoryForPaste,
  cloneGroupForPaste,
  snapshotDirectory,
  snapshotGroup,
} from '../../../lib/navigationClipboard';
import type { Directory } from '../../../types';
import { getFirstDirectory, normalizeGroups } from '../normalizers';
import type { AppSliceCreator, NavigationActions } from '../types';

function withGroupSidebarColumns<T extends { sidebarColumns?: number }>(group: T, columns?: number): T {
  if (columns !== undefined) return { ...group, sidebarColumns: Math.max(1, Math.min(6, Math.round(columns))) };
  const { sidebarColumns: _removed, ...rest } = group;
  return rest as T;
}

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
      multiSelectMode: false,
      selectedNavTarget: { kind: 'group', id: groupId },
    };
  }),
  setActiveDirectory: (directoryId) => set({
    activeDirectoryId: directoryId,
    selectedItemIds: [],
    multiSelectMode: false,
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
  setGroupSidebarColumns: (groupId, columns) => set((state) => ({
    groups: state.groups.map((group) => group.id === groupId ? withGroupSidebarColumns(group, columns) : group),
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
      multiSelectMode: false,
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
      multiSelectMode: false,
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
  setSelectedNavTarget: (selectedNavTarget) => set({ selectedNavTarget, selectedItemIds: [], multiSelectMode: false }),
  copyDirectoryToClipboard: (directoryId) => {
    const state = get();
    const group = state.groups.find((entry) => entry.directories.some((directory) => directory.id === directoryId));
    const directory = group?.directories.find((entry) => entry.id === directoryId);
    if (!group || !directory) return false;
    set({
      navigationClipboard: {
        kind: 'directory',
        copiedAt: Date.now(),
        sourceGroupName: group.name,
        directory: snapshotDirectory(directory),
      },
      itemClipboard: [],
      selectedNavTarget: { kind: 'directory', id: directoryId },
    });
    return true;
  },
  copyGroupToClipboard: (groupId) => {
    const group = get().groups.find((entry) => entry.id === groupId);
    if (!group) return false;
    set({
      navigationClipboard: { kind: 'group', copiedAt: Date.now(), group: snapshotGroup(group) },
      itemClipboard: [],
      selectedNavTarget: { kind: 'group', id: groupId },
    });
    return true;
  },
  clearNavigationClipboard: () => set({ navigationClipboard: null }),
  pasteDirectoryToGroup: (groupId) => {
    const state = get();
    const clipboard = state.navigationClipboard;
    const targetGroup = state.groups.find((group) => group.id === groupId);
    if (clipboard?.kind !== 'directory' || !targetGroup || !canPasteDirectoryIntoGroup(clipboard.directory, targetGroup)) return null;
    const directory = cloneDirectoryForPaste(
      clipboard.directory,
      targetGroup.directories.length,
      targetGroup.directories.map((entry) => entry.name),
    );
    set((current) => ({
      groups: current.groups.map((group) => group.id === groupId
        ? { ...group, directories: reindex([...group.directories.slice().sort(byOrder), directory]) }
        : group),
      activeGroupId: groupId,
      activeDirectoryId: directory.id,
      selectedItemIds: [],
      multiSelectMode: false,
      selectedNavTarget: { kind: 'directory', id: directory.id },
    }));
    return directory.id;
  },
  pasteGroupFromClipboard: () => {
    const state = get();
    const clipboard = state.navigationClipboard;
    if (clipboard?.kind !== 'group') return null;
    const group = cloneGroupForPaste(
      clipboard.group,
      state.groups.length,
      state.groups.map((entry) => entry.name),
    );
    const firstDirectoryId = group.directories.slice().sort(byOrder)[0]?.id;
    if (!firstDirectoryId) return null;
    set((current) => ({
      groups: reindex([...current.groups.slice().sort(byOrder), group]),
      activeGroupId: group.id,
      activeDirectoryId: firstDirectoryId,
      selectedItemIds: [],
      multiSelectMode: false,
      selectedNavTarget: { kind: 'group', id: group.id },
    }));
    return group.id;
  },
  moveDirectoryToGroup: (directoryId, targetGroupId) => {
    const state = get();
    const sourceGroup = state.groups.find((group) => group.directories.some((directory) => directory.id === directoryId));
    const targetGroup = state.groups.find((group) => group.id === targetGroupId);
    const sourceDirectory = sourceGroup?.directories.find((directory) => directory.id === directoryId);
    if (!sourceGroup || !targetGroup || !sourceDirectory || sourceGroup.id === targetGroup.id) return false;
    if (!canPasteDirectoryIntoGroup(sourceDirectory, targetGroup)) return false;

    set((current) => ({
      groups: current.groups.map((group) => {
        if (group.id === sourceGroup.id) {
          const remaining = group.directories.filter((directory) => directory.id !== directoryId).slice().sort(byOrder);
          const nextDirectories = remaining.length > 0
            ? remaining
            : [{ id: makeId('dir'), name: '常用', order: 0, kind: 'normal' as const, items: [] }];
          return { ...group, directories: reindex(nextDirectories) };
        }
        if (group.id === targetGroup.id) {
          return {
            ...group,
            directories: reindex([
              ...group.directories.slice().sort(byOrder),
              { ...sourceDirectory, order: group.directories.length },
            ]),
          };
        }
        return group;
      }),
      activeGroupId: current.activeDirectoryId === directoryId ? targetGroup.id : current.activeGroupId,
      activeDirectoryId: current.activeDirectoryId,
      selectedItemIds: [],
      multiSelectMode: false,
      selectedNavTarget: current.selectedNavTarget?.kind === 'directory' && current.selectedNavTarget.id === directoryId
        ? { kind: 'directory' as const, id: directoryId }
        : current.selectedNavTarget,
    }));
    return true;
  },
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
  /**
   * 设置 / 清除映射子目录被镜像的文件夹。
   *
   * 传空串表示清除（该映射子目录会变成「未选择文件夹」状态，内容区提示重新选择）。
   */
  setDirectoryMappedPath: (directoryId, mappedPath) => {
    const clean = mappedPath.trim();
    set((state) => ({
      groups: state.groups.map((group) => ({
        ...group,
        directories: group.directories.map((directory) => {
          if (directory.id !== directoryId) return directory;
          const next: Directory = { ...directory };
          if (clean) next.mappedPath = clean;
          else delete next.mappedPath;
          return next;
        }),
      })),
    }));
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
      multiSelectMode: false,
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
      multiSelectMode: false,
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
