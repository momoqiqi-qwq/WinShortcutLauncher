import type { ShortcutItem } from '../types';

export function hasUsableItemIcon(item: Pick<ShortcutItem, 'icon'>) {
  return typeof item.icon === 'string' && item.icon.trim().length > 0;
}

/** “刷新本页图标”只补齐缺失图标，绝不覆盖已有图标。 */
export function getItemsNeedingPageIconRefresh<T extends Pick<ShortcutItem, 'icon'>>(items: readonly T[]): T[] {
  return items.filter((item) => !hasUsableItemIcon(item));
}
