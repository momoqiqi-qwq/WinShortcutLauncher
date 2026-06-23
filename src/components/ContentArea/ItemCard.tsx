import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Folder, Link2, TerminalSquare, FileIcon } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { BehaviorSettings, DisplaySettings, ShortcutItem } from '../../types';
import { useAppStore } from '../../stores/appStore';
import { chooseIconResolveCommand, getCachedIcon, isDirectImageSource, resolveIconDataUrl, type IconResolveCommand } from '../../lib/iconCache';
import type { IconResolveMode, TransferStationSettings } from '../../utils/v16Types';
import { transferStationFolderDropProps } from './ItemCard.drop-patch';
import { uiAlert } from '../../lib/uiDialog';

interface ItemCardProps {
  item: ShortcutItem;
  selected: boolean;
  display: DisplaySettings;
  behavior: BehaviorSettings;
  transferStation: TransferStationSettings;
  onContextMenu: (itemId: string, x: number, y: number) => void;
}

const LAUNCH_DEBOUNCE_MS = 500;

function shouldResolveIcon(value: string) {
  return Boolean(value) && !isDirectImageSource(value);
}

function canAutoExtractIcon(item: ShortcutItem) {
  return item.type !== 'url' && Boolean(item.path?.trim());
}

function getIconResolveTarget(item: ShortcutItem) {
  const customIcon = item.icon?.trim();
  if (customIcon) return { value: customIcon, fromItemPath: false };
  if (canAutoExtractIcon(item)) return { value: item.path.trim(), fromItemPath: true };
  return { value: '', fromItemPath: false };
}

export function resolveCommand(rawIcon: string, fromItemPath: boolean, mode: IconResolveMode = 'auto'): IconResolveCommand {
  return chooseIconResolveCommand(rawIcon, fromItemPath, mode);
}

function FallbackIcon({ type, size }: { type: ShortcutItem['type']; size: number }) {
  if (type === 'folder') return <Folder size={size} />;
  if (type === 'url') return <Link2 size={size} />;
  if (type === 'command') return <TerminalSquare size={size} />;
  return <FileIcon size={size} />;
}

