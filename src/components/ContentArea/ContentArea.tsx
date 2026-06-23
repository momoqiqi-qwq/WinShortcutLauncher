import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { DndContext, DragEndEvent, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { Inbox, Search, StickyNote, X } from 'lucide-react';
import { getEffectiveDisplay, useAppStore } from '../../stores/appStore';
import { sortShortcutItemsForDisplay } from '../../lib/sort';
import type { ShortcutItem } from '../../types';
import { chooseIconResolveCommand, getCachedIcon, preloadIconDataUrls, isDirectImageSource, setIconParallelTasks, type IconResolveCommand } from '../../lib/iconCache';
import { ItemCard } from './ItemCard';
import { NoteContextMenu } from '../ContextMenu/NoteContextMenu';

interface ContentAreaProps {
  onContextMenuItem: (itemId: string, x: number, y: number) => void;
  onContextMenuArea: (x: number, y: number) => void;
}

function getIconPreloadTarget(item: ShortcutItem, mode: string) {
  const customIcon = item.icon?.trim();
  const rawIcon = customIcon || (item.type !== 'url' ? item.path?.trim() : '');
  if (!rawIcon || isDirectImageSource(rawIcon)) return undefined;
  const command = chooseIconResolveCommand(rawIcon, !customIcon, mode as any);
  return { command, path: rawIcon };
}

export function ContentArea({ onContextMenuItem, onContextMenuArea }: ContentAreaProps) {
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement | null>(null);
  const activeGroup = useAppStore((state) => state.getActiveGroup());
  const activeDirectory = useAppStore((state) => state.getActiveDirectory());
  const selectedItemIds = useAppStore((state) => state.selectedItemIds);
  const behavior = useAppStore((state) => state.behavior);
  const transferStation = useAppStore((state) => state.transferStation);
  const clearSelection = useAppStore((state) => state.clearSelection);
  const setSelectedNavTarget = useAppStore((state) => state.setSelectedNavTarget);
  const reorderItems = useAppStore((state) => state.reorderItems);
  const globalDisplay = useAppStore((state) => state.display);
  const setDirectoryNote = useAppStore((state) => state.setDirectoryNote);
  const noteSettings = useAppStore((state) => state.notes);
  const display = useMemo(() => getEffectiveDisplay(globalDisplay, activeDirectory), [globalDisplay, activeDirectory]);
  const isAllDirectory = (activeDirectory?.kind ?? 'normal') === 'all';
  const isNotesDirectory = activeDirectory?.kind === 'notes';
  const activeNotesDirectoryId = isNotesDirectory ? activeDirectory?.id : undefined;
  const [draftNote, setDraftNote] = useState('');
  const [noteMenu, setNoteMenu] = useState<{ x: number; y: number; lineStart: number } | null>(null);
  const noteTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const noteSelectionBeforeMenuRef = useRef<{ start: number; end: number; direction: 'forward' | 'backward' | 'none'; scrollTop: number; hadFocus: boolean } | null>(null);
  const noteSaveTimerRef = useRef<number | null>(null);
  const noteDirectoryIdRef = useRef<string | undefined>(undefined);
  const noteDraftRef = useRef('');
  const noteLastCommittedRef = useRef('');
  const items = useMemo(() => {
    if (!activeDirectory) return [];
    if (isAllDirectory) {
      return sortShortcutItemsForDisplay((activeGroup?.directories ?? [])
        .filter((dir) => (dir.kind ?? 'normal') === 'normal')
        .flatMap((dir) => dir.items), display.sortMode);
    }
    return sortShortcutItemsForDisplay(activeDirectory.items, display.sortMode);
  }, [activeDirectory, activeGroup, display.sortMode, isAllDirectory]);
  const filteredItems = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return items;
    return items.filter((item) => `${item.name} ${item.path} ${item.type}`.toLowerCase().includes(keyword));
  }, [items, query]);
  const ids = useMemo(() => filteredItems.map((item) => item.id), [filteredItems]);
  const cardWidth = Math.max(display.itemWidth, display.viewMode === 'compact' ? display.iconSize + 28 : display.iconSize + 46);
  const minHeight = Math.max(display.itemHeight, display.iconSize + display.labelLines * display.fontSize * 1.4 + 28);
  const areaStyle = {
    '--item-card-width': `${cardWidth}px`,
    '--item-icon-size': `${display.iconSize}px`,
    '--item-icon-img-size': `${Math.max(28, display.iconSize - 6)}px`,
    '--item-card-min-height': `${minHeight}px`,
    '--items-gap': `${display.gridGap}px`,
    '--item-drag-bg': behavior.itemDragBackgroundColor || 'var(--accent)',
    '--item-drag-glow': behavior.itemDragGlowColor || 'var(--accent)',
    '--item-drag-glow-brightness': String(behavior.itemDragGlowBrightness ?? 0.72)
  } as CSSProperties;
  const noteEditorStyle = {
    '--note-font-size': `${noteSettings.fontSize ?? 15}px`,
    '--note-line-height': String(noteSettings.lineHeight ?? 1.7),
    '--note-padding': `${noteSettings.padding ?? 16}px`,
    '--note-radius': `${noteSettings.radius ?? 16}px`
  } as CSSProperties;
  // 单击启动模式下，ItemCard 会先自己判断“是否真的长按”。
  // 只有长按计时到达后才把 PointerDown 转交给 dnd-kit；这里不再使用 delay 约束，
  // 避免“慢一点的单击”在没有拖动意图时被 dnd-kit 自动激活成拖拽。
  const itemDragActivationConstraint = behavior.launchMode === 'single'
    ? { distance: Math.max(2, Math.min(8, Math.round((behavior.itemDragTolerance ?? 10) / 2))) }
    : { distance: 8 };
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: itemDragActivationConstraint }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const clearNoteSaveTimer = useCallback(() => {
    if (noteSaveTimerRef.current !== null) {
      window.clearTimeout(noteSaveTimerRef.current);
      noteSaveTimerRef.current = null;
    }
  }, []);

  const commitDraftNote = useCallback(() => {
    clearNoteSaveTimer();
    const directoryId = noteDirectoryIdRef.current;
    if (!directoryId) return;
    const nextNote = noteDraftRef.current;
    if (nextNote === noteLastCommittedRef.current) return;
    noteLastCommittedRef.current = nextNote;
    setDirectoryNote(directoryId, nextNote);
  }, [clearNoteSaveTimer, setDirectoryNote]);

  useEffect(() => () => commitDraftNote(), [commitDraftNote]);

  useEffect(() => {
    commitDraftNote();
    const nextNote = activeNotesDirectoryId ? (activeDirectory?.note ?? '') : '';
    noteDirectoryIdRef.current = activeNotesDirectoryId;
    noteDraftRef.current = nextNote;
    noteLastCommittedRef.current = nextNote;
    setDraftNote(nextNote);
  }, [activeNotesDirectoryId]);

  function handleNoteChange(value: string) {
    setDraftNote(value);
    noteDraftRef.current = value;
    clearNoteSaveTimer();
    noteSaveTimerRef.current = window.setTimeout(commitDraftNote, noteSettings.autosaveDelayMs ?? 450);
  }

  function makeNoteSeparator(char: string | undefined, length: number | undefined, fallback: string) {
    const glyph = Array.from((char || fallback).trim())[0] ?? fallback;
    return glyph.repeat(Math.max(4, Math.min(80, Math.round(Number(length) || 14))));
  }

  function getTextareaLineStartFromMouse(textarea: HTMLTextAreaElement, event: MouseEvent<HTMLTextAreaElement>) {
    const style = window.getComputedStyle(textarea);
    const rect = textarea.getBoundingClientRect();
    const paddingTop = Number.parseFloat(style.paddingTop) || 0;
    const fontSize = Number.parseFloat(style.fontSize) || 15;
    const lineHeight = style.lineHeight === 'normal' ? fontSize * 1.35 : (Number.parseFloat(style.lineHeight) || fontSize * 1.35);
    const y = Math.max(0, event.clientY - rect.top - paddingTop + textarea.scrollTop);
    const lineIndex = Math.max(0, Math.floor(y / lineHeight));
    let position = 0;
    const value = noteDraftRef.current;
    for (let index = 0; index < lineIndex; index += 1) {
      const nextBreak = value.indexOf('\n', position);
      if (nextBreak < 0) return value.length;
      position = nextBreak + 1;
    }
    return position;
  }

  function saveNoteSelectionForMenu(textarea: HTMLTextAreaElement) {
    noteSelectionBeforeMenuRef.current = {
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
      direction: textarea.selectionDirection,
      scrollTop: textarea.scrollTop,
      hadFocus: document.activeElement === textarea
    };
  }

  function restoreNoteSelectionFromMenu() {
    const textarea = noteTextareaRef.current;
    const selection = noteSelectionBeforeMenuRef.current;
    if (!textarea || !selection) return;
    if (selection.hadFocus) textarea.focus({ preventScroll: true });
    textarea.selectionStart = Math.max(0, Math.min(selection.start, textarea.value.length));
    textarea.selectionEnd = Math.max(0, Math.min(selection.end, textarea.value.length));
    textarea.selectionDirection = selection.direction;
    textarea.scrollTop = selection.scrollTop;
  }

  function handleNoteMouseDown(event: MouseEvent<HTMLTextAreaElement>) {
    const textarea = event.currentTarget;
    if (event.button === 2) {
      saveNoteSelectionForMenu(textarea);
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    setNoteMenu(null);
    event.stopPropagation();
  }

  function openNoteContextMenu(event: MouseEvent<HTMLTextAreaElement>) {
    event.preventDefault();
    event.stopPropagation();
    const textarea = event.currentTarget;
    if (!noteSelectionBeforeMenuRef.current) saveNoteSelectionForMenu(textarea);
    const lineStart = getTextareaLineStartFromMouse(textarea, event);
    setNoteMenu({ x: event.clientX, y: event.clientY, lineStart });
    window.requestAnimationFrame(restoreNoteSelectionFromMenu);
  }

  function insertNoteSeparator(separator: string) {
    const value = noteDraftRef.current;
    const lineStart = Math.max(0, Math.min(noteMenu?.lineStart ?? noteTextareaRef.current?.selectionStart ?? value.length, value.length));
    const lineEndIndex = value.indexOf('\n', lineStart);
    const lineEnd = lineEndIndex < 0 ? value.length : lineEndIndex;
    const currentLine = value.slice(lineStart, lineEnd);
    let nextValue = value;
    let nextCaret = lineStart + separator.length;

    if (currentLine.trim().length === 0) {
      nextValue = `${value.slice(0, lineStart)}${separator}${value.slice(lineEnd)}`;
    } else {
      const insertPos = lineEnd;
      const prefix = insertPos > 0 && value[insertPos - 1] !== '\n' ? '\n' : '';
      const suffix = insertPos < value.length ? '\n' : '';
      nextValue = `${value.slice(0, insertPos)}${prefix}${separator}${suffix}${value.slice(insertPos)}`;
      nextCaret = insertPos + prefix.length + separator.length;
    }

    setNoteMenu(null);
    handleNoteChange(nextValue);
    window.requestAnimationFrame(() => {
      const textarea = noteTextareaRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.selectionStart = nextCaret;
      textarea.selectionEnd = nextCaret;
    });
  }

  useEffect(() => {
    setIconParallelTasks(display.iconParallelTasks ?? 6);
  }, [display.iconParallelTasks]);

  useEffect(() => {
    const targets = filteredItems
      .map((item) => getIconPreloadTarget(item, display.itemIconResolveMode ?? 'auto'))
      .filter((target): target is { command: IconResolveCommand; path: string } => {
        if (!target) return false;
        return !getCachedIcon(target.command, target.path);
      });
    if (targets.length > 0) preloadIconDataUrls(targets);
  }, [filteredItems, display.itemIconResolveMode]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"], .modal-card, .edit-dialog')) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f' && !isNotesDirectory) {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === 'Escape' && document.activeElement === searchRef.current) {
        event.preventDefault();
        setQuery('');
        searchRef.current?.blur();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isNotesDirectory]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!activeDirectory || query.trim() || isAllDirectory || isNotesDirectory || !over || active.id === over.id) return;
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    reorderItems(activeDirectory.id, arrayMove(ids, oldIndex, newIndex));
  }

  function openAreaMenu(event: MouseEvent<HTMLElement>) {
    const target = event.target as HTMLElement;
    if (target.closest('.item-card') || target.closest('.notes-textarea')) return;
    event.preventDefault();
    clearSelection();
    onContextMenuArea(event.clientX, event.clientY);
  }

  function renderItemsGrid() {
    if (items.length === 0) {
      return (
        <div className="empty-state">
          <Inbox size={38} />
          <div>{isAllDirectory ? '普通标签中还没有快捷项目' : '把文件、文件夹或 .lnk 快捷方式拖进来'}</div>
          <small>{isAllDirectory ? '「全部」只集中显示普通标签，便签不会出现在这里' : '也可以在空白处右键添加文件、文件夹、网址或系统功能'}</small>
        </div>
      );
    }

    if (filteredItems.length === 0) {
      return (
        <div className="empty-state">
          <Search size={38} />
          <div>没有找到匹配项目</div>
          <small>换个关键词，或点搜索框右侧的清除按钮</small>
        </div>
      );
    }

    if (isAllDirectory) {
      return (
        <div className="items-grid all-items-grid">
          {filteredItems.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              selected={selectedItemIds.includes(item.id)}
              display={display}
              behavior={behavior}
              transferStation={transferStation}
              onContextMenu={onContextMenuItem}
            />
          ))}
        </div>
      );
    }

    return (
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={ids} strategy={rectSortingStrategy}>
          <div className="items-grid">
            {filteredItems.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                selected={selectedItemIds.includes(item.id)}
                display={display}
                behavior={behavior}
                transferStation={transferStation}
                onContextMenu={onContextMenuItem}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    );
  }

  return (
    <main
      className={`content-area ${isNotesDirectory ? 'notes-area' : ''}`}
      style={areaStyle}
      onMouseDown={(event) => {
        const target = event.target as HTMLElement;
        if (!target.closest('.menu-surface')) setNoteMenu(null);
        if (!target.closest('.item-card') && !target.closest('.menu-surface') && !target.closest('.notes-textarea') && !target.closest('.content-toolbar')) {
          clearSelection();
          setSelectedNavTarget(null);
        }
      }}
      onContextMenu={openAreaMenu}
    >
      {isNotesDirectory ? (
        <div className={`notes-panel ${noteSettings.showTitle === false ? 'notes-title-hidden' : ''}`} style={noteEditorStyle}>
          {noteSettings.showTitle !== false && <div className="notes-title"><StickyNote size={18} />{activeDirectory?.name || '便签'}</div>}
          <textarea
            ref={noteTextareaRef}
            className="notes-textarea"
            placeholder="在这里写作、记录临时想法。便签不会出现在「全部」标签里。"
            value={draftNote}
            onChange={(event) => handleNoteChange(event.target.value)}
            onBlur={commitDraftNote}
            onMouseDown={handleNoteMouseDown}
            onContextMenu={openNoteContextMenu}
            wrap={noteSettings.wrap === false ? 'off' : 'soft'}
            spellCheck={false}
          />
          {noteMenu && (
            <NoteContextMenu
              x={noteMenu.x}
              y={noteMenu.y}
              dashSeparator={makeNoteSeparator(noteSettings.dashSeparatorChar, noteSettings.separatorLength, '—')}
              starSeparator={makeNoteSeparator(noteSettings.starSeparatorChar, noteSettings.separatorLength, '*')}
              onInsertSeparator={insertNoteSeparator}
              onClose={() => setNoteMenu(null)}
            />
          )}
        </div>
      ) : (
        <>
          {items.length > 0 && (
            <div className="content-toolbar" onMouseDown={(event) => event.stopPropagation()}>
              <Search size={15} />
              <input
                ref={searchRef}
                value={query}
                placeholder="搜索当前页项目（Ctrl+F）"
                onChange={(event) => setQuery(event.target.value)}
              />
              {query && <button className="toolbar-clear" onClick={() => setQuery('')} title="清除搜索"><X size={14} /></button>}
              <span>{filteredItems.length}/{items.length}</span>
            </div>
          )}
          {renderItemsGrid()}
        </>
      )}
    </main>
  );
}
