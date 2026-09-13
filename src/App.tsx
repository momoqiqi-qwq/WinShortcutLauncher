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
import { useStableEdgeDock } from './hooks/useStableEdgeDock';
import { useWindowDrag } from './hooks/useWindowDrag';
import { useWindowBoundsGuard } from './hooks/useWindowBoundsGuard';
import { useAutoSave } from './hooks/useAutoSave';
import { useCtrlWheelZoom } from './hooks/useCtrlWheelZoom';
import { useThemedFormControls } from './hooks/useThemedFormControls';
import type { ContextMenuState } from './types';
import { useAppStore } from './stores/appStore';
import { UiDialogHost } from './components/UiDialog/UiDialogHost';
import { RainbowEffects } from './components/RainbowEffects/RainbowEffects';
import { BackgroundMediaLayer } from './components/BackgroundMedia/BackgroundMedia';
import { showLauncherNotice, type LauncherNoticeDetail } from './lib/notify';
import { getWindowPersistenceSettings } from './lib/windowPersistence';
import { getProcessIntegrityStatus } from './lib/processIntegrity';
import { useWebsiteDropController } from './hooks/useWebsiteDropController';
import { useGlobalShortcutRouter } from './hooks/useGlobalShortcutRouter';
import { useOverlayRouter } from './hooks/useOverlayRouter';
import './components/RainbowEffects/RainbowEffects.css';



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
  const [edgeDockPausedUntil, setEdgeDockPausedUntil] = useState(0);
  const [edgeDockInteractiveHold, setEdgeDockInteractiveHold] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [launcherNotice, setLauncherNotice] = useState<{ id: number; message: string; durationMs: number } | null>(null);
  const edgeDockPauseActive = edgeDockPausedUntil > Date.now();


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
    void getProcessIntegrityStatus().then((status) => {
      console.info('[integrity]', status);
      if (status.isAboveMedium) {
        showLauncherNotice(`Yue Launcher 当前仍在 ${status.level} Integrity 运行，高于标准 Medium；Floorp/Firefox/资源管理器拖入可能被 Windows UIPI 阻止。请确认没有强制“以管理员身份运行”，并检查 UAC。`, { durationMs: 9000 });
      } else if (!status.isMedium) {
        showLauncherNotice(`Yue Launcher 当前为 ${status.level} Integrity，不是推荐的标准 Medium；部分文件写入或跨进程交互可能受限。`, { durationMs: 8000 });
      }
    }).catch((error) => console.warn('[integrity] status query failed', error));
  }, []);

  useEffect(() => {
    if (!edgeDockPauseActive) return;
    const timeout = window.setTimeout(() => setEdgeDockPausedUntil(0), Math.max(80, edgeDockPausedUntil - Date.now()));
    return () => window.clearTimeout(timeout);
  }, [edgeDockPauseActive, edgeDockPausedUntil]);

  const pauseEdgeDockAfterOverlayClose = useCallback((ms = 1800) => {
    // 关闭搜索/中转站等浮层时，先让 Rust 原生贴边控制器立即暂停。
    void invoke('edge_native_suspend', { ms }).catch(() => undefined);
    setEdgeDockPausedUntil(Date.now() + ms);
    setEdgeDockInteractiveHold(true);
  }, []);

  const {
    globalSearchOpen, transferStationActive, imageBrowserActive, settingsOpen, setSettingsOpen,
    openGlobalSearch, openTransferStation, openImageBrowser, closeGlobalSearch, closeTransferStation,
    closeImageBrowser, closeTopOverlay, closeFloatingPanelsFromMainClick,
  } = useOverlayRouter({ pauseAfterClose: pauseEdgeDockAfterOverlayClose });

  const {
    dragHover, webDragHover, externalDropTargetGroupId, dropPaths, dropImportTarget, clearDropImport,
  } = useWebsiteDropController({ disabled: transferStationActive || imageBrowserActive });

  useGlobalShortcutRouter({
    closeTopOverlay,
    openGlobalSearch,
    openTransferStation,
    openImageBrowser,
    openSettings: () => setSettingsOpen(true),
  });

  useStableEdgeDock({
    enabled: behavior.edgeAutoHide || behavior.autoEdgeHide || behavior.autoEdgeSnapBack,
    dockAutoHide: behavior.edgeAutoHide,
    ignoreTaskbar: behavior.edgeIgnoreTaskbar ?? false,
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

  useEffect(() => {
    function preventBrowserContextMenu(event: MouseEvent) {
      event.preventDefault();
    }
    document.addEventListener('contextmenu', preventBrowserContextMenu, { capture: true });
    return () => document.removeEventListener('contextmenu', preventBrowserContextMenu, { capture: true });
  }, []);



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
    '--sidebar-item-lines': `${display.sidebarItemLines ?? 2}`,
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



  return (
    <div
      className={`app-shell ${display.modernWinUI3Mode ? 'winui3-modern-mode' : ''} ${display.backgroundEnabled && display.backgroundImage ? 'app-background-enabled' : ''} ${display.settingsBackgroundEnabled && display.settingsBackgroundImage ? 'settings-background-enabled' : ''} ${display.settingsBackgroundGlassEffect ? 'settings-glass-enabled' : ''} ${experience.reduceMotion ? 'reduce-motion' : ''} ${experience.itemHoverAnimation ? '' : 'no-item-hover'} ${rainbow.enabled ? 'rainbow-enabled' : ''} ${rainbow.enabled && rainbow.borderEnabled ? `rainbow-border rainbow-border-${rainbow.borderMode}` : ''} ${rainbow.enabled && rainbow.textEnabled && rainbow.textOnGroups ? 'rainbow-text-groups' : ''} ${rainbow.enabled && rainbow.textEnabled && rainbow.textOnDirectories ? 'rainbow-text-directories' : ''} ${rainbow.enabled && rainbow.textEnabled && rainbow.textOnSettings ? 'rainbow-text-settings' : ''} ${rainbow.enabled && rainbow.cursorEnabled ? 'rainbow-cursor-enabled' : ''} ${experience.compactContextMenus ? 'compact-context-menus' : ''} ${experience.showContextMenuIcons ? '' : 'hide-context-menu-icons'}` }
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
            onClose={clearDropImport}
          />
        )}
        <GlobalSearch open={globalSearchOpen} onClose={closeGlobalSearch} />
        <TransferStation open={transferStationActive} onClose={closeTransferStation} />
        <ImageBrowser open={imageBrowserActive} onClose={closeImageBrowser} />
      </div>
      <SettingsPanel />
      <UiDialogHost />
      <RainbowEffects rainbow={rainbow} />
    </div>
  );
}

export default App;
