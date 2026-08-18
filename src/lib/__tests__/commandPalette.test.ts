import { describe, expect, it } from 'vitest';
import { DEFAULT_GLOBAL_SEARCH_SETTINGS } from '../../utils/v16Types';
import { buildPaletteEntries, searchPaletteEntries, toPinyinInitials } from '../commandPalette';
import type { Group } from '../../types';
import { systemToolsGroup } from '../../data/systemTools';

const groups: Group[] = [{
  id: 'group-work',
  name: '工作',
  order: 0,
  directories: [
    { id: 'dir-project', name: '前端项目', order: 0, kind: 'normal', items: [{ id: 'item-launcher', name: '月启动器', path: 'C:\\Work\\Yue', type: 'file', order: 0 }] },
    { id: 'dir-notes', name: '灵感便签', order: 1, kind: 'notes', items: [], note: '完善全局搜索与动态壁纸' },
  ],
}];

describe('command palette search', () => {
  it('creates pinyin initials for common Chinese labels', () => {
    expect(toPinyinInitials('全局命令面板')).toBe('qjmmlb');
    expect(toPinyinInitials('设置')).toBe('sz');
    expect(toPinyinInitials('便签')).toBe('bq');
  });

  it('searches projects, notes and settings', () => {
    const entries = buildPaletteEntries(groups, DEFAULT_GLOBAL_SEARCH_SETTINGS);
    expect(searchPaletteEntries(entries, 'qdq', DEFAULT_GLOBAL_SEARCH_SETTINGS, {})[0]?.title).toBe('月启动器');
    expect(searchPaletteEntries(entries, 'bq', DEFAULT_GLOBAL_SEARCH_SETTINGS, {}).some((entry) => entry.kind === 'note')).toBe(true);
    expect(searchPaletteEntries(entries, 'sz', DEFAULT_GLOBAL_SEARCH_SETTINGS, {}).some((entry) => entry.kind === 'setting')).toBe(true);
  });

  it('searches parent directories, child directories and projects by full pinyin or initials', () => {
    const navigationGroups: Group[] = [{
      id: 'group-work',
      name: '工作',
      order: 0,
      directories: [{
        id: 'dir-files',
        name: '文件夹',
        order: 0,
        kind: 'normal',
        items: [{ id: 'item-browser', name: '浏览器', path: 'C:\\Apps\\Browser.exe', type: 'file', order: 0 }],
      }],
    }];
    const entries = buildPaletteEntries(navigationGroups, DEFAULT_GLOBAL_SEARCH_SETTINGS);
    expect(searchPaletteEntries(entries, 'gz', DEFAULT_GLOBAL_SEARCH_SETTINGS, {})[0]?.kind).toBe('group');
    expect(searchPaletteEntries(entries, 'gongzuo', DEFAULT_GLOBAL_SEARCH_SETTINGS, {})[0]?.title).toBe('工作');
    expect(searchPaletteEntries(entries, 'wjj', DEFAULT_GLOBAL_SEARCH_SETTINGS, {})[0]?.title).toBe('文件夹');
    expect(searchPaletteEntries(entries, 'wenjianjia', DEFAULT_GLOBAL_SEARCH_SETTINGS, {})[0]?.title).toBe('文件夹');
    expect(searchPaletteEntries(entries, 'llq', DEFAULT_GLOBAL_SEARCH_SETTINGS, {})[0]?.title).toBe('浏览器');
    expect(searchPaletteEntries(entries, 'liulanqi', DEFAULT_GLOBAL_SEARCH_SETTINGS, {})[0]?.title).toBe('浏览器');
  });



  it('keeps path and URL matching independent', () => {
    const mixedGroups: Group[] = [{
      id: 'group-mixed',
      name: '混合',
      order: 0,
      directories: [{
        id: 'dir-mixed',
        name: '常用',
        order: 0,
        kind: 'normal',
        items: [
          { id: 'item-file', name: '本地程序', path: 'C:\\OnlyPathToken\\app.exe', type: 'file', order: 0 },
          { id: 'item-url', name: '在线站点', path: 'https://example.com/OnlyUrlToken', type: 'url', order: 1 },
        ],
      }],
    }];
    const entries = buildPaletteEntries(mixedGroups, DEFAULT_GLOBAL_SEARCH_SETTINGS);
    const noUrl = { ...DEFAULT_GLOBAL_SEARCH_SETTINGS, searchInPath: true, searchInUrl: false };
    const noPath = { ...DEFAULT_GLOBAL_SEARCH_SETTINGS, searchInPath: false, searchInUrl: true };
    expect(searchPaletteEntries(entries, 'onlyurltoken', noUrl, {})).toHaveLength(0);
    expect(searchPaletteEntries(entries, 'onlypathtoken', noPath, {})).toHaveLength(0);
    expect(searchPaletteEntries(entries, 'onlypathtoken', noUrl, {})[0]?.id).toBe('item:item-file');
    expect(searchPaletteEntries(entries, 'onlyurltoken', noPath, {})[0]?.id).toBe('item:item-url');
  });

  it('fully excludes notes and built-in system tools when their switches are off', () => {
    const withSystem = [...groups, systemToolsGroup];
    const withoutNotes = buildPaletteEntries(withSystem, { ...DEFAULT_GLOBAL_SEARCH_SETTINGS, includeNotes: false });
    expect(withoutNotes.some((entry) => entry.kind === 'note')).toBe(false);

    const withoutSystem = buildPaletteEntries(withSystem, { ...DEFAULT_GLOBAL_SEARCH_SETTINGS, includeSystemTools: false });
    expect(withoutSystem.some((entry) => entry.groupId === 'group_system_tools' || entry.id.startsWith('item:sys_'))).toBe(false);
  });

  it('stops usage/recent ranking when recent-priority is disabled', () => {
    const entries = buildPaletteEntries(groups, DEFAULT_GLOBAL_SEARCH_SETTINGS);
    const settings = { ...DEFAULT_GLOBAL_SEARCH_SETTINGS, preferRecent: false };
    const results = searchPaletteEntries(entries, '', settings, {
      'command:export-config': { count: 999, lastUsedAt: Date.now() },
    });
    expect(results[0]?.id).not.toBe('command:export-config');
  });

  it('places recent built-in commands first when query is empty', () => {
    const entries = buildPaletteEntries(groups, DEFAULT_GLOBAL_SEARCH_SETTINGS);
    const results = searchPaletteEntries(entries, '', DEFAULT_GLOBAL_SEARCH_SETTINGS, {
      'command:export-config': { count: 10, lastUsedAt: Date.now() },
    });
    expect(results.slice(0, 2).map((entry) => entry.id)).toContain('command:export-config');
  });
});

describe('command palette damaged-data compatibility', () => {
  it('coerces malformed labels instead of crashing the panel', () => {
    const damagedGroups = [{
      id: 'group-damaged',
      name: { legacy: true },
      order: 0,
      directories: [{ id: 'dir-damaged', name: 42, order: 0, kind: 'notes', items: [], note: { legacy: true } }],
    }] as unknown as Group[];
    const entries = buildPaletteEntries(damagedGroups, DEFAULT_GLOBAL_SEARCH_SETTINGS);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((entry) => typeof entry.title === 'string' && typeof entry.subtitle === 'string')).toBe(true);
    expect(() => searchPaletteEntries(entries, 'bq', DEFAULT_GLOBAL_SEARCH_SETTINGS, {})).not.toThrow();
  });
});
