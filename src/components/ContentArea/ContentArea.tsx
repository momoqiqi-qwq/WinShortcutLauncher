import { useEffect, useMemo, type MouseEvent } from 'react';
import { getEffectiveDisplay, useAppStore } from '../../stores/appStore';
import { isStartMenuDirectory } from '../../lib/startMenu';
import { getMappedPath, isMappedDirectory } from '../../lib/mappedFolder';
import { getHtmlPath, isHtmlDirectory } from '../../lib/htmlFolder';
import type { MirrorKind } from '../../lib/folderMirror';
import { NoteEditor } from './NoteEditor/NoteEditor';
import { HtmlGallery } from './HtmlGallery/HtmlGallery';
import { ShortcutGrid, getContentAreaStyle } from './ShortcutGrid/ShortcutGrid';

interface ContentAreaProps {
  onContextMenuItem: (itemId: string, x: number, y: number) => void;
  onContextMenuArea: (x: number, y: number) => void;
  /** v175: HTML 目录里的单张卡片右键。 */
  onContextMenuHtmlPage: (directoryId: string, pagePath: string, x: number, y: number) => void;
}

export function ContentArea({ onContextMenuItem, onContextMenuArea, onContextMenuHtmlPage }: ContentAreaProps) {
  const activeGroup = useAppStore((state) => state.getActiveGroup());
  const activeDirectory = useAppStore((state) => state.getActiveDirectory());
  const behavior = useAppStore((state) => state.behavior);
  const globalDisplay = useAppStore((state) => state.display);
  const clearSelection = useAppStore((state) => state.clearSelection);
  const multiSelectMode = useAppStore((state) => state.multiSelectMode);
  const setSelectedNavTarget = useAppStore((state) => state.setSelectedNavTarget);
  const display = useMemo(
    () => getEffectiveDisplay(globalDisplay, activeDirectory),
    [globalDisplay, activeDirectory],
  );
  const isAllDirectory = (activeDirectory?.kind ?? 'normal') === 'all';
  const isNotesDirectory = activeDirectory?.kind === 'notes';
  const isStartMenu = isStartMenuDirectory(activeDirectory);
  const isMapped = isMappedDirectory(activeDirectory);
  const mappedPath = isMapped ? getMappedPath(activeDirectory) : '';
  const isHtml = isHtmlDirectory(activeDirectory);
  const htmlPath = isHtml ? getHtmlPath(activeDirectory) : '';
  const activeDirectoryId = activeDirectory?.id;
  const refreshStartMenu = useAppStore((state) => state.refreshStartMenu);
  const refreshMappedFolder = useAppStore((state) => state.refreshMappedFolder);
  const refreshHtmlFolder = useAppStore((state) => state.refreshHtmlFolder);
  const areaStyle = useMemo(() => getContentAreaStyle(display, behavior), [display, behavior]);
  // 镜像子目录的内容来自真实文件夹，渲染与交互都要走另一套分支。
  const mirrorKind: MirrorKind | null = isStartMenu ? 'startMenu' : isMapped ? 'mapped' : null;

  // 切到开始菜单子目录时重新扫描一次，保证看到的是系统文件夹的最新状态。
  useEffect(() => {
    if (!isStartMenu) return;
    void refreshStartMenu();
  }, [isStartMenu, activeDirectoryId, refreshStartMenu]);

  // 映射子目录同理；mappedPath 变化（重新选择文件夹）也要重扫。
  useEffect(() => {
    if (!isMapped || !activeDirectoryId) return;
    void refreshMappedFolder(activeDirectoryId);
  }, [isMapped, activeDirectoryId, mappedPath, refreshMappedFolder]);

  // v173: HTML 子目录切进来就扫一次（顺手把根目录加进 asset 协议作用域，
  // 否则卡片里的预览 iframe 会白屏）。
  useEffect(() => {
    if (!isHtml || !activeDirectoryId) return;
    void refreshHtmlFolder(activeDirectoryId);
  }, [isHtml, activeDirectoryId, htmlPath, refreshHtmlFolder]);

  function openAreaMenu(event: MouseEvent<HTMLElement>) {
    const target = event.target as HTMLElement;
    if (target.closest('.item-card') || target.closest('.html-card') || target.closest('.notes-textarea')) return;
    event.preventDefault();
    if (!multiSelectMode) clearSelection();
    onContextMenuArea(event.clientX, event.clientY);
  }

  if (!activeDirectory) {
    return <main className="content-area" style={areaStyle} />;
  }

  return (
    <main
      className={`content-area ${isNotesDirectory ? 'notes-area' : ''} ${multiSelectMode ? 'multi-select-active' : ''}`}
      style={areaStyle}
      // v150: 便签区域也挂目录 id，拖进来的文字/网址才知道往哪个便签里落。
      data-directory-id={isNotesDirectory ? activeDirectory.id : undefined}
      onMouseDown={(event) => {
        const target = event.target as HTMLElement;
        if (
          !target.closest('.item-card') &&
          !target.closest('.html-card') &&
          !target.closest('.menu-surface') &&
          !target.closest('.notes-textarea') &&
          !target.closest('.content-toolbar')
        ) {
          if (event.button !== 0) return;
          // 多选时左键点项目之间/周围的空白区域，立即退出多选并清空选择。
          // 阻止继续冒泡到 app-shell，避免这一下同时被识别成窗口拖动。
          if (multiSelectMode) event.stopPropagation();
          clearSelection();
          setSelectedNavTarget(null);
        }
      }}
      onContextMenu={openAreaMenu}
    >
      {isNotesDirectory ? (
        <NoteEditor directory={activeDirectory} />
      ) : isHtml ? (
        <HtmlGallery
          directory={activeDirectory}
          onContextMenuPage={(pagePath, x, y) => onContextMenuHtmlPage(activeDirectory.id, pagePath, x, y)}
        />
      ) : (
        <ShortcutGrid
          activeGroup={activeGroup}
          activeDirectory={activeDirectory}
          display={display}
          isAllDirectory={isAllDirectory}
          mirrorKind={mirrorKind}
          onContextMenuItem={onContextMenuItem}
        />
      )}
    </main>
  );
}
