import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent, type ReactNode, type RefObject } from 'react';
import { DndContext, DragEndEvent, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, horizontalListSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Archive, ArrowDownAZ, Files, Images, Minus, Pin, PinOff, Plus, RotateCcw, Search, Settings, SlidersHorizontal, UsersRound, X } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../../stores/appStore';
import { DEFAULT_WINDOW_CONTROL_ORDER } from '../../stores/appStore/defaults';
import { byOrder } from '../../lib/sort';
import type { Group, WindowControlId } from '../../types';
import { QuickSettingsMenu } from './QuickSettingsMenu';
import { ConfigProfilesMenu } from './ConfigProfilesMenu';
import { MultiAccountDialog } from './MultiAccountDialog';
import { usePresenceTransition } from '../../hooks/usePresenceTransition';

function normalizeControlOrder(order?: WindowControlId[]): WindowControlId[] {
  const next: WindowControlId[] = [];
  for (const id of order ?? []) {
    if (DEFAULT_WINDOW_CONTROL_ORDER.includes(id) && !next.includes(id)) next.push(id);
  }
  for (const id of DEFAULT_WINDOW_CONTROL_ORDER) {
    if (next.includes(id)) continue;
    const defaultIndex = DEFAULT_WINDOW_CONTROL_ORDER.indexOf(id);
    const previous = DEFAULT_WINDOW_CONTROL_ORDER.slice(0, defaultIndex).reverse().find((candidate) => next.includes(candidate));
    if (previous) next.splice(next.indexOf(previous) + 1, 0, id);
    else next.push(id);
  }
  return next;
}

function EditableGroupTab({
  group,
  onContextMenu,
  isExternalDropTarget,
}: {
  group: Group;
  onContextMenu: (groupId: string, x: number, y: number) => void;
  isExternalDropTarget: boolean;
}) {
  const activeGroupId = useAppStore((state) => state.activeGroupId);
  const setActiveGroup = useAppStore((state) => state.setActiveGroup);
  const renameGroup = useAppStore((state) => state.renameGroup);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(group.name);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: group.id });
  const sortableListeners = listeners as Record<string, ((event: PointerEvent<HTMLDivElement>) => void) | undefined>;

  useEffect(() => setValue(group.name), [group.name]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    ...(group.color ? { '--group-accent': group.color } : {}),
  } as CSSProperties;

  function save() {
    const next = value.trim();
    if (next) renameGroup(group.id, next);
    setEditing(false);
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`top-tab ${activeGroupId === group.id ? 'active' : ''} ${isDragging ? 'dragging' : ''} ${group.color ? 'has-custom-color' : ''} ${isExternalDropTarget ? 'external-drop-target' : ''}`}
      data-group-id={group.id}
      onClick={() => !editing && setActiveGroup(group.id)}
      onDoubleClick={() => setEditing(true)}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setActiveGroup(group.id);
        onContextMenu(group.id, event.clientX, event.clientY);
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
        sortableListeners.onPointerDown?.(event);
      }}
      data-no-drag
      {...attributes}
    >
      {editing ? (
        <input
          className="top-tab-input"
          value={value}
          autoFocus
          onPointerDown={(event) => event.stopPropagation()}
          onChange={(event) => setValue(event.target.value)}
          onBlur={save}
          onKeyDown={(event) => {
            if (event.key === 'Enter') save();
            if (event.key === 'Escape') setEditing(false);
          }}
        />
      ) : (
        <span title={group.name}>{group.name}</span>
      )}
    </div>
  );
}

interface SortableWindowActionProps {
  id: WindowControlId;
  title: string;
  icon: ReactNode;
  className?: string;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  buttonRef?: (node: HTMLButtonElement | null) => void;
  ariaExpanded?: boolean;
  ariaHaspopup?: 'menu';
  ariaControls?: string;
}

interface ClusterSegmentRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface TabCluster {
  id: string;
  color: string;
  groupIds: string[];
}

interface ClusterDragRuntime {
  startX: number;
  startY: number;
  clientX: number;
  clientY: number;
  zoom: number;
  activated: boolean;
  frame: number;
  offsetX: number;
  offsetY: number;
  target: { id: string; before: boolean } | null;
  members: HTMLElement[];
  handle: HTMLDivElement;
  root: HTMLDivElement;
  indicator: HTMLDivElement | null;
  onMove: (event: globalThis.PointerEvent) => void;
  onUp: (event: globalThis.PointerEvent) => void;
  onCancel: (event: globalThis.PointerEvent) => void;
  onKey: (event: KeyboardEvent) => void;
  finish: (commit: boolean) => void;
}

