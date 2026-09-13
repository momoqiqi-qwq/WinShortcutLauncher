import { beforeEach, describe, expect, it } from 'vitest';
import { cloneConfig, useAppStore } from '../../appStore';
import type { ShortcutItem } from '../../../types';

function getUserGroup() {
  return useAppStore.getState().groups.find((group) => group.id === 'group_default')!;
}

function makeItem(id: string, name = id): ShortcutItem {
  return { id, name, path: `C:\\${name}.exe`, type: 'file', order: 0 };
}

describe('composed app store slices', () => {
  beforeEach(() => {
    useAppStore.getState().resetAll();
  });

  it('keeps navigation actions connected to shared state', () => {
    const store = useAppStore.getState();
    store.addGroup('工作');
    const added = useAppStore.getState().groups.find((group) => group.name === '工作');
    expect(added).toBeTruthy();

    useAppStore.getState().setActiveGroup(added!.id);
    expect(useAppStore.getState().activeGroupId).toBe(added!.id);
    expect(useAppStore.getState().activeDirectoryId).toBe(added!.directories[0].id);

    useAppStore.getState().renameGroup(added!.id, '工作区');
    expect(useAppStore.getState().getActiveGroup()?.name).toBe('工作区');

    useAppStore.getState().setGroupColor(added!.id, '#8b5cf6');
    expect(useAppStore.getState().getActiveGroup()?.color).toBe('#8b5cf6');
    useAppStore.getState().setGroupColor(added!.id, undefined);
    expect(useAppStore.getState().getActiveGroup()?.color).toBeUndefined();

    const firstGroup = useAppStore.getState().groups[0];
    useAppStore.getState().setGroupColors({ [firstGroup.id]: '#0ea5e9', [added!.id]: '#f97316' });
    expect(useAppStore.getState().groups.find((group) => group.id === firstGroup.id)?.color).toBe('#0ea5e9');
    expect(useAppStore.getState().groups.find((group) => group.id === added!.id)?.color).toBe('#f97316');
  });

  it('returns the new directory id so the UI can activate it immediately', () => {
    const group = getUserGroup();
    const directoryId = useAppStore.getState().addDirectory(group.id, '快速创建');
    expect(directoryId).toMatch(/^dir_/);
    expect(getUserGroup().directories.some((directory) => directory.id === directoryId)).toBe(true);
  });

  it('supports item add, duplicate, move and launch statistics across slices', () => {
    const group = getUserGroup();
    const firstDirectory = group.directories[0];
    useAppStore.getState().addDirectory(group.id, '第二页');
    const secondDirectory = getUserGroup().directories.find((dir) => dir.name === '第二页')!;

    useAppStore.getState().addItems(group.id, firstDirectory.id, [makeItem('item-a', 'Alpha')]);
    useAppStore.getState().duplicateItem('item-a');
    const duplicated = getUserGroup().directories[0].items.find((item) => item.id !== 'item-a')!;
    expect(duplicated.name).toContain('副本');

    useAppStore.getState().moveItemToDirectory(duplicated.id, secondDirectory.id);
    expect(getUserGroup().directories[0].items.some((item) => item.id === duplicated.id)).toBe(false);
    expect(getUserGroup().directories.find((dir) => dir.id === secondDirectory.id)?.items.some((item) => item.id === duplicated.id)).toBe(true);

    useAppStore.getState().recordItemLaunch('item-a');
    expect(useAppStore.getState().getItemById('item-a')?.launchCount).toBe(1);
  });

  it('normalizes note settings through the settings slice', () => {
    useAppStore.getState().updateNoteSettings({ fontSize: 100, autosaveDelayMs: 1, separatorLength: 500 });
    const notes = useAppStore.getState().notes;
    expect(notes.fontSize).toBe(32);
    expect(notes.autosaveDelayMs).toBe(120);
    expect(notes.separatorLength).toBe(80);
  });

  it('deduplicates image browser items by path', () => {
    useAppStore.getState().addImageBrowserItems([
      { id: 'a', name: 'A', path: 'C:\\Images\\A.png', groupId: 'default', addedAt: 1 },
      { id: 'b', name: 'B', path: 'c:\\images\\a.png', groupId: 'default', addedAt: 1 },
    ]);
    expect(useAppStore.getState().imageBrowserItems).toHaveLength(1);
  });

  it('exports and imports a normalized config after the split', () => {
    const group = getUserGroup();
    useAppStore.getState().addItems(group.id, group.directories[0].id, [makeItem('item-export')]);
    const exported = useAppStore.getState().exportConfig();
    useAppStore.getState().resetAll();
    useAppStore.getState().importConfig(exported);
    expect(useAppStore.getState().getItemById('item-export')).toBeTruthy();
  });
  it('persists customized shortcuts through export and import', () => {
    useAppStore.getState().updateShortcuts({ openSettings: 'Alt+S', openGlobalSearch: '' });
    const exported = useAppStore.getState().exportConfig();
    useAppStore.getState().resetAll();
    useAppStore.getState().importConfig(exported);
    expect(useAppStore.getState().shortcuts.openSettings).toBe('Alt+S');
    expect(useAppStore.getState().shortcuts.openGlobalSearch).toBe('');
  });



  it('keeps the three window persistence controls independent', () => {
    useAppStore.getState().updateBehavior({
      manualWindowStateEnabled: true,
      restoreWindowStateOnLaunch: false,
      saveWindowStateOnExit: true,
    });
    expect(useAppStore.getState().behavior).toMatchObject({
      manualWindowStateEnabled: true,
      restoreWindowStateOnLaunch: false,
      saveWindowStateOnExit: true,
    });
  });

  it('copies a child directory into another parent with fresh directory and item ids', () => {
    const sourceGroup = getUserGroup();
    const sourceDirectory = sourceGroup.directories[0];
    useAppStore.getState().addItems(sourceGroup.id, sourceDirectory.id, [makeItem('copy-me', 'Copy me')]);
    useAppStore.getState().addGroup('目标父目录');
    const targetGroup = useAppStore.getState().groups.find((group) => group.name === '目标父目录')!;

    expect(useAppStore.getState().copyDirectoryToClipboard(sourceDirectory.id)).toBe(true);
    const pastedId = useAppStore.getState().pasteDirectoryToGroup(targetGroup.id);
    expect(pastedId).toBeTruthy();

    const pasted = useAppStore.getState().groups
      .find((group) => group.id === targetGroup.id)!
      .directories.find((directory) => directory.id === pastedId)!;
    expect(pasted.name).toContain(sourceDirectory.name);
    expect(pasted.name).not.toBe(targetGroup.directories[0].name);
    expect(pasted.id).not.toBe(sourceDirectory.id);
    expect(pasted.items).toHaveLength(1);
    expect(pasted.items[0].id).not.toBe('copy-me');
  });

  it('remaps multi-account batch ids when copying a parent so pasted batches stay independent', () => {
    useAppStore.getState().addGroup('批次源父目录');
    const source = useAppStore.getState().groups.find((group) => group.name === '批次源父目录')!;
    const firstDirectory = source.directories[0];
    const secondDirectoryId = useAppStore.getState().addDirectory(source.id, '第二子目录');
    const batch = {
      batchId: 'batch-original',
      batchName: '测试批次',
      createdAt: 1,
      sourceUrl: 'https://example.com',
      targetKey: 'browser::profile',
    };
    useAppStore.getState().addItems(source.id, firstDirectory.id, [{ ...makeItem('batch-a'), multiAccountBatch: batch }]);
    useAppStore.getState().addItems(source.id, secondDirectoryId, [{ ...makeItem('batch-b'), multiAccountBatch: { ...batch } }]);

    expect(useAppStore.getState().copyGroupToClipboard(source.id)).toBe(true);
    const pastedId = useAppStore.getState().pasteGroupFromClipboard();
    const pasted = useAppStore.getState().groups.find((group) => group.id === pastedId)!;
    const pastedBatchIds = pasted.directories.flatMap((directory) => directory.items.map((item) => item.multiAccountBatch?.batchId).filter(Boolean));
    expect(pastedBatchIds).toHaveLength(2);
    expect(pastedBatchIds[0]).not.toBe('batch-original');
    expect(pastedBatchIds[0]).toBe(pastedBatchIds[1]);
  });

  it('moves a child directory to another parent without leaving the source parent empty', () => {
    const sourceGroup = getUserGroup();
    const sourceDirectory = sourceGroup.directories[0];
    useAppStore.getState().addGroup('移动目标');
    const targetGroup = useAppStore.getState().groups.find((group) => group.name === '移动目标')!;

    expect(useAppStore.getState().moveDirectoryToGroup(sourceDirectory.id, targetGroup.id)).toBe(true);
    const currentSource = useAppStore.getState().groups.find((group) => group.id === sourceGroup.id)!;
    const currentTarget = useAppStore.getState().groups.find((group) => group.id === targetGroup.id)!;
    expect(currentSource.directories.length).toBeGreaterThan(0);
    expect(currentSource.directories.some((directory) => directory.id === sourceDirectory.id)).toBe(false);
    expect(currentTarget.directories.some((directory) => directory.id === sourceDirectory.id)).toBe(true);
  });

  it('keeps a copied parent directory across config import so it can be pasted into another profile', () => {
    useAppStore.getState().addGroup('跨配置父目录');
    const source = useAppStore.getState().groups.find((group) => group.name === '跨配置父目录')!;
    const originalGroupId = source.id;
    const originalDirectoryId = source.directories[0].id;
    expect(useAppStore.getState().copyGroupToClipboard(source.id)).toBe(true);

    useAppStore.getState().importConfig(cloneConfig());
    expect(useAppStore.getState().navigationClipboard?.kind).toBe('group');

    const pastedId = useAppStore.getState().pasteGroupFromClipboard();
    const pasted = useAppStore.getState().groups.find((group) => group.id === pastedId)!;
    expect(pasted.name).toBe('跨配置父目录');
    expect(pasted.id).not.toBe(originalGroupId);
    expect(pasted.directories[0].id).not.toBe(originalDirectoryId);
  });


  it('uses an explicit multi-select mode and exits without leaving stale selection', () => {
    const group = getUserGroup();
    const directory = group.directories[0];
    useAppStore.getState().addItems(group.id, directory.id, [makeItem('multi-a'), makeItem('multi-b')]);

    useAppStore.getState().beginMultiSelect('multi-a');
    expect(useAppStore.getState().multiSelectMode).toBe(true);
    expect(useAppStore.getState().selectedItemIds).toEqual(['multi-a']);

    useAppStore.getState().selectItem('multi-b', true);
    expect(new Set(useAppStore.getState().selectedItemIds)).toEqual(new Set(['multi-a', 'multi-b']));

    useAppStore.getState().selectItem('multi-a', true);
    expect(useAppStore.getState().selectedItemIds).toEqual(['multi-b']);

    useAppStore.getState().finishMultiSelect();
    expect(useAppStore.getState().multiSelectMode).toBe(false);
    expect(useAppStore.getState().selectedItemIds).toEqual([]);
  });

  it('copies multiple projects atomically with fresh ids while preserving project behavior', () => {
    const group = getUserGroup();
    const sourceDirectory = group.directories[0];
    const targetDirectoryId = useAppStore.getState().addDirectory(group.id, '复制目标');
    const batch = {
      batchId: 'batch-source',
      batchName: '批量账号',
      createdAt: 10,
      sourceUrl: 'https://example.com',
      targetKey: 'browser::profile',
    };
    const route = { mode: 'specified' as const, browserId: 'floorp', profileId: 'profile-1' };
    useAppStore.getState().addItems(group.id, sourceDirectory.id, [
      { ...makeItem('copy-a'), browserRoute: route, singleClickAction: 'copy-name', doubleClickAction: 'copy-path', multiAccountBatch: batch, launchCount: 9 },
      { ...makeItem('copy-b'), browserRoute: { ...route }, singleClickAction: 'copy-path', doubleClickAction: 'open', multiAccountBatch: { ...batch }, launchCount: 4 },
    ]);

    const count = useAppStore.getState().copyItemsToDirectory(['copy-a', 'copy-b', 'copy-a'], targetDirectoryId);
    expect(count).toBe(2);
    const target = getUserGroup().directories.find((directory) => directory.id === targetDirectoryId)!;
    expect(target.items).toHaveLength(2);
    expect(target.items.map((item) => item.id)).not.toContain('copy-a');
    expect(target.items.map((item) => item.id)).not.toContain('copy-b');
    expect(target.items[0].singleClickAction).toBe('copy-name');
    expect(target.items[0].doubleClickAction).toBe('copy-path');
    expect(target.items[0].browserRoute).toEqual(route);
    expect(target.items[0].browserRoute).not.toBe(route);
    expect(target.items[0].launchCount).toBe(0);
    expect(target.items[0].multiAccountBatch?.batchId).not.toBe('batch-source');
    expect(target.items[0].multiAccountBatch?.batchId).toBe(target.items[1].multiAccountBatch?.batchId);
  });

  it('snapshots the project clipboard and remaps batch metadata on every paste', () => {
    const group = getUserGroup();
    const sourceDirectory = group.directories[0];
    const targetDirectoryId = useAppStore.getState().addDirectory(group.id, '粘贴目标');
    const route = { mode: 'specified' as const, browserId: 'edge', profileId: 'Default' };
    const batch = {
      batchId: 'batch-clipboard',
      batchName: '剪贴板批次',
      createdAt: 20,
      sourceUrl: 'https://openai.com',
      targetKey: 'edge::Default',
    };
    useAppStore.getState().addItems(group.id, sourceDirectory.id, [
      { ...makeItem('clip-a'), browserRoute: route, singleClickAction: 'copy-path', multiAccountBatch: batch },
      { ...makeItem('clip-b'), browserRoute: { ...route }, doubleClickAction: 'copy-name', multiAccountBatch: { ...batch } },
    ]);

    expect(useAppStore.getState().copyItemsToClipboard(['clip-a', 'clip-b', 'clip-a'])).toBe(2);
    const clipboardBefore = useAppStore.getState().itemClipboard;
    expect(clipboardBefore).toHaveLength(2);
    expect(clipboardBefore[0].browserRoute).toEqual(route);
    expect(clipboardBefore[0].browserRoute).not.toBe(route);

    useAppStore.getState().updateItem('clip-a', { browserRoute: { mode: 'default' } });
    expect(useAppStore.getState().itemClipboard[0].browserRoute).toEqual(route);

    expect(useAppStore.getState().pasteItemsToDirectory(targetDirectoryId)).toBe(2);
    const firstPaste = getUserGroup().directories.find((directory) => directory.id === targetDirectoryId)!.items.slice();
    expect(firstPaste[0].multiAccountBatch?.batchId).not.toBe('batch-clipboard');
    expect(firstPaste[0].multiAccountBatch?.batchId).toBe(firstPaste[1].multiAccountBatch?.batchId);
    expect(firstPaste[0].singleClickAction).toBe('copy-path');
    expect(firstPaste[1].doubleClickAction).toBe('copy-name');

    expect(useAppStore.getState().pasteItemsToDirectory(targetDirectoryId)).toBe(2);
    const allPasted = getUserGroup().directories.find((directory) => directory.id === targetDirectoryId)!.items;
    const secondPaste = allPasted.slice(2);
    expect(secondPaste[0].multiAccountBatch?.batchId).toBe(secondPaste[1].multiAccountBatch?.batchId);
    expect(secondPaste[0].multiAccountBatch?.batchId).not.toBe(firstPaste[0].multiAccountBatch?.batchId);
  });

});
