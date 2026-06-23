import { ChevronRight, Eraser, Merge, Pencil, Plus, Repeat2, StickyNote, Tags, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { ContextMenuState, DirectoryKind } from '../../types';
import { useAppStore } from '../../stores/appStore';
import { useSmartMenuPosition } from './useSmartMenuPosition';
import { byOrder } from '../../lib/sort';
import { showLauncherNotice } from '../../lib/notify';
import { uiConfirm, uiPrompt } from '../../lib/uiDialog';

interface DirectoryContextMenuProps {
  menu: Extract<ContextMenuState, { kind: 'directory' }>;
  onClose: () => void;
}

export function DirectoryContextMenu({ menu, onClose }: DirectoryContextMenuProps) {
  const groups = useAppStore((state) => state.groups);
  const addDirectory = useAppStore((state) => state.addDirectory);
  const renameDirectory = useAppStore((state) => state.renameDirectory);
  const deleteDirectory = useAppStore((state) => state.deleteDirectory);
  const clearDirectoryItems = useAppStore((state) => state.clearDirectoryItems);
  const mergeDirectory = useAppStore((state) => state.mergeDirectory);
  const setDirectoryKind = useAppStore((state) => state.setDirectoryKind);
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

  function createDirectory(kind: DirectoryKind, name: string) {
    if (currentKind === 'all') {
      showLauncherNotice('特殊标签不可添加子标签');
      onClose();
      return;
    }
    if (kind === 'all' && currentGroup.directories.some((dir) => (dir.kind ?? 'normal') === 'all')) {
      showLauncherNotice('特殊标签已存在');
      onClose();
      return;
    }
    addDirectory(currentGroup.id, name, kind);
    onClose();
  }

  async function rename() {
    const next = await uiPrompt('子目录名称', currentDirectory.name);
    if (next?.trim()) renameDirectory(currentDirectory.id, next.trim());
    onClose();
  }

  async function clear() {
    if (currentDirectory.kind === 'all' || currentDirectory.kind === 'notes') return;
    const ok = await uiConfirm(`确定清空「${currentDirectory.name}」中的全部快捷项目吗？`);
    if (ok) clearDirectoryItems(currentDirectory.id);
    onClose();
  }

  async function remove() {
    if (currentGroup.directories.length <= 1) return;
    const ok = await uiConfirm(`确定删除标签「${currentDirectory.name}」吗？`);
    if (ok) deleteDirectory(currentDirectory.id);
    onClose();
  }

  async function mergeTo(targetDirectoryId: string) {
    const target = currentGroup.directories.find((dir) => dir.id === targetDirectoryId);
    const ok = await uiConfirm(`确定把标签「${currentDirectory.name}」合并到「${target?.name ?? '目标标签'}」吗？合并后当前标签会被删除。`);
    if (ok) mergeDirectory(currentDirectory.id, targetDirectoryId);
    onClose();
  }

  function switchKind(kind: DirectoryKind) {
    setDirectoryKind(currentDirectory.id, kind);
    onClose();
  }

  return (
    <div
      ref={ref}
      className={`menu-surface item-context-menu directory-context-menu ${submenuClassName}`}
      style={style}
      onMouseDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="menu-item" onMouseEnter={() => setOpenSubmenu(null)} onClick={() => createDirectory('normal', '新目录')}><span>新建标签</span><Plus size={15} /></div>
      <div className="menu-item" onMouseEnter={() => setOpenSubmenu(null)} onClick={() => createDirectory('all', '全部')}><span>新建标签[全部]</span><Tags size={15} /></div>
      <div className="menu-item" onMouseEnter={() => setOpenSubmenu(null)} onClick={() => createDirectory('notes', '便签')}><span>新建标签[便签]</span><StickyNote size={15} /></div>
      <div className="menu-separator" />
      <div className="menu-item" onMouseEnter={() => setOpenSubmenu(null)} onClick={rename}><span>重命名</span><Pencil size={15} /></div>
      <div className={`menu-item with-submenu ${mergeTargets.length === 0 ? 'disabled' : ''}`} onMouseEnter={() => setOpenSubmenu('merge')} onClick={() => setOpenSubmenu((value) => value === 'merge' ? null : 'merge')}>
        <span>合并到标签</span><ChevronRight size={14} />
        {openSubmenu === 'merge' && mergeTargets.length > 0 && (
          <div className="menu-surface directory-submenu small-submenu">
            {mergeTargets.map((target) => (
              <div className="menu-item" key={target.id} onClick={() => mergeTo(target.id)}><span>{target.name}</span><Merge size={13} /></div>
            ))}
          </div>
        )}
      </div>
      <div className={`menu-item ${canSwitchToNotes ? '' : 'disabled'}`} onMouseEnter={() => setOpenSubmenu(null)} onClick={() => canSwitchToNotes && switchKind('notes')}><span>空标签切换为便签</span><StickyNote size={15} /></div>
      <div className={`menu-item ${canSwitchToNormal ? '' : 'disabled'}`} onMouseEnter={() => setOpenSubmenu(null)} onClick={() => canSwitchToNormal && switchKind('normal')}><span>便签切换为普通标签</span><Repeat2 size={15} /></div>
      <div className="menu-separator" />
      <div className={`menu-item ${currentDirectory.kind === 'all' || currentDirectory.kind === 'notes' ? 'disabled' : ''}`} onMouseEnter={() => setOpenSubmenu(null)} onClick={clear}><span>清空本标签应用</span><Eraser size={15} /></div>
      <div className={`menu-item danger ${currentGroup.directories.length <= 1 ? 'disabled' : ''}`} onMouseEnter={() => setOpenSubmenu(null)} onClick={remove}><span>删除标签</span><Trash2 size={15} /></div>
    </div>
  );
}
