import type { Directory, DirectoryKind, DirectoryLinkRef, Group, ShortcutItem } from '../types';

/**
 * v169: 目录链接（链接子目录 / 链接父目录）。
 *
 * 设计要点
 * - 链接**不**在运行时去另一个配置里现读现渲染，而是把源内容**物化**（镜像）进当前配置的
 *   `groups` 里：源里有什么，链接里就有什么，切换配置、重启、离线都看得见。
 * - 镜像出来的子目录 / 项目用派生 id（`linkdir:` / `linkitem:` 前缀），既避免与源配置的 id
 *   撞车（同一份数据被两个配置同时引用），也让「这条是镜像来的」可判断 —— 用户自己在链接里
 *   追加的项目不会被同步删掉。
 * - 同步是幂等的：源没变时 `applyLinkSources` 返回 `changed: false`，不会触发写盘 / 重渲染。
 */

/** 镜像子目录 id 前缀。 */
export const LINKED_DIRECTORY_PREFIX = 'linkdir:';
/** 镜像项目 id 前缀。 */
export const LINKED_ITEM_PREFIX = 'linkitem:';
/** 刚建立、还没同步过的占位子目录 id 前缀（同步成功后会被镜像内容替换）。 */
export const LINK_PENDING_PREFIX = 'linkpending:';

export function isPendingLinkDirectoryId(id: string | undefined): boolean {
  return typeof id === 'string' && id.startsWith(LINK_PENDING_PREFIX);
}

/** 链接源允许的子目录类型：普通子目录、便签子目录（便签正文一起镜像）。 */
const LINKABLE_DIRECTORY_KINDS: DirectoryKind[] = ['normal', 'notes'];

export function isLinkableDirectorySource(directory: Directory): boolean {
  if (isMirroredDirectoryId(directory.id) || isPendingLinkDirectoryId(directory.id)) return false;
  return LINKABLE_DIRECTORY_KINDS.includes((directory.kind ?? 'normal') as DirectoryKind);
}

/** 一条链接记录的 owner key —— 同一个链接实体在多次同步之间要保持稳定。 */
export function linkOwnerKey(scope: 'group' | 'directory', id: string): string {
  return `${scope === 'group' ? 'g' : 'd'}:${id}`;
}

export function linkedDirectoryId(ownerKey: string, sourceDirectoryId: string): string {
  return `${LINKED_DIRECTORY_PREFIX}${ownerKey}:${sourceDirectoryId}`;
}

export function linkedItemId(ownerKey: string, sourceItemId: string): string {
  return `${LINKED_ITEM_PREFIX}${ownerKey}:${sourceItemId}`;
}

export function isMirroredDirectoryId(id: string | undefined): boolean {
  return typeof id === 'string' && id.startsWith(LINKED_DIRECTORY_PREFIX);
}

export function isMirroredItemId(id: string | undefined): boolean {
  return typeof id === 'string' && id.startsWith(LINKED_ITEM_PREFIX);
}

function mirrorItems(items: ShortcutItem[], ownerKey: string): ShortcutItem[] {
  // 已经是镜像出来的项目不再镜像（防止链接指向自己 / 指向另一个链接时 id 前缀层层叠加）。
  return items
    .filter((item) => !isMirroredItemId(item.id))
    .map((item, index) => ({
      ...item,
      id: linkedItemId(ownerKey, item.id),
      order: index,
    }));
}

/** 把一个源子目录镜像成当前配置里的子目录（内容只读语义：源变即覆盖）。 */
export function mirrorDirectory(source: Directory, ownerKey: string, order: number): Directory {
  const isNotes = source.kind === 'notes';
  return {
    id: linkedDirectoryId(ownerKey, source.id),
    name: source.name,
    order,
    kind: isNotes ? 'notes' : 'normal',
    ...(isNotes && source.note ? { note: source.note } : {}),
    ...(isNotes && typeof source.noteShowLineNumbers === 'boolean'
      ? { noteShowLineNumbers: source.noteShowLineNumbers }
      : {}),
    ...(source.display ? { display: { ...source.display } } : {}),
    ...(source.color ? { color: source.color } : {}),
    items: isNotes ? [] : mirrorItems(source.items, ownerKey),
  };
}

/** 父目录链接：镜像源父目录下所有可链接的子目录。 */
export function mirrorGroupDirectories(source: Group, ownerKey: string): Directory[] {
  return source.directories
    .filter(isLinkableDirectorySource)
    .sort((a, b) => a.order - b.order)
    .map((directory, index) => mirrorDirectory(directory, ownerKey, index));
}

/** 同步后「镜像出来的那部分」的内容指纹，用来判断要不要写回 store。 */
function mirroredSignature(directories: Directory[]): string {
  return JSON.stringify(directories.filter((directory) => isMirroredDirectoryId(directory.id)));
}

function mirroredItemSignature(items: ShortcutItem[]): string {
  return JSON.stringify(items.filter((item) => isMirroredItemId(item.id)));
}

export interface ApplyLinkResult {
  groups: Group[];
  /** 有内容真的变了（需要写回 store）。 */
  changed: boolean;
  /** 源暂时解析不到的链接数量（配置被删 / 源被删），这些链接保持原样不动。 */
  unresolved: number;
  /** 源存在、但镜像后内容变了的分支数。 */
  updated: number;
}

/**
 * 把链接的源内容同步进 `groups`。
 *
 * @param groups 当前配置的父目录列表
 * @param resolveGroups 按配置 id 取父目录列表；空串代表「当前配置」，返回 undefined 表示取不到
 */
