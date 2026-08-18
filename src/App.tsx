import { useCallback, useEffect, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react';
import { X } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { TopBar } from './components/TopBar/TopBar';
import { Sidebar } from './components/Sidebar/Sidebar';
import { ContentArea } from './components/ContentArea/ContentArea';
import { ItemContextMenu } from './components/ContextMenu/ItemContextMenu';
import { AreaContextMenu } from './components/ContextMenu/AreaContextMenu';
import { GroupContextMenu } from './components/ContextMenu/GroupContextMenu';
import { DirectoryContextMenu } from './components/ContextMenu/DirectoryContextMenu';
import { SettingsPanel } from './components/Settings/SettingsPanel';
import { DropImportDialog } from './components/DropImportDialog/DropImportDialog';
import { GlobalSearch } from './components/GlobalSearch/GlobalSearch';
import { TransferStation } from './components/TransferStation/TransferStation';
import { ImageBrowser } from './components/ImageBrowser/ImageBrowser';
import { useThemeInstaller } from './stores/themeStore';
import { useDragDrop } from './hooks/useDragDrop';
import { useStableEdgeDock } from './hooks/useStableEdgeDock';
import { useWindowDrag } from './hooks/useWindowDrag';
import { useWindowBoundsGuard } from './hooks/useWindowBoundsGuard';
import { useAutoSave } from './hooks/useAutoSave';
import { useCtrlWheelZoom } from './hooks/useCtrlWheelZoom';
import { useThemedFormControls } from './hooks/useThemedFormControls';
import type { ContextMenuState, Group } from './types';
import { useAppStore } from './stores/appStore';
import { UiDialogHost } from './components/UiDialog/UiDialogHost';
import { uiConfirm, uiPrompt } from './lib/uiDialog';
import { createUrlShortcut } from './lib/createShortcutItems';
import { buildOnlineFaviconUrl } from './lib/faviconProviders';
import { RainbowEffects } from './components/RainbowEffects/RainbowEffects';
import { BackgroundMediaLayer } from './components/BackgroundMedia/BackgroundMedia';
import { showLauncherNotice, type LauncherNoticeDetail } from './lib/notify';
import { getWindowPersistenceSettings } from './lib/windowPersistence';
import { shortcutMatchesEvent } from './lib/keyboardShortcuts';
import { cleanDroppedTitle, extractDroppedFilePaths, extractDroppedWebLinkAsync, getDropTypeSummary, getDroppedUrlShortcutFile, nameFromDroppedUrlFile, normalizeDroppedUrl, readDroppedUrlShortcutFile, shouldAcceptExternalDropCandidate } from './lib/browserDrop';
import './components/RainbowEffects/RainbowEffects.css';



async function resolveDroppedWebsiteIcon(url: string, saveLocal: boolean, providerId = 'auto', fallback = true) {
  if (saveLocal) {
    const localIcon = await invoke<string>('fetch_website_favicon', { url, providerId, fallback }).catch(() => '');
    if (localIcon) return localIcon;
  }
  return buildOnlineFaviconUrl(url, providerId as any);
}

async function resolveDroppedWebsiteTitle(url: string) {
  const title = await invoke<string>('fetch_website_title', { url }).catch(() => '');
  return cleanDroppedTitle(title || '', url);
}

type DropTargetSelection = { groupId: string; directoryId: string } | null;

function findFirstNormalDirectory(group?: Group): DropTargetSelection {
  if (!group) return null;
  const directory = group.directories.find((entry) => (entry.kind ?? 'normal') === 'normal');
  return directory ? { groupId: group.id, directoryId: directory.id } : null;
}

function findDropGroupId(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  return target.closest<HTMLElement>('[data-group-id]')?.dataset.groupId ?? null;
}

function App() {
  useThemeInstaller();
  useThemedFormControls();
  useAutoSave();
  useCtrlWheelZoom();
  const behavior = useAppStore((state) => state.behavior);
  useEffect(() => {
    void invoke('set_window_persistence_settings', {
      settings: getWindowPersistenceSettings(behavior),
    }).catch(() => undefined);
  }, [
    behavior.manualWindowStateEnabled,
    behavior.restoreWindowStateOnLaunch,
    behavior.saveWindowStateOnExit,
  ]);
  const display = useAppStore((state) => state.display);
  const groups = useAppStore((state) => state.groups);
  const rainbow = useAppStore((state) => state.rainbow);
  const experience = useAppStore((state) => state.experience);
  const globalSearchSettings = useAppStore((state) => state.globalSearch);
  const transferStationSettings = useAppStore((state) => state.transferStation);
  const imageBrowserSettings = useAppStore((state) => state.imageBrowser);
  const [edgeDockPausedUntil, setEdgeDockPausedUntil] = useState(0);
  const [edgeDockInteractiveHold, setEdgeDockInteractiveHold] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [dropPaths, setDropPaths] = useState<string[]>([]);
  const [dropImportTarget, setDropImportTarget] = useState<DropTargetSelection>(null);
  const [webDragHover, setWebDragHover] = useState(false);
  const [externalDropTargetGroupId, setExternalDropTargetGroupId] = useState<string | null>(null);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [transferStationOpen, setTransferStationOpen] = useState(false);
  const [imageBrowserOpen, setImageBrowserOpen] = useState(false);
  const [launcherNotice, setLauncherNotice] = useState<{ id: number; message: string; durationMs: number } | null>(null);
  const settingsOpen = useAppStore((state) => state.settingsOpen);
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen);
  const edgeDockPauseActive = edgeDockPausedUntil > Date.now();
  const transferStationActive = transferStationOpen && transferStationSettings.enabled !== false;
  const imageBrowserActive = imageBrowserOpen && imageBrowserSettings.enabled !== false;

  useEffect(() => {
    if (!globalSearchSettings.enabled) setGlobalSearchOpen(false);
  }, [globalSearchSettings.enabled]);

  useEffect(() => {
    if (!transferStationSettings.enabled) setTransferStationOpen(false);
  }, [transferStationSettings.enabled]);

  useEffect(() => {
    if (!imageBrowserSettings.enabled) setImageBrowserOpen(false);
  }, [imageBrowserSettings.enabled]);


  useEffect(() => {
    let timeoutId = 0;
    function handleNotice(event: Event) {
      const detail = (event as CustomEvent<LauncherNoticeDetail | string>).detail;
      const message = typeof detail === 'string' ? detail : detail?.message;
      if (!message) return;
      const durationMs = Math.max(500, Math.min(10000, typeof detail === 'string' ? (display.toastDurationMs ?? 2400) : (detail.durationMs ?? display.toastDurationMs ?? 2400)));
      window.clearTimeout(timeoutId);
      setLauncherNotice({ id: Date.now(), message, durationMs });
      timeoutId = window.setTimeout(() => setLauncherNotice(null), durationMs);
    }
    window.addEventListener('launcher-show-notice', handleNotice);
    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener('launcher-show-notice', handleNotice);
    };
  }, [display.toastDurationMs]);

  useEffect(() => {
    if (!edgeDockPauseActive) return;
    const timeout = window.setTimeout(() => setEdgeDockPausedUntil(0), Math.max(80, edgeDockPausedUntil - Date.now()));
    return () => window.clearTimeout(timeout);
  }, [edgeDockPauseActive, edgeDockPausedUntil]);

  function pauseEdgeDockAfterOverlayClose(ms = 1800) {
    // 关闭搜索/中转站等浮层时，先让 Rust 原生贴边控制器立即暂停。
    // 否则 React 状态还没来得及重新配置 native loop，就可能被判定为“鼠标离开主界面”并马上缩回。
    void invoke('edge_native_suspend', { ms }).catch(() => undefined);
    setEdgeDockPausedUntil(Date.now() + ms);
    setEdgeDockInteractiveHold(true);
  }

  useStableEdgeDock({
    enabled: behavior.edgeAutoHide || behavior.autoEdgeHide || behavior.autoEdgeSnapBack,
    dockAutoHide: behavior.edgeAutoHide,
    hideDelayMs: behavior.edgeHideDelaySeconds <= 0.05 ? 0 : Math.round(behavior.edgeHideDelaySeconds * 1000),
    paused: edgeDockPauseActive || edgeDockInteractiveHold || settingsOpen || Boolean(contextMenu) || dropPaths.length > 0 || globalSearchOpen || transferStationActive || imageBrowserActive,
    stripSize: behavior.edgeStripSize ?? 10,
    edgeTolerance: 24,
    animationMs: behavior.edgeAnimationMs ?? 90,
    animationStyle: behavior.edgeAnimationStyle ?? 'animate-window',
    autoEdgeHide: (behavior.autoEdgeHide ?? true) || (behavior.autoEdgeSnapBack ?? false),
    autoEdgeBounce: behavior.autoEdgeBounce ?? true,
    autoEdgeSnapBack: behavior.autoEdgeSnapBack ?? false,
    autoEdgeSnapBackAnimation: behavior.autoEdgeSnapBackAnimation ?? true,
    autoEdgeSnapBackAnimationMs: behavior.autoEdgeSnapBackAnimationMs ?? 220,
    autoEdgeHideDelay: behavior.autoEdgeHideDelay ?? 1000,
    edgeVisiblePixels: behavior.edgeVisiblePixels ?? 5,
    ghostFrameFix: behavior.edgeGhostFrameFix ?? true,
    mouseLeaveHideMs: behavior.edgeMouseLeaveHideMs ?? behavior.edgeAnimationMs ?? 90,
    useMainWindowStrip: behavior.edgeUseMainWindowStrip ?? true
  });

  useEffect(() => {
    void invoke('set_close_behavior', { closeToTray: behavior.closeAction !== 'exit' }).catch(() => undefined);
  }, [behavior.closeAction]);
  useWindowBoundsGuard(behavior.autoEdgeSnapBack === true, behavior.autoEdgeSnapBackAnimation !== false, behavior.autoEdgeSnapBackAnimationMs ?? 220);
  const startWindowDrag = useWindowDrag();
  const handleDroppedWebLink = useCallback(async (link: { url: string; name?: string }, preferredTarget?: DropTargetSelection) => {
    if (transferStationActive || imageBrowserActive) return;
    const state = useAppStore.getState();
    const activeGroup = state.getActiveGroup();
    const activeDirectory = state.getActiveDirectory();
    const resolvedTarget = (() => {
      if (preferredTarget?.groupId && preferredTarget?.directoryId) return preferredTarget;
      if (activeGroup && activeDirectory && (activeDirectory.kind ?? 'normal') === 'normal') {
        return { groupId: activeGroup.id, directoryId: activeDirectory.id };
      }
      return findFirstNormalDirectory(activeGroup);
    })();
    if (!resolvedTarget) {
      showLauncherNotice('当前没有可添加网址的普通子目录');
      return;
    }

    const droppedName = cleanDroppedTitle(link.name || '', link.url);
    const draft = createUrlShortcut(link.url, droppedName);
    const shouldPromptRename = state.behavior.promptRenameDroppedWebsite !== false;
    let finalName = draft.name;

    const iconPromise = resolveDroppedWebsiteIcon(
      link.url,
      state.display.autoSaveWebsiteIcon !== false,
      state.display.faviconProvider ?? 'auto',
      state.display.faviconProviderFallback !== false,
    );

    if (shouldPromptRename) {
      const requestedName = await uiPrompt('输入拖入网站的显示名称。取消会保留当前名称。', draft.name, '重命名网站');
      if (requestedName?.trim()) finalName = requestedName.trim().slice(0, 120);
    }

    const item = { ...draft, name: finalName };
    state.addItems(resolvedTarget.groupId, resolvedTarget.directoryId, [item]);
    showLauncherNotice(`已添加网站：${item.name}`);

    const [icon, fetchedTitle] = await Promise.all([
      iconPromise,
      shouldPromptRename || droppedName ? Promise.resolve('') : resolveDroppedWebsiteTitle(link.url),
    ]);
    const patch: Record<string, string> = {};
    if (icon) patch.icon = icon;
    if (fetchedTitle) patch.name = fetchedTitle;
    if (Object.keys(patch).length) useAppStore.getState().updateItem(item.id, patch);
  }, [transferStationActive, imageBrowserActive]);

  const handleDropPaths = useCallback((paths: string[], preferredTarget?: DropTargetSelection) => {
    // 文件中转站/图片浏览器打开时，外部拖入只进入对应面板，不再同时弹出“添加快捷项目”。
    if (transferStationActive || imageBrowserActive) return;
    if (!paths.length) return;

    void (async () => {
      const filePaths: string[] = [];
      for (const path of paths) {
        if (/\.(url|website)$/i.test(path.trim())) {
          const resolvedUrl = await invoke<string>('read_url_shortcut', { path }).catch(() => '');
          const normalizedUrl = normalizeDroppedUrl(resolvedUrl || '');
          if (normalizedUrl) {
            await handleDroppedWebLink({ url: normalizedUrl, name: nameFromDroppedUrlFile(path, normalizedUrl) }, preferredTarget);
            continue;
          }
        }
        filePaths.push(path);
      }
      if (filePaths.length) {
        setDropImportTarget(preferredTarget ?? null);
        setDropPaths(filePaths);
      }
    })();
  }, [transferStationActive, imageBrowserActive, handleDroppedWebLink]);

  const { dragHover } = useDragDrop(handleDropPaths, !transferStationActive && !imageBrowserActive);

  useEffect(() => {
    function maybeAcceptExternalDrag(event: DragEvent) {
      if (transferStationActive || imageBrowserActive) return false;
      // Do not require a recognizable MIME type during dragover. Firefox/Floorp can keep
      // external drag data protected until drop; refusing dragover here prevents WebView2
      // from delivering drop at all. Validate the actual payload inside handleExternalDrop.
      return shouldAcceptExternalDropCandidate(event.dataTransfer);
    }

    function resolvePreferredTarget(target: EventTarget | null): DropTargetSelection {
      const groupId = findDropGroupId(target);
      if (!groupId) return null;
      const state = useAppStore.getState();
      const group = state.groups.find((entry) => entry.id === groupId);
      const existing = findFirstNormalDirectory(group);
      if (existing) return existing;
      if (!group) return null;
      const directoryId = state.addDirectory(group.id, '常用', 'normal');
      showLauncherNotice(`已为「${group.name}」新建普通子目录“常用”`);
      return { groupId: group.id, directoryId };
    }

    function handleExternalDragEnter(event: DragEvent) {
      if (!maybeAcceptExternalDrag(event)) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      setWebDragHover(true);
      setExternalDropTargetGroupId(findDropGroupId(event.target));
    }

    function handleExternalDragOver(event: DragEvent) {
      if (!maybeAcceptExternalDrag(event)) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      setWebDragHover(true);
      setExternalDropTargetGroupId(findDropGroupId(event.target));
    }

    function handleExternalDragLeave(event: DragEvent) {
      const related = event.relatedTarget as Node | null;
      if (related && document.documentElement.contains(related)) return;
      setWebDragHover(false);
      setExternalDropTargetGroupId(null);
    }

    async function handleExternalDrop(event: DragEvent) {
      const dataTransfer = event.dataTransfer;
      if (!dataTransfer || !shouldAcceptExternalDropCandidate(dataTransfer)) {
        setWebDragHover(false);
        setExternalDropTargetGroupId(null);
        return;
      }

      // preventDefault must happen synchronously. This is especially important for Gecko
      // drags whose type list was empty/partial during dragover.
      event.preventDefault();
      event.stopPropagation();

      const typeSummary = getDropTypeSummary(dataTransfer);
      const urlShortcutFile = getDroppedUrlShortcutFile(dataTransfer);
      const files = extractDroppedFilePaths(dataTransfer);
      const target = event.target;
      const link = await extractDroppedWebLinkAsync(dataTransfer);

      setWebDragHover(false);
      setExternalDropTargetGroupId(null);

      if (!link && !urlShortcutFile && !files.length) {
        console.warn('[browser-drop] unrecognized external drop', { types: typeSummary });
        if (/x-moz-tabbrowser-tab/i.test(typeSummary)) {
          showLauncherNotice('检测到 Firefox/Floorp 标签页内部拖拽，但浏览器没有向外部应用提供网址。请从地址栏左侧站点图标、地址栏网址或网页链接拖入。');
        } else {
          showLauncherNotice(typeSummary
            ? `浏览器拖拽已到达应用，但没有可读取的网址数据（${typeSummary}）`
            : '浏览器拖拽已到达应用，但浏览器没有暴露可读取的网址数据');
        }
        return;
      }

      const preferredTarget = resolvePreferredTarget(target);
      if (link) {
        void handleDroppedWebLink(link, preferredTarget);
        return;
      }
      if (urlShortcutFile) {
        // Firefox / Floorp / Waterfox 等在 Windows 上有时会把网址作为虚拟
        // Internet Shortcut 文件交给目标程序。优先直接读 File 内容；若 WebView
        // 没有暴露虚拟文件内容，再回退到已有路径处理。
        void readDroppedUrlShortcutFile(urlShortcutFile).then((fileLink) => {
          if (fileLink) {
            void handleDroppedWebLink(fileLink, preferredTarget);
            return;
          }
          if (files.length) handleDropPaths(files, preferredTarget);
        });
        return;
      }
      if (files.length) handleDropPaths(files, preferredTarget);
    }


    window.addEventListener('dragenter', handleExternalDragEnter, { capture: true });
    window.addEventListener('dragover', handleExternalDragOver, { capture: true });
    window.addEventListener('dragleave', handleExternalDragLeave, { capture: true });
    window.addEventListener('drop', handleExternalDrop, { capture: true });
    document.addEventListener('dragenter', handleExternalDragEnter, { capture: true });
    document.addEventListener('dragover', handleExternalDragOver, { capture: true });
    document.addEventListener('dragleave', handleExternalDragLeave, { capture: true });
    document.addEventListener('drop', handleExternalDrop, { capture: true });
    return () => {
      window.removeEventListener('dragenter', handleExternalDragEnter, { capture: true });
      window.removeEventListener('dragover', handleExternalDragOver, { capture: true });
      window.removeEventListener('dragleave', handleExternalDragLeave, { capture: true });
      window.removeEventListener('drop', handleExternalDrop, { capture: true });
      document.removeEventListener('dragenter', handleExternalDragEnter, { capture: true });
      document.removeEventListener('dragover', handleExternalDragOver, { capture: true });
      document.removeEventListener('dragleave', handleExternalDragLeave, { capture: true });
      document.removeEventListener('drop', handleExternalDrop, { capture: true });
    };
  }, [handleDroppedWebLink, handleDropPaths, transferStationActive, imageBrowserActive]);

  useEffect(() => {
    function preventBrowserContextMenu(event: MouseEvent) {
      event.preventDefault();
    }
    document.addEventListener('contextmenu', preventBrowserContextMenu, { capture: true });
    return () => document.removeEventListener('contextmenu', preventBrowserContextMenu, { capture: true });
  }, []);


  useEffect(() => {
    function isEditableTarget(target: EventTarget | null) {
      const element = target as HTMLElement | null;
      if (!element) return false;
      return Boolean(element.closest('input, textarea, select, [contenteditable="true"], .edit-dialog, .modal-card, .menu-surface'));
    }

    function visibleItemIds() {
      const state = useAppStore.getState();
      const activeDirectory = state.getActiveDirectory();
      const activeGroup = state.getActiveGroup();
      if (!activeDirectory) return [];
      if ((activeDirectory.kind ?? 'normal') === 'all') {
        return (activeGroup?.directories ?? [])
          .filter((dir) => (dir.kind ?? 'normal') === 'normal')
          .flatMap((dir) => dir.items.map((item) => item.id));
      }
      if ((activeDirectory.kind ?? 'normal') !== 'normal') return [];
      return activeDirectory.items.map((item) => item.id);
    }

    async function handleKeyDown(event: KeyboardEvent) {
      const state = useAppStore.getState();
      const shortcuts = state.shortcuts;

      if (shortcutMatchesEvent(shortcuts.closeOverlay, event)) {
        if (globalSearchOpen || transferStationActive || imageBrowserActive || settingsOpen) {
          event.preventDefault();
          if (globalSearchOpen) setGlobalSearchOpen(false);
          else if (transferStationActive) setTransferStationOpen(false);
          else if (imageBrowserActive) setImageBrowserOpen(false);
          else if (settingsOpen) setSettingsOpen(false);
          pauseEdgeDockAfterOverlayClose(900);
          return;
        }
      }

      if (isEditableTarget(event.target)) return;

      if (shortcutMatchesEvent(shortcuts.openSettings, event)) {
        event.preventDefault();
        setSettingsOpen(true);
        return;
      }
      if (shortcutMatchesEvent(shortcuts.openGlobalSearch, event)) {
        event.preventDefault();
        if (state.globalSearch.enabled) setGlobalSearchOpen(true);
        else showLauncherNotice('全局搜索已在“设置 → 搜索”中关闭');
        return;
      }
      if (shortcutMatchesEvent(shortcuts.openTransferStation, event)) {
        event.preventDefault();
        if (state.transferStation.enabled !== false) setTransferStationOpen(true);
        else showLauncherNotice('文件中转站已在“设置 → 文件中转”中关闭');
        return;
      }
      if (shortcutMatchesEvent(shortcuts.openImageBrowser, event)) {
        event.preventDefault();
        if (state.imageBrowser.enabled !== false) setImageBrowserOpen(true);
        else showLauncherNotice('图片浏览器已在“设置 → 图片预览”中关闭');
        return;
      }
      if (shortcutMatchesEvent(shortcuts.toggleAlwaysOnTop, event)) {
        event.preventDefault();
        state.updateBehavior({ alwaysOnTop: !state.behavior.alwaysOnTop });
        return;
      }
      if (shortcutMatchesEvent(shortcuts.selectAllItems, event)) {
        const ids = visibleItemIds();
        if (ids.length) {
          event.preventDefault();
          state.selectItems(ids);
        }
        return;
      }
      if (!shortcutMatchesEvent(shortcuts.deleteSelection, event)) return;

      if (state.selectedItemIds.length > 0) {
        event.preventDefault();
        if (!state.experience.confirmDeleteItems || await uiConfirm(`确定删除选中的 ${state.selectedItemIds.length} 个项目吗？`)) {
          state.deleteSelectedItems();
        }
        return;
      }

      const selectedNavTarget = state.selectedNavTarget;
      if (selectedNavTarget?.kind === 'group') {
        const group = state.groups.find((entry) => entry.id === selectedNavTarget.id);
        if (group && state.groups.length > 1) {
          event.preventDefault();
          if (!state.experience.confirmDeleteNavigation || await uiConfirm(`确定删除父目录「${group.name}」及其中所有子目录吗？`)) {
            state.deleteGroup(group.id);
          }
        }
        return;
      }

      if (selectedNavTarget?.kind === 'directory') {
        const parentGroup = state.groups.find((entry) => entry.directories.some((dir) => dir.id === selectedNavTarget.id));
        const directory = parentGroup?.directories.find((dir) => dir.id === selectedNavTarget.id);
        if (directory && parentGroup && parentGroup.directories.length > 1) {
          event.preventDefault();
          if (!state.experience.confirmDeleteNavigation || await uiConfirm(`确定删除子目录「${directory.name}」吗？`)) {
            state.deleteDirectory(directory.id);
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [globalSearchOpen, transferStationActive, imageBrowserActive, settingsOpen, setSettingsOpen]);

  const customFontFamily = display.fontFamily?.trim() || 'var(--font-family)';
  const fontApplyAreas = new Set(display.fontApplyAreas ?? []);
  const externalDropTargetGroupName = groups.find((group) => group.id === externalDropTargetGroupId)?.name;

  const shellStyle = {
    '--main-font-family': fontApplyAreas.has('main') ? customFontFamily : 'var(--font-family)',
    '--settings-font-family': fontApplyAreas.has('settings') ? customFontFamily : 'var(--font-family)',
    '--menu-font-family': fontApplyAreas.has('menus') ? customFontFamily : 'var(--font-family)',
    '--note-font-family': fontApplyAreas.has('notes') ? customFontFamily : 'var(--font-family)',
    '--menu-font-size': `${display.menuFontSize}px`,
    '--menu-item-height': `${display.menuItemHeight}px`,
    '--menu-min-width': `${display.menuMinWidth}px`,
    '--top-tab-width': `${display.topTabWidth}px`,
    '--top-tab-height': `${display.topTabHeight ?? 32}px`,
    '--top-tab-gap': `${display.topTabGap ?? 8}px`,
    '--top-tab-font-size': `${display.topTabFontSize ?? 14}px`,
    '--top-tab-border-width': `${display.topTabBorderWidth ?? 1}px`,
    '--top-tab-color-strength': `${Math.round((display.topTabColorStrength ?? 0.17) * 100)}%`,
    '--top-tab-hover-color-strength': `${Math.min(70, Math.round((display.topTabColorStrength ?? 0.17) * 100) + 8)}%`,
    '--top-tab-radius': display.topTabShape === 'square' ? '8px' : '999px',
    '--sidebar-width': `${display.sidebarWidth}px`,
    '--sidebar-item-height': `${display.sidebarItemHeight}px`,
    '--sidebar-item-gap': `${display.sidebarItemGap}px`,
    '--sidebar-font-size': `${display.sidebarFontSize}px`,
    '--sidebar-item-radius': `${display.sidebarItemRadius}px`,
    '--main-ui-scale': String(display.mainUiScale ?? display.uiScale ?? 1),
    '--settings-ui-scale': String(display.settingsUiScale ?? display.uiScale ?? 1),
    '--ui-scale': String(display.mainUiScale ?? display.uiScale ?? 1),
    '--scrollbar-size': `${display.scrollbarSize ?? 12}px`,
    '--scrollbar-radius': `${display.scrollbarRadius ?? 999}px`,
    '--scrollbar-thumb-color': display.scrollbarUseThemeColor === false ? (display.scrollbarThumbColor || '#8A8F98') : 'var(--accent)',
    '--scrollbar-thumb-hover-color': display.scrollbarUseThemeColor === false ? (display.scrollbarThumbHoverColor || display.scrollbarThumbColor || '#5B8DEF') : 'var(--accent)',
    '--scrollbar-track-color': display.scrollbarTrackColor || 'rgba(0, 0, 0, 0.08)',
    '--window-control-size': `${display.windowControlSize ?? 34}px`,
    '--window-control-gap': `${display.windowControlGap ?? 8}px`,
    '--edge-strip-size': `${behavior.edgeStripSize ?? 10}px`,
    '--edge-strip-opacity': String(behavior.edgeStripOpacity ?? 0.88),
    '--edge-strip-color': behavior.edgeStripUseThemeColor ? 'var(--accent)' : (behavior.edgeStripColor || 'var(--accent)'),
    '--launcher-panel-alpha': `${Math.round((display.backgroundPanelOpacity ?? 0.86) * 100)}%`,
    '--settings-panel-alpha': `${Math.round((display.settingsBackgroundPanelOpacity ?? 0.9) * 100)}%`,
    '--settings-glass-blur': `${display.settingsBackgroundGlassBlur ?? 22}px`,
    '--settings-glass-saturation': String(display.settingsBackgroundGlassSaturation ?? 1.32),
    '--settings-glass-highlight-alpha': String(display.settingsBackgroundGlassHighlight ?? 0.72),
    '--rainbow-border-colors': rainbow.borderColors.join(', '),
    '--rainbow-text-colors': rainbow.textColors.join(', '),
    '--rainbow-border-gradient': `linear-gradient(90deg, ${rainbow.borderColors.join(', ')})`,
    '--rainbow-text-gradient': `linear-gradient(90deg, ${rainbow.textColors.join(', ')})`,
    '--rainbow-border-speed': `${rainbow.borderSpeedSeconds}s`,
    '--rainbow-text-speed': `${rainbow.textSpeedSeconds}s`,
    '--rainbow-border-width': `${rainbow.borderWidth}px`,
    '--rainbow-border-brightness': String(rainbow.borderBrightness)
  } as CSSProperties;

  function handleShellContextMenu(event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault();
    const target = event.target as HTMLElement;
    if (target.closest('.menu-surface, .modal-card, .edit-dialog, input, textarea, select')) return;
    if (target.closest('.top-tab, .side-tab, .item-card, .icon-button')) return;

    const state = useAppStore.getState();
    if (target.closest('.topbar')) {
      const groupId = state.activeGroupId || state.groups[0]?.id;
      if (groupId) setContextMenu({ kind: 'group', groupId, x: event.clientX, y: event.clientY });
      return;
    }
    if (target.closest('.sidebar')) {
      setContextMenu({ kind: 'area', x: event.clientX, y: event.clientY });
      return;
    }
    setContextMenu({ kind: 'area', x: event.clientX, y: event.clientY });
  }

  const openGlobalSearch = useCallback(() => {
    if (globalSearchSettings.enabled) setGlobalSearchOpen(true);
    else showLauncherNotice('全局搜索已在“设置 → 搜索”中关闭');
  }, [globalSearchSettings.enabled]);
  const openTransferStation = useCallback(() => {
    if (transferStationSettings.enabled !== false) setTransferStationOpen(true);
    else showLauncherNotice('文件中转站已在“设置 → 文件中转”中关闭');
  }, [transferStationSettings.enabled]);
  const openImageBrowser = useCallback(() => {
    if (imageBrowserSettings.enabled !== false) setImageBrowserOpen(true);
    else showLauncherNotice('图片浏览器已在“设置 → 图片预览”中关闭');
  }, [imageBrowserSettings.enabled]);
  const openGroupContextMenu = useCallback((groupId: string, x: number, y: number) => {
    setContextMenu({ kind: 'group', groupId, x, y });
  }, []);
  const openDirectoryContextMenu = useCallback((directoryId: string, x: number, y: number) => {
    setContextMenu({ kind: 'directory', directoryId, x, y });
  }, []);
  const openItemContextMenu = useCallback((itemId: string, x: number, y: number) => {
    setContextMenu({ kind: 'item', itemId, x, y });
  }, []);
  const openAreaContextMenu = useCallback((x: number, y: number) => {
    setContextMenu({ kind: 'area', x, y });
  }, []);

  function closeFloatingPanelsFromMainClick(target: HTMLElement) {
    if (!globalSearchOpen && !transferStationActive && !imageBrowserActive && !settingsOpen) return false;

    // 点击浮层自身、菜单、弹窗、输入控件时不关闭；只有点击主界面空白/内容区域才关闭。
    if (target.closest('.global-search-modal, .transfer-station-panel, .image-browser-panel, .floating-settings-panel, .modal-card, .menu-surface, .edit-dialog, input, textarea, select')) {
      return false;
    }

    if (globalSearchOpen) setGlobalSearchOpen(false);
    if (transferStationActive) setTransferStationOpen(false);
    if (imageBrowserActive) setImageBrowserOpen(false);
    if (settingsOpen) setSettingsOpen(false);
    pauseEdgeDockAfterOverlayClose(900);
    return true;
  }

  return (
    <div
      className={`app-shell ${display.backgroundEnabled && display.backgroundImage ? 'app-background-enabled' : ''} ${display.settingsBackgroundEnabled && display.settingsBackgroundImage ? 'settings-background-enabled' : ''} ${display.settingsBackgroundGlassEffect ? 'settings-glass-enabled' : ''} ${experience.reduceMotion ? 'reduce-motion' : ''} ${experience.itemHoverAnimation ? '' : 'no-item-hover'} ${rainbow.enabled ? 'rainbow-enabled' : ''} ${rainbow.enabled && rainbow.borderEnabled ? `rainbow-border rainbow-border-${rainbow.borderMode}` : ''} ${rainbow.enabled && rainbow.textEnabled && rainbow.textOnGroups ? 'rainbow-text-groups' : ''} ${rainbow.enabled && rainbow.textEnabled && rainbow.textOnDirectories ? 'rainbow-text-directories' : ''} ${rainbow.enabled && rainbow.textEnabled && rainbow.textOnSettings ? 'rainbow-text-settings' : ''} ${rainbow.enabled && rainbow.cursorEnabled ? 'rainbow-cursor-enabled' : ''} ${experience.compactContextMenus ? 'compact-context-menus' : ''} ${experience.showContextMenuIcons ? '' : 'hide-context-menu-icons'}` }
      style={shellStyle}
      onMouseDown={(event) => {
        setContextMenu(null);
        const target = event.target as HTMLElement;
        if (closeFloatingPanelsFromMainClick(target)) {
          event.stopPropagation();
          return;
        }
        startWindowDrag(event);
      }}
      onMouseLeave={() => {
        if (edgeDockInteractiveHold) {
          setEdgeDockInteractiveHold(false);
          setEdgeDockPausedUntil(Date.now() + 350);
        }
      }}
      onContextMenu={handleShellContextMenu}
    >
      <BackgroundMediaLayer
        className="app-background-layer"
        enabled={display.backgroundEnabled}
        source={display.backgroundImage}
        mediaKind={display.backgroundMediaKind}
        fit={display.backgroundFit}
        positionX={display.backgroundPositionX ?? 50}
        positionY={display.backgroundPositionY ?? 50}
        opacity={display.backgroundOpacity ?? 0.62}
        dim={display.backgroundDim ?? 0.18}
        blur={display.backgroundBlur ?? 0}
        motionEnabled={display.backgroundMotionEnabled !== false && !settingsOpen}
        playbackRate={display.backgroundPlaybackRate ?? 1}
        pauseWhenHidden={display.backgroundPauseWhenHidden !== false}
        containAmbient={display.backgroundContainAmbient !== false}
        reduceMotion={experience.reduceMotion}
      />
      <div className="app-main-layer">
        <TopBar
          onContextMenuGroup={openGroupContextMenu}
          onOpenGlobalSearch={openGlobalSearch}
          onOpenTransferStation={openTransferStation}
          onOpenImageBrowser={openImageBrowser}
          externalDropTargetGroupId={externalDropTargetGroupId}
        />
        <div className="main-layout">
          <Sidebar
            onContextMenuDirectory={openDirectoryContextMenu}
            onContextMenuArea={openAreaContextMenu}
          />
          <ContentArea
            onContextMenuItem={openItemContextMenu}
            onContextMenuArea={openAreaContextMenu}
          />
        </div>
        {(dragHover || webDragHover) && (
          <div className="drag-overlay">
            {externalDropTargetGroupName ? `松开鼠标添加到「${externalDropTargetGroupName}」` : '松开鼠标添加到启动器'}
          </div>
        )}
        {launcherNotice && (
          <div
            key={launcherNotice.id}
            className="special-tag-notice"
            role="status"
            style={{ '--notice-duration': `${launcherNotice.durationMs}ms` } as CSSProperties}
            title={launcherNotice.message}
          >
            <span className="special-tag-notice-text">{launcherNotice.message}</span>
            <button type="button" aria-label="关闭提示" title="关闭提示" onClick={() => setLauncherNotice(null)}><X size={13} /></button>
            <span className="special-tag-notice-progress" aria-hidden="true" />
          </div>
        )}
        {contextMenu?.kind === 'item' && <ItemContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} />}
        {contextMenu?.kind === 'area' && <AreaContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} />}
        {contextMenu?.kind === 'group' && <GroupContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} />}
        {contextMenu?.kind === 'directory' && <DirectoryContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} />}
        {dropPaths.length > 0 && (
          <DropImportDialog
            paths={dropPaths}
            initialGroupId={dropImportTarget?.groupId}
            initialDirectoryId={dropImportTarget?.directoryId}
            onClose={() => {
              setDropPaths([]);
              setDropImportTarget(null);
            }}
          />
        )}
        {globalSearchOpen && <GlobalSearch open onClose={() => { pauseEdgeDockAfterOverlayClose(); setGlobalSearchOpen(false); }} />}
        <TransferStation open={transferStationActive} onClose={() => { pauseEdgeDockAfterOverlayClose(); setTransferStationOpen(false); }} />
        <ImageBrowser open={imageBrowserActive} onClose={() => { pauseEdgeDockAfterOverlayClose(); setImageBrowserOpen(false); }} />
      </div>
      <SettingsPanel />
      <UiDialogHost />
      <RainbowEffects rainbow={rainbow} />
    </div>
  );
}

export default App;
