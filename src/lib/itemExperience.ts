import type { AfterLaunchAction, ItemTooltipMode, ShortcutItem } from '../types';
import { searchTextMatches } from './pinyinSearch';

export function matchesItemQuery(item: ShortcutItem, query: string, includePath = true) {
  if (!query.trim()) return true;
  if (searchTextMatches(item.name, query)) return true;
  if (searchTextMatches(item.type, query)) return true;
  return includePath && searchTextMatches(item.path, query);
}

export function buildItemTooltip(item: ShortcutItem, mode: ItemTooltipMode) {
  if (mode === 'off') return undefined;
  if (mode === 'name') return item.name;
  const details = [item.name];
  if (item.path?.trim()) details.push(item.path.trim());
  const launchCount = Math.max(0, item.launchCount ?? 0);
  if (launchCount > 0) details.push(`启动次数：${launchCount}`);
  if (item.lastLaunchedAt) {
    const date = new Date(item.lastLaunchedAt);
    if (!Number.isNaN(date.getTime())) details.push(`最近启动：${date.toLocaleString()}`);
  }
  return details.join('\n');
}

export function nextKeyboardItemIndex(
  currentIndex: number,
  itemCount: number,
  key: string,
) {
  if (itemCount <= 0) return -1;
  if (key === 'Home') return 0;
  if (key === 'End') return itemCount - 1;
  const safeCurrent = currentIndex >= 0 && currentIndex < itemCount ? currentIndex : -1;
  if (key === 'ArrowLeft' || key === 'ArrowUp') {
    return safeCurrent <= 0 ? itemCount - 1 : safeCurrent - 1;
  }
  if (key === 'ArrowRight' || key === 'ArrowDown') {
    return safeCurrent < 0 || safeCurrent >= itemCount - 1 ? 0 : safeCurrent + 1;
  }
  return safeCurrent;
}

export function normalizeAfterLaunchAction(action: unknown): AfterLaunchAction {
  return action === 'minimize' || action === 'hide' ? action : 'keep';
}

export type ItemActivationInteraction = 'pointer-up' | 'double-click';

export function shouldLaunchItemFromInteraction(
  launchMode: 'single' | 'double',
  interaction: ItemActivationInteraction,
  options: { button?: number; modified?: boolean; dragged?: boolean } = {},
) {
  if ((options.button ?? 0) !== 0 || options.modified || options.dragged) return false;
  return launchMode === 'single' ? interaction === 'pointer-up' : interaction === 'double-click';
}

export function getItemActivationHint(launchMode: 'single' | 'double', customSort: boolean) {
  if (launchMode === 'single') return customSort ? '单击启动；长按拖动排序；右键管理' : '单击启动；右键管理';
  return customSort ? '双击启动；拖动排序；右键管理' : '双击启动；右键管理';
}
