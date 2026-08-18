import { useMemo, type MouseEvent } from 'react';
import { getEffectiveDisplay, useAppStore } from '../../stores/appStore';
import { NoteEditor } from './NoteEditor/NoteEditor';
import { ShortcutGrid, getContentAreaStyle } from './ShortcutGrid/ShortcutGrid';

interface ContentAreaProps {
  onContextMenuItem: (itemId: string, x: number, y: number) => void;
  onContextMenuArea: (x: number, y: number) => void;
}

export function ContentArea({ onContextMenuItem, onContextMenuArea }: ContentAreaProps) {
  const activeGroup = useAppStore((state) => state.getActiveGroup());
  const activeDirectory = useAppStore((state) => state.getActiveDirectory());
  const behavior = useAppStore((state) => state.behavior);
  const globalDisplay = useAppStore((state) => state.display);
  const clearSelection = useAppStore((state) => state.clearSelection);
  const setSelectedNavTarget = useAppStore((state) => state.setSelectedNavTarget);
  const display = useMemo(
    () => getEffectiveDisplay(globalDisplay, activeDirectory),
    [globalDisplay, activeDirectory],
  );
  const isAllDirectory = (activeDirectory?.kind ?? 'normal') === 'all';
  const isNotesDirectory = activeDirectory?.kind === 'notes';
  const areaStyle = useMemo(() => getContentAreaStyle(display, behavior), [display, behavior]);

  function openAreaMenu(event: MouseEvent<HTMLElement>) {
    const target = event.target as HTMLElement;
    if (target.closest('.item-card') || target.closest('.notes-textarea')) return;
    event.preventDefault();
    clearSelection();
    onContextMenuArea(event.clientX, event.clientY);
  }

  if (!activeDirectory) {
    return <main className="content-area" style={areaStyle} />;
  }

  return (
    <main
      className={`content-area ${isNotesDirectory ? 'notes-area' : ''}`}
      style={areaStyle}
      onMouseDown={(event) => {
        const target = event.target as HTMLElement;
        if (
          !target.closest('.item-card') &&
          !target.closest('.menu-surface') &&
          !target.closest('.notes-textarea') &&
          !target.closest('.content-toolbar')
        ) {
          clearSelection();
          setSelectedNavTarget(null);
        }
      }}
      onContextMenu={openAreaMenu}
    >
      {isNotesDirectory ? (
        <NoteEditor directory={activeDirectory} />
      ) : (
        <ShortcutGrid
          activeGroup={activeGroup}
          activeDirectory={activeDirectory}
          display={display}
          isAllDirectory={isAllDirectory}
          onContextMenuItem={onContextMenuItem}
        />
      )}
    </main>
  );
}
