import type { ShortcutItem, SortMode } from '../types';

export function byOrder<T extends { order: number }>(a: T, b: T): number {
  return a.order - b.order;
}

export function reindex<T extends { order: number }>(items: T[]): T[] {
  return items.map((item, index) => ({ ...item, order: index }));
}

export function sortShortcutItemsForDisplay(items: ShortcutItem[], mode: SortMode | string): ShortcutItem[] {
  const sorted = items.slice();
  if (mode === 'name') {
    sorted.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' }));
  } else if (mode === 'type') {
    sorted.sort((a, b) => {
      const typeOrder = a.type.localeCompare(b.type);
      return typeOrder || a.name.localeCompare(b.name, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' });
    });
  } else {
    sorted.sort(byOrder);
  }
  return sorted;
}

export function sortShortcutItemsForStorage(items: ShortcutItem[], mode: SortMode): ShortcutItem[] {
  return reindex(sortShortcutItemsForDisplay(items, mode));
}
