import { useCallback } from 'react';
import type { DirectoryKind } from '../types';
import { useAppStore } from '../stores/appStore';
import { getUniqueDirectoryName } from '../lib/directoryExperience';
import { showLauncherNotice } from '../lib/notify';
import { uiPrompt } from '../lib/uiDialog';

const DEFAULT_NAMES: Record<DirectoryKind, string> = {
  normal: '新目录',
  notes: '便签',
  all: '全部',
};

export function useDirectoryCreator() {
  const activeGroup = useAppStore((state) => state.getActiveGroup());
  const activeDirectory = useAppStore((state) => state.getActiveDirectory());
  const experience = useAppStore((state) => state.experience);
  const addDirectory = useAppStore((state) => state.addDirectory);
  const setActiveDirectory = useAppStore((state) => state.setActiveDirectory);

  return useCallback(async (kind: DirectoryKind = 'normal', requestedName?: string) => {
    if (!activeGroup) return null;
    if ((activeDirectory?.kind ?? 'normal') === 'all') {
      showLauncherNotice('特殊标签不可添加子标签');
      return null;
    }
    if (kind === 'all' && activeGroup.directories.some((directory) => (directory.kind ?? 'normal') === 'all')) {
      showLauncherNotice('特殊标签已存在');
      return null;
    }

    const existingNames = activeGroup.directories.map((directory) => directory.name);
    const baseName = requestedName?.trim() || DEFAULT_NAMES[kind];
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
    if (experience.activateNewDirectoryAfterCreate) setActiveDirectory(directoryId);
    return directoryId;
  }, [activeDirectory?.kind, activeGroup, addDirectory, experience.activateNewDirectoryAfterCreate, experience.autoNumberDuplicateDirectories, experience.promptDirectoryNameOnCreate, setActiveDirectory]);
}
