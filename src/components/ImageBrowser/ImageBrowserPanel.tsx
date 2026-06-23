import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent as ReactDragEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { Check, Copy, Crop, Edit2, ExternalLink, FolderOpen, ImagePlus, Plus, Settings, Trash2, X } from 'lucide-react';
import { DEFAULT_IMAGE_BROWSER_SETTINGS, type ImageBrowserGroup, type ImageBrowserItem, type ImageBrowserSettings } from '../../utils/v16Types';
import './ImageBrowserPanel.css';
import { uiAlert, uiConfirm, uiPrompt } from '../../lib/uiDialog';

export interface ImageBrowserPanelProps {
  openPanel: boolean;
  items: ImageBrowserItem[];
  settings?: Partial<ImageBrowserSettings>;
  onClose: () => void;
  onChange: (items: ImageBrowserItem[]) => void;
  onUpdateSettings?: (settings: Partial<ImageBrowserSettings>) => void;
}

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|bmp|svg|ico|tiff?|avif)$/i;
const DEFAULT_GROUP_ID = 'default';

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function makeLocalId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function pathBasename(path: string) {
  return path.replace(/\\/g, '/').split('/').filter(Boolean).pop() || path;
}

function normalizePath(path: string) {
  let clean = path.trim();
  if (/^file:\/\//i.test(clean)) {
    clean = decodeURI(clean.replace(/^file:\/\//i, ''));
    if (/^\/[A-Za-z]:/.test(clean)) clean = clean.slice(1);
  }
  return clean;
}

function pathToFileUrl(path: string) {
  const normalized = path.replace(/\\/g, '/');
  if (/^file:/i.test(normalized)) return normalized;
  const withSlash = /^[A-Za-z]:/.test(normalized) ? `/${normalized}` : normalized;
  return `file://${encodeURI(withSlash)}`;
}

function createImageItem(path: string, groupId: string): ImageBrowserItem | null {
  const clean = normalizePath(path);
  if (!clean || !IMAGE_EXT.test(clean)) return null;
  return {
    id: makeLocalId('img'),
    name: pathBasename(clean),
    path: clean,
    groupId,
    addedAt: Date.now(),
  };
}

function mergeImages(oldItems: ImageBrowserItem[], paths: string[], groupId: string) {
  const exists = new Set(oldItems.map((x) => x.path.toLowerCase()));
  const next = [...oldItems];
  for (const raw of paths) {
    const item = createImageItem(raw, groupId);
    if (!item || exists.has(item.path.toLowerCase())) continue;
    next.push(item);
    exists.add(item.path.toLowerCase());
  }
  return next;
}

function normalizeGroups(settings: ImageBrowserSettings): ImageBrowserGroup[] {
  const source = settings.groups?.length ? settings.groups : DEFAULT_IMAGE_BROWSER_SETTINGS.groups;
  const seen = new Set<string>();
  const groups = source
    .map((group, index) => ({
      id: group.id || (index === 0 ? DEFAULT_GROUP_ID : makeLocalId('imggrp')),
      name: group.name || (index === 0 ? '默认' : `分组 ${index + 1}`),
      order: Number.isFinite(Number(group.order)) ? Number(group.order) : index,
    }))
    .filter((group) => {
      if (seen.has(group.id)) return false;
      seen.add(group.id);
      return true;
    })
    .sort((a, b) => a.order - b.order)
    .map((group, index) => ({ ...group, order: index }));
  return groups.length ? groups : [{ id: DEFAULT_GROUP_ID, name: '默认', order: 0 }];
}

function groupOf(item: ImageBrowserItem) {
  return item.groupId || DEFAULT_GROUP_ID;
}


type CropRect = { left: number; top: number; width: number; height: number };
type ImageContentMetrics = {
  stageRect: DOMRect;
  stageScrollLeft: number;
  stageScrollTop: number;
  imageRect: DOMRect;
  selectableRect: { left: number; top: number; width: number; height: number };
  scale: number;
  offsetX: number;
  offsetY: number;
};

function getImageContentMetrics(img: HTMLImageElement, fit: ImageBrowserSettings['previewFit']): ImageContentMetrics | null {
  if (!img.naturalWidth || !img.naturalHeight) return null;
  const stage = img.closest('.image-browser-preview-stage') as HTMLElement | null;
  if (!stage) return null;
  const stageRect = stage.getBoundingClientRect();
  const imageRect = img.getBoundingClientRect();
  const boxWidth = imageRect.width;
  const boxHeight = imageRect.height;
  if (boxWidth <= 0 || boxHeight <= 0) return null;

  const scale = fit === 'cover'
    ? Math.max(boxWidth / img.naturalWidth, boxHeight / img.naturalHeight)
    : Math.min(boxWidth / img.naturalWidth, boxHeight / img.naturalHeight);
  const contentWidth = img.naturalWidth * scale;
  const contentHeight = img.naturalHeight * scale;
  const offsetX = (boxWidth - contentWidth) / 2;
  const offsetY = (boxHeight - contentHeight) / 2;
  const selectableRect = fit === 'cover'
    ? { left: imageRect.left, top: imageRect.top, width: imageRect.width, height: imageRect.height }
    : { left: imageRect.left + offsetX, top: imageRect.top + offsetY, width: contentWidth, height: contentHeight };

  return { stageRect, stageScrollLeft: stage.scrollLeft, stageScrollTop: stage.scrollTop, imageRect, selectableRect, scale, offsetX, offsetY };
}

function cropRectArea(rect?: CropRect | null) {
  return rect ? Math.round(Math.abs(rect.width) * Math.abs(rect.height)) : 0;
}

function useImageDataUrl(item?: ImageBrowserItem) {
  const [dataUrl, setDataUrl] = useState<string | undefined>(item?.dataUrl);
  useEffect(() => {
    let cancelled = false;
    if (!item) {
      setDataUrl(undefined);
      return;
    }
    if (item.dataUrl?.startsWith('data:image/')) {
      setDataUrl(item.dataUrl);
      return;
    }
    setDataUrl(undefined);
    invoke<string>('read_icon_as_data_url', { path: item.path })
      .then((value) => { if (!cancelled && value) setDataUrl(value); })
      .catch(() => { if (!cancelled) setDataUrl(undefined); });
    return () => { cancelled = true; };
  }, [item?.id, item?.path, item?.dataUrl]);
  return dataUrl;
}

function Thumbnail({ item, selected, width, settings, onSelect }: { item: ImageBrowserItem; selected: boolean; width: number; settings: ImageBrowserSettings; onSelect: () => void }) {
  const src = useImageDataUrl(item);
  const showName = settings.showFileName && settings.imageNamePosition !== 'hidden';
  const name = <span className={`image-browser-thumb-name ${settings.imageNamePosition}`}>{item.name}</span>;
  return (
    <button className={`image-browser-thumb ${selected ? 'active' : ''} name-${settings.imageNamePosition}`} style={{ width }} onClick={onSelect} title={item.path} data-no-drag>
      {showName && settings.imageNamePosition === 'top' && name}
      <div className="image-browser-thumb-frame">
        {src ? <img src={src} alt="" draggable={false} /> : <span>图片</span>}
        {showName && settings.imageNamePosition === 'inside' && name}
      </div>
      {showName && settings.imageNamePosition === 'bottom' && name}
    </button>
  );
}

export function ImageBrowserPanel({ openPanel, items, settings: settingsPatch, onClose, onChange, onUpdateSettings }: ImageBrowserPanelProps) {
  const settings = { ...DEFAULT_IMAGE_BROWSER_SETTINGS, ...settingsPatch } as ImageBrowserSettings;
  const groups = useMemo(() => normalizeGroups(settings), [settings.groups]);
  const activeGroupId = groups.some((group) => group.id === settings.activeGroupId) ? settings.activeGroupId : groups[0].id;
  const activeGroup = groups.find((group) => group.id === activeGroupId) ?? groups[0];
  const groupItems = useMemo(() => items.filter((item) => groupOf(item) === activeGroupId), [items, activeGroupId]);
  const [activeId, setActiveId] = useState<string | undefined>(groupItems[0]?.id);
  const [dragOver, setDragOver] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [editingImageName, setEditingImageName] = useState(false);
  const [imageNameDraft, setImageNameDraft] = useState('');
  const [cropMode, setCropMode] = useState(false);
  const [cropRect, setCropRect] = useState<CropRect | null>(null);
  const cropDraggingRef = useRef(false);
  const previewImageRef = useRef<HTMLImageElement | null>(null);
  const activeItem = useMemo(() => groupItems.find((item) => item.id === activeId) ?? groupItems[0], [activeId, groupItems]);
  const previewSrc = useImageDataUrl(activeItem);
  const visiblePaths = useMemo(() => groupItems.map((item) => item.path), [groupItems]);

  useEffect(() => {
    if (!groupItems.length) setActiveId(undefined);
    else if (!activeId || !groupItems.some((item) => item.id === activeId)) setActiveId(groupItems[0].id);
  }, [groupItems, activeId]);

  useEffect(() => {
    setEditingImageName(false);
    setImageNameDraft(activeItem?.name ?? '');
    setCropMode(false);
    setCropRect(null);
  }, [activeItem?.id]);

  useEffect(() => {
    if (!openPanel || !settings.acceptExternalDrops) return;
    let unlisten: undefined | (() => void);
    getCurrentWebview().onDragDropEvent((event) => {
      const payload: any = event.payload;
      if (payload.type === 'enter' || payload.type === 'over') setDragOver(true);
      if (payload.type === 'leave') setDragOver(false);
      if (payload.type === 'drop') {
        setDragOver(false);
        const droppedPaths: string[] = payload.paths || [];
        if (droppedPaths.length) onChange(mergeImages(items, droppedPaths, activeGroupId));
      }
    }).then((fn) => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, [openPanel, settings.acceptExternalDrops, items, onChange, activeGroupId]);

  if (!openPanel || !settings.enabled) return null;

  function updateSettings(patch: Partial<ImageBrowserSettings>) {
    onUpdateSettings?.(patch);
  }

  function updateGroups(nextGroups: ImageBrowserGroup[], nextActiveGroupId = activeGroupId) {
    updateSettings({
      groups: nextGroups.map((group, index) => ({ ...group, order: index })),
      activeGroupId: nextActiveGroupId,
    });
  }

  async function addGroup() {
    const name = (await uiPrompt('请输入图片分组名称', `分组 ${groups.length + 1}`))?.trim();
    if (!name) return;
    const group = { id: makeLocalId('imggrp'), name, order: groups.length };
    updateGroups([...groups, group], group.id);
  }

  async function renameGroup() {
    const name = (await uiPrompt('修改图片分组名称', activeGroup.name))?.trim();
    if (!name) return;
    updateGroups(groups.map((group) => group.id === activeGroupId ? { ...group, name } : group));
  }

  async function deleteGroup() {
    if (groups.length <= 1) return;
    if (!(await uiConfirm(`删除分组“${activeGroup.name}”？该分组内图片会移动到“${groups[0].name}”。`))) return;
    const fallbackId = groups.find((group) => group.id !== activeGroupId)?.id ?? DEFAULT_GROUP_ID;
    onChange(items.map((item) => groupOf(item) === activeGroupId ? { ...item, groupId: fallbackId } : item));
    updateGroups(groups.filter((group) => group.id !== activeGroupId), fallbackId);
  }

  function startPanelResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = settings.panelWidth;
    document.body.classList.add('image-browser-resizing');

    function handleMove(moveEvent: PointerEvent) {
      const nextWidth = clamp(startWidth + (startX - moveEvent.clientX), 180, 10000);
      updateSettings({ panelWidth: Math.round(nextWidth) });
    }

    function handleUp() {
      document.body.classList.remove('image-browser-resizing');
      window.removeEventListener('pointermove', handleMove, true);
      window.removeEventListener('pointerup', handleUp, true);
    }

    window.addEventListener('pointermove', handleMove, true);
    window.addEventListener('pointerup', handleUp, true);
  }

  function startThumbPaneResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = settings.thumbnailPaneWidth;
    document.body.classList.add('image-browser-resizing');

    function handleMove(moveEvent: PointerEvent) {
      const maxPane = Math.max(48, settings.panelWidth - 80);
      const nextWidth = clamp(startWidth + (moveEvent.clientX - startX), 48, maxPane);
      updateSettings({ thumbnailPaneWidth: Math.round(nextWidth) });
    }

    function handleUp() {
      document.body.classList.remove('image-browser-resizing');
      window.removeEventListener('pointermove', handleMove, true);
      window.removeEventListener('pointerup', handleUp, true);
    }

    window.addEventListener('pointermove', handleMove, true);
    window.addEventListener('pointerup', handleUp, true);
  }

  async function addImages() {
    const selected = await open({
      multiple: true,
      directory: false,
      filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'ico', 'tif', 'tiff', 'avif'] }]
    });
    const list = Array.isArray(selected) ? selected : selected ? [selected] : [];
    if (list.length) onChange(mergeImages(items, list as string[], activeGroupId));
  }

  async function copyAllToFolder() {
    const target = await open({ directory: true, multiple: false, title: '选择图片复制到的文件夹' });
    if (!target) return;
    await invoke('copy_transfer_paths_to_folder', { paths: visiblePaths, folder: target, action: settings.dragExportAction });
  }

  async function copyActiveToFolder() {
    if (!activeItem) return;
    const target = await open({ directory: true, multiple: false, title: '选择图片复制到的文件夹' });
    if (!target) return;
    await invoke('copy_transfer_paths_to_folder', { paths: [activeItem.path], folder: target, action: settings.dragExportAction });
  }

  function remove(id: string) {
    onChange(items.filter((item) => item.id !== id));
  }


  function updateImageItem(id: string, patch: Partial<ImageBrowserItem>) {
    onChange(items.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  function startRenameActive() {
    if (!activeItem) return;
    setImageNameDraft(activeItem.name || pathBasename(activeItem.path));
    setEditingImageName(true);
    setCropMode(false);
    setCropRect(null);
  }

  function saveActiveName() {
    if (!activeItem) return;
    const nextName = imageNameDraft.trim();
    if (!nextName) return;
    updateImageItem(activeItem.id, { name: nextName });
    setEditingImageName(false);
  }

  function cancelRenameActive() {
    setImageNameDraft(activeItem?.name ?? '');
    setEditingImageName(false);
  }

  function toggleCropMode() {
    setEditingImageName(false);
    setCropMode((value) => {
      if (value) {
        setCropRect(null);
          }
      return !value;
    });
  }

  function updateCropPointerFromEvent(event: { clientX: number; clientY: number }) {
    if (!cropMode || !previewImageRef.current) return null;
    const metrics = getImageContentMetrics(previewImageRef.current, settings.previewFit);
    if (!metrics) return null;
    const { selectableRect } = metrics;
    const x = clamp(event.clientX, selectableRect.left, selectableRect.left + selectableRect.width);
    const y = clamp(event.clientY, selectableRect.top, selectableRect.top + selectableRect.height);
    return { ...metrics, x, y };
  }

  function handleCropPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    updateCropPointerFromEvent(event);
  }

  function startCrop(event: ReactPointerEvent<HTMLDivElement>) {
    if (!cropMode || !previewImageRef.current) return;
    const metrics = getImageContentMetrics(previewImageRef.current, settings.previewFit);
    if (!metrics) return;
    const { stageRect, stageScrollLeft, stageScrollTop, selectableRect } = metrics;
    if (
      event.clientX < selectableRect.left ||
      event.clientX > selectableRect.left + selectableRect.width ||
      event.clientY < selectableRect.top ||
      event.clientY > selectableRect.top + selectableRect.height
    ) return;
    const startClientX = clamp(event.clientX, selectableRect.left, selectableRect.left + selectableRect.width);
    const startClientY = clamp(event.clientY, selectableRect.top, selectableRect.top + selectableRect.height);
    const startStageX = startClientX - stageRect.left + stageScrollLeft;
    const startStageY = startClientY - stageRect.top + stageScrollTop;
    const stageEl = event.currentTarget;
    const pointerId = event.pointerId;

    event.preventDefault();
    event.stopPropagation();
    cropDraggingRef.current = true;
    stageEl.setPointerCapture?.(pointerId);
    setCropRect({ left: startStageX, top: startStageY, width: 0, height: 0 });

    function handleMove(moveEvent: PointerEvent) {
      const nextClientX = clamp(moveEvent.clientX, selectableRect.left, selectableRect.left + selectableRect.width);
      const nextClientY = clamp(moveEvent.clientY, selectableRect.top, selectableRect.top + selectableRect.height);
      const nextStageX = nextClientX - stageRect.left + stageScrollLeft;
      const nextStageY = nextClientY - stageRect.top + stageScrollTop;
      setCropRect({
        left: Math.min(startStageX, nextStageX),
        top: Math.min(startStageY, nextStageY),
        width: Math.abs(nextStageX - startStageX),
        height: Math.abs(nextStageY - startStageY),
      });
    }

    function handleUp() {
      cropDraggingRef.current = false;
      stageEl.releasePointerCapture?.(pointerId);
      window.removeEventListener('pointermove', handleMove, true);
      window.removeEventListener('pointerup', handleUp, true);
      window.removeEventListener('pointercancel', handleUp, true);
    }

    window.addEventListener('pointermove', handleMove, true);
    window.addEventListener('pointerup', handleUp, true);
    window.addEventListener('pointercancel', handleUp, true);
  }

  function applyCrop() {
    if (!activeItem || !previewImageRef.current || !cropRect || cropRectArea(cropRect) < 16) return;
    const img = previewImageRef.current;
    const metrics = getImageContentMetrics(img, settings.previewFit);
    if (!metrics) return;
    const { stageRect, stageScrollLeft, stageScrollTop, imageRect, selectableRect, scale, offsetX, offsetY } = metrics;
    const absLeft = stageRect.left - stageScrollLeft + cropRect.left;
    const absTop = stageRect.top - stageScrollTop + cropRect.top;
    const absRight = absLeft + cropRect.width;
    const absBottom = absTop + cropRect.height;
    const visibleLeft = Math.max(absLeft, selectableRect.left);
    const visibleTop = Math.max(absTop, selectableRect.top);
    const visibleRight = Math.min(absRight, selectableRect.left + selectableRect.width);
    const visibleBottom = Math.min(absBottom, selectableRect.top + selectableRect.height);
    if (visibleRight - visibleLeft < 2 || visibleBottom - visibleTop < 2) return;

    const sourceX = settings.previewFit === 'cover'
      ? (visibleLeft - imageRect.left - offsetX) / scale
      : (visibleLeft - selectableRect.left) / scale;
    const sourceY = settings.previewFit === 'cover'
      ? (visibleTop - imageRect.top - offsetY) / scale
      : (visibleTop - selectableRect.top) / scale;
    const sourceW = (visibleRight - visibleLeft) / scale;
    const sourceH = (visibleBottom - visibleTop) / scale;
    const sx = clamp(Math.floor(sourceX), 0, img.naturalWidth - 1);
    const sy = clamp(Math.floor(sourceY), 0, img.naturalHeight - 1);
    const sw = clamp(Math.round(sourceW), 1, img.naturalWidth - sx);
    const sh = clamp(Math.round(sourceH), 1, img.naturalHeight - sy);

    try {
      const canvas = document.createElement('canvas');
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      const dataUrl = canvas.toDataURL('image/png');
      updateImageItem(activeItem.id, { dataUrl });
      setCropMode(false);
      setCropRect(null);
      } catch (error) {
      console.error('crop image failed', error);
      void uiAlert('截取失败：当前图片可能不支持画布裁剪。');
    }
  }

  function resetActiveCrop() {
    if (!activeItem?.dataUrl) return;
    updateImageItem(activeItem.id, { dataUrl: undefined });
    setCropMode(false);
    setCropRect(null);
  }

  async function clearAll() {
    if (settings.confirmClear && !(await uiConfirm(`确定清空“${activeGroup.name}”分组里的图片？`))) return;
    onChange(items.filter((item) => groupOf(item) !== activeGroupId));
  }

  function writeDragData(event: ReactDragEvent<HTMLElement>, item: ImageBrowserItem) {
    const fileUrl = pathToFileUrl(item.path);
    event.stopPropagation();
    event.dataTransfer.effectAllowed = settings.dragExportAction === 'move' ? 'move' : 'copy';
    event.dataTransfer.setData('text/plain', item.path);
    event.dataTransfer.setData('text/uri-list', fileUrl);
    event.dataTransfer.setData('text/x-moz-url', `${fileUrl}\n${item.name}`);
    event.dataTransfer.setData('DownloadURL', `image/*:${item.name}:${fileUrl}`);
  }

  const previewFitClass = settings.previewFit === 'cover' ? 'cover' : settings.previewFit === 'actual' ? 'actual' : 'contain';
  const panelStyle = {
    width: settings.panelWidth,
    '--image-browser-panel-percent': `${Math.round((settings.panelOpacity ?? 0.96) * 100)}%`,
    '--image-browser-preview-bg': settings.previewBackground || 'rgba(0,0,0,.28)',
    '--image-browser-preview-padding': `${settings.previewPadding ?? 12}px`,
    '--image-browser-preview-radius': `${settings.previewRadius ?? 4}px`
  } as CSSProperties;

  return (
    <aside
      className={`image-browser-panel ${dragOver ? 'drag-over' : ''}`}
      style={panelStyle}
      data-no-drag
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
      onDragLeave={(event) => { if (event.currentTarget === event.target) setDragOver(false); }}
      onDrop={(event) => {
        event.preventDefault();
        setDragOver(false);
        const dropped = Array.from(event.dataTransfer.files).map((file: any) => file.path || file.name).filter(Boolean);
        if (dropped.length) onChange(mergeImages(items, dropped, activeGroupId));
      }}
    >
      <div className="image-browser-panel-resizer" data-no-drag onPointerDown={startPanelResize} title="拖动调整图片浏览器宽度" />
      <header className="image-browser-header">
        <strong>▣ 图片浏览</strong>
        <div className="image-browser-header-actions">
          <button onClick={() => setShowSettings((value) => !value)} title="图片浏览设置"><Settings size={16} /></button>
          <button onClick={onClose} title="关闭"><X size={16} /></button>
        </div>
      </header>
      <div className="image-browser-groupbar" data-no-drag>
        <div className="image-browser-groups">
          {groups.map((group) => (
            <button key={group.id} className={group.id === activeGroupId ? 'active' : ''} onClick={() => updateSettings({ activeGroupId: group.id })} onDoubleClick={renameGroup} title="双击重命名">
              {group.name}
            </button>
          ))}
        </div>
        <div className="image-browser-group-actions">
          <button onClick={addGroup} title="添加分组"><Plus size={15} /></button>
          <button onClick={renameGroup} title="重命名当前分组"><Edit2 size={15} /></button>
          <button onClick={deleteGroup} disabled={groups.length <= 1} title="删除当前分组"><Trash2 size={15} /></button>
        </div>
      </div>
      <div className="image-browser-toolbar">
        {settings.showAddButton && <button onClick={addImages}><ImagePlus size={15} /> 添加图片</button>}
        {settings.showCopyAllButton && <button onClick={copyAllToFolder} disabled={!groupItems.length}><FolderOpen size={15} /> 复制本组到文件夹</button>}
        {settings.showClearButton && <button className="danger" onClick={clearAll} disabled={!groupItems.length}><Trash2 size={15} /> 清空本组</button>}
      </div>
      {showSettings && (
        <section className="image-browser-settings" data-no-drag>
          <div className="image-browser-settings-grid">
            <label>面板宽度 <b>{settings.panelWidth}px</b><input type="range" min={180} max={2600} step={10} value={Math.min(settings.panelWidth, 2600)} onChange={(e) => updateSettings({ panelWidth: Number(e.target.value) })} /></label>
            <label>缩略图区宽度 <b>{settings.thumbnailPaneWidth}px</b><input type="range" min={48} max={1600} step={4} value={Math.min(settings.thumbnailPaneWidth, 1600)} onChange={(e) => updateSettings({ thumbnailPaneWidth: Number(e.target.value) })} /></label>
            <label>缩略图宽度 <b>{settings.thumbnailWidth}px</b><input type="range" min={32} max={800} step={4} value={Math.min(settings.thumbnailWidth, 800)} onChange={(e) => updateSettings({ thumbnailWidth: Number(e.target.value) })} /></label>
            <label>预览留白 <b>{settings.previewPadding}px</b><input type="range" min={0} max={240} step={1} value={settings.previewPadding} onChange={(e) => updateSettings({ previewPadding: Number(e.target.value) })} /></label>
            <label>图片圆角 <b>{settings.previewRadius}px</b><input type="range" min={0} max={240} step={1} value={settings.previewRadius} onChange={(e) => updateSettings({ previewRadius: Number(e.target.value) })} /></label>
            <label>面板不透明度 <b>{Math.round(settings.panelOpacity * 100)}%</b><input type="range" min={20} max={100} step={1} value={Math.round(settings.panelOpacity * 100)} onChange={(e) => updateSettings({ panelOpacity: Number(e.target.value) / 100 })} /></label>
            <label>预览背景 <input className="image-browser-text-input" value={settings.previewBackground} onChange={(e) => updateSettings({ previewBackground: e.target.value })} placeholder="rgba(0,0,0,.28) 或 #000000" /></label>
            <label>显示方式
              <select value={settings.previewFit} onChange={(e) => updateSettings({ previewFit: e.target.value as ImageBrowserSettings['previewFit'] })}>
                <option value="contain">完整显示</option>
                <option value="cover">填满区域</option>
                <option value="actual">原始大小</option>
              </select>
            </label>
            <label>图片名称位置
              <select value={settings.imageNamePosition} onChange={(e) => updateSettings({ imageNamePosition: e.target.value as ImageBrowserSettings['imageNamePosition'] })}>
                <option value="bottom">图片下方</option>
                <option value="top">图片上方</option>
                <option value="inside">图片内部</option>
                <option value="hidden">不显示</option>
              </select>
            </label>
          </div>
          <div className="image-browser-settings-checks">
            <label><input type="checkbox" checked={settings.showFileName} onChange={(e) => updateSettings({ showFileName: e.target.checked })} /> 显示图片名称</label>
            <label><input type="checkbox" checked={settings.showImageMeta} onChange={(e) => updateSettings({ showImageMeta: e.target.checked })} /> 显示图片路径信息</label>
            <label><input type="checkbox" checked={settings.showHint} onChange={(e) => updateSettings({ showHint: e.target.checked })} /> 显示拖拽提示</label>
            <label><input type="checkbox" checked={settings.acceptExternalDrops} onChange={(e) => updateSettings({ acceptExternalDrops: e.target.checked })} /> 允许拖入图片</label>
            <label><input type="checkbox" checked={settings.showAddButton} onChange={(e) => updateSettings({ showAddButton: e.target.checked })} /> 显示“添加图片”</label>
            <label><input type="checkbox" checked={settings.showCopyAllButton} onChange={(e) => updateSettings({ showCopyAllButton: e.target.checked })} /> 显示“复制本组”</label>
            <label><input type="checkbox" checked={settings.showClearButton} onChange={(e) => updateSettings({ showClearButton: e.target.checked })} /> 显示“清空本组”</label>
            <label><input type="checkbox" checked={settings.showActiveActions} onChange={(e) => updateSettings({ showActiveActions: e.target.checked })} /> 显示单图操作按钮</label>
            <label><input type="checkbox" checked={settings.confirmClear} onChange={(e) => updateSettings({ confirmClear: e.target.checked })} /> 清空前确认</label>
          </div>
        </section>
      )}
      {settings.showHint && <div className="image-browser-hint">把图片拖进来浏览；拖动左侧缩略图或主预览图，可把图片拖到外部文件夹。若资源管理器不接收，可用“复制到文件夹”。</div>}
      <div className="image-browser-body">
        <div className="image-browser-thumbs" style={{ width: settings.thumbnailPaneWidth }}>
          {groupItems.map((item, index) => (
            <div key={item.id} className="image-browser-thumb-row" draggable onDragStart={(event) => writeDragData(event, item)} data-no-drag>
              <span className="image-browser-index">{index + 1}</span>
              <Thumbnail item={item} selected={activeItem?.id === item.id} width={Math.min(settings.thumbnailWidth, Math.max(32, settings.thumbnailPaneWidth - 38))} settings={settings} onSelect={() => setActiveId(item.id)} />
            </div>
          ))}
          {!groupItems.length && <div className="image-browser-empty-small">当前分组为空，拖入图片或点击添加</div>}
        </div>
        <div className="image-browser-divider-resizer" data-no-drag onPointerDown={startThumbPaneResize} title="拖动调整左侧缩略图区宽度" />
        <main className="image-browser-preview">
          {activeItem && previewSrc ? (
            <>
              {settings.showImageMeta && (
                <div className="image-browser-preview-top">
                  <div className="image-browser-preview-info">
                    {editingImageName ? (
                      <div className="image-browser-name-editor">
                        <input
                          autoFocus
                          value={imageNameDraft}
                          onChange={(event) => setImageNameDraft(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') saveActiveName();
                            if (event.key === 'Escape') cancelRenameActive();
                          }}
                        />
                        <button onClick={saveActiveName} title="保存名称"><Check size={15} /></button>
                        <button onClick={cancelRenameActive} title="取消"><X size={15} /></button>
                      </div>
                    ) : (
                      <strong onDoubleClick={startRenameActive} title="双击修改图片名称">{activeItem.name}</strong>
                    )}
                    <span>{activeItem.path}</span>
                  </div>
                  {settings.showActiveActions && (
                    <div className="image-browser-preview-actions">
                      <button onClick={startRenameActive} title="修改图片名称"><Edit2 size={16} /></button>
                      <button className={cropMode ? 'active' : ''} onClick={toggleCropMode} title="截取图片大小"><Crop size={16} /></button>
                      {cropMode && <button onClick={applyCrop} disabled={cropRectArea(cropRect) < 16} title="应用截取"><Check size={16} /></button>}
                      {activeItem.dataUrl && <button onClick={resetActiveCrop} title="还原原图预览">原</button>}
                      <button onClick={() => navigator.clipboard.writeText(activeItem.path)} title="复制路径"><Copy size={16} /></button>
                      <button onClick={() => invoke('launch_item', { path: activeItem.path, asAdmin: false })} title="打开"><ExternalLink size={16} /></button>
                      <button onClick={copyActiveToFolder} title="复制到文件夹"><FolderOpen size={16} /></button>
                      <button onClick={() => remove(activeItem.id)} title="移除"><Trash2 size={16} /></button>
                    </div>
                  )}
                </div>
              )}
              {cropMode && <div className="image-browser-crop-tip">拖动图片区域选择截取范围，再点击 ✓ 应用。截取只修改预览内图片，不覆盖原文件。</div>}
              <div
                className={`image-browser-preview-stage ${previewFitClass} ${cropMode ? 'crop-mode' : ''}`}
                draggable={!cropMode}
                onDragStart={(event) => { if (!cropMode) writeDragData(event, activeItem); }}
                onPointerDown={startCrop}
                onPointerMove={handleCropPointerMove}
                onPointerEnter={handleCropPointerMove}
                data-no-drag
              >
                <img ref={previewImageRef} src={previewSrc} alt={activeItem.name} draggable={false} />
                {cropMode && cropRect && (
                  <div
                    className="image-browser-crop-box"
                    style={{ left: cropRect.left, top: cropRect.top, width: cropRect.width, height: cropRect.height }}
                  />
                )}
              </div>
            </>
          ) : (
            <div className="image-browser-empty">暂无图片。拖入图片后会像幻灯片缩略图一样显示在左侧。</div>
          )}
        </main>
      </div>
    </aside>
  );
}
