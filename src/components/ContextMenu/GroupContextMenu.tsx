import { ChevronRight, FolderPlus, Merge, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ContextMenuState } from '../../types';
import { useAppStore } from '../../stores/appStore';
import { useSmartMenuPosition } from './useSmartMenuPosition';
import { byOrder } from '../../lib/sort';
import { uiConfirm } from '../../lib/uiDialog';

interface GroupContextMenuProps {
  menu: Extract<ContextMenuState, { kind: 'group' }>;
  onClose: () => void;
}

export function GroupContextMenu({ menu, onClose }: GroupContextMenuProps) {
  const rawGroups = useAppStore((state) => state.groups);
  const groups = useMemo(() => rawGroups.slice().sort(byOrder), [rawGroups]);
  const group = groups.find((entry) => entry.id === menu.groupId);
  const addGroup = useAppStore((state) => state.addGroup);
  const deleteGroup = useAppStore((state) => state.deleteGroup);
  const mergeGroup = useAppStore((state) => state.mergeGroup);
  const { ref, style, submenuClassName } = useSmartMenuPosition(menu.x, menu.y, 8, 260);
  const [openSubmenu, setOpenSubmenu] = useState<'merge' | null>(null);

  if (!group) return null;
  const currentGroup = group;
  const targetGroups = groups.filter((entry) => entry.id !== currentGroup.id);

  function createGroup() {
    addGroup('新分组');
    onClose();
  }

  async function remove() {
    if (groups.length <= 1) return;
    const ok = await uiConfirm(`确定删除分区「${currentGroup.name}」及其中所有子目录吗？`);
    if (ok) deleteGroup(currentGroup.id);
    onClose();
  }

  async function mergeTo(targetGroupId: string) {
    const target = groups.find((entry) => entry.id === targetGroupId);
    const ok = await uiConfirm(`确定把分区「${currentGroup.name}」合并到「${target?.name ?? '目标分区'}」吗？合并后当前分区会被删除。`);
    if (ok) mergeGroup(currentGroup.id, targetGroupId);
    onClose();
  }

  return (
    <div
      ref={ref}
      className={`menu-surface item-context-menu group-context-menu ${submenuClassName}`}
      style={style}
      onMouseDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="menu-item" onMouseEnter={() => setOpenSubmenu(null)} onClick={createGroup}><span>新建分区</span><FolderPlus size={15} /></div>
      <div className={`menu-item with-submenu ${targetGroups.length === 0 ? 'disabled' : ''}`} onMouseEnter={() => setOpenSubmenu('merge')} onClick={() => setOpenSubmenu((value) => value === 'merge' ? null : 'merge')}>
        <span>合并到分区</span><ChevronRight size={14} />
        {openSubmenu === 'merge' && targetGroups.length > 0 && (
          <div className="menu-surface directory-submenu small-submenu">
            {targetGroups.map((target) => (
              <div className="menu-item" key={target.id} onClick={() => mergeTo(target.id)}>
                <span>{target.name}</span><Merge size={13} />
              </div>
            ))}
          </div>
        )}
      </div>
      <div className={`menu-item danger ${groups.length <= 1 ? 'disabled' : ''}`} onMouseEnter={() => setOpenSubmenu(null)} onClick={remove}><span>删除分区</span><Trash2 size={15} /></div>
    </div>
  );
}
