import { describe, expect, it } from 'vitest';
import { DEFAULT_GLOBAL_SEARCH_SETTINGS } from '../../../utils/v16Types';
import { buildPaletteEntries } from '../../../lib/commandPalette';
import { useAppStore } from '../../appStore';
import { normalizeBehavior, normalizeDisplay, normalizeGroups, normalizeShortcutItem } from '../normalizers';
import { restorePersistedState } from '../persistence';

describe('persisted shortcut data normalization', () => {
  it('replaces invalid group, directory and item arrays with safe defaults', () => {
    for (const value of [null, undefined, 'broken', 42, { legacy: true }]) {
      const groups = normalizeGroups(value);
      expect(groups).toHaveLength(1);
      expect(groups[0].directories).toHaveLength(1);
      expect(groups[0].directories[0].items).toEqual([]);
    }

    const groups = normalizeGroups([{ id: 'g', name: '工作', directories: 'broken' }]);
    expect(groups[0]).toMatchObject({ id: 'g', name: '工作' });
    expect(groups[0].directories).toHaveLength(1);
  });

  it('coerces every shortcut field to a render-safe value', () => {
    const item = normalizeShortcutItem({
      id: { bad: true },
      name: { legacy: true },
      path: 123,
      icon: { nested: true },
      type: 'unsupported',
      order: '7',
      labelLines: 99,
      launchCount: '-5',
      lastLaunchedAt: 'not-a-number',
    });

    expect(item.id).toMatch(/^item_/);
    expect(item.name).toBe('未命名项目');
    expect(item.path).toBe('123');
    expect(item.icon).toBeUndefined();
    expect(item.type).toBe('file');
    expect(item.order).toBe(7);
    expect(item.labelLines).toBeUndefined();
    expect(item.launchCount).toBe(0);
    expect(item.lastLaunchedAt).toBeUndefined();
  });

  it('deduplicates damaged ids and remains safe for command-palette indexing', () => {
    const groups = normalizeGroups([
      {
        id: 'duplicate',
        name: 100,
        directories: [
          {
            id: 'duplicate-dir',
            name: { old: true },
            items: [
              { id: 'duplicate-item', name: null, path: { path: true }, icon: 8, order: '2' },
              { id: 'duplicate-item', name: 9, path: 'https://example.com', order: '1' },
            ],
          },
        ],
      },
      {
        id: 'duplicate',
        directories: [{ id: 'duplicate-dir', items: [{ id: 'duplicate-item' }] }],
      },
    ]);

    const groupIds = groups.map((group) => group.id);
    const directoryIds = groups.flatMap((group) => group.directories.map((directory) => directory.id));
    const itemIds = groups.flatMap((group) => group.directories.flatMap((directory) => directory.items.map((item) => item.id)));
    expect(new Set(groupIds).size).toBe(groupIds.length);
    expect(new Set(directoryIds).size).toBe(directoryIds.length);
    expect(new Set(itemIds).size).toBe(itemIds.length);
    expect(() => buildPaletteEntries(groups, DEFAULT_GLOBAL_SEARCH_SETTINGS)).not.toThrow();
  });

  it('preserves valid parent-group colors and drops malformed colors', () => {
    const groups = normalizeGroups([
      { id: 'a', name: 'A', color: '#8b5cf6', directories: [] },
      { id: 'b', name: 'B', color: 'javascript:bad', directories: [] },
    ]);
    expect(groups[0].color).toBe('#8b5cf6');
    expect(groups[1].color).toBeUndefined();
  });

  it('clamps the expanded parent-tab appearance settings', () => {
    const display = normalizeDisplay({
      topTabWidth: 999,
      topTabHeight: 2,
      topTabGap: 99,
      topTabFontSize: 100,
      topTabBorderWidth: 20,
      topTabColorStrength: 2,
    });
    expect(display).toMatchObject({
      topTabWidth: 280,
      topTabHeight: 26,
      topTabGap: 24,
      topTabFontSize: 22,
      topTabBorderWidth: 4,
      topTabColorStrength: 0.55,
    });
  });

  it('normalizes the URL browser opening mode and keeps default-browser compatibility', () => {
    expect(normalizeBehavior({}).urlOpenMode).toBe('default');
    expect(normalizeBehavior({ urlOpenMode: 'foreground-browser' }).urlOpenMode).toBe('foreground-browser');
    expect(normalizeBehavior({ urlOpenMode: 'specified' }).urlOpenMode).toBe('specified');
    expect(normalizeBehavior({ urlOpenMode: 'unsupported' as never }).urlOpenMode).toBe('default');
  });

  it('migrates v107 persisted foreground-browser mode into browserRouter', () => {
    const restored = restorePersistedState({ behavior: { urlOpenMode: 'foreground-browser' } });
    expect(restored.browserRouter.mode).toBe('foreground-browser');
  });


  it('restores null and malformed persisted roots to a complete safe state', () => {
    for (const value of [null, 'broken', 9, { groups: 'broken' }]) {
      const restored = restorePersistedState(value);
      expect(restored.groups[0].directories[0]).toBeTruthy();
      expect(restored.activeGroupId).toBe(restored.groups[0].id);
      expect(restored.activeDirectoryId).toBe(restored.groups[0].directories[0].id);
    }
  });

  it('adds the multi-config control to older persisted button layouts', () => {
    const restored = restorePersistedState({
      display: {
        windowControlOrder: ['close', 'search'],
        windowControlHidden: ['profiles', 'legacy-control'],
      },
    });
    expect(restored.display.windowControlOrder).toContain('profiles');
    expect(restored.display.windowControlHidden).toEqual(['profiles']);
  });

  it('accepts a null or malformed imported config without crashing the store', () => {
    expect(() => useAppStore.getState().importConfig(null)).not.toThrow();
    expect(useAppStore.getState().groups[0].directories[0]).toBeTruthy();

    expect(() => useAppStore.getState().importConfig({
      groups: [{ directories: [{ items: 'broken' }] }],
      display: 'broken',
      behavior: 7,
    })).not.toThrow();
    expect(useAppStore.getState().groups[0].directories[0].items).toEqual([]);
  });
});
