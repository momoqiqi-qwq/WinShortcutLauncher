import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CheckSquare, Inbox, RefreshCw, Search, X } from 'lucide-react';
import type { Directory, DisplaySettings, Group, ShortcutItem } from '../../../types';
import { useAppStore } from '../../../stores/appStore';
import { sortShortcutItemsForDisplay } from '../../../lib/sort';
import { setIconParallelTasks } from '../../../lib/iconCache';
import { ItemCard } from '../ItemCard';
import { launchShortcutItem } from '../../../lib/launchShortcut';
import { matchesItemQuery, nextKeyboardItemIndex } from '../../../lib/itemExperience';
import { uiAlert } from '../../../lib/uiDialog';
import { formatShortcut, shortcutMatchesEvent } from '../../../lib/keyboardShortcuts';
import { getMappedPath, isMappedDirectory } from '../../../lib/mappedFolder';
import type { MirrorKind } from '../../../lib/folderMirror';

interface ShortcutGridProps {
  activeGroup?: Group;
  activeDirectory: Directory;
  display: DisplaySettings;
  isAllDirectory: boolean;
  /** 镜像子目录（开始菜单 / 映射文件夹）；null 表示普通子目录。 */
  mirrorKind: MirrorKind | null;
  onContextMenuItem: (itemId: string, x: number, y: number) => void;
}