export function ItemCard({ item, selected, display, behavior, transferStation, onContextMenu }: ItemCardProps) {
  const selectItem = useAppStore((state) => state.selectItem);
  const selectedItemIds = useAppStore((state) => state.selectedItemIds);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const sortableListeners = listeners as Record<string, ((event: unknown) => void) | undefined>;
  const effectiveLines = item.labelLines ?? display.labelLines;
  const fallbackIconSize = Math.max(28, display.iconSize - 12);
  const pointerDownRef = useRef<{ x: number; y: number; button: number; pointerId: number } | null>(null);
  const singleClickDragTimerRef = useRef<number | null>(null);
  const pointerStillDownRef = useRef(false);
  const singleClickSortableStartedRef = useRef(false);
  const pointerMovedBeyondClickRef = useRef(false);
  const launchLockRef = useRef<{ pending: boolean; lastAt: number }>({ pending: false, lastAt: 0 });
  const itemIconMode = display.itemIconResolveMode ?? 'auto';
  const iconTarget = useMemo(() => {
    const target = getIconResolveTarget(item);
    const rawIcon = target.value;
    if (!rawIcon) return { rawIcon: '', command: 'get_file_icon' as IconResolveCommand };
    const command = resolveCommand(rawIcon, target.fromItemPath, itemIconMode);
    return { rawIcon, command };
  }, [item.icon, item.path, item.type, itemIconMode]);
  const [resolvedIcon, setResolvedIcon] = useState<string | undefined>(() => {
    const target = getIconResolveTarget(item);
    const rawIcon = target.value;
    if (!rawIcon) return undefined;
    if (isDirectImageSource(rawIcon)) return rawIcon;
    const command = resolveCommand(rawIcon, target.fromItemPath, itemIconMode);
    return getCachedIcon(command, rawIcon);
  });

  useEffect(() => {
    const { rawIcon, command } = iconTarget;
    if (!rawIcon) {
      setResolvedIcon(undefined);
      return;
    }
    if (isDirectImageSource(rawIcon)) {
      setResolvedIcon(rawIcon);
      return;
    }

    const cached = getCachedIcon(command, rawIcon);
    if (cached) {
      setResolvedIcon(cached);
      return;
    }

    let cancelled = false;
    // Keep the fallback icon visible while the persistent / native cache resolves.
    setResolvedIcon(undefined);
    resolveIconDataUrl(command, rawIcon)
      .then((dataUrl) => {
        if (!cancelled && dataUrl) setResolvedIcon(dataUrl);
      })
      .catch(() => {
        if (!cancelled && shouldResolveIcon(rawIcon)) setResolvedIcon(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, [iconTarget]);

  const stationDropProps = transferStation?.dragToShortcutFolders === false ? {} : transferStationFolderDropProps(item);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    '--label-lines': effectiveLines,
    '--label-chars': display.charsPerLine,
    '--label-font-size': display.fontSize
  } as CSSProperties;

  async function launch(asAdmin = false) {
    const now = Date.now();
    if (launchLockRef.current.pending || now - launchLockRef.current.lastAt < LAUNCH_DEBOUNCE_MS) return;
    launchLockRef.current = { pending: true, lastAt: now };
    try {
      await invoke('launch_item', { path: item.path, asAdmin });
    } catch (error) {
      console.error(error);
      void uiAlert(`启动失败：${String(error)}`);
    } finally {
      launchLockRef.current.pending = false;
    }
  }

  function getSingleClickTolerance() {
    return Math.max(2, Math.min(28, Math.round(behavior.itemDragTolerance ?? 10)));
  }

  function wasPointerDrag(start: { x: number; y: number } | null, event: { clientX: number; clientY: number }) {
    if (!start) return true;
    const threshold = behavior.launchMode === 'single' ? getSingleClickTolerance() : 6;
    return Math.hypot(event.clientX - start.x, event.clientY - start.y) > threshold;
  }

  function clearSingleClickDragTimer() {
    if (singleClickDragTimerRef.current !== null) {
      window.clearTimeout(singleClickDragTimerRef.current);
      singleClickDragTimerRef.current = null;
    }
  }

  function resetPressState(pointerId?: number) {
    const start = pointerDownRef.current;
    if (pointerId !== undefined && start && start.pointerId !== pointerId) return;
    clearSingleClickDragTimer();
    pointerStillDownRef.current = false;
    pointerDownRef.current = null;
    pointerMovedBeyondClickRef.current = false;
    singleClickSortableStartedRef.current = false;
  }

  useEffect(() => {
    const clearSoon = () => window.setTimeout(() => resetPressState(), 0);
    const clearNow = () => resetPressState();
    window.addEventListener('pointerup', clearSoon, true);
    window.addEventListener('pointercancel', clearSoon, true);
    window.addEventListener('mouseup', clearSoon, true);
    window.addEventListener('blur', clearNow, true);
    return () => {
      window.removeEventListener('pointerup', clearSoon, true);
      window.removeEventListener('pointercancel', clearSoon, true);
      window.removeEventListener('mouseup', clearSoon, true);
      window.removeEventListener('blur', clearNow, true);
    };
  }, []);

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    event.stopPropagation();
    const append = event.ctrlKey || event.metaKey;
    selectItem(item.id, append);
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    pointerDownRef.current = { x: event.clientX, y: event.clientY, button: event.button, pointerId: event.pointerId };
    pointerStillDownRef.current = true;
    pointerMovedBeyondClickRef.current = false;
    singleClickSortableStartedRef.current = false;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Some WebView / device combinations do not support capture for every pointer.
    }
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const start = pointerDownRef.current;
    if (!start || start.pointerId !== event.pointerId) return;
    if (wasPointerDrag(start, event)) pointerMovedBeyondClickRef.current = true;
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    const start = pointerDownRef.current;
    const sortableAlreadyStarted = singleClickSortableStartedRef.current;
    clearSingleClickDragTimer();
    pointerStillDownRef.current = false;
    pointerDownRef.current = null;
    if (!start || start.pointerId !== event.pointerId || behavior.launchMode !== 'single') return;
    if (sortableAlreadyStarted) return;
    if (start.button !== 0 || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    if (pointerMovedBeyondClickRef.current || wasPointerDrag(start, event) || isDragging) return;
    event.stopPropagation();
    selectItem(item.id, false);
    // 让 dnd-kit 的 document pointerup 先完成清理，再启动外部程序。
    // 否则外部程序抢焦点时，偶发会留下一个已经激活/待激活的拖拽态。
    window.setTimeout(() => void launch(false), 60);
  }

  function handlePointerCancel(event: PointerEvent<HTMLDivElement>) {
    resetPressState(event.pointerId);
  }

  function handleDoubleClick(event: MouseEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (behavior.launchMode !== 'double') return;
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    selectItem(item.id, false);
    void launch(false);
  }

  function handleContext(event: MouseEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (event.ctrlKey || event.metaKey) {
      selectItem(item.id, true);
    } else if (selectedItemIds.length === 0) {
      selectItem(item.id, false);
    }
    onContextMenu(item.id, event.clientX, event.clientY);
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`item-card ${selected ? 'selected' : ''} ${isDragging ? 'dragging' : ''}`}
      title={item.name}
      {...attributes}
      {...listeners}
      {...stationDropProps}
      onClick={handleClick}
      onPointerDown={(event) => {
        handlePointerDown(event);
        if (event.button !== 0) return;

        if (behavior.launchMode !== 'single') {
          sortableListeners.onPointerDown?.(event);
          return;
        }

        // 单击启动模式：先不把 pointerdown 交给 dnd-kit。
        // 只有按住达到设置的长按时间后，才允许进入项目排序拖拽。
        const pressEvent = event;
        const expectedPointerId = event.pointerId;
        clearSingleClickDragTimer();
        singleClickDragTimerRef.current = window.setTimeout(() => {
          const start = pointerDownRef.current;
          if (!pointerStillDownRef.current || !start || start.pointerId !== expectedPointerId || start.button !== 0) return;
          singleClickSortableStartedRef.current = true;
          sortableListeners.onPointerDown?.(pressEvent);
        }, Math.max(80, Math.min(1200, Math.round(behavior.itemDragLongPressMs ?? 220))));
      }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onLostPointerCapture={(event) => { if (!pointerStillDownRef.current) resetPressState(event.pointerId); }}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContext}
    >
      <div className="item-edit-name">
        <div className="item-icon">
          {resolvedIcon ? <img src={resolvedIcon} alt="" draggable={false} /> : <FallbackIcon type={item.type} size={fallbackIconSize} />}
        </div>
        <div className="item-label">{item.name}</div>
      </div>
    </div>
  );
}

export async function launchItem(item: ShortcutItem, asAdmin = false) {
  await invoke('launch_item', { path: item.path, asAdmin });
}
