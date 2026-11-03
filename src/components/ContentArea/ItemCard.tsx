import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { Folder, Link2, TerminalSquare, FileIcon, Pin, Type } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { BehaviorSettings, DisplaySettings, ImageCardSize, ShortcutItem } from '../../types';
import { useAppStore } from '../../stores/appStore';
import { chooseIconResolveCommand, getCachedIcon, isDirectImageSource, resolveIconDataUrl, type IconResolveCommand } from '../../lib/iconCache';
import { allowImagePreview, clampImageCardSize, resolveImageCardSize, resolveImageCardZoom, stepImageCardZoom } from '../../lib/imageCard';
import { clampTextBoxSize, resolveTextBox, textBoxDisplayName } from '../../lib/textBox';
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
  /** v148: 相邻组合后的实际渲染色（independent 模式下就是 item.color）。 */
  frameColor?: string;
  onContextMenu: (itemId: string, x: number, y: number) => void;
}

const LAUNCH_DEBOUNCE_MS = 500;

/**
 * v188: 图片卡片的八个缩放手柄。
 *
 * 和 HTML 目录卡片是同一套方向约定（n/s/e/w/ne/nw/se/sw），这样两个地方的
 * 拖拽手感完全一致。手柄按下必须 stopPropagation，否则会被卡片自己的
 * pointerdown（排序拖拽 / 单击打开）吃掉。
 */
const IMAGE_HANDLE_DIRS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as const;
type ImageHandleDir = (typeof IMAGE_HANDLE_DIRS)[number];
const IMAGE_HANDLE_CURSOR: Record<ImageHandleDir, string> = {
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  nw: 'nwse-resize',
  se: 'nwse-resize'
};

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
  if (type === 'text') return <Type size={size} />;
  return <FileIcon size={size} />;
}

