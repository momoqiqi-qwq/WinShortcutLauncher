import { useEffect, useMemo, useRef, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { DEFAULT_TRANSFER_STATION_SETTINGS, type TransferStationItem, type TransferStationSettings } from '../../utils/v16Types';
import { resolveItemIcon } from '../../utils/iconResolver';
import './TransferStationPanel.css';
import { uiConfirm } from '../../lib/uiDialog';

export interface TransferStationPanelProps {
  openPanel: boolean;
  items: TransferStationItem[];
  settings?: Partial<TransferStationSettings>;
  onClose: () => void;
  onChange: (items: TransferStationItem[]) => void;
  onAddToCurrentDirectory?: (paths: string[]) => void;
}

function pathBasename(path: string) {
  return path.replace(/\\/g, '/').split('/').filter(Boolean).pop() || path;
}

function pathToFileUrl(path: string) {
  const normalized = path.replace(/\\/g, '/');
  if (/^file:/i.test(normalized)) return normalized;
  const withSlash = /^[A-Za-z]:/.test(normalized) ? `/${normalized}` : normalized;
  return `file://${encodeURI(withSlash)}`;
}

function newStationItem(path: string): TransferStationItem {
  const clean = path.replace(/^file:\/\//i, '').replace(/^\//, (m) => (path[2] === ':' ? '' : m));
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: pathBasename(clean),
    path: clean,
    kind: /[\\/]$/.test(clean) ? 'folder' : 'unknown',
    addedAt: Date.now(),
  };
}

function mergeItems(oldItems: TransferStationItem[], paths: string[]) {
  const exists = new Set(oldItems.map((x) => x.path.toLowerCase()));
  const next = [...oldItems];
  for (const p of paths) {
    if (!p || exists.has(p.toLowerCase())) continue;
    const item = newStationItem(p);
    next.push(item);
    exists.add(p.toLowerCase());
  }
  return next;
}

function StationIcon({ item, size }: { item: TransferStationItem; size: number }) {
  const [icon, setIcon] = useState<string | undefined>(item.icon);
  useEffect(() => {
    let cancelled = false;
    resolveItemIcon({ path: item.path, icon: item.icon, name: item.name }).then((next) => {
      if (!cancelled) setIcon(next);
    });
    return () => { cancelled = true; };
  }, [item.path, item.icon, item.name]);
  if (icon) return <img className="station-icon" src={icon} width={size} height={size} alt="" />;
  return <div className="station-icon fallback" style={{ width: size, height: size }}>{item.kind === 'folder' ? '📁' : '📄'}</div>;
}

export function TransferStationPanel({ openPanel, items, settings: settingsPatch, onClose, onChange, onAddToCurrentDirectory }: TransferStationPanelProps) {
  const settings = { ...DEFAULT_TRANSFER_STATION_SETTINGS, ...settingsPatch };
  const [dragOver, setDragOver] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const paths = useMemo(() => items.map((x) => x.path), [items]);

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
        if (droppedPaths.length) onChange(mergeItems(items, droppedPaths));
      }
    }).then((fn) => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, [openPanel, settings.acceptExternalDrops, items, onChange]);

  if (!openPanel || !settings.enabled) return null;

  async function addFiles() {
    const selected = await open({ multiple: true, directory: false });
    const list = Array.isArray(selected) ? selected : selected ? [selected] : [];
    onChange(mergeItems(items, list as string[]));
  }

  async function addFolder() {
    const selected = await open({ multiple: true, directory: true });
    const list = Array.isArray(selected) ? selected : selected ? [selected] : [];
    onChange(mergeItems(items, list as string[]));
  }

  async function copyToFolder() {
    const target = await open({ directory: true, multiple: false });
    if (!target) return;
    await invoke('copy_transfer_paths_to_folder', { paths, folder: target, action: settings.dropAction });
  }

  function remove(id: string) {
    onChange(items.filter((x) => x.id !== id));
  }

  async function clearAll() {
    if (settings.confirmClear && !(await uiConfirm('确定清空文件中转站？'))) return;
    onChange([]);
  }

  return (
    <aside
      ref={panelRef}
      data-no-drag
      className={`transfer-station-panel ${dragOver ? 'drag-over' : ''}`}
      style={{ width: settings.panelWidth }}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver(false); }}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const dropped = Array.from(e.dataTransfer.files).map((file: any) => file.path || file.name).filter(Boolean);
        if (dropped.length) onChange(mergeItems(items, dropped));
      }}
    >
      <header className="station-header">
        <strong>▣ 文件中转站</strong>
        <button onClick={onClose}>×</button>
      </header>
      <div className="station-toolbar">
        <button onClick={addFiles}>添加文件</button>
        <button onClick={addFolder}>添加文件夹</button>
        <button onClick={() => onAddToCurrentDirectory?.(paths)} disabled={!items.length}>加到当前目录</button>
        <button onClick={copyToFolder} disabled={!items.length}>复制到文件夹</button>
        <button className="danger" onClick={clearAll} disabled={!items.length}>清空</button>
      </div>
      <div className="station-drop-hint">拖入文件/文件夹到这里；中转站项目也可以拖到本应用里的“文件夹”快捷项目上。</div>
      <div className="station-list">
        {items.map((item) => (
          <div
            key={item.id}
            className="station-item"
            data-no-drag
            draggable
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onDragStart={(e) => {
              e.stopPropagation();
              const payload = JSON.stringify({ paths: [item.path], action: settings.dropAction });
              const fileUrl = pathToFileUrl(item.path);
              e.dataTransfer.effectAllowed = settings.dropAction === 'move' ? 'move' : 'copy';
              e.dataTransfer.setData('application/x-launcher-transfer-paths', payload);
              e.dataTransfer.setData('text/plain', item.path);
              e.dataTransfer.setData('text/uri-list', fileUrl);
              e.dataTransfer.setData('text/x-moz-url', `${fileUrl}\n${item.name}`);
              e.dataTransfer.setData('DownloadURL', `application/octet-stream:${item.name}:${fileUrl}`);
            }}
          >
            {settings.showIcon && <StationIcon item={item} size={settings.iconSize} />}
            <div className="station-item-main">
              <strong>{item.name}</strong>
              <span>{item.path}</span>
            </div>
            <button title="复制路径" onClick={() => navigator.clipboard.writeText(item.path)}>⧉</button>
            <button title="打开" onClick={() => invoke('launch_item', { path: item.path, asAdmin: false })}>↗</button>
            <button title="删除" onClick={() => remove(item.id)}>🗑</button>
          </div>
        ))}
        {!items.length && <div className="station-empty">暂无文件。把文件拖进来，或点击“添加文件”。</div>}
      </div>
    </aside>
  );
}

export function readTransferStationDrag(dataTransfer: DataTransfer) {
  const raw = dataTransfer.getData('application/x-launcher-transfer-paths');
  if (!raw) return null;
  try { return JSON.parse(raw) as { paths: string[]; action?: 'copy' | 'move' }; }
  catch { return null; }
}