// 成组框外扩的留白（px）。默认标签间距 8px，框外扩 4 + 把手外探 4 正好不侵入相邻标签
const CLUSTER_FRAME_PAD = 4;
// 指针移动超过该距离才真正开始拖动，避免误触
const CLUSTER_DRAG_THRESHOLD = 6;

// v138: 同色相邻父目录的「成组框」。框是覆盖在标签外圈的描边（中间镂空，不挡标签点击），
// 抓住边框拖动即可把整组同色标签作为一个块移动到别的位置。
function TopBarTabClusterOverlay({
  cluster,
  segments,
  suppressed,
  insertIndicatorRef,
  onClusterDrop,
  onClusterDragChange,
}: {
  cluster: TabCluster;
  segments: ClusterSegmentRect[];
  suppressed: boolean;
  insertIndicatorRef: RefObject<HTMLDivElement | null>;
  onClusterDrop: (cluster: TabCluster, overGroupId: string | null, before: boolean) => void;
  onClusterDragChange: (clusterId: string | null) => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<ClusterDragRuntime | null>(null);

  // 卸载兜底：清掉内联 transform 和全局监听，避免残留
  useEffect(() => () => dragRef.current?.finish(false), []);

  function beginTracking(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || dragRef.current) return;
    const rootCandidate = rootRef.current;
    if (!rootCandidate) return;
    const rootNode = rootCandidate;
    const tabsContainer = rootNode.parentElement;
    if (!tabsContainer) return;
    event.stopPropagation();
    event.preventDefault();
    const handle = event.currentTarget;
    const memberIds = new Set(cluster.groupIds);
    const members = Array.from(tabsContainer.querySelectorAll<HTMLElement>('.top-tab[data-group-id]'))
      .filter((tab) => memberIds.has(tab.dataset.groupId ?? ''));
    const indicator = insertIndicatorRef.current;
    // .app-main-layer 上的 UI 缩放（zoom）会让视觉像素和布局像素差一个系数，位移要除回去
    const zoom = rootNode.offsetWidth ? rootNode.getBoundingClientRect().width / rootNode.offsetWidth : 1;

    function activate() {
      state.activated = true;
      setDragging(true);
      onClusterDragChange(cluster.id);
      for (const member of members) {
        member.classList.add('cluster-drag-member');
        member.style.willChange = 'transform';
      }
      if (indicator) {
        indicator.style.setProperty('--cluster-indicator-color', cluster.color);
        indicator.classList.add('visible');
      }
    }

    function updateIndicator() {
      if (!indicator) return;
      const stack = document.elementsFromPoint(state.clientX, state.clientY);
      let targetTab: HTMLElement | null = null;
      for (const element of stack) {
        const tab = element.closest?.('.top-tab') as HTMLElement | null;
        const id = tab?.dataset.groupId;
        if (id && !memberIds.has(id)) {
          targetTab = tab;
          break;
        }
      }
      if (!targetTab) {
        state.target = null;
        indicator.classList.remove('visible');
        return;
      }
      const rect = targetTab.getBoundingClientRect();
      const before = state.clientX < rect.left + rect.width / 2;
      state.target = { id: targetTab.dataset.groupId as string, before };
      const gap = 5;
      indicator.style.left = `${(before ? targetTab.offsetLeft - gap : targetTab.offsetLeft + targetTab.offsetWidth + gap) - 1}px`;
      indicator.style.top = `${targetTab.offsetTop - 2}px`;
      indicator.style.height = `${targetTab.offsetHeight + 4}px`;
      indicator.classList.add('visible');
    }

    function applyFrame() {
      state.frame = 0;
      const dx = state.offsetX;
      const dy = state.offsetY;
      rootNode.style.transform = `translate(${dx}px, ${dy}px)`;
      for (const member of state.members) member.style.transform = `translate(${dx}px, ${dy}px)`;
      updateIndicator();
    }

    function finish(commit: boolean) {
      if (dragRef.current !== state) return;
      dragRef.current = null;
      if (state.frame) window.cancelAnimationFrame(state.frame);
      handle.removeEventListener('pointermove', state.onMove);
      handle.removeEventListener('pointerup', state.onUp);
      handle.removeEventListener('pointercancel', state.onCancel);
      window.removeEventListener('keydown', state.onKey, true);
      // 先移除 class（恢复 transition）再清 transform，让标签平滑落回新位置
      for (const member of state.members) {
        member.classList.remove('cluster-drag-member');
        member.style.willChange = '';
        member.style.transform = '';
      }
      rootNode.style.transform = '';
      indicator?.classList.remove('visible');
      setDragging(false);
      onClusterDragChange(null);
      if (commit && state.activated && state.target) onClusterDrop(cluster, state.target.id, state.target.before);
    }

    function onMove(nativeEvent: globalThis.PointerEvent) {
      if (!state.activated && Math.hypot(nativeEvent.clientX - state.startX, nativeEvent.clientY - state.startY) < CLUSTER_DRAG_THRESHOLD) return;
      if (!state.activated) activate();
      state.clientX = nativeEvent.clientX;
      state.clientY = nativeEvent.clientY;
      state.offsetX = (nativeEvent.clientX - state.startX) / state.zoom;
      state.offsetY = (nativeEvent.clientY - state.startY) / state.zoom;
      if (!state.frame) state.frame = window.requestAnimationFrame(applyFrame);
    }

    const state: ClusterDragRuntime = {
      startX: event.clientX,
      startY: event.clientY,
      clientX: event.clientX,
      clientY: event.clientY,
      zoom,
      activated: false,
      frame: 0,
      offsetX: 0,
      offsetY: 0,
      target: null,
      members,
      handle,
      root: rootNode,
      indicator,
      onMove,
      onUp: () => finish(true),
      onCancel: () => finish(false),
      onKey: (nativeEvent) => {
        if (nativeEvent.key === 'Escape') finish(false);
      },
      finish,
    };
    dragRef.current = state;

    handle.setPointerCapture(event.pointerId);
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', state.onUp);
    handle.addEventListener('pointercancel', state.onCancel);
    window.addEventListener('keydown', state.onKey, true);
  }

  if (!segments.length) return null;

  return (
    <div
      ref={rootRef}
      className={`topbar-tab-cluster ${suppressed ? 'suppressed' : ''} ${dragging ? 'dragging' : ''}`}
      aria-hidden="true"
    >
      {segments.map((segment) => (
        <div
          key={`${segment.top}-${segment.left}`}
          className="topbar-tab-cluster-segment"
          style={{
            left: segment.left - CLUSTER_FRAME_PAD,
            top: segment.top - CLUSTER_FRAME_PAD,
            width: segment.width + CLUSTER_FRAME_PAD * 2,
            height: segment.height + CLUSTER_FRAME_PAD * 2,
            '--cluster-accent': cluster.color,
          } as CSSProperties}
        >
          <div className="topbar-tab-cluster-handle edge-n" title="拖动整组移动这些同色父目录" onPointerDown={beginTracking} />
          <div className="topbar-tab-cluster-handle edge-s" title="拖动整组移动这些同色父目录" onPointerDown={beginTracking} />
          <div className="topbar-tab-cluster-handle edge-w" title="拖动整组移动这些同色父目录" onPointerDown={beginTracking} />
          <div className="topbar-tab-cluster-handle edge-e" title="拖动整组移动这些同色父目录" onPointerDown={beginTracking} />
        </div>
      ))}
    </div>
  );
}

