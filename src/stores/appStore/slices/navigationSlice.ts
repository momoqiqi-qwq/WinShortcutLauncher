import { makeId } from '../../../lib/id';
import { byOrder, reindex } from '../../../lib/sort';
import {
  canPasteDirectoryIntoGroup,
  cloneDirectoryForPaste,
  cloneGroupForPaste,
  snapshotDirectory,
  snapshotGroup,
} from '../../../lib/navigationClipboard';
import type { Directory, Group } from '../../../types';
import { clampCardSize } from '../../../lib/htmlFolder';
import { getFirstDirectory, normalizeGroups } from '../normalizers';
import type { AppSliceCreator, NavigationActions } from '../types';

function withGroupSidebarColumns<T extends { sidebarColumns?: number }>(group: T, columns?: number): T {
  if (columns !== undefined) return { ...group, sidebarColumns: Math.max(1, Math.min(6, Math.round(columns))) };
  const { sidebarColumns: _removed, ...rest } = group;
  return rest as T;
}

/** v147: 父目录 / 子目录 / 项目共用同一套「有颜色就写入、没颜色就删字段」的写法。 */
function withColor<T extends { color?: string }>(target: T, color?: string): T {
  if (color) return { ...target, color };
  const { color: _removed, ...rest } = target;
  return rest as T;
}

