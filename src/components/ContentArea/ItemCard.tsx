import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from 'react';
import { Folder, Link2, TerminalSquare, FileIcon, Pin } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { BehaviorSettings, DisplaySettings, ShortcutItem } from '../../types';
import { useAppStore } from '../../stores/appStore';
import { chooseIconResolveCommand, getCachedIcon, isDirectImageSource, resolveIconDataUrl, type IconResolveCommand } from '../../lib/iconCache';
import type { IconResolveMode, TransferStationSettings } from '../../utils/v16Types';
import { transferStationFolderDropProps } from './ItemCard.drop-patch';
import { uiAlert } from '../../lib/uiDialog';
import { buildItemTooltip } from '../../lib/itemExperience';
import { getItemCopyPayload, getItemInteractionHint, resolveItemClickAction, type ResolvedItemClickAction } from '../../lib/itemClickActions';
import { writeTextToClipboard } from '../../lib/clipboardText';
import { getSystemDoubleClickTimeMs, primeSystemDoubleClickTime } from '../../lib/doubleClickTiming';
import { showLauncherNotice } from '../../lib/notify';
import { launchShortcutItem } from '../../lib/launchShortcut';
import { trackActivePointerReset } from '../../lib/pointerResetHub';

interface ItemCardProps {
  item: ShortcutItem;
  selected: boolean;
  display: DisplaySettings;
  behavior: BehaviorSettings;
  transferStation: TransferStationSettings;
  onContextMenu: (itemId: string, x: number, y: number) => void;
}

const LAUNCH_DEBOUNCE_MS = 500;

function safeTrim(value: unknown) {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
}

function shouldResolveIcon(value: string) {
  return Boolean(value) && !isDirectImageSource(value);
}

function canAutoExtractIcon(item: ShortcutItem) {
  return item.type !== 'url' && Boolean(safeTrim(item.path));
}

