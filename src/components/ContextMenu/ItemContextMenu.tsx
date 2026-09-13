import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { ChevronRight, ClipboardCopy, ClipboardPaste, Copy, CopyPlus, FolderOpen, ImagePlus, Pencil, Pin, PinOff, RefreshCw, Shield, Sparkles, Trash2, CheckSquare } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import type { BrowserRouteOverride, ContextMenuState, ItemClickAction, ShortcutItem, ShortcutType } from '../../types';
import { useAppStore } from '../../stores/appStore';
import { byOrder } from '../../lib/sort';
import { launchShortcutItem } from '../../lib/launchShortcut';
import { TextDisplaySubmenu } from './TextDisplaySubmenu';
import { useSmartMenuPosition } from './useSmartMenuPosition';
import { uiAlert, uiConfirm, uiPrompt } from '../../lib/uiDialog';
import { refreshShortcutIcon } from '../../lib/refreshShortcutIcon';
import { showLauncherNotice } from '../../lib/notify';
import { BrowserRoutePicker } from '../Settings/BrowserRoutePicker';
import { useBrowserCatalog } from '../../hooks/useBrowserCatalog';
import { ItemClickActionPicker } from '../ItemInteraction/ItemClickActionPicker';
import { writeTextToClipboard } from '../../lib/clipboardText';

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
  const [browserRoute, setBrowserRoute] = useState<BrowserRouteOverride>(item.browserRoute ?? { mode: 'inherit' });
  const [singleClickAction, setSingleClickAction] = useState<ItemClickAction>(item.singleClickAction ?? 'inherit');
  const [doubleClickAction, setDoubleClickAction] = useState<ItemClickAction>(item.doubleClickAction ?? 'inherit');
  const router = useAppStore((state) => state.browserRouter);
  const globalLaunchMode = useAppStore((state) => state.behavior.launchMode);
  const { catalog } = useBrowserCatalog(router.customBrowsers);

  function submit(event: FormEvent) {
    event.preventDefault();
    onSave({
      name: name.trim() || item.name,
      path: path.trim() || item.path,
      type,
      icon: icon.trim() || undefined,
      browserRoute: type === 'url' ? browserRoute : item.browserRoute,
      singleClickAction: singleClickAction === 'inherit' ? undefined : singleClickAction,
      doubleClickAction: doubleClickAction === 'inherit' ? undefined : doubleClickAction,
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
        {type === 'url' && (
          <label className="edit-field">
            <span>网址浏览器 / Profile</span>
            <BrowserRoutePicker
              value={browserRoute}
              onChange={setBrowserRoute}
              catalog={catalog}
              router={router}
            />
            <small className="settings-hint">“继承上一级”会先读取所在父目录设置，再读取全局浏览器路由中心。</small>
          </label>
        )}
        <div className="edit-field item-click-action-editor">
          <span>点击动作</span>
          <div className="item-click-action-grid">
            <label>
              <small>左键单击</small>
              <ItemClickActionPicker
                value={singleClickAction}
                interaction="single"
                itemType={type}
                globalLaunchMode={globalLaunchMode}
                onChange={setSingleClickAction}
              />
            </label>
            <label>
              <small>左键双击</small>
              <ItemClickActionPicker
                value={doubleClickAction}
                interaction="double"
                itemType={type}
                globalLaunchMode={globalLaunchMode}
                onChange={setDoubleClickAction}
              />
            </label>
          </div>
          <small className="settings-hint">可分别设置打开、复制名称、复制{type === 'url' ? '网址' : type === 'command' ? '命令' : '路径'}、复制“名称 + 内容”或无动作。单击和双击都有动作时，会按 Windows 双击速度自动区分，不会误触发两次复制。</small>
        </div>
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
  const globalDisplay = useAppStore((state) => state.display);
  const experience = useAppStore((state) => state.experience);
  const selectItem = useAppStore((state) => state.selectItem);
  const selectItems = useAppStore((state) => state.selectItems);
  const beginMultiSelect = useAppStore((state) => state.beginMultiSelect);
  const deleteSelectedItems = useAppStore((state) => state.deleteSelectedItems);
  const updateItem = useAppStore((state) => state.updateItem);
  const copyItemsToDirectory = useAppStore((state) => state.copyItemsToDirectory);
  const moveItemToDirectory = useAppStore((state) => state.moveItemToDirectory);
  const duplicateItem = useAppStore((state) => state.duplicateItem);
  const copyItemsToClipboard = useAppStore((state) => state.copyItemsToClipboard);
  const itemClipboard = useAppStore((state) => state.itemClipboard);
  const pasteItemsToDirectory = useAppStore((state) => state.pasteItemsToDirectory);
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
    const count = copyItemsToDirectory(actionItemIds, directoryId);
    if (count > 0) showLauncherNotice(`已复制 ${count} 个项目到目标子目录`);
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


  async function refreshCurrentItemIcon() {
    onClose();
    const icon = await refreshShortcutIcon(currentItem, globalDisplay, { forceRefresh: true });
    if (!icon) {
      showLauncherNotice(`「${currentItem.name}」图标刷新失败`);
      return;
    }
    updateItem(currentItem.id, { icon });
    showLauncherNotice(`已刷新当前项目图标：${currentItem.name}`);
  }

  function togglePinned() {
    updateItem(currentItem.id, { pinned: !currentItem.pinned });
    showLauncherNotice(currentItem.pinned ? `已取消固定：${currentItem.name}` : `已固定到前面：${currentItem.name}`);
    onClose();
  }

  function duplicateCurrentItem() {
    duplicateItem(currentItem.id);
    showLauncherNotice(`已创建副本：${currentItem.name}`);
    onClose();
  }

  function copyActionItems() {
    const count = copyItemsToClipboard(actionItemIds);
    if (count > 0) showLauncherNotice(`已复制 ${count} 个项目，可在目标子目录粘贴`);
    onClose();
  }

  function pasteActionItems() {
    const sourceDirectory = groups.flatMap((group) => group.directories).find((directory) => directory.items.some((entry) => entry.id === currentItem.id));
    const targetDirectory = (activeDirectory?.kind ?? 'normal') === 'normal' ? activeDirectory : sourceDirectory;
    if (!targetDirectory || (targetDirectory.kind ?? 'normal') !== 'normal') return;
    const count = pasteItemsToDirectory(targetDirectory.id);
    if (count > 0) showLauncherNotice(`已粘贴 ${count} 个项目到「${targetDirectory.name}」`);
    onClose();
  }

  async function copyText(value: string, label: string) {
    try {
      await writeTextToClipboard(value);
      showLauncherNotice(`已复制${label}`);
    } catch (error) {
      void uiAlert(`复制失败：${String(error)}`);
    }
    onClose();
  }

  async function deleteActionItems() {
    if (experience.confirmDeleteItems) {
      const ok = await uiConfirm(`确定删除${actionCount > 1 ? `选中的 ${actionCount} 个项目` : `「${currentItem.name}」`}吗？`);
      if (!ok) return;
    }
    if (!currentIsSelected) selectItem(currentItem.id, false);
    window.setTimeout(() => useAppStore.getState().deleteSelectedItems(), 0);
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
        <div className="menu-item" onClick={() => { launchShortcutItem(currentItem, false).catch((error) => uiAlert(`启动失败：${String(error)}`)); onClose(); }}>打开</div>
        <div className="menu-item" onClick={() => { launchShortcutItem(currentItem, true).catch((error) => uiAlert(`启动失败：${String(error)}`)); onClose(); }}>
          <span>以管理员身份运行</span><Shield size={14} />
        </div>
        <div className="menu-item" onClick={() => { invoke('open_file_location', { path: currentItem.path }).catch((error) => uiAlert(`打开所在文件夹失败：${String(error)}`)); onClose(); }}>
          <span>打开所在文件夹</span><FolderOpen size={14} />
        </div>
        <div className="menu-separator" />
        <div
          className="menu-item"
          onMouseEnter={() => setOpenSubmenu(null)}
          onClick={() => { beginMultiSelect(currentItem.id); onClose(); }}
        >
          <span>使用多选</span><CheckSquare size={14} />
        </div>
        {visibleItemIds.length > 1 && (
          <div
            className="menu-item"
            onMouseEnter={() => setOpenSubmenu(null)}
            onClick={() => { selectItems(visibleItemIds); beginMultiSelect(); onClose(); }}
          >
            <span>选中本页全部</span><CheckSquare size={14} />
          </div>
        )}
        <div className="menu-separator" />
        <div className="menu-item" onMouseEnter={() => setOpenSubmenu(null)} onClick={() => setEditOpen(true)}><span>编辑</span><Pencil size={14} /></div>
        <div className="menu-item" onMouseEnter={() => setOpenSubmenu(null)} onClick={togglePinned}>
          <span>{currentItem.pinned ? '取消固定项目' : '固定项目到前面'}</span>{currentItem.pinned ? <PinOff size={14} /> : <Pin size={14} />}
        </div>
        <div className="menu-item" onMouseEnter={() => setOpenSubmenu(null)} onClick={copyActionItems}><span>复制项目{actionCount > 1 ? `（${actionCount} 项）` : ''}</span><Copy size={14} /></div>
        <div className={`menu-item ${itemClipboard.length ? '' : 'disabled'}`} onMouseEnter={() => setOpenSubmenu(null)} onClick={() => itemClipboard.length && pasteActionItems()}><span>粘贴项目{itemClipboard.length ? `（${itemClipboard.length} 项）` : ''}</span><ClipboardPaste size={14} /></div>
        <div className="menu-item" onMouseEnter={() => setOpenSubmenu(null)} onClick={duplicateCurrentItem}><span>创建当前项目副本</span><CopyPlus size={14} /></div>
        <div className="menu-item" onMouseEnter={() => setOpenSubmenu(null)} onClick={() => void copyText(currentItem.path, currentItem.type === 'url' ? '网址' : '路径')}><span>复制{currentItem.type === 'url' ? '网址' : '路径'}</span><ClipboardCopy size={14} /></div>
        <div className="menu-item" onMouseEnter={() => setOpenSubmenu(null)} onClick={refreshCurrentItemIcon}><span>刷新当前项目图标</span><RefreshCw size={14} /></div>
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
        <div className="menu-item danger" onMouseEnter={() => setOpenSubmenu(null)} onClick={() => void deleteActionItems()}>
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
