import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { DndContext, DragEndEvent, DragStartEvent, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { FolderPlus } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import { byOrder } from '../../lib/sort';
import { getDirectoryDisplayCount } from '../../lib/directoryExperience';
import { useDirectoryCreator } from '../../hooks/useDirectoryCreator';
import type { Directory } from '../../types';

function EditableDirectory({
  directory,
  count,
  onContextMenu,
  dragSessionActive,
}: {
  directory: Directory;
  count: number;
  onContextMenu: (directoryId: string, x: number, y: number) => void;
  dragSessionActive: boolean;
}) {
  const activeDirectoryId = useAppStore((state) => state.activeDirectoryId);
  const setActiveDirectory = useAppStore((state) => state.setActiveDirectory);
  const renameDirectory = useAppStore((state) => state.renameDirectory);
  const experience = useAppStore((state) => state.experience);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(directory.name);
  const localRef = useRef<HTMLDivElement | null>(null);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: directory.id, disabled: editing });
  const isActive = activeDirectoryId === directory.id;
  const style = {
    transform: dragSessionActive ? CSS.Transform.toString(transform) : undefined,
    transition: dragSessionActive ? transition : undefined,
  };
  const setCombinedRef = useCallback((node: HTMLDivElement | null) => {
    localRef.current = node;
    setNodeRef(node);
  }, [setNodeRef]);

  useEffect(() => {
    if (isActive) localRef.current?.scrollIntoView({ block: 'nearest' });
  }, [isActive]);

  useEffect(() => setValue(directory.name), [directory.name]);

  function save() {
    const next = value.trim();
    if (next) renameDirectory(directory.id, next);
    else setValue(directory.name);
    setEditing(false);
  }

  return (
    <div
      ref={setCombinedRef}
      style={style}
      className={`side-tab side-tab-${directory.kind ?? 'normal'} ${isActive ? 'active' : ''} ${isDragging ? 'dragging' : ''}`}
      data-directory-id={directory.id}
      onClick={() => !editing && setActiveDirectory(directory.id)}
      onDoubleClick={(event) => {
        event.stopPropagation();
        setEditing(true);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setActiveDirectory(directory.id);
        useAppStore.getState().clearSelection();
        onContextMenu(directory.id, event.clientX, event.clientY);
      }}
      title={`${directory.name}${experience.showDirectoryItemCount ? `（${count}）` : ''}`}
      {...attributes}
      {...listeners}
    >
      {editing ? (
        <input
          className="side-tab-input"
          value={value}
          autoFocus
          onPointerDown={(event) => event.stopPropagation()}
          onChange={(event) => setValue(event.target.value)}
          onBlur={save}
          onKeyDown={(event) => {
            if (event.key === 'Enter') save();
            if (event.key === 'Escape') {
              setValue(directory.name);
              setEditing(false);
            }
          }}
        />
      ) : (
        <>
          <span className="side-tab-label">{directory.name}</span>
          {experience.showDirectoryItemCount && <span className="side-tab-count">{count}</span>}
        </>
      )}
    </div>
  );
}

