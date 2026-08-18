import { describe, expect, it } from 'vitest';
import { getItemsNeedingPageIconRefresh, hasUsableItemIcon } from '../pageIconPolicy';

describe('page icon completion policy', () => {
  const items = [
    { id: 'a', icon: 'data:image/png;base64,abc' },
    { id: 'b', icon: '' },
    { id: 'c' },
    { id: 'd', icon: '   ' }
  ];

  it('treats trimmed non-empty icons as existing', () => {
    expect(hasUsableItemIcon(items[0])).toBe(true);
    expect(hasUsableItemIcon(items[3])).toBe(false);
  });

  it('only returns projects without icons', () => {
    expect(getItemsNeedingPageIconRefresh(items).map((item) => item.id)).toEqual(['b', 'c', 'd']);
  });

  it('never mutates the original list', () => {
    const copy = items.slice();
    getItemsNeedingPageIconRefresh(items);
    expect(items).toEqual(copy);
  });
});
