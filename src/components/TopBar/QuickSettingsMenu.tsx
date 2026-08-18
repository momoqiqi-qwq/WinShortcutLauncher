import { forwardRef, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Check, Eye, EyeOff, GripVertical, RotateCcw, Settings2, Star } from 'lucide-react';
import {
  QUICK_SETTINGS_CATALOG,
  defaultQuickSettingsPreferences,
  loadQuickSettingsPreferences,
  saveQuickSettingsPreferences,
  type QuickSettingDefinition,
  type QuickSettingsPreferences,
} from '../../lib/quickSettings';
import { requestSettingsSection, requestSettingsTab } from '../../lib/settingsCatalog';
import './QuickSettingsMenu.css';

function SortableEditorRow({
  entry,
  favorite,
  hidden,
  onToggleFavorite,
  onToggleHidden,
  onOpen,
}: {
  entry: QuickSettingDefinition;
  favorite: boolean;
  hidden: boolean;
  onToggleFavorite: () => void;
  onToggleHidden: () => void;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: entry.id });
  return (
    <div ref={setNodeRef} className={`quick-settings-editor-row ${hidden ? 'is-hidden' : ''} ${isDragging ? 'dragging' : ''}`} style={{ transform: CSS.Transform.toString(transform), transition }}>
      <button type="button" className="quick-settings-drag-handle" title="拖动排序" aria-label={`拖动 ${entry.label}`} {...attributes} {...listeners}><GripVertical size={15} /></button>
      <button type="button" className="quick-settings-editor-main" onClick={onOpen}><span>{entry.label}</span><small>{entry.description}</small></button>
      <button type="button" className={favorite ? 'active' : ''} title={favorite ? '取消收藏' : '收藏'} onClick={onToggleFavorite}><Star size={14} fill={favorite ? 'currentColor' : 'none'} /></button>
      <button type="button" className={hidden ? 'active' : ''} title={hidden ? '恢复显示' : '隐藏'} onClick={onToggleHidden}>{hidden ? <EyeOff size={14} /> : <Eye size={14} />}</button>
    </div>
  );
}

export const QuickSettingsMenu = forwardRef<HTMLDivElement, {
  left: number;
  onClose: (restoreFocus: boolean) => void;
  reduceMotion?: boolean;
}>(function QuickSettingsMenu({ left, onClose, reduceMotion = false }, ref) {
  const [preferences, setPreferences] = useState<QuickSettingsPreferences>(() => loadQuickSettingsPreferences());
  const [editing, setEditing] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const byId = useMemo(() => new Map(QUICK_SETTINGS_CATALOG.map((entry) => [entry.id, entry])), []);
  const orderedEntries = useMemo(() => preferences.order.map((id) => byId.get(id)).filter((entry): entry is QuickSettingDefinition => Boolean(entry)), [byId, preferences.order]);
  const visibleEntries = useMemo(() => {
    const visible = orderedEntries.filter((entry) => !preferences.hidden.includes(entry.id));
    const favorites = visible.filter((entry) => preferences.favorites.includes(entry.id));
    const rest = visible.filter((entry) => !preferences.favorites.includes(entry.id));
    return [...favorites, ...rest];
  }, [orderedEntries, preferences.favorites, preferences.hidden]);

  function commit(next: QuickSettingsPreferences) {
    setPreferences(next);
    saveQuickSettingsPreferences(next);
  }

  function openEntry(entry: QuickSettingDefinition) {
    onClose(false);
    if (entry.section) requestSettingsSection(entry.tab, entry.section);
    else requestSettingsTab(entry.tab);
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (editing) setEditing(false);
      else onClose(true);
      return;
    }
    if (editing) return;
    const menu = event.currentTarget;
    const items = Array.from(menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    let nextIndex = currentIndex;
    if (event.key === 'ArrowDown') nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % items.length;
    else if (event.key === 'ArrowUp') nextIndex = currentIndex < 0 ? items.length - 1 : (currentIndex - 1 + items.length) % items.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = items.length - 1;
    else return;
    event.preventDefault();
    items[nextIndex]?.focus();
  }

  function handleDragEnd(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) return;
    const oldIndex = preferences.order.indexOf(String(event.active.id));
    const newIndex = preferences.order.indexOf(String(event.over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    commit({ ...preferences, order: arrayMove(preferences.order, oldIndex, newIndex) });
  }

  function toggleFavorite(id: string) {
    commit({ ...preferences, favorites: preferences.favorites.includes(id) ? preferences.favorites.filter((entry) => entry !== id) : [...preferences.favorites, id] });
  }

  function toggleHidden(id: string) {
    commit({ ...preferences, hidden: preferences.hidden.includes(id) ? preferences.hidden.filter((entry) => entry !== id) : [...preferences.hidden, id] });
  }

  function reset() {
    commit(defaultQuickSettingsPreferences());
  }

  return (
    <div id="topbar-quick-settings-menu" ref={ref} className={`topbar-quick-settings-menu ${editing ? 'is-editing' : ''} ${reduceMotion ? 'reduce-motion' : ''}`} style={{ left }} data-no-drag role="menu" aria-label="常用设置快捷入口" onKeyDown={handleKeyDown} onPointerDown={(event) => event.stopPropagation()}>
      <div className="topbar-quick-settings-head">
        <div><strong>{editing ? '自定义快捷设置' : '快速进入设置'}</strong><small>{editing ? '拖动排序 · 收藏 · 隐藏' : `${visibleEntries.length} 个入口 · 收藏项优先`}</small></div>
        <button type="button" className="quick-settings-customize" title={editing ? '完成自定义' : '自定义快捷设置'} onClick={() => setEditing((value) => !value)}>{editing ? <Check size={14} /> : <Settings2 size={14} />}</button>
      </div>
      {editing ? (
        <>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={preferences.order} strategy={verticalListSortingStrategy}>
              <div className="quick-settings-editor-list">
                {orderedEntries.map((entry) => <SortableEditorRow key={entry.id} entry={entry} favorite={preferences.favorites.includes(entry.id)} hidden={preferences.hidden.includes(entry.id)} onToggleFavorite={() => toggleFavorite(entry.id)} onToggleHidden={() => toggleHidden(entry.id)} onOpen={() => openEntry(entry)} />)}
              </div>
            </SortableContext>
          </DndContext>
          <button type="button" className="quick-settings-reset" onClick={reset}><RotateCcw size={13} /> 恢复默认布局</button>
        </>
      ) : (
        <div className="quick-settings-view-list">
          {visibleEntries.map((entry) => (
            <button type="button" role="menuitem" key={entry.id} onClick={() => openEntry(entry)}>
              <span>{entry.label}{preferences.favorites.includes(entry.id) && <Star className="quick-setting-star" size={10} fill="currentColor" />}</span>
              <small>{entry.description}</small>
            </button>
          ))}
          {visibleEntries.length === 0 && <div className="quick-settings-empty">所有入口都已隐藏。点右上角自定义按钮恢复。</div>}
        </div>
      )}
    </div>
  );
});
