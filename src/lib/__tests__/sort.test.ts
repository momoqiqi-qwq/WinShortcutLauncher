import { describe, expect, it } from 'vitest';
import type { ShortcutItem } from '../../types';
import { reindex, sortShortcutItemsForDisplay } from '../sort';

const items: ShortcutItem[] = [
  { id: 'a', name: 'B', path: 'b', type: 'file', order: 0, launchCount: 1, lastLaunchedAt: 20 },
  { id: 'b', name: 'A', path: 'a', type: 'url', order: 1, pinned: true, launchCount: 3, lastLaunchedAt: 10 },
  { id: 'c', name: 'C', path: 'c', type: 'folder', order: 2, launchCount: 3, lastLaunchedAt: 30 }
];

describe('shortcut sorting', () => {
  it('puts pinned items first when enabled', () => {
    expect(sortShortcutItemsForDisplay(items, 'name', true).map((item) => item.id)).toEqual(['b', 'c', 'a']);
  });

  it('按名称时文件夹排在文件前，组内再按名称', () => {
    const mixed: ShortcutItem[] = [
      { id: 'f1', name: 'Alpha.txt', path: 'a', type: 'file', order: 0 },
      { id: 'd1', name: 'Zeta', path: 'z', type: 'folder', order: 1 },
      { id: 'f2', name: 'Beta.exe', path: 'b', type: 'command', order: 2 },
      { id: 'd2', name: 'Alpha', path: 'd', type: 'folder', order: 3 },
      { id: 'f3', name: 'Gamma.url', path: 'c', type: 'url', order: 4 },
    ];
    expect(sortShortcutItemsForDisplay(mixed, 'name', false).map((item) => item.id)).toEqual([
      'd2', // 文件夹 Alpha
      'd1', // 文件夹 Zeta
      'f2', // command Beta.exe
      'f1', // file Alpha.txt
      'f3', // url Gamma.url
    ]);
  });

  it('按类型保持纯类型名分组', () => {
    const mixed: ShortcutItem[] = [
      { id: 'd1', name: 'Alpha', path: 'd', type: 'folder', order: 0 },
      { id: 'f1', name: 'Zeta', path: 'a', type: 'file', order: 1 },
      { id: 'c1', name: 'Beta', path: 'b', type: 'command', order: 2 },
    ];
    expect(sortShortcutItemsForDisplay(mixed, 'type', false).map((item) => item.id)).toEqual(['c1', 'f1', 'd1']);
  });

  it('sorts by recent launch time', () => {
    expect(sortShortcutItemsForDisplay(items, 'recent', false).map((item) => item.id)).toEqual(['c', 'a', 'b']);
  });

  it('sorts by frequency and uses recency as tie breaker', () => {
    expect(sortShortcutItemsForDisplay(items, 'frequent', false).map((item) => item.id)).toEqual(['c', 'b', 'a']);
  });

  it('reindexes order without mutating the source', () => {
    const source = [{ order: 8, value: 'a' }, { order: 2, value: 'b' }];
    expect(reindex(source).map((item) => item.order)).toEqual([0, 1]);
    expect(source.map((item) => item.order)).toEqual([8, 2]);
  });
});