export function Sidebar({
  onContextMenuDirectory,
  onContextMenuArea,
}: {
  onContextMenuDirectory: (directoryId: string, x: number, y: number) => void;
  onContextMenuArea: (x: number, y: number) => void;
}) {
  const activeGroup = useAppStore((state) => state.getActiveGroup());
  const reorderDirectories = useAppStore((state) => state.reorderDirectories);
  const globalDisplay = useAppStore((state) => state.display);
  const experience = useAppStore((state) => state.experience);
  const createDirectory = useDirectoryCreator();
  const directories = useMemo(() => activeGroup?.directories.slice().sort(byOrder) ?? [], [activeGroup]);
  const sidebarColumns = Math.max(1, Math.min(6, Math.round(activeGroup?.sidebarColumns ?? globalDisplay.sidebarColumns ?? 1)));
  const ids = useMemo(() => directories.map((dir) => dir.id), [directories]);
  const activeDragIdRef = useRef<string | null>(null);
  const activeGroupIdRef = useRef(activeGroup?.id ?? '');
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [dndSessionKey, setDndSessionKey] = useState(0);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const finishDragSession = useCallback(() => {
    activeDragIdRef.current = null;
    setActiveDragId(null);
  }, []);

  const hardResetDragSession = useCallback(() => {
    activeDragIdRef.current = null;
    setActiveDragId(null);
    setDndSessionKey((value) => value + 1);
  }, []);

  useEffect(() => {
    const nextGroupId = activeGroup?.id ?? '';
    if (activeGroupIdRef.current !== nextGroupId && activeDragIdRef.current) hardResetDragSession();
    activeGroupIdRef.current = nextGroupId;
  }, [activeGroup?.id, hardResetDragSession]);

  useEffect(() => {
    function handlePointerUp() {
      if (!activeDragIdRef.current) return;
      window.setTimeout(() => {
        // dnd-kit normally clears the session synchronously in its own pointerup handler.
        // If it did not, remount the DndContext so no stale transform/overlay can remain.
        if (activeDragIdRef.current) hardResetDragSession();
      }, 0);
    }
    function handlePointerCancel() {
      if (activeDragIdRef.current) hardResetDragSession();
    }
    function handleLostPointerCapture() {
      if (!activeDragIdRef.current) return;
      window.setTimeout(() => {
        if (activeDragIdRef.current) hardResetDragSession();
      }, 0);
    }
    function handleWindowBlur() {
      if (activeDragIdRef.current) hardResetDragSession();
    }
    function handleVisibilityChange() {
      if (document.visibilityState !== 'visible' && activeDragIdRef.current) hardResetDragSession();
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && activeDragIdRef.current) hardResetDragSession();
    }
    window.addEventListener('pointerup', handlePointerUp, true);
    window.addEventListener('pointercancel', handlePointerCancel, true);
    window.addEventListener('lostpointercapture', handleLostPointerCapture, true);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('keydown', handleEscape, true);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('pointerup', handlePointerUp, true);
      window.removeEventListener('pointercancel', handlePointerCancel, true);
      window.removeEventListener('lostpointercapture', handleLostPointerCapture, true);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('keydown', handleEscape, true);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [hardResetDragSession]);

  function handleDragStart(event: DragStartEvent) {
    const id = String(event.active.id);
    activeDragIdRef.current = id;
    setActiveDragId(id);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    try {
      if (!activeGroup || !over || active.id === over.id) return;
      const oldIndex = ids.indexOf(String(active.id));
      const newIndex = ids.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return;
      reorderDirectories(activeGroup.id, arrayMove(ids, oldIndex, newIndex));
    } finally {
      finishDragSession();
    }
  }

  function handleSidebarContext(event: MouseEvent<HTMLElement>) {
    const target = event.target as HTMLElement;
    if (target.closest('.side-tab') || target.closest('.icon-button')) return;
    event.preventDefault();
    useAppStore.getState().clearSelection();
    onContextMenuArea(event.clientX, event.clientY);
  }

  function handleSidebarDoubleClick(event: MouseEvent<HTMLElement>) {
    if (!experience.doubleClickSidebarToCreate) return;
    const target = event.target as HTMLElement;
    if (target.closest('.side-tab, .icon-button, .sidebar-header')) return;
    void createDirectory('normal', '新目录');
  }

  return (
    <aside className="sidebar panel" onContextMenu={handleSidebarContext} onDoubleClick={handleSidebarDoubleClick}>
      <div className="sidebar-header">
        <span className="sidebar-header-title">子目录 <small>{sidebarColumns} 列</small></span>
        <button className="icon-button" title="新增子目录" onClick={() => void createDirectory('normal', '新目录')}>
          <FolderPlus size={15} />
        </button>
      </div>
      <DndContext
        key={`${activeGroup?.id ?? 'none'}-${dndSessionKey}`}
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragCancel={hardResetDragSession}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={ids} strategy={sidebarColumns > 1 ? rectSortingStrategy : verticalListSortingStrategy}>
          <div
            className={`sidebar-tabs ${globalDisplay.sidebarShowFullNames ? 'full-names' : ''}`}
            style={{ '--sidebar-columns': sidebarColumns } as CSSProperties}
          >
            {directories.map((directory) => (
              <EditableDirectory
                directory={directory}
                count={getDirectoryDisplayCount(directory, directories)}
                key={directory.id}
                onContextMenu={onContextMenuDirectory}
                dragSessionActive={activeDragId !== null}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </aside>
  );
}