export function ShortcutGrid({
  activeGroup,
  activeDirectory,
  display,
  isAllDirectory,
  mirrorKind,
  onContextMenuItem,
}: ShortcutGridProps) {
  const isStartMenuDirectory = mirrorKind === 'startMenu';
  const isMappedDirectory = mirrorKind === 'mapped';
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement | null>(null);
  const selectedItemIds = useAppStore((state) => state.selectedItemIds);
  const multiSelectMode = useAppStore((state) => state.multiSelectMode);
  const finishMultiSelect = useAppStore((state) => state.finishMultiSelect);
  const behavior = useAppStore((state) => state.behavior);
  const experience = useAppStore((state) => state.experience);
  const shortcuts = useAppStore((state) => state.shortcuts);
  const globalSearchSettings = useAppStore((state) => state.globalSearch);
  const transferStation = useAppStore((state) => state.transferStation);
  const reorderItems = useAppStore((state) => state.reorderItems);
  const selectItem = useAppStore((state) => state.selectItem);
  const startMenuItems = useAppStore((state) => state.startMenuItems);
  const startMenuLoading = useAppStore((state) => state.startMenuLoading);
  const refreshStartMenu = useAppStore((state) => state.refreshStartMenu);
  const mappedItems = useAppStore((state) => state.getMappedItems(activeDirectory.id));
  const mappedLoading = useAppStore((state) => Boolean(state.mappedLoading[activeDirectory.id]));
  const mappedError = useAppStore((state) => state.mappedError[activeDirectory.id] ?? '');
  const refreshMappedFolder = useAppStore((state) => state.refreshMappedFolder);
  const mappedRoot = isMappedDirectory ? getMappedPath(activeDirectory) : '';
  // 两类镜像子目录共用的加载态与刷新入口。
  const mirrorLoading = isStartMenuDirectory ? startMenuLoading : mappedLoading;
  const refreshMirror = () => (isStartMenuDirectory ? refreshStartMenu() : refreshMappedFolder(activeDirectory.id));

  const items = useMemo(() => {
    // 镜像子目录的条目是运行时扫描出来的，不来自配置。
    if (isStartMenuDirectory) {
      return sortShortcutItemsForDisplay(
        startMenuItems,
        display.sortMode,
        experience.pinnedItemsFirst,
      );
    }
    if (isMappedDirectory) {
      return sortShortcutItemsForDisplay(
        mappedItems,
        display.sortMode,
        experience.pinnedItemsFirst,
      );
    }
    if (isAllDirectory) {
      return sortShortcutItemsForDisplay(
        (activeGroup?.directories ?? [])
          .filter((dir) => (dir.kind ?? 'normal') === 'normal')
          .flatMap((dir) => dir.items),
        display.sortMode,
        experience.pinnedItemsFirst,
      );
    }
    return sortShortcutItemsForDisplay(
      activeDirectory.items,
      display.sortMode,
      experience.pinnedItemsFirst,
    );
  }, [activeDirectory.items, activeGroup, display.sortMode, experience.pinnedItemsFirst, isAllDirectory, isStartMenuDirectory, isMappedDirectory, startMenuItems, mappedItems]);

  const filteredItems = useMemo(
    () => items.filter((item) => matchesItemQuery(item, query, experience.searchIncludesPath)),
    [experience.searchIncludesPath, items, query],
  );
  const ids = useMemo(() => filteredItems.map((item) => item.id), [filteredItems]);
  const selectedItemIdSet = useMemo(() => new Set(selectedItemIds), [selectedItemIds]);
  const itemDragActivationConstraint = behavior.launchMode === 'single'
    ? { distance: Math.max(2, Math.min(8, Math.round((behavior.itemDragTolerance ?? 10) / 2))) }
    : { distance: 8 };
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: itemDragActivationConstraint }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    setQuery('');
  }, [activeDirectory.id]);

  useEffect(() => {
    setIconParallelTasks(display.iconParallelTasks ?? 6);
  }, [display.iconParallelTasks]);

  useEffect(() => {
    function focusSelectedCard(itemId: string) {
      window.setTimeout(() => {
        const target = Array.from(document.querySelectorAll<HTMLElement>('[data-item-id]'))
          .find((element) => element.dataset.itemId === itemId);
        target?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }, 0);
    }

    function hasBlockingOverlay() {
      return Boolean(document.querySelector('.global-search-modal, .transfer-station-panel, .image-browser-panel, .floating-settings-panel, .modal-card, .edit-dialog, .menu-surface'));
    }

    async function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isSearchFocused = document.activeElement === searchRef.current;
      if (isSearchFocused) {
        if (shortcutMatchesEvent(shortcuts.closeOverlay, event)) {
          event.preventDefault();
          setQuery('');
          searchRef.current?.blur();
        }
        return;
      }
      if (target?.closest('input, textarea, select, [contenteditable="true"]') || hasBlockingOverlay()) return;

      if (shortcutMatchesEvent(shortcuts.focusPageSearch, event)) {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }

      if (
        experience.typeToSearch
        && !event.ctrlKey
        && !event.metaKey
        && !event.altKey
        && event.key.length === 1
        && !/\s/.test(event.key)
      ) {
        event.preventDefault();
        setQuery((current) => `${current}${event.key}`);
        searchRef.current?.focus();
        return;
      }

      if (!experience.keyboardNavigation || event.ctrlKey || event.metaKey || event.altKey) return;
      if (shortcutMatchesEvent(shortcuts.launchSelectedItem, event)) {
        const selected = filteredItems.find((item) => selectedItemIdSet.has(item.id));
        if (!selected) return;
        event.preventDefault();
        try {
          await launchShortcutItem(selected, false);
        } catch (error) {
          console.error(error);
          void uiAlert(`启动失败：${String(error)}`);
        }
        return;
      }

      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
      if (filteredItems.length === 0) return;
      event.preventDefault();
      const currentIndex = filteredItems.findIndex((item) => selectedItemIdSet.has(item.id));
      const nextIndex = nextKeyboardItemIndex(currentIndex, filteredItems.length, event.key);
      const nextItem = filteredItems[nextIndex];
      if (!nextItem) return;
      selectItem(nextItem.id, false);
      focusSelectedCard(nextItem.id);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [experience.keyboardNavigation, experience.typeToSearch, filteredItems, selectedItemIdSet, selectItem, shortcuts]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (
      display.sortMode !== 'custom' ||
      query.trim() ||
      isAllDirectory ||
      isStartMenuDirectory ||
      isMappedDirectory ||
      !over ||
      active.id === over.id
    ) return;
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    reorderItems(activeDirectory.id, arrayMove(ids, oldIndex, newIndex));
  }

  function renderGrid() {
    if (items.length === 0) {
      if (mirrorKind) {
        const label = isStartMenuDirectory ? '开始菜单' : '映射文件夹';
        // 映射子目录没选文件夹 / 读取失败时，提示「怎么办」而不是「没有项目」。
        const mappedHint = !mappedRoot
          ? '还没有选择要映射的文件夹：在左侧该子目录上右键 →「重新选择文件夹」'
          : mappedError
            ? `读取失败：${mappedError}`
            : '这个文件夹里还没有内容';
        return (
          <div className="empty-state">
            <Inbox size={38} />
            <div>{isStartMenuDirectory ? '开始菜单文件夹里还没有快捷方式' : '映射文件夹里还没有内容'}</div>
            {isMappedDirectory ? (
              <small>{mappedHint}</small>
            ) : experience.showEmptyGuide ? (
              <small>把应用、文件或文件夹拖到这里，就会在{label}里生成快捷方式</small>
            ) : null}
            <button
              type="button"
              className="btn-secondary btn-compact"
              onClick={() => void refreshMirror()}
              disabled={mirrorLoading || (isMappedDirectory && !mappedRoot)}
            >
              <RefreshCw size={13} /> {mirrorLoading ? '正在刷新…' : `刷新${label}`}
            </button>
          </div>
        );
      }
      return (
        <div className="empty-state">
          <Inbox size={38} />
          <div>{isAllDirectory ? '普通标签中还没有快捷项目' : '当前标签还没有项目'}</div>
          {experience.showEmptyGuide && (
            <small>
              {isAllDirectory
                ? '「全部」只集中显示普通标签，便签不会出现在这里'
                : '可拖入文件、文件夹、浏览器网页，或在空白处右键添加'}
            </small>
          )}
        </div>
      );
    }

    if (filteredItems.length === 0) {
      return (
        <div className="empty-state">
          <Search size={38} />
          <div>没有找到匹配项目</div>
          <small>可输入中文、完整拼音或首字母，例如 gz、wjj、llq</small>
        </div>
      );
    }

    const cards = filteredItems.map((item) => (
      <ItemCard
        key={item.id}
        item={item}
        selected={selectedItemIdSet.has(item.id)}
        display={display}
        behavior={behavior}
        transferStation={transferStation}
        onContextMenu={onContextMenuItem}
      />
    ));

    if (isAllDirectory || mirrorKind) return <div className="items-grid all-items-grid">{cards}</div>;

    return (
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={ids} strategy={rectSortingStrategy}>
          <div className="items-grid">{cards}</div>
        </SortableContext>
      </DndContext>
    );
  }

  return (
    <>
      {items.length > 0 && (
        <div className={`content-toolbar ${multiSelectMode ? 'multi-select-toolbar' : ''}`} onMouseDown={(event) => event.stopPropagation()}>
          <Search size={15} />
          <input
            ref={searchRef}
            value={query}
            placeholder={globalSearchSettings.placeholder?.trim() || (experience.searchIncludesPath ? `搜索名称、拼音、路径或网址（${formatShortcut(shortcuts.focusPageSearch) || "未设置快捷键"}）` : `搜索项目名称 / 拼音 / 首字母（${formatShortcut(shortcuts.focusPageSearch) || "未设置快捷键"}）`)}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <button className="toolbar-clear" onClick={() => setQuery('')} title="清除搜索">
              <X size={14} />
            </button>
          )}
          <span>{filteredItems.length}/{items.length}</span>
          {mirrorKind && (
            <button
              type="button"
              className="toolbar-clear"
              title={isStartMenuDirectory ? '重新扫描系统开始菜单文件夹' : `重新扫描 ${mappedRoot || '映射文件夹'}`}
              onClick={() => void refreshMirror()}
              disabled={mirrorLoading || (isMappedDirectory && !mappedRoot)}
            >
              <RefreshCw size={14} />
            </button>
          )}
          {multiSelectMode && (
            <button
              type="button"
              className="multi-select-finish"
              onClick={finishMultiSelect}
              title="完成多选并恢复项目原本的点击动作"
            >
              <CheckSquare size={13} />
              <strong>已选 {selectedItemIds.length}</strong>
              <em>完成</em>
            </button>
          )}
        </div>
      )}
      {renderGrid()}
    </>
  );
}

export function getContentAreaStyle(display: DisplaySettings, behavior: ReturnType<typeof useAppStore.getState>['behavior']) {
  const cardWidth = Math.max(
    display.itemWidth,
    display.viewMode === 'compact' ? display.iconSize + 28 : display.iconSize + 46,
  );
  const minHeight = Math.max(
    display.itemHeight,
    display.iconSize + display.labelLines * display.fontSize * 1.4 + 28,
  );
  return {
    '--item-card-width': `${cardWidth}px`,
    '--item-icon-size': `${display.iconSize}px`,
    '--item-icon-img-size': `${Math.max(28, display.iconSize - 6)}px`,
    '--item-card-min-height': `${minHeight}px`,
    '--items-gap': `${display.gridGap}px`,
    '--item-drag-bg': behavior.itemDragBackgroundColor || 'var(--accent)',
    '--item-drag-glow': behavior.itemDragGlowColor || 'var(--accent)',
    '--item-drag-glow-brightness': String(behavior.itemDragGlowBrightness ?? 0.72),
  } as CSSProperties;
}