function getIconResolveTarget(item: ShortcutItem) {
  const customIcon = safeTrim(item.icon);
  if (customIcon) return { value: customIcon, fromItemPath: false };
  if (canAutoExtractIcon(item)) return { value: safeTrim(item.path), fromItemPath: true };
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

function ItemCardComponent({ item, selected, display, behavior, transferStation, onContextMenu }: ItemCardProps) {
  const selectItem = useAppStore((state) => state.selectItem);
  const clearSelection = useAppStore((state) => state.clearSelection);
  const multiSelectMode = useAppStore((state) => state.multiSelectMode);
  const itemTooltipMode = useAppStore((state) => state.experience.itemTooltipMode);
  const showLaunchCountBadge = useAppStore((state) => state.experience.showLaunchCountBadge);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: display.sortMode !== 'custom' || multiSelectMode,
  });
  const sortableListeners = listeners as Record<string, ((event: unknown) => void) | undefined>;
  const cardRef = useRef<HTMLDivElement | null>(null);
  const untrackPointerResetRef = useRef<(() => void) | null>(null);
  const [iconVisible, setIconVisible] = useState(false);
  const setCardNodeRef = useCallback((node: HTMLDivElement | null) => {
    cardRef.current = node;
    setNodeRef(node);
  }, [setNodeRef]);
  const effectiveLines = item.labelLines ?? display.labelLines;
  const fallbackIconSize = Math.max(28, display.iconSize - 12);
  const pointerDownRef = useRef<{ x: number; y: number; button: number; pointerId: number } | null>(null);
  const singleClickDragTimerRef = useRef<number | null>(null);
  const pendingSingleActionTimerRef = useRef<number | null>(null);
  const pendingSingleActionGenerationRef = useRef(0);
  const pointerStillDownRef = useRef(false);
  const singleClickSortableStartedRef = useRef(false);
  const pointerMovedBeyondClickRef = useRef(false);
  const launchLockRef = useRef<{ pending: boolean; lastAt: number }>({ pending: false, lastAt: 0 });
  const itemIconMode = display.itemIconResolveMode ?? 'auto';
  const singleClickAction = resolveItemClickAction(item.singleClickAction, 'single', behavior.launchMode);
  const doubleClickAction = resolveItemClickAction(item.doubleClickAction, 'double', behavior.launchMode);
  const singleClickHasAction = singleClickAction !== 'none';
  const interactionHint = multiSelectMode
    ? '多选模式：左键选择或取消选择，右键对已选项目执行批量操作'
    : getItemInteractionHint(item, behavior.launchMode, display.sortMode === 'custom');
  const iconTarget = useMemo(() => {
    const target = getIconResolveTarget(item);
    const rawIcon = target.value;
    if (!rawIcon) return { rawIcon: '', command: 'get_file_icon' as IconResolveCommand };
    const command = resolveCommand(rawIcon, target.fromItemPath, itemIconMode);
    return { rawIcon, command };
  }, [item.icon, item.path, item.type, itemIconMode]);
  const [resolvedIcon, setResolvedIcon] = useState<string | undefined>(undefined);

  useEffect(() => {
    const element = cardRef.current;
    if (!element || typeof IntersectionObserver === 'undefined') {
      setIconVisible(true);
      return;
    }
    const root = element.closest('.content-area');
    try {
      const observer = new IntersectionObserver((records) => {
        if (records.some((record) => record.isIntersecting)) {
          setIconVisible(true);
          observer.disconnect();
        }
      }, { root, rootMargin: '320px 0px' });
      observer.observe(element);
      return () => observer.disconnect();
    } catch {
      setIconVisible(true);
    }
  }, [item.id]);

  useEffect(() => {
    const { rawIcon, command } = iconTarget;
    if (!rawIcon) {
      setResolvedIcon(undefined);
      return;
    }
    if (!iconVisible) {
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
  }, [iconTarget, iconVisible]);

  const stationDropProps = transferStation?.dragToShortcutFolders === false ? {} : transferStationFolderDropProps(item);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    '--label-lines': effectiveLines,
    '--label-chars': display.charsPerLine,
    '--label-font-size': display.fontSize
  } as CSSProperties;

  useEffect(() => {
    primeSystemDoubleClickTime();
  }, []);

  async function launch(asAdmin = false) {
    const now = Date.now();
    if (launchLockRef.current.pending || now - launchLockRef.current.lastAt < LAUNCH_DEBOUNCE_MS) return;
    launchLockRef.current = { pending: true, lastAt: now };
    try {
      await launchShortcutItem(item, asAdmin);
    } catch (error) {
      console.error(error);
      void uiAlert(`启动失败：${String(error)}`);
    } finally {
      launchLockRef.current.pending = false;
    }
  }

  async function executeClickAction(action: ResolvedItemClickAction) {
    if (action === 'none') return;
    if (action === 'open') {
      await launch(false);
      return;
    }
    const payload = getItemCopyPayload(item, action);
    if (!payload || !payload.text) {
      showLauncherNotice('当前项目没有可复制的内容');
      return;
    }
    try {
      await writeTextToClipboard(payload.text);
      showLauncherNotice(`已复制${payload.label}：${item.name}`);
    } catch (error) {
      console.error('copy item click action failed', error);
      void uiAlert(`复制失败：${String(error)}`);
    }
  }

  function cancelPendingSingleAction() {
    pendingSingleActionGenerationRef.current += 1;
    if (pendingSingleActionTimerRef.current !== null) {
      window.clearTimeout(pendingSingleActionTimerRef.current);
      pendingSingleActionTimerRef.current = null;
    }
  }

  function scheduleSingleAction(action: ResolvedItemClickAction) {
    cancelPendingSingleAction();
    const generation = pendingSingleActionGenerationRef.current;
    void getSystemDoubleClickTimeMs().then((systemDelay) => {
      if (generation !== pendingSingleActionGenerationRef.current) return;
      const delay = Math.max(220, Math.min(1050, systemDelay + 28));
      pendingSingleActionTimerRef.current = window.setTimeout(() => {
        pendingSingleActionTimerRef.current = null;
        if (generation !== pendingSingleActionGenerationRef.current) return;
        void executeClickAction(action);
      }, delay);
    });
  }

  function getSingleClickTolerance() {
    return Math.max(2, Math.min(28, Math.round(behavior.itemDragTolerance ?? 10)));
  }

  function wasPointerDrag(start: { x: number; y: number } | null, event: { clientX: number; clientY: number }) {
    if (!start) return true;
    const threshold = singleClickHasAction ? getSingleClickTolerance() : 6;
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
    untrackPointerResetRef.current?.();
    untrackPointerResetRef.current = null;
    clearSingleClickDragTimer();
    pointerStillDownRef.current = false;
    pointerDownRef.current = null;
    pointerMovedBeyondClickRef.current = false;
    singleClickSortableStartedRef.current = false;
  }

  useEffect(() => () => {
    untrackPointerResetRef.current?.();
    untrackPointerResetRef.current = null;
    clearSingleClickDragTimer();
    cancelPendingSingleAction();
  }, []);

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    // 多选模式只负责切换选中状态，不触发项目原本的单击/双击动作。
    event.stopPropagation();
    if (multiSelectMode) return;
    // 普通左键同时清掉旧选择，避免残留蓝色状态造成歧义。
    if (!(event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)) clearSelection();
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (multiSelectMode) {
      cancelPendingSingleAction();
      resetPressState();
      if (event.button === 0) {
        // 多选不需要等待 pointerup / 双击判定：按下一次就立即切换选中状态。
        event.preventDefault();
        event.stopPropagation();
        selectItem(item.id, true);
      }
      return;
    }
    pointerDownRef.current = { x: event.clientX, y: event.clientY, button: event.button, pointerId: event.pointerId };
    pointerStillDownRef.current = true;
    untrackPointerResetRef.current?.();
    untrackPointerResetRef.current = trackActivePointerReset(() => resetPressState());
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
    if (!start || start.pointerId !== event.pointerId) return;
    const modified = event.ctrlKey || event.metaKey || event.shiftKey || event.altKey;
    const dragged = sortableAlreadyStarted || pointerMovedBeyondClickRef.current || wasPointerDrag(start, event) || isDragging;
    if (multiSelectMode) {
      cancelPendingSingleAction();
      if (event.button === 0 && !dragged) {
        event.stopPropagation();
        selectItem(item.id, true);
      }
      return;
    }
    if (event.button !== 0 || modified || dragged || singleClickAction === 'none') return;
    event.stopPropagation();

    // 当单击和双击都配置了动作时，等待 Windows 当前的双击时间。
    // 这样双击不会先执行一次单击复制，再覆盖成双击复制。
    if (doubleClickAction !== 'none') {
      scheduleSingleAction(singleClickAction);
      return;
    }

    cancelPendingSingleAction();
    // 让 dnd-kit 的 document pointerup 先完成清理，再执行复制/打开动作。
    window.setTimeout(() => void executeClickAction(singleClickAction), 60);
  }

  function handlePointerCancel(event: PointerEvent<HTMLDivElement>) {
    resetPressState(event.pointerId);
  }

  function handleDoubleClick(event: MouseEvent<HTMLDivElement>) {
    cancelPendingSingleAction();
    event.preventDefault();
    event.stopPropagation();
    if (multiSelectMode) return;
    const modified = event.ctrlKey || event.metaKey || event.shiftKey || event.altKey;
    if (event.button !== 0 || modified || isDragging || doubleClickAction === 'none') return;
    void executeClickAction(doubleClickAction);
  }

  function handleContext(event: MouseEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (multiSelectMode) {
      if (!selected) selectItem(item.id, true);
    } else if (event.ctrlKey || event.metaKey) {
      selectItem(item.id, true);
    } else {
      selectItem(item.id, false);
    }
    onContextMenu(item.id, event.clientX, event.clientY);
  }

  return (
    <div
      ref={setCardNodeRef}
      style={style}
      className={`item-card ${selected ? 'selected' : ''} ${isDragging ? 'dragging' : ''} ${item.pinned ? 'pinned' : ''} ${multiSelectMode ? 'multi-select-item' : ''} ${display.showFullItemName ? 'full-item-name' : ''}`}
      title={[buildItemTooltip(item, itemTooltipMode), interactionHint].filter(Boolean).join('\n')}
      data-item-id={item.id}
      aria-selected={selected}
      aria-label={`${item.name}，${interactionHint}`}
      data-launch-mode={behavior.launchMode}
      {...attributes}
      {...listeners}
      {...stationDropProps}
      onClick={handleClick}
      onPointerDown={(event) => {
        handlePointerDown(event);
        if (event.button !== 0 || multiSelectMode) return;

        if (!singleClickHasAction) {
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
      {item.pinned && <span className="item-pin-badge" title="固定项目"><Pin size={11} fill="currentColor" /></span>}
      {showLaunchCountBadge && (item.launchCount ?? 0) > 0 && (
        <span className="item-launch-count-badge" title={`已启动 ${item.launchCount} 次`}>{item.launchCount}</span>
      )}
      <div className="item-edit-name">
        <div className="item-icon">
          {resolvedIcon ? <img src={resolvedIcon} alt="" draggable={false} loading="lazy" decoding="async" /> : <FallbackIcon type={item.type} size={fallbackIconSize} />}
        </div>
        <div className="item-label">{item.name}</div>
      </div>
    </div>
  );
}

function areItemCardPropsEqual(previous: ItemCardProps, next: ItemCardProps) {
  return previous.item === next.item
    && previous.selected === next.selected
    && previous.onContextMenu === next.onContextMenu
    && previous.transferStation.dragToShortcutFolders === next.transferStation.dragToShortcutFolders
    && previous.display.sortMode === next.display.sortMode
    && previous.display.labelLines === next.display.labelLines
    && previous.display.showFullItemName === next.display.showFullItemName
    && previous.display.iconSize === next.display.iconSize
    && previous.display.itemIconResolveMode === next.display.itemIconResolveMode
    && previous.display.charsPerLine === next.display.charsPerLine
    && previous.display.fontSize === next.display.fontSize
    && previous.behavior.launchMode === next.behavior.launchMode
    && previous.behavior.itemDragTolerance === next.behavior.itemDragTolerance
    && previous.behavior.itemDragLongPressMs === next.behavior.itemDragLongPressMs;
}

export const ItemCard = memo(ItemCardComponent, areItemCardPropsEqual);
