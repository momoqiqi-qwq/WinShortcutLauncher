import type { Directory, DirectoryLinkRef, Group } from '../../../types';
import { makeId } from '../../../lib/id';
import { syncDirectoryLinks, invalidateLinkSourceCache } from '../../../lib/linkSyncRunner';
import { LINK_PENDING_PREFIX } from '../../../lib/directoryLinks';
import type { AppSliceCreator, LinkActions } from '../types';

/** 新建出来的链接先用占位名，第一次同步就会被源的名字替换掉。 */
const LINK_DIRECTORY_PLACEHOLDER = '链接子目录';
const LINK_GROUP_PLACEHOLDER = '链接父目录';

function patchLink<T extends Group | Directory>(target: T, ref: DirectoryLinkRef): T {
  return { ...target, link: { ...ref } };
}

/**
 * v169: 「链接子目录 / 链接父目录」的写操作。
 *
 * 链接本身只存一个来源指针（配置 id + 父目录 id +【子目录 id】），内容由
 * `lib/directoryLinks.ts` 的 `applyLinkSources` 物化进 `groups`，所以：
 * - 渲染层（侧边栏 / 标签页 / 内容区 / 启动项目）不需要任何改动；
 * - 内容的同步、跨配置读取，都收敛在 `linkSyncRunner` 里。
 */
export const createLinkSlice: AppSliceCreator<LinkActions> = (set, get) => {
  const runSync = () => { void syncDirectoryLinks(); };

  return {
    addLinkedDirectory: (groupId, ref) => {
      const group = get().groups.find((entry) => entry.id === groupId);
      if (!group) return null;
      const directoryId = makeId('linkdir-owner');
      set((state) => ({
        groups: state.groups.map((entry) => (
          entry.id === groupId
            ? {
              ...entry,
              directories: [
                ...entry.directories,
                patchLink<Directory>({
                  id: directoryId,
                  name: LINK_DIRECTORY_PLACEHOLDER,
                  order: entry.directories.length,
                  kind: 'link',
                  items: [],
                }, ref),
              ],
            }
            : entry
        )),
      }));
      invalidateLinkSourceCache();
      runSync();
      return directoryId;
    },

    addLinkedGroup: (ref) => {
      const groupId = makeId('linkgroup-owner');
      set((state) => ({
        groups: [
          ...state.groups,
          patchLink<Group>({
            id: groupId,
            name: LINK_GROUP_PLACEHOLDER,
            order: state.groups.length,
            // 先放一个占位子目录，避免「空父目录」在同步到达前被判成异常。
            directories: [{
              id: `${LINK_PENDING_PREFIX}${groupId}`,
              name: '等待同步',
              order: 0,
              kind: 'normal',
              items: [],
            }],
          }, ref),
        ],
      }));
      invalidateLinkSourceCache();
      runSync();
      return groupId;
    },

    setLinkedSource: (scope, ref) => {
      const groups = get().groups;
      const target = scope.kind === 'group'
        ? groups.find((group) => group.id === scope.id)
        : groups.find((group) => group.directories.some((dir) => dir.id === scope.id));
      if (!target) return false;
      set((state) => ({
        groups: state.groups.map((group) => {
          if (scope.kind === 'group') {
            return group.id === scope.id ? patchLink(group, ref) : group;
          }
          if (!group.directories.some((dir) => dir.id === scope.id)) return group;
          return {
            ...group,
            directories: group.directories.map((dir) => (
              dir.id === scope.id ? patchLink(dir, ref) : dir
            )),
          };
        }),
      }));
      invalidateLinkSourceCache();
      runSync();
      return true;
    },

    detachLink: (scope) => {
      const apply = <T extends Group | Directory>(entity: T): T => {
        const next = { ...entity };
        delete next.link;
        if ((next as Directory).kind === 'link') (next as Directory).kind = 'normal';
        return next;
      };
      const groups = get().groups;
      const exists = scope.kind === 'group'
        ? groups.some((group) => group.id === scope.id)
        : groups.some((group) => group.directories.some((dir) => dir.id === scope.id));
      if (!exists) return false;
      set((state) => ({
        groups: state.groups.map((group) => {
          if (scope.kind === 'group') {
            return group.id === scope.id ? apply(group) : group;
          }
          if (!group.directories.some((dir) => dir.id === scope.id)) return group;
          return {
            ...group,
            directories: group.directories.map((dir) => (dir.id === scope.id ? apply(dir) : dir)),
          };
        }),
      }));
      return true;
    },

    syncLinks: async () => {
      invalidateLinkSourceCache();
      await syncDirectoryLinks();
    },
  };
};
