import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { ChevronRight, Copy, FolderOpen, ImagePlus, Pencil, Shield, Sparkles, Trash2, CheckSquare, XCircle } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import type { ContextMenuState, ShortcutItem, ShortcutType } from '../../types';
import { useAppStore } from '../../stores/appStore';
import { byOrder } from '../../lib/sort';
import { launchItem } from '../ContentArea/ItemCard';
import { TextDisplaySubmenu } from './TextDisplaySubmenu';
import { useSmartMenuPosition } from './useSmartMenuPosition';
import { uiAlert, uiPrompt } from '../../lib/uiDialog';

interface ItemContextMenuProps {
  menu: Extract<ContextMenuState, { kind: 'item' }>;
  onClose: () => void;
}

type ItemSubmenu = 'text' | 'copy' | 'move' | null;


function isAbsoluteLocalPath(value: string) {
  return /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith('\\\\') || value.startsWith('/system/') || value.startsWith('/windows/');
}

function isRelativeImagePath(value: string) {
  return /\.(png|jpe?g|webp|gif|svg|ico)$/i.test(value) && !isAbsoluteLocalPath(value) && !value.startsWith('data:image/') && !value.startsWith('http://') && !value.startsWith('https://');
}

function ItemEditDialog({ item, onSave, onCancel }: {
  item: ShortcutItem;
  onSave: (patch: Partial<ShortcutItem>) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(item.name);
  const [path, setPath] = useState(item.path);
  const [type, setType] = useState<ShortcutType>(item.type);
  const [icon, setIcon] = useState(item.icon ?? '');

  function submit(event: FormEvent) {
    event.preventDefault();
    onSave({
      name: name.trim() || item.name,
      path: path.trim() || item.path,
      type,
      icon: icon.trim() || undefined
    });
  }

  return (
    <div className="edit-dialog-backdrop" onMouseDown={(event) => event.stopPropagation()} onContextMenu={(event) => event.preventDefault()}>
      <form className="edit-dialog" onSubmit={submit}>
        <div className="edit-dialog-title">编辑快捷项目</div>
        <label className="edit-field">
          <span>名称</span>
          <input autoFocus value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="edit-field">
          <span>路径或命令</span>
          <textarea rows={3} value={path} onChange={(event) => setPath(event.target.value)} />
        </label>
        <label className="edit-field">
          <span>类型</span>
          <select value={type} onChange={(event) => setType(event.target.value as ShortcutType)}>
            <option value="file">文件</option>
            <option value="folder">文件夹</option>
            <option value="url">网址</option>
            <option value="command">命令</option>
          </select>
        </label>
        <label className="edit-field">
          <span>图标</span>
          <textarea
            rows={3}
            placeholder="可填 data:image/base64、相对路径 icons/app.png、本地图标路径、/system/imageres.dll,0"
            value={icon}
            onChange={(event) => setIcon(event.target.value)}
          />
        </label>
        <div className="edit-dialog-actions">
          <button type="button" className="btn-secondary" onClick={onCancel}>取消</button>
          <button type="submit" className="btn-primary">保存</button>
        </div>
      </form>
    </div>
  );
}

export function ItemContextMenu({ menu, onClose }: ItemContextMenuProps) {
  const item = useAppStore((state) => state.getItemById(menu.itemId));
  const groups = useAppStore((state) => state.groups);
  const selectedItemIds = useAppStore((state) => state.selectedItemIds);
  const activeGroup = useAppStore((state) => state.getActiveGroup());
  const activeDirectory = useAppStore((state) => state.getActiveDirectory());
  const selectItem = useAppStore((state) => state.selectItem);
  const selectItems = useAppStore((state) => state.selectItems);
  const clearSelection = useAppStore((state) => state.clearSelection);
  const deleteSelectedItems = useAppStore((state) => state.deleteSelectedItems);
  const updateItem = useAppStore((state) => state.updateItem);
  const copyItemToDirectory = useAppStore((state) => state.copyItemToDirectory);
  const moveItemToDirectory = useAppStore((state) => state.moveItemToDirectory);
  const [openSubmenu, setOpenSubmenu] = useState<ItemSubmenu>(null);
  const [editOpen, setEditOpen] = useState(false);
  const { ref, style, submenuClassName } = useSmartMenuPosition(menu.x, menu.y, 8, 320);

  const directories = useMemo(() => groups
    .slice()
    .sort(byOrder)
    .flatMap((group) => group.directories.slice().sort(byOrder).filter((dir) => (dir.kind ?? 'normal') === 'normal').map((dir) => ({ ...dir, groupName: group.name }))), [groups]);

  const visibleItemIds = useMemo(() => {
    if (!activeDirectory) return [];
    if ((activeDirectory.kind ?? 'normal') === 'all') {
      return (activeGroup?.directories ?? [])
        .filter((dir) => (dir.kind ?? 'normal') === 'normal')
        .flatMap((dir) => dir.items.map((entry) => entry.id));
    }
    if ((activeDirectory.kind ?? 'normal') !== 'normal') return [];
    return activeDirectory.items.map((entry) => entry.id);
  }, [activeDirectory, activeGroup]);

  if (!item) return null;
  const currentItem = item;
  const currentIsSelected = selectedItemIds.includes(currentItem.id);
  const actionItemIds = currentIsSelected ? selectedItemIds : [currentItem.id];
  const actionCount = actionItemIds.length;

  function copyActionItemsToDirectory(directoryId: string) {
    actionItemIds.forEach((id) => copyItemToDirectory(id, directoryId));
    onClose();
  }

  function moveActionItemsToDirectory(directoryId: string) {
    actionItemIds.forEach((id) => moveItemToDirectory(id, directoryId));
    onClose();
  }

  function saveEditedItem(patch: Partial<ShortcutItem>) {
    updateItem(currentItem.id, patch);
    setEditOpen(false);
    onClose();
  }

  async function resolveIconInput(raw: string) {
    const value = raw.trim();
    if (!value) return undefined;
    if (value.startsWith('data:image/') || value.startsWith('http://') || value.startsWith('https://')) return value;
    if (isRelativeImagePath(value)) return value;
    if (/\.(png|jpe?g|webp|gif|svg|ico)$/i.test(value) && !value.startsWith('/system/') && !value.startsWith('/windows/')) {
      const dataUrl = await invoke<string>('read_icon_as_data_url', { path: value }).catch(() => '');
      if (dataUrl) return dataUrl;
    }
    return await invoke<string>('get_file_icon', { path: value }).catch((error) => {
      void uiAlert(`提取图标失败：${String(error)}`);
      return '';
    }) || value;
  }

  async function editIconByText() {
    const raw = await uiPrompt('输入图标路径、相对路径 icons/app.png、/system/imageres.dll,0 或 data:image/base64', currentItem.icon ?? currentItem.path);
    if (raw === null) return;
    const icon = await resolveIconInput(raw);
    updateItem(currentItem.id, { icon });
    onClose();
  }

  async function useSystemIcon() {
    const raw = await uiPrompt('输入系统图标资源，例如 /system/imageres.dll,0 或 /system/shell32.dll,3；留空则引用当前项目路径', '/system/imageres.dll,0');
    if (raw === null) return;
    const target = raw.trim() || currentItem.path;
    const icon = await invoke<string>('get_file_icon', { path: target }).catch((error) => {
      void uiAlert(`提取系统图标失败：${String(error)}`);
      return '';
    });
    if (icon) updateItem(currentItem.id, { icon });
    onClose();
  }

  async function chooseLocalIcon() {
    const picked = await open({
      multiple: false,
      directory: false,
      title: '选择图标图片',
      filters: [
        { name: '图标图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'ico'] }
      ]
    });
    if (!picked || Array.isArray(picked)) return;
    const icon = await invoke<string>('read_icon_as_data_url', { path: picked }).catch((error) => {
      void uiAlert(`读取图标失败：${String(error)}`);
      return '';
    });
    if (icon) updateItem(currentItem.id, { icon });
    onClose();
  }

  return (
    <>
      <div
        ref={ref}
        className={`menu-surface item-context-menu ${submenuClassName}`}
        style={style}
        onMouseDown={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.preventDefault()}
      >
        <div className="menu-item" onClick={() => { launchItem(currentItem, false).catch((error) => uiAlert(`启动失败：${String(error)}`)); onClose(); }}>打开</div>
        <div className="menu-item" onClick={() => { launchItem(currentItem, true).catch((error) => uiAlert(`启动失败：${String(error)}`)); onClose(); }}>
          <span>以管理员身份运行</span><Shield size={14} />
        </div>
        <div className="menu-item" onClick={() => { invoke('open_file_location', { path: currentItem.path }).catch((error) => uiAlert(`打开所在文件夹失败：${String(error)}`)); onClose(); }}>
          <span>打开所在文件夹</span><FolderOpen size={14} />
        </div>
        {(selectedItemIds.length > 0 || visibleItemIds.length > 1) && (
          <>
            <div className="menu-separator" />
            {!currentIsSelected && selectedItemIds.length > 0 && (
              <div className="menu-item" onMouseEnter={() => setOpenSubmenu(null)} onClick={() => { selectItem(currentItem.id, true); onClose(); }}>
                <span>加入多选</span><CheckSquare size={14} />
              </div>
            )}
            {currentIsSelected && (
              <div className="menu-item" onMouseEnter={() => setOpenSubmenu(null)} onClick={() => { selectItem(currentItem.id, true); onClose(); }}>
                <span>取消选择此项</span><XCircle size={14} />
              </div>
            )}
            {visibleItemIds.length > 1 && (
              <div className="menu-item" onMouseEnter={() => setOpenSubmenu(null)} onClick={() => { selectItems(visibleItemIds); onClose(); }}>
                <span>选中本页全部</span><CheckSquare size={14} />
              </div>
            )}
            {selectedItemIds.length > 0 && (
              <div className="menu-item" onMouseEnter={() => setOpenSubmenu(null)} onClick={() => { clearSelection(); onClose(); }}>清除多选</div>
            )}
          </>
        )}
        <div className="menu-separator" />
        <div className="menu-item" onMouseEnter={() => setOpenSubmenu(null)} onClick={() => setEditOpen(true)}><span>编辑</span><Pencil size={14} /></div>
        <div className="menu-item" onMouseEnter={() => setOpenSubmenu(null)} onClick={editIconByText}><span>编辑图标</span><ImagePlus size={14} /></div>
        <div className="menu-item" onMouseEnter={() => setOpenSubmenu(null)} onClick={useSystemIcon}><span>引用系统图标</span><Sparkles size={14} /></div>
        <div className="menu-item" onMouseEnter={() => setOpenSubmenu(null)} onClick={chooseLocalIcon}><span>浏览本地图标</span><FolderOpen size={14} /></div>
        <div className="menu-item with-submenu" onMouseEnter={() => setOpenSubmenu('text')} onClick={() => setOpenSubmenu((value) => value === 'text' ? null : 'text')}>
          <span>文字显示</span><ChevronRight size={14} />
          {openSubmenu === 'text' && <TextDisplaySubmenu item={currentItem} onDone={onClose} />}
        </div>
        <div className="menu-separator" />
        <div className="menu-item with-submenu" onMouseEnter={() => setOpenSubmenu('copy')} onClick={() => setOpenSubmenu((value) => value === 'copy' ? null : 'copy')}>
          <span>复制{actionCount > 1 ? ` ${actionCount} 项` : ''}到目录</span><ChevronRight size={14} />
          {openSubmenu === 'copy' && (
            <div className="menu-surface directory-submenu">
              {directories.map((dir) => (
                <div className="menu-item" key={dir.id} onClick={() => copyActionItemsToDirectory(dir.id)}>
                  <span>{dir.groupName} / {dir.name}</span><Copy size={13} />
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="menu-item with-submenu" onMouseEnter={() => setOpenSubmenu('move')} onClick={() => setOpenSubmenu((value) => value === 'move' ? null : 'move')}>
          <span>移动{actionCount > 1 ? ` ${actionCount} 项` : ''}到目录</span><ChevronRight size={14} />
          {openSubmenu === 'move' && (
            <div className="menu-surface directory-submenu">
              {directories.map((dir) => (
                <div className="menu-item" key={dir.id} onClick={() => moveActionItemsToDirectory(dir.id)}>
                  {dir.groupName} / {dir.name}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="menu-separator" />
        <div className="menu-item danger" onMouseEnter={() => setOpenSubmenu(null)} onClick={() => { if (!currentIsSelected) selectItem(currentItem.id, false); setTimeout(() => useAppStore.getState().deleteSelectedItems(), 0); onClose(); }}>
          <span>删除{actionCount > 1 ? ` ${actionCount} 项` : ''}</span><Trash2 size={14} />
        </div>
      </div>
      {editOpen && (
        <ItemEditDialog
          item={currentItem}
          onCancel={() => setEditOpen(false)}
          onSave={saveEditedItem}
        />
      )}
    </>
  );
}
