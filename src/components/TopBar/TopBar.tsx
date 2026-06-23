import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { DndContext, DragEndEvent, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, horizontalListSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Archive, Copy, Images, Minus, Pin, PinOff, Plus, Search, Settings, X } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../../stores/appStore';
import { byOrder } from '../../lib/sort';
import type { Group, WindowControlId } from '../../types';

const DEFAULT_CONTROL_ORDER: WindowControlId[] = ['search', 'transfer', 'image', 'add', 'multi', 'settings', 'pin', 'minimize', 'close'];

function normalizeControlOrder(order?: WindowControlId[]): WindowControlId[] {
  const next: WindowControlId[] = [];
  for (const id of order ?? []) {
    if (DEFAULT_CONTROL_ORDER.includes(id) && !next.includes(id)) next.push(id);
  }
  for (const id of DEFAULT_CONTROL_ORDER) {
    if (!next.includes(id)) next.push(id);
  }
  return next;
}

function EditableGroupTab({ group, onContextMenu }: { group: Group; onContextMenu: (groupId: string, x: number, y: number) => void }) {
  const activeGroupId = useAppStore((state) => state.activeGroupId);
  const setActiveGroup = useAppStore((state) => state.setActiveGroup);
  const renameGroup = useAppStore((state) => state.renameGroup);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(group.name);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: group.id });
  const sortableListeners = listeners as Record<string, ((event: PointerEvent<HTMLDivElement>) => void) | undefined>;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  };

  function save() {
    const next = value.trim();
    if (next) renameGroup(group.id, next);
    setEditing(false);
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`top-tab ${activeGroupId === group.id ? 'active' : ''} ${isDragging ? 'dragging' : ''}`}
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
}

function SortableWindowAction({ id, title, icon, className = '', onClick }: SortableWindowActionProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  } as CSSProperties;
  const sortableListeners = listeners as Record<string, ((event: PointerEvent<HTMLButtonElement>) => void) | undefined>;

  return (
    <button
      ref={setNodeRef}
      style={style}
      className={`icon-button window-control-button draggable-window-control ${className} ${isDragging ? 'dragging' : ''}`}
      data-no-drag
      title={`${title}（拖动可调整位置）`}
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
  onOpenImageBrowser
}: {
  onContextMenuGroup: (groupId: string, x: number, y: number) => void;
  onOpenGlobalSearch: () => void;
  onOpenTransferStation: () => void;
  onOpenImageBrowser: () => void;
}) {
  const rawGroups = useAppStore((state) => state.groups);
  const groups = useMemo(() => rawGroups.slice().sort(byOrder), [rawGroups]);
  const activeGroupId = useAppStore((state) => state.activeGroupId);
  const display = useAppStore((state) => state.display);
  const behavior = useAppStore((state) => state.behavior);
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
  const actionOrder = useMemo(() => normalizeControlOrder(display.windowControlOrder), [display.windowControlOrder]);
  const tabsRef = useRef<HTMLDivElement | null>(null);
  const [visibleRows, setVisibleRows] = useState(1);
  const [overflowRows, setOverflowRows] = useState(false);

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


  useEffect(() => {
    const win = getCurrentWindow() as unknown as { setAlwaysOnTop?: (alwaysOnTop: boolean) => Promise<void> };
    win.setAlwaysOnTop?.(Boolean(behavior.alwaysOnTop)).catch((error) => console.warn('set always on top failed', error));
  }, [behavior.alwaysOnTop]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    reorderGroups(arrayMove(ids, oldIndex, newIndex));
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

  async function openNewMainWindow(event?: MouseEvent<HTMLButtonElement>) {
    event?.preventDefault();
    event?.stopPropagation();
    await invoke('open_new_main_window').catch((error) => console.warn('open new window failed', error));
  }

  function toggleAlwaysOnTop(event?: MouseEvent<HTMLButtonElement>) {
    event?.preventDefault();
    event?.stopPropagation();
    updateBehavior({ alwaysOnTop: !behavior.alwaysOnTop });
  }

  function handleTopbarContext(event: MouseEvent<HTMLElement>) {
    const target = event.target as HTMLElement;
    if (target.closest('.top-tab') || target.closest('.icon-button')) return;
    event.preventDefault();
    const targetGroupId = activeGroupId || groups[0]?.id;
    if (targetGroupId) onContextMenuGroup(targetGroupId, event.clientX, event.clientY);
  }

  const actionMap: Record<WindowControlId, SortableWindowActionProps> = {
    search: { id: 'search', title: '全局搜索', icon: <Search size={16} />, onClick: onOpenGlobalSearch },
    transfer: { id: 'transfer', title: '文件中转站', icon: <Archive size={16} />, onClick: onOpenTransferStation },
    image: { id: 'image', title: '图片浏览', icon: <Images size={16} />, onClick: onOpenImageBrowser },
    add: { id: 'add', title: '新增父目录', icon: <Plus size={16} />, onClick: () => addGroup('新分组') },
    multi: { id: 'multi', title: '多开新窗口', icon: <Copy size={16} />, onClick: openNewMainWindow },
    settings: { id: 'settings', title: '设置', icon: <Settings size={16} />, onClick: () => setSettingsOpen(true) },
    pin: { id: 'pin', title: behavior.alwaysOnTop ? '取消置顶' : '窗口置顶', icon: behavior.alwaysOnTop ? <PinOff size={16} /> : <Pin size={16} />, className: behavior.alwaysOnTop ? 'window-pin-active' : '', onClick: toggleAlwaysOnTop },
    minimize: { id: 'minimize', title: '最小化', icon: <Minus size={16} />, onClick: minimizeWindow },
    close: { id: 'close', title: '关闭', icon: <X size={16} />, className: 'window-close-button', onClick: closeWindow }
  };

  return (
    <header
      className={`topbar ${display.topTabEqualWidth ? 'topbar-equal-tabs' : ''} ${overflowRows ? 'topbar-overflow-tabs' : ''} topbar-shape-${display.topTabShape}`}
      style={{ '--topbar-visible-rows': visibleRows } as CSSProperties}
      data-tauri-drag-region
      onContextMenu={handleTopbarContext}
    >
      <DndContext sensors={tabSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
          <div ref={tabsRef} className="topbar-tabs">
            {groups.map((group) => <EditableGroupTab group={group} key={group.id} onContextMenu={onContextMenuGroup} />)}
          </div>
        </SortableContext>
      </DndContext>
      <DndContext sensors={actionSensors} collisionDetection={closestCenter} onDragEnd={handleActionDragEnd}>
        <SortableContext items={actionOrder} strategy={horizontalListSortingStrategy}>
          <div className={`topbar-actions topbar-actions-${display.windowControlStyle ?? 'round'}`} data-no-drag>
            {actionOrder.map((id) => <SortableWindowAction key={id} {...actionMap[id]} />)}
          </div>
        </SortableContext>
      </DndContext>
    </header>
  );
}
