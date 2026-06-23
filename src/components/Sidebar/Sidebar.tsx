import { useMemo, useState, type MouseEvent } from 'react';
import { DndContext, DragEndEvent, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { FolderPlus } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import { byOrder } from '../../lib/sort';
import { showLauncherNotice } from '../../lib/notify';
import type { Directory } from '../../types';

function EditableDirectory({ directory, onContextMenu, onContextMenuArea }: { directory: Directory; onContextMenu: (directoryId: string, x: number, y: number) => void; onContextMenuArea: (x: number, y: number) => void }) {
  const activeDirectoryId = useAppStore((state) => state.activeDirectoryId);
  const setActiveDirectory = useAppStore((state) => state.setActiveDirectory);
  const renameDirectory = useAppStore((state) => state.renameDirectory);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(directory.name);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: directory.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  };

  function save() {
    const next = value.trim();
    if (next) renameDirectory(directory.id, next);
    setEditing(false);
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`side-tab side-tab-${directory.kind ?? 'normal'} ${activeDirectoryId === directory.id ? 'active' : ''} ${isDragging ? 'dragging' : ''}`}
      onClick={() => !editing && setActiveDirectory(directory.id)}
      onDoubleClick={() => setEditing(true)}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setActiveDirectory(directory.id);
        useAppStore.getState().clearSelection();
        if (event.ctrlKey || event.metaKey || event.shiftKey) {
          onContextMenu(directory.id, event.clientX, event.clientY);
        } else {
          onContextMenuArea(event.clientX, event.clientY);
        }
      }}
      title={directory.name}
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
            if (event.key === 'Escape') setEditing(false);
          }}
        />
      ) : (
        <span>{directory.name}</span>
      )}
    </div>
  );
}

export function Sidebar({ onContextMenuDirectory, onContextMenuArea }: { onContextMenuDirectory: (directoryId: string, x: number, y: number) => void; onContextMenuArea: (x: number, y: number) => void }) {
  const activeGroup = useAppStore((state) => state.getActiveGroup());
  const activeDirectoryId = useAppStore((state) => state.activeDirectoryId);
  const activeDirectory = useAppStore((state) => state.getActiveDirectory());
  const addDirectory = useAppStore((state) => state.addDirectory);
  const reorderDirectories = useAppStore((state) => state.reorderDirectories);
  const directories = useMemo(() => activeGroup?.directories.slice().sort(byOrder) ?? [], [activeGroup]);
  const ids = useMemo(() => directories.map((dir) => dir.id), [directories]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
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

  return (
    <aside className="sidebar panel" onContextMenu={handleSidebarContext}>
      <div className="sidebar-header">
        <span>子目录</span>
        <button
          className="icon-button"
          title="新增子目录"
          onClick={() => {
            if (!activeGroup) return;
            if ((activeDirectory?.kind ?? 'normal') === 'all') {
              showLauncherNotice('特殊标签不可添加子标签');
              return;
            }
            addDirectory(activeGroup.id, '新目录');
          }}
        >
          <FolderPlus size={15} />
        </button>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <div className="sidebar-tabs">
            {directories.map((directory) => <EditableDirectory directory={directory} key={directory.id} onContextMenu={onContextMenuDirectory} onContextMenuArea={onContextMenuArea} />)}
          </div>
        </SortableContext>
      </DndContext>
    </aside>
  );
}
