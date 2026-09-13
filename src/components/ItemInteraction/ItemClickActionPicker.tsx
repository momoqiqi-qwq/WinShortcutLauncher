import type { ItemClickAction, ShortcutType } from '../../types';
import { getItemPathLabel, resolveItemClickAction, describeResolvedItemAction, type ItemClickInteraction } from '../../lib/itemClickActions';

interface ItemClickActionPickerProps {
  value?: ItemClickAction;
  interaction: ItemClickInteraction;
  itemType: ShortcutType;
  globalLaunchMode: 'single' | 'double';
  onChange: (value: ItemClickAction) => void;
  className?: string;
}

export function ItemClickActionPicker({
  value,
  interaction,
  itemType,
  globalLaunchMode,
  onChange,
  className,
}: ItemClickActionPickerProps) {
  const inherited = resolveItemClickAction('inherit', interaction, globalLaunchMode);
  const inheritedLabel = describeResolvedItemAction(inherited, { type: itemType });
  const pathLabel = getItemPathLabel({ type: itemType });

  return (
    <select
      className={className ?? 'soft-input'}
      value={value ?? 'inherit'}
      onChange={(event) => onChange(event.target.value as ItemClickAction)}
    >
      <option value="inherit">跟随全局（{inheritedLabel}）</option>
      <option value="open">打开项目</option>
      <option value="copy-name">复制名称</option>
      <option value="copy-path">复制{pathLabel}</option>
      <option value="copy-name-path">复制名称 + {pathLabel}</option>
      <option value="none">无动作</option>
    </select>
  );
}
