import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { ChevronRight, ClipboardPaste, Copy, Eraser, FolderInput, FolderOpen, FolderSymlink, Merge, Pencil, RefreshCw, Repeat2, StickyNote, Trash2 } from 'lucide-react';
import { useState, type MouseEvent } from 'react';
import type { ContextMenuState, DirectoryKind } from '../../types';
import { useAppStore } from '../../stores/appStore';
import { useSmartMenuPosition } from './useSmartMenuPosition';
import { byOrder } from '../../lib/sort';
import { uiAlert, uiConfirm, uiPrompt } from '../../lib/uiDialog';
import { showLauncherNotice } from '../../lib/notify';
import { canPasteDirectoryIntoGroup } from '../../lib/navigationClipboard';
import { getStartMenuFolder } from '../../lib/startMenu';
import { getMappedPath, isMappedDirectory, mappedFolderLabel, validateMappedFolder } from '../../lib/mappedFolder';

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
  const itemClipboard = useAppStore((state) => state.itemClipboard);
  const pasteItemsToDirectory = useAppStore((state) => state.pasteItemsToDirectory);
  const navigationClipboard = useAppStore((state) => state.navigationClipboard);
  const copyDirectoryToClipboard = useAppStore((state) => state.copyDirectoryToClipboard);
  const pasteDirectoryToGroup = useAppStore((state) => state.pasteDirectoryToGroup);
  const moveDirectoryToGroup = useAppStore((state) => state.moveDirectoryToGroup);
  const experience = useAppStore((state) => state.experience);
  const refreshStartMenu = useAppStore((state) => state.refreshStartMenu);
  const startMenuFolder = useAppStore((state) => state.startMenuFolder);
  const refreshMappedFolder = useAppStore((state) => state.refreshMappedFolder);
  const setDirectoryMappedPath = useAppStore((state) => state.setDirectoryMappedPath);
  const mappedError = useAppStore((state) => state.mappedError);
  const hiddenItems = new Set(experience.directoryContextMenuHiddenItems ?? []);
  const show = (id: import('../../types').DirectoryContextMenuItemId) => !hiddenItems.has(id);
  const { ref, style, submenuClassName } = useSmartMenuPosition(menu.x, menu.y, 8, 260);
  const [openSubmenu, setOpenSubmenu] = useState<'merge' | 'move' | null>(null);
  const group = groups.find((entry) => entry.directories.some((dir) => dir.id === menu.directoryId));
  const directory = group?.directories.find((dir) => dir.id === menu.directoryId);

  if (!group || !directory) return null;
  const currentGroup = group;
  const currentDirectory = directory;
  const currentKind = currentDirectory.kind ?? 'normal';
  const isStartMenu = currentKind === 'startMenu';
  const isMapped = isMappedDirectory(currentDirectory);
  const mappedRoot = isMapped ? getMappedPath(currentDirectory) : '';
  const mergeTargets = currentGroup.directories
    .slice()
    .sort(byOrder)
    // 映射子目录各自镜像不同文件夹，合并没有意义。
    .filter((dir) => dir.id !== currentDirectory.id && (dir.kind ?? 'normal') === currentKind && currentKind !== 'all' && currentKind !== 'mapped');
  const moveTargets = groups.slice().sort(byOrder).filter((entry) => entry.id !== currentGroup.id);
  const canSwitchToNotes = currentKind === 'normal' && currentDirectory.items.length === 0;
  const canSwitchToNormal = currentKind === 'notes';
  const copiedDirectory = navigationClipboard?.kind === 'directory' ? navigationClipboard.directory : null;
  const canPasteDirectory = Boolean(copiedDirectory && canPasteDirectoryIntoGroup(copiedDirectory, currentGroup));

  async function rename() {
    const next = await uiPrompt('子目录名称', currentDirectory.name);
    if (next?.trim()) renameDirectory(currentDirectory.id, next.trim());
    onClose();
  }

  async function clear() {
    if (currentDirectory.kind === 'all' || currentDirectory.kind === 'notes' || isMapped) return;
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

  function pasteItems() {
    const count = pasteItemsToDirectory(currentDirectory.id);
    if (count > 0) showLauncherNotice(`已粘贴 ${count} 个项目到「${currentDirectory.name}」`);
    onClose();
  }

  async function refreshStartMenuItems() {
    onClose();
    await refreshStartMenu();
    const state = useAppStore.getState();
    if (state.startMenuError) {
      showLauncherNotice(`刷新开始菜单失败：${state.startMenuError}`);
      return;
    }
    showLauncherNotice(`已刷新开始菜单：${state.startMenuItems.length} 个快捷方式`);
  }

  async function openStartMenuFolder() {
    onClose();
    try {
      const folder = startMenuFolder || await getStartMenuFolder();
      await invoke('open_file_location', { path: folder });
    } catch (error) {
      void uiAlert(`打开开始菜单文件夹失败：${String(error)}`);
    }
  }

  async function refreshMappedFolderItems() {
    onClose();
    if (!mappedRoot) {
      showLauncherNotice('该映射子目录还没有选择文件夹，请用「重新选择文件夹」指定');
      return;
    }
    await refreshMappedFolder(currentDirectory.id);
    const error = useAppStore.getState().mappedError[currentDirectory.id];
    if (error) {
      showLauncherNotice(`刷新映射文件夹失败：${error}`);
      return;
    }
    showLauncherNotice(`已刷新映射文件夹：${useAppStore.getState().getMappedItems(currentDirectory.id).length} 个项目`);
  }

  async function openMappedFolder() {
    onClose();
    if (!mappedRoot) {
      showLauncherNotice('该映射子目录还没有选择文件夹，请用「重新选择文件夹」指定');
      return;
    }
    try {
      await invoke('open_file_location', { path: mappedRoot });
    } catch (error) {
      void uiAlert(`打开映射文件夹失败：${String(error)}`);
    }
  }

  /** 重新指定被镜像的文件夹；只改配置里的路径，不动原文件夹里的任何内容。 */
  async function changeMappedFolder() {
    const picked = await open({ directory: true, multiple: false, title: '选择要映射的文件夹' });
    if (typeof picked !== 'string' || !picked.trim()) {
      onClose();
      return;
    }
    try {
      const resolved = await validateMappedFolder(picked);
      setDirectoryMappedPath(currentDirectory.id, resolved);
      await refreshMappedFolder(currentDirectory.id);
      const error = useAppStore.getState().mappedError[currentDirectory.id];
      showLauncherNotice(error
        ? `已切换映射文件夹，但读取失败：${error}`
        : `已切换映射到「${mappedFolderLabel(resolved)}」`);
    } catch (error) {
      void uiAlert(`无法使用该文件夹：${String(error)}`);
    }
    onClose();
  }

  function copyDirectory() {
    if (copyDirectoryToClipboard(currentDirectory.id)) {
      showLauncherNotice(`已复制子目录「${currentDirectory.name}」；可粘贴到其他父目录`);
    }
    onClose();
  }

  function pasteDirectory() {
    if (!copiedDirectory) return;
    const pastedId = pasteDirectoryToGroup(currentGroup.id);
    if (pastedId) {
      const pasted = useAppStore.getState().groups
        .find((entry) => entry.id === currentGroup.id)
        ?.directories.find((entry) => entry.id === pastedId);
      showLauncherNotice(`已粘贴子目录到「${currentGroup.name}」${pasted ? `：${pasted.name}` : ''}`);
    } else if ((copiedDirectory.kind ?? 'normal') === 'all') {
      showLauncherNotice(`「${currentGroup.name}」已经有“全部”子目录，不能重复粘贴`);
    }
    onClose();
  }

  function moveTo(targetGroupId: string) {
    const target = groups.find((entry) => entry.id === targetGroupId);
    if (!target) return;
    if (moveDirectoryToGroup(currentDirectory.id, targetGroupId)) {
      showLauncherNotice(`已将「${currentDirectory.name}」移动到「${target.name}」`);
    } else if (currentKind === 'all' || currentKind === 'startMenu') {
      const label = currentKind === 'startMenu' ? '开始菜单' : '全部';
      showLauncherNotice(`「${target.name}」已经有“${label}”子目录，无法移动`);
    }
    onClose();
  }

  const canPaste = currentKind === 'normal' && itemClipboard.length > 0;
  const showClipboardSection = show('copyDirectory') || show('pasteDirectory') || show('moveToGroup') || show('paste');
  const showStartMenuSection = isStartMenu && (show('refreshStartMenu') || show('openStartMenuFolder'));
  const showMappedSection = isMapped
    && (show('refreshMappedFolder') || show('openMappedFolder') || show('changeMappedFolder'));
  const showManageSection = show('rename') || show('merge') || show('switchToNotes') || show('switchToNormal');
  const showDangerSection = show('clear') || show('delete');
  const hasVisibleSection = showClipboardSection || showStartMenuSection || showMappedSection || showManageSection || showDangerSection;

  return (
    <div
      ref={ref}
      className={`menu-surface item-context-menu directory-context-menu ${submenuClassName}`}
      style={style}
      onMouseDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      {show('copyDirectory') && <div className="menu-item" onMouseEnter={() => setOpenSubmenu(null)} onClick={copyDirectory}><span>复制子目录</span><Copy size={15} /></div>}
      {show('pasteDirectory') && <div className={`menu-item ${canPasteDirectory ? '' : 'disabled'}`} title={copiedDirectory && !canPasteDirectory ? '目标父目录已经存在同类型的“全部/开始菜单”子目录' : undefined} onMouseEnter={() => setOpenSubmenu(null)} onClick={() => canPasteDirectory && pasteDirectory()}><span>粘贴子目录{copiedDirectory ? `「${copiedDirectory.name}」` : ''}</span><ClipboardPaste size={15} /></div>}
      {show('moveToGroup') && <div className={`menu-item with-submenu ${moveTargets.length === 0 ? 'disabled' : ''}`} onMouseEnter={() => setOpenSubmenu('move')} onClick={() => moveTargets.length > 0 && setOpenSubmenu((value) => value === 'move' ? null : 'move')}>
        <span>移动到父目录</span><ChevronRight size={14} />
        {openSubmenu === 'move' && moveTargets.length > 0 && (
          <div className="menu-surface directory-submenu small-submenu">
            {moveTargets.map((target) => {
              const blocked = (currentKind === 'all' || currentKind === 'startMenu')
                && target.directories.some((dir) => (dir.kind ?? 'normal') === currentKind);
              return (
                <div
                  className={`menu-item ${blocked ? 'disabled' : ''}`}
                  key={target.id}
                  title={blocked ? `该父目录已经存在“${currentKind === 'startMenu' ? '开始菜单' : '全部'}”子目录` : undefined}
                  onClick={(event: MouseEvent<HTMLDivElement>) => {
                    event.stopPropagation();
                    if (!blocked) moveTo(target.id);
                  }}
                >
                  <span>{target.name}</span><FolderInput size={13} />
                </div>
              );
            })}
          </div>
        )}
      </div>}
      {show('paste') && <div className={`menu-item ${canPaste ? '' : 'disabled'}`} title={isStartMenu || isMapped ? '镜像子目录的内容来自真实文件夹，不能粘贴普通项目' : undefined} onMouseEnter={() => setOpenSubmenu(null)} onClick={() => canPaste && pasteItems()}><span>粘贴项目{itemClipboard.length ? `（${itemClipboard.length} 项）` : ''}</span><ClipboardPaste size={15} /></div>}
      {showClipboardSection && (showStartMenuSection || showMappedSection || showManageSection || showDangerSection) && <div className="menu-separator" />}
      {show('refreshStartMenu') && isStartMenu && <div className="menu-item" onMouseEnter={() => setOpenSubmenu(null)} onClick={() => void refreshStartMenuItems()}><span>刷新开始菜单</span><RefreshCw size={15} /></div>}
      {show('openStartMenuFolder') && isStartMenu && <div className="menu-item" title={startMenuFolder || undefined} onMouseEnter={() => setOpenSubmenu(null)} onClick={() => void openStartMenuFolder()}><span>打开开始菜单文件夹</span><FolderOpen size={15} /></div>}
      {showStartMenuSection && (showMappedSection || showManageSection || showDangerSection) && <div className="menu-separator" />}
      {show('refreshMappedFolder') && isMapped && <div className="menu-item" title={mappedError[currentDirectory.id] || mappedRoot || undefined} onMouseEnter={() => setOpenSubmenu(null)} onClick={() => void refreshMappedFolderItems()}><span>刷新映射文件夹</span><RefreshCw size={15} /></div>}
      {show('openMappedFolder') && isMapped && <div className="menu-item" title={mappedRoot || undefined} onMouseEnter={() => setOpenSubmenu(null)} onClick={() => void openMappedFolder()}><span>打开映射文件夹</span><FolderOpen size={15} /></div>}
      {show('changeMappedFolder') && isMapped && <div className="menu-item" title={mappedRoot || '还没有选择文件夹'} onMouseEnter={() => setOpenSubmenu(null)} onClick={() => void changeMappedFolder()}><span>重新选择文件夹</span><FolderSymlink size={15} /></div>}
      {showMappedSection && (showManageSection || showDangerSection) && <div className="menu-separator" />}
      {show('rename') && <div className="menu-item" title={isStartMenu ? '只改启动器里的显示名称，不会重命名系统快捷方式' : undefined} onMouseEnter={() => setOpenSubmenu(null)} onClick={() => void rename()}><span>重命名子目录</span><Pencil size={15} /></div>}
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
      {show('switchToNotes') && !isStartMenu && !isMapped && <div className={`menu-item ${canSwitchToNotes ? '' : 'disabled'}`} onMouseEnter={() => setOpenSubmenu(null)} onClick={() => canSwitchToNotes && switchKind('notes')}><span>空子目录切换为便签</span><StickyNote size={15} /></div>}
      {show('switchToNormal') && !isStartMenu && !isMapped && <div className={`menu-item ${canSwitchToNormal ? '' : 'disabled'}`} onMouseEnter={() => setOpenSubmenu(null)} onClick={() => canSwitchToNormal && switchKind('normal')}><span>便签切换为普通子目录</span><Repeat2 size={15} /></div>}
      {showManageSection && showDangerSection && <div className="menu-separator" />}
      {show('clear') && <div className={`menu-item ${currentDirectory.kind === 'all' || currentDirectory.kind === 'notes' || isStartMenu || isMapped ? 'disabled' : ''}`} title={isStartMenu || isMapped ? '镜像子目录不能清空，请删除其中的真实项目' : undefined} onMouseEnter={() => setOpenSubmenu(null)} onClick={() => void clear()}><span>清空子目录项目</span><Eraser size={15} /></div>}
      {show('delete') && <div className={`menu-item danger ${currentGroup.directories.length <= 1 ? 'disabled' : ''}`} onMouseEnter={() => setOpenSubmenu(null)} onClick={() => void remove()}><span>删除子目录</span><Trash2 size={15} /></div>}
      {!hasVisibleSection && <div className="menu-empty-hint">此菜单项目已全部隐藏，可在设置中恢复</div>}
    </div>
  );
}
