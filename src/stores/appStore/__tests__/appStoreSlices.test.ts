import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '../../appStore';
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

});
