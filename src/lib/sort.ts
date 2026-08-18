import type { ShortcutItem, SortMode } from '../types';

export function byOrder<T extends { order: number }>(a: T, b: T): number {
  const left = Number(a?.order);
  const right = Number(b?.order);
  return (Number.isFinite(left) ? left : 0) - (Number.isFinite(right) ? right : 0);
}

function safeText(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}


export function reindex<T extends { order: number }>(items: T[]): T[] {
  return items.map((item, index) => ({ ...item, order: index }));
}

function comparePinned(a: ShortcutItem, b: ShortcutItem, pinnedFirst: boolean) {
  if (!pinnedFirst) return 0;
  return Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
}

export function sortShortcutItemsForDisplay(items: ShortcutItem[], mode: SortMode | string, pinnedFirst = true): ShortcutItem[] {
  const sorted = items.slice();
  sorted.sort((a, b) => {
    const pinnedOrder = comparePinned(a, b, pinnedFirst);
    if (pinnedOrder) return pinnedOrder;

    if (mode === 'name') {
      return safeText(a.name).localeCompare(safeText(b.name), 'zh-Hans-CN', { numeric: true, sensitivity: 'base' });
    }
    if (mode === 'type') {
      const typeOrder = safeText(a.type).localeCompare(safeText(b.type));
      return typeOrder || safeText(a.name).localeCompare(safeText(b.name), 'zh-Hans-CN', { numeric: true, sensitivity: 'base' });
    }
    if (mode === 'recent') {
      return (b.lastLaunchedAt ?? 0) - (a.lastLaunchedAt ?? 0)
        || (b.launchCount ?? 0) - (a.launchCount ?? 0)
        || byOrder(a, b);
    }
    if (mode === 'frequent') {
      return (b.launchCount ?? 0) - (a.launchCount ?? 0)
        || (b.lastLaunchedAt ?? 0) - (a.lastLaunchedAt ?? 0)
        || byOrder(a, b);
    }
    return byOrder(a, b);
  });
  return sorted;
}

export function sortShortcutItemsForStorage(items: ShortcutItem[], mode: SortMode): ShortcutItem[] {
  return reindex(sortShortcutItemsForDisplay(items, mode, false));
}