function ItemCardComponent({ item, selected, display, behavior, transferStation, frameColor, onContextMenu }: ItemCardProps) {
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
  // v188: 图片卡片 —— 有 imageSize 就说明这张卡要显示图片本身，并且可以拖边改大小。
  const imageSize = resolveImageCardSize(item);
  const isImageCard = imageSize !== null;
  // v193: 文本框卡片 —— type 为 text 时正文就是一段文字，同样能拖边改大小、双击改字。
  const textBox = resolveTextBox(item);
  const isTextBox = textBox !== null;
  const updateItem = useAppStore((state) => state.updateItem);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  // 拖拽过程中的临时尺寸（图片和文本框共用，松手才落盘）。
  const [liveCardSize, setLiveCardSize] = useState<ImageCardSize | null>(null);
  const liveCardSizeRef = useRef<ImageCardSize | null>(null);
  const [cardResize, setCardResize] = useState<{
    kind: 'image' | 'text';
    dir: ImageHandleDir;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
  } | null>(null);
  const textBoxRef = useRef(textBox);
  textBoxRef.current = textBox;
  const [textEditing, setTextEditing] = useState(false);
  const textEditorRef = useRef<HTMLDivElement | null>(null);
  const textBeforeEditRef = useRef('');
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
  // 单击启动模式下，pointerdown 先不交给 dnd-kit；等确认是拖拽（指针动过阈值或长按到点）时
  // 再回放按下时的那份事件，dnd-kit 才能拿到有效坐标。
  const singleClickPressEventRef = useRef<PointerEvent<HTMLDivElement> | null>(null);
  const launchLockRef = useRef<{ pending: boolean; lastAt: number }>({ pending: false, lastAt: 0 });
  const itemIconMode = display.itemIconResolveMode ?? 'auto';
  const singleClickAction = resolveItemClickAction(item.singleClickAction, 'single', behavior.launchMode);
  const doubleClickAction = resolveItemClickAction(item.doubleClickAction, 'double', behavior.launchMode);
  const singleClickHasAction = singleClickAction !== 'none';
  const interactionHint = multiSelectMode
    ? '多选模式：左键选择或取消选择，右键对已选项目执行批量操作'
    : isTextBox
      ? '双击直接改字；拖边框或四角可以改大小；右键管理'
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
    if (isImageCard || isTextBox) {
      // 图片卡片显示图片本身、文本框直接显示文字，都不需要再额外取一次系统图标。
      setResolvedIcon(undefined);
      return;
    }
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
  }, [iconTarget, iconVisible, isImageCard, isTextBox]);

  // v188: 图片本体走 asset 协议（convertFileSrc）直接给 <img>，不套 base64，
  // 大图也不会吃内存。读之前必须先把这张图加进协议作用域，否则是空图。
  useEffect(() => {
    if (!isImageCard) {
      setImageSrc(null);
      return;
    }
    const path = safeTrim(item.path);
    if (!path) {
      setImageSrc(null);
      return;
    }
    if (isDirectImageSource(path)) {
      setImageSrc(path);
      return;
    }
    let cancelled = false;
    allowImagePreview(path)
      .then(() => {
        if (!cancelled) setImageSrc(convertFileSrc(path));
      })
      .catch(() => {
        if (!cancelled) setImageSrc(null);
      });
    return () => {
      cancelled = true;
    };
  }, [isImageCard, item.path]);

  // 落盘之后（item.imageSize / item.textBox 变了）就丢掉拖拽过程中的临时尺寸，改用真实值。
  useEffect(() => {
    liveCardSizeRef.current = null;
    setLiveCardSize(null);
  }, [item.imageSize?.width, item.imageSize?.height, item.textBox?.width, item.textBox?.height]);

  // v198: 图片缩放 —— 手势只改框里的图片，卡片的宽高（imageSize）一点不动。
  const savedImageZoom = isImageCard ? resolveImageCardZoom(item) : 1;
  const [liveImageZoom, setLiveImageZoom] = useState<number | null>(null);
  const liveImageZoomRef = useRef<number | null>(null);
  const savedImageZoomRef = useRef(savedImageZoom);
  savedImageZoomRef.current = savedImageZoom;
  const zoomCommitTimerRef = useRef<number | null>(null);
  const zoomHintTimerRef = useRef<number | null>(null);
  const [zoomHintVisible, setZoomHintVisible] = useState(false);

  // 自己落盘的回声不要打断正在进行的连续缩放：值一致就把本地态留着，
  // 只有外部真的改了（右键「还原缩放」之类）才清掉。
  useEffect(() => {
    const live = liveImageZoomRef.current;
    if (live != null && Math.abs(live - savedImageZoom) < 0.001) return;
    liveImageZoomRef.current = null;
    setLiveImageZoom(null);
  }, [savedImageZoom]);

  // 拖拽：监听挂在 window 上，鼠标滑出手柄、甚至滑出卡片都不会丢事件。
  useEffect(() => {
    if (!cardResize) return;
    const resizeKind = cardResize.kind;
    const previousCursor = document.body.style.cursor;
    const previousSelect = document.body.style.userSelect;
    document.body.style.cursor = IMAGE_HANDLE_CURSOR[cardResize.dir];
    document.body.style.userSelect = 'none';

    function handleMove(event: globalThis.PointerEvent) {
      if (!cardResize) return;
      const dx = event.clientX - cardResize.startX;
      const dy = event.clientY - cardResize.startY;
      let width = cardResize.startWidth;
      let height = cardResize.startHeight;
      if (cardResize.dir.includes('e')) width = cardResize.startWidth + dx;
      if (cardResize.dir.includes('w')) width = cardResize.startWidth - dx;
      if (cardResize.dir.includes('s')) height = cardResize.startHeight + dy;
      if (cardResize.dir.includes('n')) height = cardResize.startHeight - dy;
      const next = resizeKind === 'text'
        ? clampTextBoxSize({ width, height })
        : clampImageCardSize({ width, height });
      liveCardSizeRef.current = next;
      setLiveCardSize(next);
    }

    function handleUp() {
      const size = liveCardSizeRef.current;
      const kind = resizeKind;
      setCardResize(null);
      if (!size) return;
      if (kind === 'text') {
        const current = textBoxRef.current;
        if (current) {
          updateItem(item.id, { textBox: { ...current, width: size.width, height: size.height } });
        }
        return;
      }
      updateItem(item.id, { imageSize: size });
    }

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousSelect;
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };
  }, [cardResize, item.id, updateItem]);

  // v198: Ctrl + 滚轮（触控板双指捏合在 Chromium 里也走带 ctrlKey 的 wheel）缩放框里的图片。
  // 必须用原生监听器 + passive:false，React 的 onWheel 是 passive 的，preventDefault 会被忽略。
  useEffect(() => {
    if (!isImageCard) return;
    const element = cardRef.current;
    if (!element) return;

    const commit = (value: number) => {
      updateItem(item.id, { imageZoom: value > 1 ? value : undefined });
    };

    function handleWheel(event: WheelEvent) {
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      event.stopPropagation();
      const base = liveImageZoomRef.current ?? savedImageZoomRef.current;
      const next = stepImageCardZoom(base, event.deltaY);
      if (next === base) return;
      liveImageZoomRef.current = next;
      setLiveImageZoom(next);
      setZoomHintVisible(true);

      // 连续滚动时不要每一下都写配置：停手 220ms 再落盘。
      if (zoomCommitTimerRef.current != null) window.clearTimeout(zoomCommitTimerRef.current);
      zoomCommitTimerRef.current = window.setTimeout(() => {
        zoomCommitTimerRef.current = null;
        commit(next);
      }, 220);
      if (zoomHintTimerRef.current != null) window.clearTimeout(zoomHintTimerRef.current);
      zoomHintTimerRef.current = window.setTimeout(() => setZoomHintVisible(false), 1100);
    }

    element.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      element.removeEventListener('wheel', handleWheel);
      // 卡片被换掉 / 卸载时把还没落盘的那一档写下去，免得最后一下滚轮白滚。
      if (zoomCommitTimerRef.current != null) {
        window.clearTimeout(zoomCommitTimerRef.current);
        zoomCommitTimerRef.current = null;
        const pending = liveImageZoomRef.current;
        if (pending != null) commit(pending);
      }
    };
  }, [isImageCard, item.id, updateItem]);

  const stationDropProps = transferStation?.dragToShortcutFolders === false ? {} : transferStationFolderDropProps(item);

  // v188/v193: 图片卡片和文本框都用自己记住的宽高（拖拽过程中先用临时值，松手才落盘）。
  const effectiveImageSize = isImageCard ? (liveCardSize ?? imageSize) : null;
  const effectiveTextBoxSize = isTextBox ? (liveCardSize ?? textBox) : null;
  const effectiveCardSize = effectiveImageSize ?? effectiveTextBoxSize;
  // v198: 图片本体的缩放（框不动，只放大/缩小框里的那张图）。
  const effectiveImageZoom = isImageCard ? (liveImageZoom ?? savedImageZoom) : 1;

  // 拖左边 / 上边时，卡片在 flex 流里的位置不会动，只靠改变宽高会让「被拖的那条边」
  // 往反方向跑。所以边拖边补一个平移量，让那条边始终黏在光标上；松手时平移归零
  // （卡片回到正常流位置，尺寸已经变大，邻居按 flex 重新排列）。
  const liveOffset = cardResize && liveCardSize
    ? {
      x: cardResize.dir.includes('w') ? cardResize.startWidth - liveCardSize.width : 0,
      y: cardResize.dir.includes('n') ? cardResize.startHeight - liveCardSize.height : 0
    }
    : null;

  const style = {
    transform: CSS.Transform.toString(transform) ?? (liveOffset ? `translate(${liveOffset.x}px, ${liveOffset.y}px)` : undefined),
    transition,
    '--label-lines': effectiveLines,
    '--label-chars': display.charsPerLine,
    // v179: 项目名称字号 = 项目字号 × 全局字号缩放（0.8–1.5）。
    '--label-font-size': Math.round(display.fontSize * (display.fontScale ?? 1) * 100) / 100,
    // v147: 项目自定义颜色通过 CSS 变量注入，由 ItemCard.css 画成彩色框。
    // v148: frameColor 已经是「相邻组合」算完的最终颜色。
    ...(frameColor ? { '--item-accent': frameColor } : {}),
    ...(effectiveCardSize ? { width: `${effectiveCardSize.width}px`, height: `${effectiveCardSize.height}px` } : {})
  } as CSSProperties;

  /** v188/v193: 手柄按下 —— 必须抢在卡片自己的 pointerdown 之前拦下来。 */
  function startCardResize(event: PointerEvent<HTMLSpanElement>, dir: ImageHandleDir) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const base = effectiveCardSize;
    if (!base) return;
    liveCardSizeRef.current = base;
    setCardResize({
      kind: isTextBox ? 'text' : 'image',
      dir,
      startX: event.clientX,
      startY: event.clientY,
      startWidth: base.width,
      startHeight: base.height
    });
  }

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

  /** v193: 进入行内编辑 —— 双击文本框 / 单击「打开」都走这里。 */
  function beginTextEdit() {
    const box = textBoxRef.current;
    if (!box || textEditing) return;
    cancelPendingSingleAction();
    textBeforeEditRef.current = box.text;
    setTextEditing(true);
    window.setTimeout(() => {
      const node = textEditorRef.current;
      if (!node) return;
      try {
        node.focus();
        const range = document.createRange();
        range.selectNodeContents(node);
        range.collapse(false);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      } catch {
        // 某些 WebView 组合下选区 API 会抛，能聚焦就够了。
      }
    }, 0);
  }

  /** 失焦 / Ctrl+Enter：把编辑后的文字落盘。 */
  function commitTextEdit() {
    if (!textEditing) return;
    const node = textEditorRef.current;
    const nextText = (node?.innerText ?? textBeforeEditRef.current).replace(/\u00a0/g, ' ');
    setTextEditing(false);
    const box = textBoxRef.current;
    if (!box || nextText === box.text) return;
    updateItem(item.id, {
      textBox: { ...box, text: nextText.slice(0, 20000) },
      // 名称还是上一段正文（或新建时的「文本框」）时跟着改，用户自己起过名字就不动它。
      ...(item.name === '文本框' || item.name === textBoxDisplayName(box.text)
        ? { name: textBoxDisplayName(nextText) }
        : {})
    });
  }

  function cancelTextEdit() {
    const node = textEditorRef.current;
    if (node) node.textContent = textBeforeEditRef.current;
    setTextEditing(false);
    node?.blur();
  }

  async function executeClickAction(action: ResolvedItemClickAction) {
    if (action === 'none') return;
    if (action === 'open') {
      if (textBoxRef.current) {
        beginTextEdit();
        return;
      }
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
    singleClickPressEventRef.current = null;
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
    singleClickPressEventRef.current = null;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Some WebView / device combinations do not support capture for every pointer.
    }
  }

  /** 把按下时的那份 pointerdown 回放给 dnd-kit：只有它才带得出正确的起始坐标。 */
  function startSingleClickSortableDrag() {
    const pressEvent = singleClickPressEventRef.current;
    if (!pressEvent || singleClickSortableStartedRef.current) return;
    singleClickSortableStartedRef.current = true;
    clearSingleClickDragTimer();
    sortableListeners.onPointerDown?.(pressEvent);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const start = pointerDownRef.current;
    if (!start || start.pointerId !== event.pointerId) return;
    if (!wasPointerDrag(start, event)) return;
    pointerMovedBeyondClickRef.current = true;
    // 单击启动模式下，用户一旦真的把指针拖出点击容差，意图就是排序而不是单击。
    // 这时立刻接入 dnd-kit，否则必须按住不动等满长按时间才拖得动 —— 正常的
    // 「按下即拖」会完全没有反应，看起来就是「项目之间拖不动」。
    if (singleClickHasAction) startSingleClickSortableDrag();
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    const start = pointerDownRef.current;
    const sortableAlreadyStarted = singleClickSortableStartedRef.current;
    clearSingleClickDragTimer();
    pointerStillDownRef.current = false;
    pointerDownRef.current = null;
    singleClickPressEventRef.current = null;
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
    if (event.button !== 0 || modified || isDragging) return;
    // 文本框：双击就是改字，不受单击/双击动作设置影响。
    if (textBoxRef.current) {
      beginTextEdit();
      return;
    }
    if (doubleClickAction === 'none') return;
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
      className={`item-card ${selected ? 'selected' : ''} ${isDragging ? 'dragging' : ''} ${item.pinned ? 'pinned' : ''} ${multiSelectMode ? 'multi-select-item' : ''} ${display.showFullItemName ? 'full-item-name' : ''} ${frameColor ? 'has-custom-color' : ''} ${isImageCard ? 'image-card' : ''} ${cardResize ? 'image-card-resizing' : ''} ${isTextBox ? 'text-card' : ''} ${textEditing ? 'text-card-editing' : ''} ${cardResize?.kind === 'text' ? 'text-card-resizing' : ''}`}
      title={[
        buildItemTooltip(item, itemTooltipMode),
        interactionHint,
        isImageCard ? '拖拽卡片边框或四角可以调整卡片大小；Ctrl + 滚轮（或双指捏合）只缩放框里的图片，框不动' : ''
      ].filter(Boolean).join('\n')}
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

        // 单击启动模式：先不把 pointerdown 交给 dnd-kit，免得一次普通单击被当成排序。
        // 之后有两条通道进入拖拽：指针拖出点击容差（handlePointerMove），
        // 或者按住达到设置的长按时间（下面这个定时器）。
        const expectedPointerId = event.pointerId;
        singleClickPressEventRef.current = event;
        clearSingleClickDragTimer();
        singleClickDragTimerRef.current = window.setTimeout(() => {
          const start = pointerDownRef.current;
          if (!pointerStillDownRef.current || !start || start.pointerId !== expectedPointerId || start.button !== 0) return;
          startSingleClickSortableDrag();
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
      {isImageCard && zoomHintVisible && (
        <span className="image-card-zoom-badge" aria-hidden>{Math.round(effectiveImageZoom * 100)}%</span>
      )}
      {isTextBox && textBox ? (
        <div
          ref={textEditorRef}
          className="text-card-body"
          style={{ fontSize: textBox.fontSize ?? 15, textAlign: textBox.align ?? 'left' }}
          contentEditable={textEditing}
          suppressContentEditableWarning
          spellCheck={false}
          onPointerDown={(event) => { if (textEditing) event.stopPropagation(); }}
          onClick={(event) => { if (textEditing) event.stopPropagation(); }}
          onBlur={commitTextEdit}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              cancelTextEdit();
              return;
            }
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              event.stopPropagation();
              commitTextEdit();
            }
          }}
        >
          {textBox.text}
        </div>
      ) : (
        <div className="item-edit-name">
          {isImageCard ? (
            <div className="item-icon item-image-box">
              {imageSrc
                ? (
                  <img
                    className={`item-image-photo ${effectiveImageZoom !== 1 ? 'image-card-zoomed' : ''}`}
                    src={imageSrc}
                    alt=""
                    draggable={false}
                    loading="lazy"
                    decoding="async"
                    style={{
                      objectFit: item.imageFit === 'contain' ? 'contain' : 'cover',
                      ...(effectiveImageZoom !== 1 ? { transform: `scale(${effectiveImageZoom})` } : {})
                    }}
                    onError={() => setImageSrc(null)}
                  />
                )
                : <FallbackIcon type={item.type} size={fallbackIconSize} />}
            </div>
          ) : (
            <div className="item-icon">
              {resolvedIcon ? <img src={resolvedIcon} alt="" draggable={false} loading="lazy" decoding="async" /> : <FallbackIcon type={item.type} size={fallbackIconSize} />}
            </div>
          )}
          <div className="item-label">{item.name}</div>
        </div>
      )}
      {(isImageCard || isTextBox) && IMAGE_HANDLE_DIRS.map((dir) => (
        <span
          key={dir}
          className={`image-card-handle image-drag-${dir}`}
          aria-hidden
          onPointerDown={(event) => startCardResize(event, dir)}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        />
      ))}
    </div>
  );
}

function areItemCardPropsEqual(previous: ItemCardProps, next: ItemCardProps) {
  return previous.item === next.item
    && previous.selected === next.selected
    && previous.frameColor === next.frameColor
    && previous.onContextMenu === next.onContextMenu
    && previous.transferStation.dragToShortcutFolders === next.transferStation.dragToShortcutFolders
    && previous.display.sortMode === next.display.sortMode
    && previous.display.labelLines === next.display.labelLines
    && previous.display.showFullItemName === next.display.showFullItemName
    && previous.display.iconSize === next.display.iconSize
    && previous.display.itemIconResolveMode === next.display.itemIconResolveMode
    && previous.display.charsPerLine === next.display.charsPerLine
    && previous.display.fontSize === next.display.fontSize
    && (previous.display.fontScale ?? 1) === (next.display.fontScale ?? 1)
    && previous.behavior.launchMode === next.behavior.launchMode
    && previous.behavior.itemDragTolerance === next.behavior.itemDragTolerance
    && previous.behavior.itemDragLongPressMs === next.behavior.itemDragLongPressMs;
}

export const ItemCard = memo(ItemCardComponent, areItemCardPropsEqual);
