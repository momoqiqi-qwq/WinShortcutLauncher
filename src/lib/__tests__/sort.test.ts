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
    expect(sortShortcutItemsForDisplay(items, 'name', true).map((item) => item.id)).toEqual(['b', 'a', 'c']);
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
