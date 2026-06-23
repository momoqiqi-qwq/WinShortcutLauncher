import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { ChevronRight, FilePlus2, FolderPlus, Globe, RefreshCw, Trash2, Wrench, Grid2X2, ArrowDownAZ, Merge, Repeat2, StickyNote } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import type { ContextMenuState, Directory, ShortcutItem, SortMode, ViewMode } from '../../types';
import { getEffectiveDisplay, useAppStore } from '../../stores/appStore';
import { createShortcutItemsFromPaths, createUrlShortcut } from '../../lib/createShortcutItems';
import { makeId } from '../../lib/id';
import { systemToolsGroup } from '../../data/systemTools';
import { useSmartMenuPosition } from './useSmartMenuPosition';
import { uiConfirm } from '../../lib/uiDialog';

interface AreaContextMenuProps {
  menu: Extract<ContextMenuState, { kind: 'area' }>;
  onClose: () => void;
}

function normalizeOpenResult(result: string | string[] | null): string[] {
  if (!result) return [];
  return Array.isArray(result) ? result : [result];
}

function firstNormalDirectory(directories: Directory[], fallbackId: string) {
  return directories.find((dir) => (dir.kind ?? 'normal') === 'normal')?.id ?? fallbackId;
}


function googleFaviconUrl(url: string) {
  try {
    const parsed = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(parsed.hostname)}&sz=128`;
  } catch {
    return '';
  }
}

async function resolveWebsiteIcon(url: string, saveLocal: boolean) {
  if (saveLocal) {
    const cachedIcon = await invoke<string>('get_cached_website_favicon', { url }).catch(() => '');
    if (cachedIcon) return cachedIcon;
    const localIcon = await invoke<string>('fetch_website_favicon', { url }).catch(() => '');
    if (localIcon) return localIcon;
  }
  return googleFaviconUrl(url);
}

export function AreaContextMenu({ menu, onClose }: AreaContextMenuProps) {
  const activeGroupId = useAppStore((state) => state.activeGroupId);
  const activeDirectoryId = useAppStore((state) => state.activeDirectoryId);
  const activeGroup = useAppStore((state) => state.getActiveGroup());
  const activeDirectory = useAppStore((state) => state.getActiveDirectory());
  const globalDisplay = useAppStore((state) => state.display);
  const addItems = useAppStore((state) => state.addItems);
  const updateDisplay = useAppStore((state) => state.updateDisplay);
  const updateDirectoryDisplay = useAppStore((state) => state.updateDirectoryDisplay);
  const updateItem = useAppStore((state) => state.updateItem);
  const clearDirectoryItems = useAppStore((state) => state.clearDirectoryItems);
  const sortDirectoryItems = useAppStore((state) => state.sortDirectoryItems);
  const mergeDirectory = useAppStore((state) => state.mergeDirectory);
  const setDirectoryKind = useAppStore((state) => state.setDirectoryKind);
  const clearSelection = useAppStore((state) => state.clearSelection);
  const display = useMemo(() => getEffectiveDisplay(globalDisplay, activeDirectory), [globalDisplay, activeDirectory]);
  type AreaSubmenu = 'system' | 'icon' | 'view' | 'sort' | 'globalIcon' | 'globalView' | 'globalSort' | 'mergeDirectory' | null;
  const [openSubmenu, setOpenSubmenu] = useState<AreaSubmenu>(null);
  const [urlDialogOpen, setUrlDialogOpen] = useState(false);
  const [urlDraft, setUrlDraft] = useState('');
  const [urlNameDraft, setUrlNameDraft] = useState('');
  const [urlAutoFetchIcon, setUrlAutoFetchIcon] = useState(true);
  const [urlError, setUrlError] = useState('');
  const { ref, style, submenuClassName } = useSmartMenuPosition(menu.x, menu.y, 8, 300);
  const targetDirectoryId = activeDirectory?.kind === 'all' || activeDirectory?.kind === 'notes'
    ? firstNormalDirectory(activeGroup?.directories ?? [], activeDirectoryId)
    : activeDirectoryId;
  const activeKind = activeDirectory?.kind ?? 'normal';
  const directoryMergeTargets = useMemo(() => (activeGroup?.directories ?? [])
    .filter((dir) => dir.id !== activeDirectoryId && (dir.kind ?? 'normal') === activeKind && activeKind !== 'all')
    .sort((a, b) => a.order - b.order), [activeGroup, activeDirectoryId, activeKind]);
  const canSwitchToNotes = activeKind === 'normal' && (activeDirectory?.items.length ?? 0) === 0;
  const canSwitchToNormal = activeKind === 'notes';


  async function addPickedPaths(directory: boolean) {
    const picked = await open({
      multiple: !directory,
      directory,
      title: directory ? '选择要添加的文件夹' : '选择要添加的文件'
    });
    const paths = normalizeOpenResult(picked as string | string[] | null);
    if (!paths.length) return;
    const items = await createShortcutItemsFromPaths(paths);
    addItems(activeGroupId, targetDirectoryId, items);
    onClose();
  }

  function addUrl() {
    setOpenSubmenu(null);
    setUrlDraft('');
    setUrlNameDraft('');
    setUrlAutoFetchIcon(true);
    setUrlError('');
    setUrlDialogOpen(true);
  }

  async function submitUrl(event?: FormEvent) {
    event?.preventDefault();
    const rawUrl = urlDraft.trim();
    if (!rawUrl) {
      setUrlError('请输入网址');
      return;
    }
    const normalizedUrl = /^[a-z][a-z0-9+.-]*:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
    try {
      // 只校验结构，不限制域名类型，支持 localhost / IP / 内网地址。
      new URL(normalizedUrl);
    } catch {
      setUrlError('网址格式不正确');
      return;
    }
    const item = createUrlShortcut(normalizedUrl, urlNameDraft.trim() || undefined);
    addItems(activeGroupId, targetDirectoryId, [item]);
    setUrlDialogOpen(false);
    onClose();
    if (urlAutoFetchIcon) {
      const icon = await resolveWebsiteIcon(normalizedUrl, globalDisplay.autoSaveWebsiteIcon !== false);
      if (icon) updateItem(item.id, { icon });
    }
  }

  function closeUrlDialog() {
    setUrlDialogOpen(false);
    setUrlError('');
  }

  function addSystemTool(item: ShortcutItem) {
    addItems(activeGroupId, targetDirectoryId, [{ ...item, id: makeId('item'), order: 0 }]);
    onClose();
  }

  async function refreshIcons() {
    const items = activeDirectory?.items ?? [];
    for (const item of items) {
      const icon = item.type === 'url'
        ? await resolveWebsiteIcon(item.path, globalDisplay.autoSaveWebsiteIcon !== false)
        : await invoke<string>('get_file_icon', { path: item.path }).catch(() => '');
      if (icon) updateItem(item.id, { icon });
    }
    onClose();
  }

  async function clearCurrentDirectory() {
    if (!activeDirectory || activeDirectory.kind === 'all' || activeDirectory.kind === 'notes') return;
    const ok = await uiConfirm(`确定清空「${activeDirectory.name}」中的全部快捷项目吗？`);
    if (!ok) return;
    clearDirectoryItems(activeDirectory.id);
    onClose();
  }

  function applySort(mode: SortMode, scope: 'directory' | 'global') {
    if (scope === 'global') updateDisplay({ sortMode: mode });
    if (scope === 'directory') updateDirectoryDisplay(activeDirectoryId, { sortMode: mode });
    if (activeDirectory && activeDirectory.kind !== 'all' && activeDirectory.kind !== 'notes') sortDirectoryItems(activeDirectoryId, mode);
    onClose();
  }

  function setView(mode: ViewMode, scope: 'directory' | 'global') {
    if (scope === 'global') updateDisplay({ viewMode: mode });
    if (scope === 'directory') updateDirectoryDisplay(activeDirectoryId, { viewMode: mode });
    onClose();
  }

  function setIcon(size: number, scope: 'directory' | 'global') {
    if (scope === 'global') updateDisplay({ iconSize: size });
    if (scope === 'directory') updateDirectoryDisplay(activeDirectoryId, { iconSize: size });
    onClose();
  }

  async function mergeCurrentDirectoryTo(targetDirectoryId: string) {
    if (!activeDirectory || !targetDirectoryId) return;
    const target = activeGroup?.directories.find((dir) => dir.id === targetDirectoryId);
    const ok = await uiConfirm(`确定把标签「${activeDirectory.name}」合并到「${target?.name ?? '目标标签'}」吗？合并后当前标签会被删除。`);
    if (ok) mergeDirectory(activeDirectory.id, targetDirectoryId);
    onClose();
  }

  function switchCurrentDirectoryKind(kind: 'normal' | 'notes') {
    if (!activeDirectory) return;
    setDirectoryKind(activeDirectory.id, kind);
    onClose();
  }

  function mergeDirectoryMenu() {
    return (
      <div className="menu-surface directory-submenu small-submenu">
        {directoryMergeTargets.map((target) => (
          <div className="menu-item" key={target.id} onClick={() => mergeCurrentDirectoryTo(target.id)}><span>{target.name}</span><Merge size={13} /></div>
        ))}
      </div>
    );
  }

  function sizeMenu(scope: 'directory' | 'global') {
    const current = scope === 'global' ? globalDisplay.iconSize : display.iconSize;
    return (
      <div className="menu-surface directory-submenu small-submenu">
        {[
          ['小图标', 40],
          ['中图标', 52],
          ['大图标', 80]
        ].map(([label, size]) => (
          <div className="menu-item" key={String(size)} onClick={() => setIcon(Number(size), scope)}>
            <span>{label}</span>{current === Number(size) ? <span>✓</span> : null}
          </div>
        ))}
      </div>
    );
  }

  function viewMenu(scope: 'directory' | 'global') {
    const current = scope === 'global' ? globalDisplay.viewMode : display.viewMode;
    return (
      <div className="menu-surface directory-submenu small-submenu">
        <div className="menu-item" onClick={() => setView('grid', scope)}><span>图标网格</span>{current === 'grid' ? <span>✓</span> : <Grid2X2 size={13} />}</div>
        <div className="menu-item" onClick={() => setView('compact', scope)}><span>紧凑网格</span>{current === 'compact' ? <span>✓</span> : null}</div>
      </div>
    );
  }

  function sortMenu(scope: 'directory' | 'global') {
    const current = scope === 'global' ? globalDisplay.sortMode : display.sortMode;
    return (
      <div className="menu-surface directory-submenu small-submenu">
        <div className="menu-item" onClick={() => applySort('custom', scope)}><span>自定义顺序</span>{current === 'custom' ? <span>✓</span> : null}</div>
        <div className="menu-item" onClick={() => applySort('name', scope)}><span>按名称</span>{current === 'name' ? <span>✓</span> : <ArrowDownAZ size={13} />}</div>
        <div className="menu-item" onClick={() => applySort('type', scope)}><span>按类型</span>{current === 'type' ? <span>✓</span> : null}</div>
      </div>
    );
  }

  return (
    <>
    <div
      ref={ref}
      className={`menu-surface item-context-menu area-context-menu ${submenuClassName}`}
      style={style}
      onMouseDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="menu-item" onMouseEnter={() => setOpenSubmenu(null)} onClick={() => addPickedPaths(false)}><span>添加文件</span><FilePlus2 size={15} /></div>
      <div className="menu-item" onMouseEnter={() => setOpenSubmenu(null)} onClick={() => addPickedPaths(true)}><span>添加文件夹</span><FolderPlus size={15} /></div>
      <div className="menu-item" onMouseEnter={() => setOpenSubmenu(null)} onClick={addUrl}><span>添加网址</span><Globe size={15} /></div>
      <div className="menu-item with-submenu" onMouseEnter={() => setOpenSubmenu('system')} onClick={() => setOpenSubmenu((value) => value === 'system' ? null : 'system')}>
        <span>添加系统功能</span><ChevronRight size={14} />
        {openSubmenu === 'system' && (
          <div className="menu-surface directory-submenu system-tool-submenu">
            {systemToolsGroup.directories.map((directory) => (
              <div className="system-tool-section" key={directory.id}>
                <div className="system-tool-title">{directory.name}</div>
                {directory.items.map((item) => (
                  <div className="menu-item" key={item.id} onClick={() => addSystemTool(item)}>
                    <span>{item.name}</span><Wrench size={13} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="menu-separator" />
      <div className="menu-item with-submenu" onMouseEnter={() => setOpenSubmenu('icon')} onClick={() => setOpenSubmenu((value) => value === 'icon' ? null : 'icon')}>
        <span>图标大小</span><ChevronRight size={14} />
        {openSubmenu === 'icon' && sizeMenu('directory')}
      </div>
      <div className="menu-item with-submenu" onMouseEnter={() => setOpenSubmenu('view')} onClick={() => setOpenSubmenu((value) => value === 'view' ? null : 'view')}>
        <span>查看方式</span><ChevronRight size={14} />
        {openSubmenu === 'view' && viewMenu('directory')}
      </div>
      <div className="menu-item with-submenu" onMouseEnter={() => setOpenSubmenu('sort')} onClick={() => setOpenSubmenu((value) => value === 'sort' ? null : 'sort')}>
        <span>排序方式</span><ChevronRight size={14} />
        {openSubmenu === 'sort' && sortMenu('directory')}
      </div>
      <div className="menu-separator" />
      <div className="menu-item with-submenu" onMouseEnter={() => setOpenSubmenu('globalIcon')} onClick={() => setOpenSubmenu((value) => value === 'globalIcon' ? null : 'globalIcon')}>
        <span>统一-图标大小</span><ChevronRight size={14} />
        {openSubmenu === 'globalIcon' && sizeMenu('global')}
      </div>
      <div className="menu-item with-submenu" onMouseEnter={() => setOpenSubmenu('globalView')} onClick={() => setOpenSubmenu((value) => value === 'globalView' ? null : 'globalView')}>
        <span>统一-查看方式</span><ChevronRight size={14} />
        {openSubmenu === 'globalView' && viewMenu('global')}
      </div>
      <div className="menu-item with-submenu" onMouseEnter={() => setOpenSubmenu('globalSort')} onClick={() => setOpenSubmenu((value) => value === 'globalSort' ? null : 'globalSort')}>
        <span>统一-排序方式</span><ChevronRight size={14} />
        {openSubmenu === 'globalSort' && sortMenu('global')}
      </div>
      <div className="menu-separator" />
      <div className={`menu-item with-submenu ${directoryMergeTargets.length === 0 ? 'disabled' : ''}`} onMouseEnter={() => setOpenSubmenu('mergeDirectory')} onClick={() => setOpenSubmenu((value) => value === 'mergeDirectory' ? null : 'mergeDirectory')}>
        <span>合并当前标签到</span><ChevronRight size={14} />
        {openSubmenu === 'mergeDirectory' && directoryMergeTargets.length > 0 && mergeDirectoryMenu()}
      </div>
      <div className={`menu-item ${canSwitchToNotes ? '' : 'disabled'}`} onMouseEnter={() => setOpenSubmenu(null)} onClick={() => canSwitchToNotes && switchCurrentDirectoryKind('notes')}><span>空标签切换为便签</span><StickyNote size={15} /></div>
      <div className={`menu-item ${canSwitchToNormal ? '' : 'disabled'}`} onMouseEnter={() => setOpenSubmenu(null)} onClick={() => canSwitchToNormal && switchCurrentDirectoryKind('normal')}><span>便签切换为普通标签</span><Repeat2 size={15} /></div>
      <div className="menu-separator" />
      <div className="menu-item" onMouseEnter={() => setOpenSubmenu(null)} onClick={refreshIcons}><span>刷新本页图标</span><RefreshCw size={15} /></div>
      <div className={`menu-item danger ${activeDirectory?.kind === 'all' || activeDirectory?.kind === 'notes' ? 'disabled' : ''}`} onMouseEnter={() => setOpenSubmenu(null)} onClick={clearCurrentDirectory}><span>清空本页应用</span><Trash2 size={15} /></div>
    </div>
    {urlDialogOpen && (
      <div className="url-shortcut-dialog-backdrop" data-no-drag onMouseDown={(event) => { event.stopPropagation(); }} onContextMenu={(event) => event.preventDefault()}>
        <form className="url-shortcut-dialog" onSubmit={submitUrl} onMouseDown={(event) => event.stopPropagation()}>
          <div className="url-shortcut-title">
            <Globe size={18} />
            <span>添加网站</span>
          </div>
          <div className="url-shortcut-combo">
            <label>
              名称 <span>可留空</span>
              <input
                value={urlNameDraft}
                onChange={(event) => setUrlNameDraft(event.target.value)}
                placeholder="例如：我的网站"
              />
            </label>
            <label>
              网址
              <input
                autoFocus
                value={urlDraft}
                onChange={(event) => { setUrlDraft(event.target.value); setUrlError(''); }}
                placeholder="https://example.com"
              />
            </label>
          </div>
          <label className="url-shortcut-check">
            <input
              type="checkbox"
              checked={urlAutoFetchIcon}
              onChange={(event) => setUrlAutoFetchIcon(event.target.checked)}
            />
            这次添加时自动获取网站图标
          </label>
          <p className="url-shortcut-hint">名称和网址在同一个添加窗口里填写；不写 https:// 时会自动补上。图标是否保存到本地按“设置 - 图标”里的开关决定。</p>
          {urlError && <div className="url-shortcut-error">{urlError}</div>}
          <div className="url-shortcut-actions">
            <button type="button" className="ghost" onClick={closeUrlDialog}>取消</button>
            <button type="submit">添加</button>
          </div>
        </form>
      </div>
    )}
    </>
  );
}