/** 在所有父目录的所有子目录里替换某个子目录，同时保持没有命中的父目录引用不变。 */
function mapDirectories(groups: Group[], mapper: (directory: Directory) => Directory): Group[] {
  return groups.map((group) => {
    let changed = false;
    const directories = group.directories.map((directory) => {
      const next = mapper(directory);
      if (next !== directory) changed = true;
      return next;
    });
    return changed ? { ...group, directories } : group;
  });
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
    groups: state.groups.map((group) => group.id === groupId ? withColor(group, color) : group),
  })),
  setGroupColors: (colors) => set((state) => ({
    groups: state.groups.map((group) => (
      Object.prototype.hasOwnProperty.call(colors, group.id)
        ? withColor(group, colors[group.id])
        : group
    )),
  })),
  setDirectoryColor: (directoryId, color) => set((state) => ({
    groups: mapDirectories(state.groups, (directory) => (
      directory.id === directoryId ? withColor(directory, color) : directory
    )),
  })),
  setDirectoryColors: (colors) => set((state) => ({
    groups: mapDirectories(state.groups, (directory) => (
      Object.prototype.hasOwnProperty.call(colors, directory.id)
        ? withColor(directory, colors[directory.id])
        : directory
    )),
  })),
  setItemColor: (itemId, color) => set((state) => ({
    groups: mapDirectories(state.groups, (directory) => {
      if (!directory.items.some((item) => item.id === itemId)) return directory;
      return {
        ...directory,
        items: directory.items.map((item) => (item.id === itemId ? withColor(item, color) : item)),
      };
    }),
  })),
  setItemColors: (colors) => set((state) => ({
    groups: mapDirectories(state.groups, (directory) => {
      if (!directory.items.some((item) => Object.prototype.hasOwnProperty.call(colors, item.id))) return directory;
      return {
        ...directory,
        items: directory.items.map((item) => (
          Object.prototype.hasOwnProperty.call(colors, item.id)
            ? withColor(item, colors[item.id])
            : item
        )),
      };
    }),
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
    const firstNext = getFirstDirectory(nextGroups, { normalized: true });
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
        mode: 'copy',
      },
      itemClipboard: [],
      itemClipboardMode: 'copy',
      selectedNavTarget: { kind: 'directory', id: directoryId },
    });
    return true;
  },
  cutDirectoryToClipboard: (directoryId) => {
    const state = get();
    const group = state.groups.find((entry) => entry.directories.some((directory) => directory.id === directoryId));
    const directory = group?.directories.find((entry) => entry.id === directoryId);
    if (!group || !directory) return false;
    set({
      navigationClipboard: {
        kind: 'directory',
        copiedAt: Date.now(),
        sourceGroupName: group.name,
        // 快照保留原 id：剪切粘贴时按 id 找回真实目录移动，不克隆。
        directory: snapshotDirectory(directory),
        mode: 'cut',
      },
      itemClipboard: [],
      itemClipboardMode: 'copy',
      selectedNavTarget: { kind: 'directory', id: directoryId },
    });
    return true;
  },
  copyGroupToClipboard: (groupId) => {
    const group = get().groups.find((entry) => entry.id === groupId);
    if (!group) return false;
    set({
      navigationClipboard: { kind: 'group', copiedAt: Date.now(), group: snapshotGroup(group), mode: 'copy' },
      itemClipboard: [],
      itemClipboardMode: 'copy',
      selectedNavTarget: { kind: 'group', id: groupId },
    });
    return true;
  },
  cutGroupToClipboard: (groupId) => {
    const group = get().groups.find((entry) => entry.id === groupId);
    if (!group) return false;
    set({
      navigationClipboard: { kind: 'group', copiedAt: Date.now(), group: snapshotGroup(group), mode: 'cut' },
      itemClipboard: [],
      itemClipboardMode: 'copy',
      selectedNavTarget: { kind: 'group', id: groupId },
    });
    return true;
  },
  clearNavigationClipboard: () => set({ navigationClipboard: null }),
  pasteDirectoryToGroup: (groupId) => {
    const state = get();
    const clipboard = state.navigationClipboard;
    const targetGroup = state.groups.find((group) => group.id === groupId);
    if (clipboard?.kind !== 'directory' || !targetGroup) return null;

    // v167: 剪切模式 —— 移动真实目录（保留 id），原父目录里那份要删掉。
    if (clipboard.mode === 'cut') {
      const directoryId = clipboard.directory.id;
      const sourceGroup = state.groups.find((group) => group.directories.some((directory) => directory.id === directoryId));
      if (!sourceGroup) {
        // 源目录已经不在了（被删 / 换配置），剪贴板作废。
        set({ navigationClipboard: null });
        return null;
      }
      if (sourceGroup.id === groupId) return null;
      const moved = get().moveDirectoryToGroup(directoryId, groupId);
      if (!moved) return null;
      set({ navigationClipboard: null });
      return directoryId;
    }

    if (!canPasteDirectoryIntoGroup(clipboard.directory, targetGroup)) return null;
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
  pasteGroupIntoGroupFromClipboard: (targetGroupId) => {
    const state = get();
    const clipboard = state.navigationClipboard;
    if (clipboard?.kind !== 'group') return null;
    const sourceGroupId = clipboard.group.id;
    if (sourceGroupId === targetGroupId) return null;
    if (!state.groups.some((group) => group.id === sourceGroupId)) {
      set({ navigationClipboard: null });
      return null;
    }
    const target = state.groups.find((group) => group.id === targetGroupId);
    if (!target) return null;
    const before = state.groups.length;
    get().mergeGroup(sourceGroupId, targetGroupId);
    // mergeGroup 自己会拒绝「只剩一个父目录」「源或目标不存在」这类情况；没真的合并就不算成功，剪贴板留着。
    if (get().groups.length >= before) return null;
    set({ navigationClipboard: null });
    return targetGroupId;
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
  /**
   * v173: 设置 / 清除 HTML 子目录被扫描的文件夹。
   *
   * 换文件夹要顺手清掉旧页面的缓存，否则卡片会先闪一下上一个目录的内容。
   * `htmlCards` 里按绝对路径记的尺寸不用动 —— 换目录后旧 key 自然不再命中。
   */
  setDirectoryHtmlPath: (directoryId, htmlPath) => {
    const clean = htmlPath.trim();
    set((state) => ({
      groups: state.groups.map((group) => ({
        ...group,
        directories: group.directories.map((directory) => {
          if (directory.id !== directoryId) return directory;
          const next: Directory = { ...directory };
          if (clean) next.htmlPath = clean;
          else delete next.htmlPath;
          return next;
        }),
      })),
    }));
    get().clearHtmlFolder(directoryId);
  },
  /** v173: 记住单个页面卡片被拖出来的尺寸（key 是文件绝对路径）。 */
  setHtmlCardSize: (directoryId, pagePath, size) => {
    const key = pagePath.trim();
    if (!key) return;
    const next = clampCardSize(size);
    set((state) => ({
      groups: state.groups.map((group) => ({
        ...group,
        directories: group.directories.map((directory) => directory.id === directoryId
          ? { ...directory, htmlCards: { ...(directory.htmlCards ?? {}), [key]: next } }
          : directory),
      })),
    }));
  },
  /** v173: 清掉所有单卡尺寸，回到目录默认大小。 */
  resetHtmlCardSizes: (directoryId) => set((state) => ({
    groups: state.groups.map((group) => ({
      ...group,
      directories: group.directories.map((directory) => {
        if (directory.id !== directoryId) return directory;
        const next: Directory = { ...directory };
        delete next.htmlCards;
        return next;
      }),
    })),
  })),
  /** v173: 改 HTML 子目录的显示设置；传 undefined 的字段会被忽略。 */
  updateHtmlView: (directoryId, patch) => {
    const cleaned = Object.fromEntries(
      Object.entries(patch ?? {}).filter(([, value]) => value !== undefined),
    );
    set((state) => ({
      groups: state.groups.map((group) => ({
        ...group,
        directories: group.directories.map((directory) => {
          if (directory.id !== directoryId) return directory;
          const merged = { ...(directory.htmlView ?? {}), ...cleaned };
          const next: Directory = { ...directory };
          if (Object.keys(merged).length > 0) next.htmlView = merged;
          else delete next.htmlView;
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
    const fallbackDir = nextTarget?.directories[0]?.id ?? getFirstDirectory(groups, { normalized: true }).directoryId;
    // 选中项如果正指着被合并掉的那个父目录（或它里面某个子目录），合并后指针要跟着落到目标父目录上，
    // 否则 Ctrl+X / Ctrl+V 会对着一个已经不存在的 id 空转。
    const selectionPointsAtSource = Boolean(
      state.selectedNavTarget
      && (state.selectedNavTarget.id === sourceGroupId
        || source.directories.some((directory) => directory.id === state.selectedNavTarget?.id)),
    );
    return {
      groups,
      activeGroupId: state.activeGroupId === sourceGroupId ? targetGroupId : state.activeGroupId,
      activeDirectoryId: source.directories.some((dir) => dir.id === state.activeDirectoryId)
        ? fallbackDir
        : state.activeDirectoryId,
      selectedNavTarget: selectionPointsAtSource
        ? { kind: 'group' as const, id: targetGroupId }
        : state.selectedNavTarget,
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