export function applyLinkSources(
  groups: Group[],
  resolveGroups: (profileId: string) => Group[] | undefined,
): ApplyLinkResult {
  let changed = false;
  let unresolved = 0;
  let updated = 0;

  const nextGroups = groups.map((group) => {
    // 1) 父目录链接：目录列表整体跟随源，用户自己加的子目录留在后面。
    if (group.link) {
      const sourceGroups = resolveGroups(group.link.profileId);
      const sourceGroup = sourceGroups?.find((candidate) => candidate.id === group.link?.groupId);
      if (!sourceGroups || !sourceGroup) {
        unresolved += 1;
        return group;
      }
      const ownerKey = linkOwnerKey('group', group.id);
      const mirrored = mirrorGroupDirectories(sourceGroup, ownerKey);
      const locals = group.directories.filter(
        (directory) => !isMirroredDirectoryId(directory.id) && !isPendingLinkDirectoryId(directory.id),
      );
      const merged = [...mirrored, ...locals];
      const nextDirectories = (merged.length
        ? merged
        : [pendingDirectory('空父目录', `${LINK_PENDING_PREFIX}${group.id}`)])
        .map((directory, index) => (
          directory.order === index ? directory : { ...directory, order: index }
        ));
      const nameChanged = group.name !== sourceGroup.name;
      const contentChanged = mirroredSignature(nextDirectories) !== mirroredSignature(group.directories);
      if (!nameChanged && !contentChanged) return group;
      changed = true;
      updated += 1;
      return {
        ...group,
        name: sourceGroup.name,
        directories: nextDirectories,
      };
    }

    // 2) 子目录链接：只换这个子目录的项目列表。
    let groupChanged = false;
    const nextDirectories = group.directories.map((directory) => {
      if (directory.kind !== 'link' || !directory.link) return directory;
      const sourceGroups = resolveGroups(directory.link.profileId);
      const sourceGroup = sourceGroups?.find((candidate) => candidate.id === directory.link?.groupId);
      const sourceDirectory = sourceGroup?.directories.find(
        (candidate) => candidate.id === directory.link?.directoryId,
      );
      if (!sourceGroups || !sourceGroup || !sourceDirectory) {
        unresolved += 1;
        return directory;
      }
      const ownerKey = linkOwnerKey('directory', directory.id);
      const isNotes = sourceDirectory.kind === 'notes';
      const mirrored = isNotes ? [] : mirrorItems(sourceDirectory.items, ownerKey);
      const locals = directory.items.filter((item) => !isMirroredItemId(item.id));
      const nextItems = [...mirrored, ...locals].map((item, index) => (
        item.order === index ? item : { ...item, order: index }
      ));
      const nameChanged = directory.name !== sourceDirectory.name;
      const noteChanged = isNotes ? (directory.note ?? '') !== (sourceDirectory.note ?? '') : false;
      const contentChanged = isNotes
        ? noteChanged
        : mirroredItemSignature(nextItems) !== mirroredItemSignature(directory.items);
      if (!nameChanged && !contentChanged) return directory;
      groupChanged = true;
      return {
        ...directory,
        name: sourceDirectory.name,
        ...(isNotes ? { note: sourceDirectory.note ?? '' } : {}),
        items: isNotes ? directory.items : nextItems,
      };
    });
    if (!groupChanged) return group;
    changed = true;
    updated += 1;
    return { ...group, directories: nextDirectories };
  });

  return {
    groups: changed ? nextGroups : groups,
    changed,
    unresolved,
    updated,
  };
}

/** 刚建立、还没同步到的占位子目录（保证父目录不会是空的）。id 必须稳定，否则每次同步都算「变了」。 */
function pendingDirectory(name: string, id: string): Directory {
  return {
    id,
    name,
    order: 0,
    kind: 'normal',
    items: [],
  };
}

/** 新建链接子目录（内容先留空，紧接着由同步填上）。 */
export function createLinkedDirectory(ref: DirectoryLinkRef, name: string, order: number): Directory {
  return {
    id: `dir-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    order,
    kind: 'link',
    link: ref,
    items: [],
  };
}

/** 新建链接父目录（先放一个占位子目录，避免空父目录被判成异常）。 */
export function createLinkedGroup(ref: DirectoryLinkRef, name: string, order: number): Group {
  const groupId = `group-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id: groupId,
    name,
    order,
    link: ref,
    directories: [pendingDirectory('等待同步', `${LINK_PENDING_PREFIX}${groupId}`)],
  };
}

/** 链接的人类可读来源描述，用在菜单 / 提示里。 */
export function describeLinkSource(
  ref: DirectoryLinkRef,
  context?: { groups?: Group[]; activeProfileId?: string },
): string {
  const activeProfileId = context?.activeProfileId ?? '';
  const isCrossProfile = Boolean(ref.profileId) && ref.profileId !== activeProfileId;
  const sourceGroups = context?.groups;
  const group = sourceGroups?.find((entry) => entry.id === ref.groupId);
  const directory = ref.directoryId
    ? group?.directories.find((entry) => entry.id === ref.directoryId)
    : undefined;
  const path = [group?.name, directory?.name].filter(Boolean).join(' › ');
  const profileLabel = isCrossProfile
    ? (ref.profileName || '其他配置')
    : '当前配置';
  if (!path) {
    return isCrossProfile ? `${profileLabel} › 已过期的链接源` : '已过期的链接源';
  }
  return isCrossProfile ? `${profileLabel} › ${path}` : path;
}

/** 链接是否指向当前配置（同配置链接，改源立刻同步）。 */
export function isSameProfileLink(ref: DirectoryLinkRef, activeProfileId: string): boolean {
  return !ref.profileId || ref.profileId === activeProfileId;
}
