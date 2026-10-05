import { invoke } from '@tauri-apps/api/core';
import type { Directory, ShortcutItem } from '../types';
import {
  folderMirrorEntriesToItems,
  folderMirrorItemId,
  MAPPED_ITEM_PREFIX,
  type CreateShortcutsResult,
  type FolderMirrorEntry,
} from './folderMirror';

/**
 * 「映射文件夹子目录」= 用户自选根目录的实时镜像。
 *
 * 与开始菜单子目录行为完全一致（实时镜像 / 拖入写回真实快捷方式 /
 * 删除送回收站 / 重命名改真实文件名），区别只有两点：
 * 1. 根目录由用户通过文件夹选择框指定，存在 `Directory.mappedPath`；
 * 2. 列的是该文件夹根级**全部文件与文件夹**，不限于快捷方式。
 */

export type MappedEntry = FolderMirrorEntry;
export type CreateMappedResult = CreateShortcutsResult;

export const MAPPED_DEFAULT_NAME = '映射文件夹';
export const MAPPED_FOLDER_ITEM_PREFIX = MAPPED_ITEM_PREFIX;

export function isMappedDirectory(directory?: Directory | null): boolean {
  return (directory?.kind ?? 'normal') === 'mapped';
}

/** 映射目录的根路径；未配置时返回空串。 */
export function getMappedPath(directory?: Directory | null): string {
  return directory?.mappedPath?.trim() ?? '';
}

/** 是否是可用的映射目录（kind 对且已配置路径）。 */
export function hasMappedPath(directory?: Directory | null): boolean {
  return isMappedDirectory(directory) && Boolean(getMappedPath(directory));
}

export function isMappedItemId(itemId: string): boolean {
  return itemId.startsWith(MAPPED_ITEM_PREFIX);
}

export function mappedItemId(path: string): string {
  return folderMirrorItemId(MAPPED_ITEM_PREFIX, path);
}

export function mappedEntriesToItems(entries: MappedEntry[]): ShortcutItem[] {
  return folderMirrorEntriesToItems(entries, MAPPED_ITEM_PREFIX);
}

/** 从路径里取最后一段作为展示用名称。 */
export function mappedFolderLabel(path: string): string {
  const trimmed = path.trim().replace(/[\\/]+$/, '');
  if (!trimmed) return '';
  const parts = trimmed.split(/[\\/]/);
  return parts[parts.length - 1] || trimmed;
}

export function validateMappedFolder(root: string): Promise<string> {
  return invoke<string>('validate_mapped_folder', { root });
}

export function listMappedFolder(root: string): Promise<MappedEntry[]> {
  return invoke<MappedEntry[]>('list_mapped_folder', { root });
}

export function createMappedShortcuts(root: string, paths: string[]): Promise<CreateMappedResult> {
  return invoke<CreateMappedResult>('create_mapped_shortcuts', { root, paths });
}

export function createMappedUrl(root: string, url: string, name: string): Promise<string> {
  return invoke<string>('create_mapped_url', { root, url, name });
}

export function removeMappedEntries(root: string, paths: string[]): Promise<number> {
  return invoke<number>('remove_mapped_entries', { root, paths });
}

export function renameMappedEntry(root: string, path: string, name: string): Promise<string> {
  return invoke<string>('rename_mapped_entry', { root, path, name });
}
