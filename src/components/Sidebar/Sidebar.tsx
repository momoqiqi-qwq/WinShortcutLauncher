import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { DndContext, DragEndEvent, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
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
}: {
  directory: Directory;
  count: number;
  onContextMenu: (directoryId: string, x: number, y: number) => void;
}) {
  const activeDirectoryId = useAppStore((state) => state.activeDirectoryId);
  const setActiveDirectory = useAppStore((state) => state.setActiveDirectory);
  const renameDirectory = useAppStore((state) => state.renameDirectory);
  const experience = useAppStore((state) => state.experience);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(directory.name);
  const localRef = useRef<HTMLDivElement | null>(null);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: directory.id });
  const isActive = activeDirectoryId === directory.id;
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
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
  const experience = useAppStore((state) => state.experience);
  const createDirectory = useDirectoryCreator();
  const directories = useMemo(() => activeGroup?.directories.slice().sort(byOrder) ?? [], [activeGroup]);
  const ids = useMemo(() => directories.map((dir) => dir.id), [directories]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!activeGroup || !over || active.id === over.id) return;
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    reorderDirectories(activeGroup.id, arrayMove(ids, oldIndex, newIndex));
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
        <span>子目录</span>
        <button className="icon-button" title="新增子目录" onClick={() => void createDirectory('normal', '新目录')}>
          <FolderPlus size={15} />
        </button>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <div className="sidebar-tabs">
            {directories.map((directory) => (
              <EditableDirectory
                directory={directory}
                count={getDirectoryDisplayCount(directory, directories)}
                key={directory.id}
                onContextMenu={onContextMenuDirectory}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </aside>
  );
}
