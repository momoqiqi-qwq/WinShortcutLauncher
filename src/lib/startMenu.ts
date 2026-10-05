import { invoke } from '@tauri-apps/api/core';
import type { Directory, ShortcutItem } from '../types';
import {
  folderMirrorEntriesToItems,
  folderMirrorItemId,
  START_MENU_ITEM_PREFIX,
  type CreateShortcutsResult,
  type FolderMirrorEntry,
} from './folderMirror';

/**
 * 「开始菜单子目录」是实时镜像，不把内容写进配置。
 *
 * 数据来源始终是当前用户的开始菜单文件夹：
 * `%APPDATA%\Microsoft\Windows\Start Menu\Programs`（只扫根目录一层）。
 * 拖入应用 = 在该文件夹里生成快捷方式；删除 = 送入回收站；重命名 = 改真实的 .lnk 文件名。
 *
 * 通用逻辑在 `folderMirror.ts`；这里是固定路径的那一份绑定。
 */

export type StartMenuEntry = FolderMirrorEntry;
export type CreateStartMenuResult = CreateShortcutsResult;

export { START_MENU_ITEM_PREFIX };

export const START_MENU_DEFAULT_NAME = '开始菜单';

export function isStartMenuDirectory(directory?: Directory | null): boolean {
  return (directory?.kind ?? 'normal') === 'startMenu';
}

export function isStartMenuItemId(itemId: string): boolean {
  return itemId.startsWith(START_MENU_ITEM_PREFIX);
}

export function startMenuItemId(path: string): string {
  return folderMirrorItemId(START_MENU_ITEM_PREFIX, path);
}

/** 把开始菜单条目映射成启动器项目。 */
export function startMenuEntriesToItems(entries: StartMenuEntry[]): ShortcutItem[] {
  return folderMirrorEntriesToItems(entries, START_MENU_ITEM_PREFIX);
}

export function getStartMenuFolder(): Promise<string> {
  return invoke<string>('get_start_menu_folder');
}

export function listStartMenuShortcuts(): Promise<StartMenuEntry[]> {
  return invoke<StartMenuEntry[]>('list_start_menu_shortcuts');
}

export function createStartMenuShortcuts(paths: string[]): Promise<CreateStartMenuResult> {
  return invoke<CreateStartMenuResult>('create_start_menu_shortcuts', { paths });
}

export function createStartMenuUrl(url: string, name: string): Promise<string> {
  return invoke<string>('create_start_menu_url', { url, name });
}

export function removeStartMenuShortcuts(paths: string[]): Promise<number> {
  return invoke<number>('remove_start_menu_shortcuts', { paths });
}

export function renameStartMenuShortcut(path: string, name: string): Promise<string> {
  return invoke<string>('rename_start_menu_shortcut', { path, name });
}
