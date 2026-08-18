import { ChevronRight, Eraser, Merge, Pencil, Repeat2, StickyNote, Trash2 } from 'lucide-react';
import { useState, type MouseEvent } from 'react';
import type { ContextMenuState, DirectoryKind } from '../../types';
import { useAppStore } from '../../stores/appStore';
import { useSmartMenuPosition } from './useSmartMenuPosition';
import { byOrder } from '../../lib/sort';
import { uiConfirm, uiPrompt } from '../../lib/uiDialog';

interface DirectoryContextMenuProps {
  menu: Extract<ContextMenuState, { kind: 'directory' }>;
  onClose: () => void;
}

export function DirectoryContextMenu({ menu, onClose }: DirectoryContextMenuProps) {
  const groups = useAppStore((state) => state.groups);
  const renameDirectory = useAppStore((state) => state.renameDirectory);
  const deleteDirectory = useAppStore((state) => state.deleteDirectory);
  const clearDirectoryItems = useAppStore((state) => state.clearDirectoryItems);
  const mergeDirectory = useAppStore((state) => state.mergeDirectory);
  const setDirectoryKind = useAppStore((state) => state.setDirectoryKind);
  const experience = useAppStore((state) => state.experience);
  const hiddenItems = new Set(experience.directoryContextMenuHiddenItems ?? []);
  const show = (id: import('../../types').DirectoryContextMenuItemId) => !hiddenItems.has(id);
  const { ref, style, submenuClassName } = useSmartMenuPosition(menu.x, menu.y, 8, 260);
  const [openSubmenu, setOpenSubmenu] = useState<'merge' | null>(null);
  const group = groups.find((entry) => entry.directories.some((dir) => dir.id === menu.directoryId));
  const directory = group?.directories.find((dir) => dir.id === menu.directoryId);

  if (!group || !directory) return null;
  const currentGroup = group;
  const currentDirectory = directory;
  const currentKind = currentDirectory.kind ?? 'normal';
  const mergeTargets = currentGroup.directories
    .slice()
    .sort(byOrder)
    .filter((dir) => dir.id !== currentDirectory.id && (dir.kind ?? 'normal') === currentKind && currentKind !== 'all');
  const canSwitchToNotes = currentKind === 'normal' && currentDirectory.items.length === 0;
  const canSwitchToNormal = currentKind === 'notes';

  async function rename() {
    const next = await uiPrompt('子目录名称', currentDirectory.name);
    if (next?.trim()) renameDirectory(currentDirectory.id, next.trim());
    onClose();
  }

  async function clear() {
    if (currentDirectory.kind === 'all' || currentDirectory.kind === 'notes') return;
    const ok = !experience.confirmClearDirectory || await uiConfirm(`确定清空「${currentDirectory.name}」中的全部快捷项目吗？`);
    if (ok) clearDirectoryItems(currentDirectory.id);
    onClose();
  }

  async function remove() {
    if (currentGroup.directories.length <= 1) return;
    const ok = !experience.confirmDeleteNavigation || await uiConfirm(`确定删除子目录「${currentDirectory.name}」吗？`);
    if (ok) deleteDirectory(currentDirectory.id);
    onClose();
  }

  async function mergeTo(targetDirectoryId: string) {
    const target = currentGroup.directories.find((dir) => dir.id === targetDirectoryId);
    const ok = await uiConfirm(`确定把子目录「${currentDirectory.name}」合并到「${target?.name ?? '目标子目录'}」吗？合并后当前子目录会被删除。`);
    if (ok) mergeDirectory(currentDirectory.id, targetDirectoryId);
    onClose();
  }

  function switchKind(kind: DirectoryKind) {
    setDirectoryKind(currentDirectory.id, kind);
    onClose();
  }

  const showManageSection = show('rename') || show('merge') || show('switchToNotes') || show('switchToNormal');
  const showDangerSection = show('clear') || show('delete');

  return (
    <div
      ref={ref}
      className={`menu-surface item-context-menu directory-context-menu ${submenuClassName}`}
      style={style}
      onMouseDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      {show('rename') && <div className="menu-item" onMouseEnter={() => setOpenSubmenu(null)} onClick={() => void rename()}><span>重命名子目录</span><Pencil size={15} /></div>}
      {show('merge') && <div className={`menu-item with-submenu ${mergeTargets.length === 0 ? 'disabled' : ''}`} onMouseEnter={() => setOpenSubmenu('merge')} onClick={() => mergeTargets.length > 0 && setOpenSubmenu((value) => value === 'merge' ? null : 'merge')}>
        <span>合并到子目录</span><ChevronRight size={14} />
        {openSubmenu === 'merge' && mergeTargets.length > 0 && (
          <div className="menu-surface directory-submenu small-submenu">
            {mergeTargets.map((target) => (
              <div
                className="menu-item"
                key={target.id}
                onClick={(event: MouseEvent<HTMLDivElement>) => {
                  event.stopPropagation();
                  void mergeTo(target.id);
                }}
              >
                <span>{target.name}</span><Merge size={13} />
              </div>
            ))}
          </div>
        )}
      </div>}
      {show('switchToNotes') && <div className={`menu-item ${canSwitchToNotes ? '' : 'disabled'}`} onMouseEnter={() => setOpenSubmenu(null)} onClick={() => canSwitchToNotes && switchKind('notes')}><span>空子目录切换为便签</span><StickyNote size={15} /></div>}
      {show('switchToNormal') && <div className={`menu-item ${canSwitchToNormal ? '' : 'disabled'}`} onMouseEnter={() => setOpenSubmenu(null)} onClick={() => canSwitchToNormal && switchKind('normal')}><span>便签切换为普通子目录</span><Repeat2 size={15} /></div>}
      {showManageSection && showDangerSection && <div className="menu-separator" />}
      {show('clear') && <div className={`menu-item ${currentDirectory.kind === 'all' || currentDirectory.kind === 'notes' ? 'disabled' : ''}`} onMouseEnter={() => setOpenSubmenu(null)} onClick={() => void clear()}><span>清空子目录项目</span><Eraser size={15} /></div>}
      {show('delete') && <div className={`menu-item danger ${currentGroup.directories.length <= 1 ? 'disabled' : ''}`} onMouseEnter={() => setOpenSubmenu(null)} onClick={() => void remove()}><span>删除子目录</span><Trash2 size={15} /></div>}
      {!showManageSection && !showDangerSection && <div className="menu-empty-hint">此菜单项目已全部隐藏，可在设置中恢复</div>}
    </div>
  );
}
