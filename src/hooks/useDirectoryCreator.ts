import { useCallback } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import type { DirectoryKind } from '../types';
import { useAppStore } from '../stores/appStore';
import { getUniqueDirectoryName } from '../lib/directoryExperience';
import { MAPPED_DEFAULT_NAME, mappedFolderLabel, validateMappedFolder } from '../lib/mappedFolder';
import { showLauncherNotice } from '../lib/notify';
import { uiPrompt } from '../lib/uiDialog';

const DEFAULT_NAMES: Record<DirectoryKind, string> = {
  normal: '新目录',
  notes: '便签',
  all: '全部',
  startMenu: '开始菜单',
  mapped: MAPPED_DEFAULT_NAME,
};

export function useDirectoryCreator() {
  const activeGroup = useAppStore((state) => state.getActiveGroup());
  const activeDirectory = useAppStore((state) => state.getActiveDirectory());
  const experience = useAppStore((state) => state.experience);
  const addDirectory = useAppStore((state) => state.addDirectory);
  const setDirectoryMappedPath = useAppStore((state) => state.setDirectoryMappedPath);
  const setActiveDirectory = useAppStore((state) => state.setActiveDirectory);

  return useCallback(async (kind: DirectoryKind = 'normal', requestedName?: string) => {
    if (!activeGroup) return null;
    if ((activeDirectory?.kind ?? 'normal') === 'all') {
      showLauncherNotice('特殊标签不可添加子标签');
      return null;
    }
    // 「全部」和「开始菜单」在每个父目录里都只能有一个；映射文件夹可以建多个（各映射不同目录）。
    if (
      (kind === 'all' || kind === 'startMenu')
      && activeGroup.directories.some((directory) => (directory.kind ?? 'normal') === kind)
    ) {
      showLauncherNotice(kind === 'startMenu' ? '该父目录已存在开始菜单子目录' : '特殊标签已存在');
      return null;
    }

    // 映射文件夹：先选文件夹，取消就整个中止（不留一个没配路径的空子目录）。
    let mappedPath = '';
    if (kind === 'mapped') {
      const picked = await open({ directory: true, multiple: false, title: '选择要映射的文件夹' });
      if (typeof picked !== 'string' || !picked.trim()) return null;
      try {
        mappedPath = await validateMappedFolder(picked);
      } catch (error) {
        showLauncherNotice(`无法使用该文件夹：${String(error)}`);
        return null;
      }
    }

    const existingNames = activeGroup.directories.map((directory) => directory.name);
    // 映射目录默认直接用被映射文件夹的名字，比「映射文件夹」有辨识度。
    const fallbackName = kind === 'mapped' && mappedPath ? mappedFolderLabel(mappedPath) : DEFAULT_NAMES[kind];
    const baseName = requestedName?.trim() || fallbackName || DEFAULT_NAMES[kind];
    const suggestedName = experience.autoNumberDuplicateDirectories
      ? getUniqueDirectoryName(existingNames, baseName)
      : baseName;

    let name = suggestedName;
    if (experience.promptDirectoryNameOnCreate) {
      const input = await uiPrompt('请输入子目录名称', suggestedName, '新建子目录');
      if (input === null) return null;
      name = input.trim();
      if (!name) {
        showLauncherNotice('子目录名称不能为空');
        return null;
      }
    }

    if (experience.autoNumberDuplicateDirectories) {
      name = getUniqueDirectoryName(existingNames, name);
    }

    const directoryId = addDirectory(activeGroup.id, name, kind);
    if (kind === 'mapped') setDirectoryMappedPath(directoryId, mappedPath);
    if (experience.activateNewDirectoryAfterCreate) setActiveDirectory(directoryId);
    return directoryId;
  }, [activeDirectory?.kind, activeGroup, addDirectory, experience.activateNewDirectoryAfterCreate, experience.autoNumberDuplicateDirectories, experience.promptDirectoryNameOnCreate, setActiveDirectory, setDirectoryMappedPath]);
}
