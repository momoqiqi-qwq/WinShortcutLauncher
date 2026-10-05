import { describe, expect, it } from 'vitest';
import {
  isStartMenuDirectory,
  isStartMenuItemId,
  startMenuEntriesToItems,
  startMenuItemId,
  START_MENU_ITEM_PREFIX,
} from '../startMenu';
import { normalizeDirectory, normalizeGroups } from '../../stores/appStore/normalizers';

describe('start menu directory helpers', () => {
  it('recognizes the startMenu directory kind', () => {
    expect(isStartMenuDirectory({ id: 'd', name: '开始菜单', order: 0, items: [], kind: 'startMenu' })).toBe(true);
    expect(isStartMenuDirectory({ id: 'd', name: '常用', order: 0, items: [] })).toBe(false);
    expect(isStartMenuDirectory(undefined)).toBe(false);
  });

  it('maps scanned entries to shortcut items with a stable prefixed id', () => {
    const items = startMenuEntriesToItems([
      { name: 'Notepad', path: 'C:\\Start Menu\\Notepad.lnk', extension: 'lnk' },
      { name: 'Example', path: 'C:\\Start Menu\\Example.url', extension: 'url' },
    ]);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      id: `${START_MENU_ITEM_PREFIX}C:\\Start Menu\\Notepad.lnk`,
      name: 'Notepad',
      path: 'C:\\Start Menu\\Notepad.lnk',
      type: 'command',
      order: 0,
    });
    expect(items[1]).toMatchObject({ type: 'file', order: 1 });
    expect(startMenuItemId('C:\\Start Menu\\Notepad.lnk')).toBe(items[0].id);
    expect(isStartMenuItemId(items[0].id)).toBe(true);
    expect(isStartMenuItemId('item-1')).toBe(false);
  });
});

describe('start menu directory normalization', () => {
  it('keeps the startMenu kind instead of degrading it to normal', () => {
    const directory = normalizeDirectory({
      id: 'dir-sm',
      name: '开始菜单',
      kind: 'startMenu',
      items: [{ id: 'stale', name: '旧数据', path: 'C:\\x.lnk', type: 'command', order: 0 }],
    });

    expect(directory.kind).toBe('startMenu');
    // 内容来自实时扫描，落盘的旧条目必须丢掉，否则会和真实文件夹内容打架。
    expect(directory.items).toEqual([]);
  });

  it('survives a full group normalization round trip', () => {
    const groups = normalizeGroups([{
      id: 'g1',
      name: '我的快捷方式',
      directories: [
        { id: 'd1', name: '常用', kind: 'normal', items: [] },
        { id: 'd2', name: '开始菜单', kind: 'startMenu', items: [] },
      ],
    }]);

    expect(groups[0].directories.map((entry) => entry.kind)).toEqual(['normal', 'startMenu']);
  });
});
