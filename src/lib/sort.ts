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

/** 名称排序：中文/数字感知的本地化比较。 */
function compareName(a: ShortcutItem, b: ShortcutItem): number {
  return safeText(a.name).localeCompare(safeText(b.name), 'zh-Hans-CN', { numeric: true, sensitivity: 'base' });
}

/**
 * 类型分组比较：**文件夹永远排在最前**，其余类型按类型名排序。
 *
 * 「按名称」排序时先用它做一级键，再按名称排 —— 否则文件夹和文件会按首字母
 * 交错混在一起（映射文件夹 / 开始菜单这类镜像目录尤其明显）。
 */
function compareTypeGroup(a: ShortcutItem, b: ShortcutItem): number {
  const aFolder = a.type === 'folder';
  const bFolder = b.type === 'folder';
  if (aFolder !== bFolder) return aFolder ? -1 : 1;
  return safeText(a.type).localeCompare(safeText(b.type));
}

export function sortShortcutItemsForDisplay(items: ShortcutItem[], mode: SortMode | string, pinnedFirst = true): ShortcutItem[] {
  const sorted = items.slice();
  sorted.sort((a, b) => {
    const pinnedOrder = comparePinned(a, b, pinnedFirst);
    if (pinnedOrder) return pinnedOrder;

    if (mode === 'name') {
      // 一级：类型分组（文件夹优先）；二级：名称。
      return compareTypeGroup(a, b) || compareName(a, b);
    }
    if (mode === 'type') {
      // 「按类型」保持原有的纯类型名分组（command → file → folder → url）。
      return safeText(a.type).localeCompare(safeText(b.type)) || compareName(a, b);
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
