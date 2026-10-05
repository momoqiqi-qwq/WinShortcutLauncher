import type { ShortcutItem } from '../types';

/**
 * 文件夹镜像的共享层。
 *
 * 两类子目录共用这一套：`startMenu`（根目录固定 = 系统开始菜单文件夹）与
 * `mapped`（根目录由用户自选，存在 `Directory.mappedPath`）。
 *
 * 它们的共同点：**内容不落盘**。条目由 Rust 实时扫描目标文件夹得到，
 * 只活在运行时 store 里；拖入 = 在目标文件夹里生成真实快捷方式；
 * 删除 = 送回收站；重命名 = 改真实文件名。
 *
 * 虚拟项目的 id 约定为 `<前缀><绝对路径>` —— 稳定、可反查真实文件，
 * 且不会和普通项目的 id 撞车。
 */

export interface FolderMirrorEntry {
  name: string;
  path: string;
  extension: string;
  /** 映射目录会把子文件夹也列出来；开始菜单子目录永远是 false。 */
  isDir?: boolean;
}

export interface CreateShortcutsResult {
  created: string[];
  skipped: string[];
  errors: string[];
}

export const START_MENU_ITEM_PREFIX = 'startmenu:';
export const MAPPED_ITEM_PREFIX = 'mapped:';

/** 镜像类子目录的种类；`null` 表示不是镜像子目录。 */
export type MirrorKind = 'startMenu' | 'mapped';

const MIRROR_ITEM_PREFIXES = [START_MENU_ITEM_PREFIX, MAPPED_ITEM_PREFIX];

/** 两类镜像子目录的虚拟项目 id 都带前缀；普通项目 id 不带。 */
export function isFolderMirrorItemId(itemId: string): boolean {
  return MIRROR_ITEM_PREFIXES.some((prefix) => itemId.startsWith(prefix));
}

export function folderMirrorItemId(prefix: string, path: string): string {
  return `${prefix}${path}`;
}

/** 从虚拟 id 反查真实路径；不是虚拟 id 时返回空串。 */
export function folderMirrorItemPath(itemId: string): string {
  const prefix = MIRROR_ITEM_PREFIXES.find((value) => itemId.startsWith(value));
  return prefix ? itemId.slice(prefix.length) : '';
}

/**
 * 条目的项目类型。
 *
 * `.lnk` / `.exe` 是「启动程序」→ `command`；`.url` 与普通文件 → `file`
 * （注意：项目的 `path` 是那个 `.url` 文件本身的路径，不是网址字符串，
 * 所以不能标成 `url`，否则右键会把它当成网站来复制/路由）；
 * 子文件夹 → `folder`。
 */
export function folderMirrorEntryType(entry: FolderMirrorEntry): ShortcutItem['type'] {
  if (entry.isDir) return 'folder';
  return entry.extension === 'lnk' || entry.extension === 'exe' ? 'command' : 'file';
}

/** 把扫描到的文件夹条目映射成启动器项目。 */
export function folderMirrorEntriesToItems(
  entries: FolderMirrorEntry[],
  prefix: string,
): ShortcutItem[] {
  return entries.map((entry, index) => ({
    id: folderMirrorItemId(prefix, entry.path),
    name: entry.name,
    path: entry.path,
    type: folderMirrorEntryType(entry),
    order: index,
  }));
}
