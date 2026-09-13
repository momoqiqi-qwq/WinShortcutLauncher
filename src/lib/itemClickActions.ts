import type { ItemClickAction, ShortcutItem } from '../types';

export type ResolvedItemClickAction = Exclude<ItemClickAction, 'inherit'>;
export type ItemClickInteraction = 'single' | 'double';

const VALID_ACTIONS = new Set<ItemClickAction>([
  'inherit',
  'open',
  'copy-name',
  'copy-path',
  'copy-name-path',
  'none',
]);

export function normalizeItemClickAction(value: unknown): ItemClickAction | undefined {
  return typeof value === 'string' && VALID_ACTIONS.has(value as ItemClickAction)
    ? value as ItemClickAction
    : undefined;
}

export function resolveItemClickAction(
  action: ItemClickAction | undefined,
  interaction: ItemClickInteraction,
  launchMode: 'single' | 'double',
): ResolvedItemClickAction {
  if (action && action !== 'inherit') return action;
  if (launchMode === 'single') return interaction === 'single' ? 'open' : 'none';
  return interaction === 'double' ? 'open' : 'none';
}

export function getItemPathLabel(item: Pick<ShortcutItem, 'type'>) {
  return item.type === 'url' ? '网址' : item.type === 'command' ? '命令' : '路径';
}

export function getItemCopyPayload(
  item: Pick<ShortcutItem, 'name' | 'path' | 'type'>,
  action: ResolvedItemClickAction,
): { text: string; label: string } | null {
  const name = String(item.name ?? '').trim();
  const path = String(item.path ?? '').trim();
  const pathLabel = getItemPathLabel(item);
  if (action === 'copy-name') return { text: name, label: '名称' };
  if (action === 'copy-path') return { text: path, label: pathLabel };
  if (action === 'copy-name-path') {
    const text = [name, path].filter(Boolean).join('\n');
    return { text, label: `名称 + ${pathLabel}` };
  }
  return null;
}

export function describeResolvedItemAction(
  action: ResolvedItemClickAction,
  item: Pick<ShortcutItem, 'type'>,
) {
  const pathLabel = getItemPathLabel(item);
  if (action === 'open') return '打开项目';
  if (action === 'copy-name') return '复制名称';
  if (action === 'copy-path') return `复制${pathLabel}`;
  if (action === 'copy-name-path') return `复制名称 + ${pathLabel}`;
  return '无动作';
}

export function getItemInteractionHint(
  item: Pick<ShortcutItem, 'type' | 'singleClickAction' | 'doubleClickAction'>,
  launchMode: 'single' | 'double',
  customSort: boolean,
) {
  const single = resolveItemClickAction(item.singleClickAction, 'single', launchMode);
  const double = resolveItemClickAction(item.doubleClickAction, 'double', launchMode);
  const parts: string[] = [];
  if (single !== 'none') parts.push(`单击：${describeResolvedItemAction(single, item)}`);
  if (double !== 'none') parts.push(`双击：${describeResolvedItemAction(double, item)}`);
  if (customSort) parts.push(single !== 'none' ? '长按拖动排序' : '拖动排序');
  parts.push('右键管理');
  return parts.join('；');
}