function SortableWindowAction({ id, title, icon, className = '', onClick, buttonRef, ariaExpanded, ariaHaspopup, ariaControls }: SortableWindowActionProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  } as CSSProperties;
  const sortableListeners = listeners as Record<string, ((event: PointerEvent<HTMLButtonElement>) => void) | undefined>;

  return (
    <button
      ref={(node) => { setNodeRef(node); buttonRef?.(node); }}
      style={style}
      className={`icon-button window-control-button draggable-window-control ${className} ${isDragging ? 'dragging' : ''}`}
      data-no-drag
      data-window-control-id={id}
      title={`${title}（拖动可调整位置）`}
      aria-expanded={ariaExpanded}
      aria-haspopup={ariaHaspopup}
      aria-controls={ariaControls}
      onPointerDown={(event) => {
        event.stopPropagation();
        sortableListeners.onPointerDown?.(event);
      }}
      onClick={(event) => {
        event.stopPropagation();
        onClick(event);
      }}
      {...attributes}
    >
      {icon}
    </button>
  );
}

export function TopBar({
  onContextMenuGroup,
  onOpenGlobalSearch,
  onOpenTransferStation,
  onOpenImageBrowser,
  externalDropTargetGroupId,
}: {
  onContextMenuGroup: (groupId: string, x: number, y: number) => void;
  onOpenGlobalSearch: () => void;
  onOpenTransferStation: () => void;
  onOpenImageBrowser: () => void;
  externalDropTargetGroupId?: string | null;
}) {
  const rawGroups = useAppStore((state) => state.groups);
  const groups = useMemo(() => rawGroups.slice().sort(byOrder), [rawGroups]);
  const activeGroupId = useAppStore((state) => state.activeGroupId);
  const display = useAppStore((state) => state.display);
  const behavior = useAppStore((state) => state.behavior);
  const experience = useAppStore((state) => state.experience);
  const reorderGroups = useAppStore((state) => state.reorderGroups);
  const addGroup = useAppStore((state) => state.addGroup);
  const updateDisplay = useAppStore((state) => state.updateDisplay);
  const updateBehavior = useAppStore((state) => state.updateBehavior);
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen);
  const tabSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 14 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const actionSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const ids = useMemo(() => groups.map((group) => group.id), [groups]);
  // v138: 找出「颜色相同且在顺序上相邻」的父目录，数量 ≥2 时画一个更鲜艳的成组框
  const tabClusters = useMemo<TabCluster[]>(() => {
    const result: TabCluster[] = [];
    let index = 0;
    while (index < groups.length) {
      const color = groups[index].color?.toLowerCase();
      if (!color) {
        index += 1;
        continue;
      }
      let end = index + 1;
      while (end < groups.length && groups[end].color?.toLowerCase() === color) end += 1;
      if (end - index >= 2) {
        result.push({ id: `cluster-${groups[index].id}`, color: groups[index].color as string, groupIds: groups.slice(index, end).map((group) => group.id) });
      }
      index = end;
    }
    return result;
  }, [groups]);
  const [clusterSegments, setClusterSegments] = useState<Record<string, ClusterSegmentRect[]>>({});
  const [draggingClusterId, setDraggingClusterId] = useState<string | null>(null);
  const [tabSortableDragging, setTabSortableDragging] = useState(false);
  const insertIndicatorRef = useRef<HTMLDivElement | null>(null);
  const actionOrder = useMemo(() => normalizeControlOrder(display.windowControlOrder), [display.windowControlOrder]);
  const hiddenControlIds = useMemo(() => new Set(display.windowControlHidden ?? []), [display.windowControlHidden]);
  const visibleActionOrder = useMemo(() => actionOrder.filter((id) => !hiddenControlIds.has(id)), [actionOrder, hiddenControlIds]);
  const tabsRef = useRef<HTMLDivElement | null>(null);
  const topbarRef = useRef<HTMLElement | null>(null);
  const quickSettingsButtonRef = useRef<HTMLButtonElement | null>(null);
  const quickSettingsMenuRef = useRef<HTMLDivElement | null>(null);
  const configProfilesButtonRef = useRef<HTMLButtonElement | null>(null);
  const configProfilesMenuRef = useRef<HTMLDivElement | null>(null);
  const multiAccountButtonRef = useRef<HTMLButtonElement | null>(null);
  const multiAccountPanelRef = useRef<HTMLFormElement | null>(null);
  const [visibleRows, setVisibleRows] = useState(1);
  const [overflowRows, setOverflowRows] = useState(false);
  const [quickSettingsOpen, setQuickSettingsOpen] = useState(false);
  const [configProfilesOpen, setConfigProfilesOpen] = useState(false);
  const [multiAccountOpen, setMultiAccountOpen] = useState(false);
  const quickSettingsPresence = usePresenceTransition(quickSettingsOpen, experience.reduceMotion ? 0 : 170);
  const configProfilesPresence = usePresenceTransition(configProfilesOpen, experience.reduceMotion ? 0 : 170);
  const multiAccountPresence = usePresenceTransition(multiAccountOpen, experience.reduceMotion ? 0 : 220);

  useLayoutEffect(() => {
    const node = tabsRef.current;
    if (!node) return;
    const currentNode = node;

    function measureRows() {
      const tabs = Array.from(currentNode.querySelectorAll<HTMLElement>('.top-tab'));
      if (!tabs.length) {
        setVisibleRows(1);
        setOverflowRows(false);
        return;
      }
      const rows = new Set(tabs.map((tab) => Math.round(tab.offsetTop)));
      const totalRows = Math.max(1, rows.size);
      setVisibleRows(totalRows);
      setOverflowRows(false);
    }

    measureRows();
    const observer = new ResizeObserver(measureRows);
    observer.observe(currentNode);
    currentNode.querySelectorAll('.top-tab').forEach((tab) => observer.observe(tab));
    const id = window.setTimeout(measureRows, 0);
    return () => {
      window.clearTimeout(id);
      observer.disconnect();
    };
  }, [groups.length, display.topTabEqualWidth, display.topTabWidth, display.topTabShape]);

  // v138: 量出每个成组框覆盖的标签区域。换行时按行拆成多段矩形，框会分段描边但仍算同一组。
  useLayoutEffect(() => {
    const node = tabsRef.current;
    if (!node) return;
    const currentNode = node;

    function measure() {
      if (!tabClusters.length) {
        setClusterSegments((current) => (Object.keys(current).length ? {} : current));
        return;
      }
      const tabById = new Map<string, HTMLElement>();
      currentNode.querySelectorAll<HTMLElement>('.top-tab[data-group-id]').forEach((tab) => {
        const id = tab.dataset.groupId;
        if (id) tabById.set(id, tab);
      });
      const next: Record<string, ClusterSegmentRect[]> = {};
      for (const cluster of tabClusters) {
        const rows = new Map<number, ClusterSegmentRect>();
        for (const groupId of cluster.groupIds) {
          const tab = tabById.get(groupId);
          if (!tab) continue;
          const row = rows.get(tab.offsetTop);
          if (!row) {
            rows.set(tab.offsetTop, { left: tab.offsetLeft, top: tab.offsetTop, width: tab.offsetWidth, height: tab.offsetHeight });
          } else {
            const right = Math.max(row.left + row.width, tab.offsetLeft + tab.offsetWidth);
            row.left = Math.min(row.left, tab.offsetLeft);
            row.width = right - row.left;
            row.height = Math.max(row.height, tab.offsetHeight);
          }
        }
        next[cluster.id] = Array.from(rows.values()).sort((a, b) => a.top - b.top);
      }
      setClusterSegments((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next));
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(currentNode);
    currentNode.querySelectorAll('.top-tab').forEach((tab) => observer.observe(tab));
    return () => observer.disconnect();
  }, [tabClusters, groups.length, display.topTabEqualWidth, display.topTabWidth, display.topTabHeight, display.topTabGap, display.topTabFontSize, display.topTabShape]);


  // 三个下拉面板统一锚定到「触发它的那个按钮」的右下角：
  // 面板右上角 = 按钮右下角（间隙 6px），因此会盖住按钮组下面几行。
  // 位置算好后写进 CSS 变量，CSS 里的 left/top 只作为没量到时的兜底值。
  // 宽度必须用 offsetWidth 量：进场动画带 scale，getBoundingClientRect 会量偏小。
  useLayoutEffect(() => {
    const bar = topbarRef.current;
    if (!bar) return;
    // 面板真正的挂载由 usePresenceTransition 的 rendered 决定，它比 open 晚一帧，
    // 所以依赖里必须带上 rendered，否则面板挂载的那次提交不会再触发这里。
    const anchors = [
      { open: multiAccountOpen, rendered: multiAccountPresence.rendered, button: multiAccountButtonRef.current, panel: multiAccountPanelRef.current },
      { open: configProfilesOpen, rendered: configProfilesPresence.rendered, button: configProfilesButtonRef.current, panel: configProfilesMenuRef.current },
      { open: quickSettingsOpen, rendered: quickSettingsPresence.rendered, button: quickSettingsButtonRef.current, panel: quickSettingsMenuRef.current },
    ];
    const active =
      anchors.find((item) => item.open && item.button && item.panel) ??
      anchors.find((item) => item.rendered && item.button && item.panel);
    if (!active) return;
    const button = active.button;
    const panel = active.panel;
    if (!button || !panel) return;

    function place() {
      if (!bar || !button || !panel) return;
      const topbarRect = bar.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
      const panelWidth = panel.offsetWidth;
      if (!panelWidth) return;
      // .app-main-layer 带 zoom（UI 缩放），getBoundingClientRect 给的是视口 CSS 像素，
      // 而 offsetWidth / CSS 的 left 用的是子树的布局像素，差一个 zoom 系数，必须换算，
      // 否则 UI 缩放不是 1 时面板会整体偏移（zoom 越小偏得越多）。
      const zoom = bar.clientWidth ? topbarRect.width / bar.clientWidth : 1;
      const buttonRight = (buttonRect.right - topbarRect.left) / zoom;
      const buttonBottom = (buttonRect.bottom - topbarRect.top) / zoom;
      const topbarWidth = topbarRect.width / zoom;
      const edge = 8;
      const gap = 6;
      const rawLeft = buttonRight - panelWidth;
      const maxLeft = Math.max(edge, topbarWidth - panelWidth - edge);
      const left = Math.max(edge, Math.min(rawLeft, maxLeft));
      const top = Math.max(0, buttonBottom + gap);
      const height = Math.max(260, Math.min(720, (window.innerHeight - topbarRect.top) / zoom - top - 10));
      bar.style.setProperty('--topbar-panel-left', `${Math.round(left)}px`);
      bar.style.setProperty('--topbar-panel-top', `${Math.round(top)}px`);
      bar.style.setProperty('--topbar-panel-height', `${Math.round(height)}px`);
    }

    place();
    const frame = window.requestAnimationFrame(place);
    window.addEventListener('resize', place);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', place);
      bar.style.removeProperty('--topbar-panel-left');
      bar.style.removeProperty('--topbar-panel-top');
      bar.style.removeProperty('--topbar-panel-height');
    };
  }, [
    quickSettingsOpen,
    configProfilesOpen,
    multiAccountOpen,
    quickSettingsPresence.rendered,
    configProfilesPresence.rendered,
    multiAccountPresence.rendered,
    visibleActionOrder,
  ]);

  useLayoutEffect(() => {
    if (!quickSettingsOpen) return;
    const frame = window.requestAnimationFrame(() => {
      quickSettingsMenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [quickSettingsOpen]);

  useLayoutEffect(() => {
    if (!configProfilesOpen) return;
    const frame = window.requestAnimationFrame(() => {
      configProfilesMenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [configProfilesOpen]);

  function closeQuickSettings(restoreFocus = false) {
    setQuickSettingsOpen(false);
    if (restoreFocus) window.setTimeout(() => quickSettingsButtonRef.current?.focus(), 0);
  }

  function closeConfigProfiles(restoreFocus = false) {
    setConfigProfilesOpen(false);
    if (restoreFocus) window.setTimeout(() => configProfilesButtonRef.current?.focus(), 0);
  }

  useEffect(() => {
    if (!quickSettingsOpen) return;
    function closeFromOutside(event: globalThis.PointerEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.topbar-quick-settings-menu, [data-window-control-id="settingsQuick"]')) return;
      closeQuickSettings(true);
    }
    function closeFromKeyboard(event: KeyboardEvent) {
      if (event.key === 'Escape') closeQuickSettings(true);
    }
    window.addEventListener('pointerdown', closeFromOutside, true);
    window.addEventListener('keydown', closeFromKeyboard, true);
    return () => {
      window.removeEventListener('pointerdown', closeFromOutside, true);
      window.removeEventListener('keydown', closeFromKeyboard, true);
    };
  }, [quickSettingsOpen]);

  useEffect(() => {
    if (!configProfilesOpen) return;
    function closeFromOutside(event: globalThis.PointerEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.topbar-config-profiles-menu, [data-window-control-id="profiles"], .ui-dialog-backdrop')) return;
      closeConfigProfiles(true);
    }
    function closeFromKeyboard(event: KeyboardEvent) {
      if (event.key === 'Escape') closeConfigProfiles(true);
    }
    window.addEventListener('pointerdown', closeFromOutside, true);
    window.addEventListener('keydown', closeFromKeyboard, true);
    return () => {
      window.removeEventListener('pointerdown', closeFromOutside, true);
      window.removeEventListener('keydown', closeFromKeyboard, true);
    };
  }, [configProfilesOpen]);

  // 多账号中心改成下拉面板后不再有全屏遮罩，点面板外面要能关掉
  useEffect(() => {
    if (!multiAccountOpen) return;
    function closeFromOutside(event: globalThis.PointerEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.multi-account-dialog, [data-window-control-id="multiAccount"], [data-window-control-id="settingsQuick"], [data-window-control-id="profiles"], .ui-dialog-backdrop')) return;
      setMultiAccountOpen(false);
    }
    window.addEventListener('pointerdown', closeFromOutside, true);
    return () => window.removeEventListener('pointerdown', closeFromOutside, true);
  }, [multiAccountOpen]);

  useEffect(() => {
    const alwaysOnTop = Boolean(behavior.alwaysOnTop);
    void invoke('set_window_always_on_top', { alwaysOnTop }).catch((error) => {
      const win = getCurrentWindow() as unknown as { setAlwaysOnTop?: (value: boolean) => Promise<void> };
      win.setAlwaysOnTop?.(alwaysOnTop).catch((fallbackError) => console.warn('set always on top failed', error, fallbackError));
    });
  }, [behavior.alwaysOnTop]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    reorderGroups(arrayMove(ids, oldIndex, newIndex));
  }

  // v138: 整组拖动落点——把同色块从原顺序里摘出来，插到目标标签的前/后
  function handleClusterDrop(cluster: TabCluster, overGroupId: string | null, before: boolean) {
    if (!overGroupId || cluster.groupIds.includes(overGroupId)) return;
    const memberSet = new Set(cluster.groupIds);
    const remaining = ids.filter((id) => !memberSet.has(id));
    const overIndex = remaining.indexOf(overGroupId);
    if (overIndex < 0) return;
    const insertIndex = before ? overIndex : overIndex + 1;
    const next = [...remaining.slice(0, insertIndex), ...cluster.groupIds, ...remaining.slice(insertIndex)];
    if (next.every((id, index) => id === ids[index])) return;
    reorderGroups(next);
  }

  function handleActionDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const current = actionOrder;
    const oldIndex = current.indexOf(String(active.id) as WindowControlId);
    const newIndex = current.indexOf(String(over.id) as WindowControlId);
    if (oldIndex < 0 || newIndex < 0) return;
    updateDisplay({ windowControlOrder: arrayMove(current, oldIndex, newIndex) });
  }

  async function minimizeWindow(event?: MouseEvent<HTMLButtonElement>) {
    event?.preventDefault();
    event?.stopPropagation();
    await getCurrentWindow().minimize().catch((error) => console.warn('minimize failed', error));
  }

  async function closeWindow(event?: MouseEvent<HTMLButtonElement>) {
    event?.preventDefault();
    event?.stopPropagation();
    await getCurrentWindow().close().catch((error) => console.warn('close failed', error));
  }

  function toggleAlwaysOnTop(event?: MouseEvent<HTMLButtonElement>) {
    event?.preventDefault();
    event?.stopPropagation();
    updateBehavior({ alwaysOnTop: !behavior.alwaysOnTop });
  }

  function sortGroupsByName(event?: MouseEvent<HTMLButtonElement>) {
    event?.preventDefault();
    event?.stopPropagation();
    const savedOrder = display.sortGroupsSavedOrder;
    if (savedOrder) {
      // 还原：按保存的顺序排（跳过已删除的父目录），保存之后新增的父目录接在后面
      const savedSet = new Set(savedOrder);
      reorderGroups([
        ...savedOrder.filter((id) => ids.includes(id)),
        ...ids.filter((id) => !savedSet.has(id)),
      ]);
      updateDisplay({ sortGroupsSavedOrder: null });
      return;
    }
    // 按字母排列：先把当前顺序存起来，再排序
    updateDisplay({ sortGroupsSavedOrder: ids });
    const sortedIds = groups
      .slice()
      .sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? ''), 'zh-Hans-CN', { numeric: true, sensitivity: 'base' }))
      .map((group) => group.id);
    reorderGroups(sortedIds);
  }

  function handleTopbarContext(event: MouseEvent<HTMLElement>) {
    const target = event.target as HTMLElement;
    if (target.closest('.top-tab') || target.closest('.icon-button')) return;
    event.preventDefault();
    const targetGroupId = activeGroupId || groups[0]?.id;
    if (targetGroupId) onContextMenuGroup(targetGroupId, event.clientX, event.clientY);
  }

  const actionMap: Record<WindowControlId, SortableWindowActionProps> = {
    search: { id: 'search', title: '全局命令面板（Ctrl+K）', icon: <Search size={16} />, onClick: onOpenGlobalSearch },
    transfer: { id: 'transfer', title: '文件中转站', icon: <Archive size={16} />, onClick: onOpenTransferStation },
    image: { id: 'image', title: '图片浏览', icon: <Images size={16} />, onClick: onOpenImageBrowser },
    profiles: { id: 'profiles', title: '多配置', icon: <Files size={16} />, className: configProfilesOpen ? 'config-profiles-active' : '', buttonRef: (node) => { configProfilesButtonRef.current = node; }, ariaExpanded: configProfilesOpen, ariaHaspopup: 'menu', ariaControls: 'topbar-config-profiles-menu', onClick: () => { setMultiAccountOpen(false); setQuickSettingsOpen(false); setConfigProfilesOpen((open) => !open); } },
    multiAccount: { id: 'multiAccount', title: '多账号批量生成', icon: <UsersRound size={16} />, className: multiAccountOpen ? 'multi-account-active' : '', buttonRef: (node) => { multiAccountButtonRef.current = node; }, ariaExpanded: multiAccountOpen, onClick: () => { setQuickSettingsOpen(false); setConfigProfilesOpen(false); setMultiAccountOpen((open) => !open); } },
    sortGroups: { id: 'sortGroups', title: display.sortGroupsSavedOrder ? '还原排列顺序' : '父目录按字母排列', icon: display.sortGroupsSavedOrder ? <RotateCcw size={16} /> : <ArrowDownAZ size={16} />, onClick: sortGroupsByName },
    add: { id: 'add', title: '新增父目录', icon: <Plus size={16} />, onClick: () => addGroup('新分组') },
    settingsQuick: { id: 'settingsQuick', title: '常用设置快捷入口', icon: <SlidersHorizontal size={16} />, className: quickSettingsOpen ? 'quick-settings-active' : '', buttonRef: (node) => { quickSettingsButtonRef.current = node; }, ariaExpanded: quickSettingsOpen, ariaHaspopup: 'menu', ariaControls: 'topbar-quick-settings-menu', onClick: () => { setMultiAccountOpen(false); setConfigProfilesOpen(false); if (quickSettingsOpen) closeQuickSettings(false); else setQuickSettingsOpen(true); } },
    settings: { id: 'settings', title: '设置', icon: <Settings size={16} />, onClick: () => setSettingsOpen(true) },
    pin: { id: 'pin', title: behavior.alwaysOnTop ? '取消置顶' : '窗口置顶', icon: behavior.alwaysOnTop ? <PinOff size={16} /> : <Pin size={16} />, className: behavior.alwaysOnTop ? 'window-pin-active' : '', onClick: toggleAlwaysOnTop },
    minimize: { id: 'minimize', title: '最小化', icon: <Minus size={16} />, onClick: minimizeWindow },
    close: { id: 'close', title: '关闭', icon: <X size={16} />, className: 'window-close-button', onClick: closeWindow }
  };

  return (
    <header
      ref={topbarRef}
      className={`topbar ${display.topTabEqualWidth ? 'topbar-equal-tabs' : ''} ${overflowRows ? 'topbar-overflow-tabs' : ''} topbar-shape-${display.topTabShape}`}
      style={{ '--topbar-visible-rows': visibleRows } as CSSProperties}
      data-tauri-drag-region
      onContextMenu={handleTopbarContext}
    >
      <DndContext
        sensors={tabSensors}
        collisionDetection={closestCenter}
        onDragStart={() => setTabSortableDragging(true)}
        onDragEnd={(event) => {
          setTabSortableDragging(false);
          handleDragEnd(event);
        }}
        onDragCancel={() => setTabSortableDragging(false)}
      >
        <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
          <div ref={tabsRef} className="topbar-tabs">
            {groups.map((group) => <EditableGroupTab group={group} key={group.id} onContextMenu={onContextMenuGroup} isExternalDropTarget={externalDropTargetGroupId === group.id} />)}
            <div ref={insertIndicatorRef} className="topbar-cluster-insert-indicator" aria-hidden="true" />
            {tabClusters.map((cluster) => (
              <TopBarTabClusterOverlay
                key={cluster.id}
                cluster={cluster}
                segments={clusterSegments[cluster.id] ?? []}
                suppressed={tabSortableDragging || (draggingClusterId !== null && draggingClusterId !== cluster.id)}
                insertIndicatorRef={insertIndicatorRef}
                onClusterDrop={handleClusterDrop}
                onClusterDragChange={setDraggingClusterId}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <DndContext sensors={actionSensors} collisionDetection={closestCenter} onDragEnd={handleActionDragEnd}>
        <SortableContext items={visibleActionOrder} strategy={horizontalListSortingStrategy}>
          <div className={`topbar-actions topbar-actions-${display.windowControlStyle ?? 'round'}`} data-no-drag>
            {visibleActionOrder.map((id) => <SortableWindowAction key={id} {...actionMap[id]} />)}
          </div>
        </SortableContext>
      </DndContext>
      {quickSettingsPresence.rendered && (
        <QuickSettingsMenu
          ref={quickSettingsMenuRef}
          onClose={closeQuickSettings}
          reduceMotion={experience.reduceMotion}
          closing={quickSettingsPresence.closing}
        />
      )}
      {configProfilesPresence.rendered && (
        <ConfigProfilesMenu
          ref={configProfilesMenuRef}
          onClose={closeConfigProfiles}
          reduceMotion={experience.reduceMotion}
          closing={configProfilesPresence.closing}
        />
      )}
      {multiAccountPresence.rendered && <MultiAccountDialog closing={multiAccountPresence.closing} panelRef={(node) => { multiAccountPanelRef.current = node; }} onClose={() => setMultiAccountOpen(false)} />}
    </header>
  );
}
