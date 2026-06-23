import { useCallback, useEffect, useMemo, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
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
import type { ContextMenuState } from './types';
import { useAppStore } from './stores/appStore';
import { UiDialogHost } from './components/UiDialog/UiDialogHost';
import { uiConfirm } from './lib/uiDialog';



const DEFAULT_RAINBOW_COLORS = ['#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#00C7FF', '#5856D6', '#FF2D55'];

function normalizeRainbowColors(value: unknown): string[] {
  const source = Array.isArray(value) ? value : DEFAULT_RAINBOW_COLORS;
  const seen = new Set<string>();
  const colors: string[] = [];
  for (const item of source) {
    const hex = String(item ?? '').trim().toUpperCase();
    if (!/^#[0-9A-F]{6}$/.test(hex) || seen.has(hex)) continue;
    seen.add(hex);
    colors.push(hex);
  }
  return colors.length ? colors : DEFAULT_RAINBOW_COLORS;
}

function cssGradientStops(colors: string[]) {
  const list = colors.length ? colors : DEFAULT_RAINBOW_COLORS;
  return [...list, list[0]].join(', ');
}

function cssLinearRainbow(colors: string[]) {
  return `linear-gradient(90deg, ${cssGradientStops(colors)})`;
}

function cssConicRainbow(colors: string[]) {
  return `conic-gradient(${cssGradientStops(colors)})`;
}

function cssUrl(value: string): string {
  if (!value) return 'none';
  const trimmed = value.trim();
  if (!trimmed) return 'none';
  const safe = trimmed.replace(/\\/g, '/').replace(/"/g, '\\"');
  if (/^(data:image\/|blob:|https?:\/\/|asset:|tauri:)/i.test(trimmed)) return `url("${safe}")`;
  return `url("${convertFileSrc(trimmed).replace(/"/g, '\\"')}")`;
}

function backgroundSize(fit: string | undefined): string {
  if (fit === 'stretch') return '100% 100%';
  if (fit === 'tile') return 'auto';
  return fit || 'cover';
}

function backgroundRepeat(fit: string | undefined): string {
  return fit === 'tile' ? 'repeat' : 'no-repeat';
}

type RainbowTrailPoint = { id: number; x: number; y: number; t: number; hue: number; size: number; color: string };

function App() {
  useThemeInstaller();
  useAutoSave();
  useCtrlWheelZoom();
  const display = useAppStore((state) => state.display);
  const [backgroundImageCss, setBackgroundImageCss] = useState('none');
  const [edgeDockPausedUntil, setEdgeDockPausedUntil] = useState(0);
  const [edgeDockInteractiveHold, setEdgeDockInteractiveHold] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [dropPaths, setDropPaths] = useState<string[]>([]);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [transferStationOpen, setTransferStationOpen] = useState(false);
  const [imageBrowserOpen, setImageBrowserOpen] = useState(false);
  const [launcherNotice, setLauncherNotice] = useState('');
  const [rainbowTrail, setRainbowTrail] = useState<RainbowTrailPoint[]>([]);
  const [rainbowCursor, setRainbowCursor] = useState({ x: -999, y: -999, visible: false });
  const behavior = useAppStore((state) => state.behavior);
  const settingsOpen = useAppStore((state) => state.settingsOpen);
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen);
  const edgeDockPauseActive = edgeDockPausedUntil > Date.now();
  const rainbowActive = Boolean(behavior.rainbowEnabled);
  const rainbowMouseTrailActive = rainbowActive && behavior.rainbowMouseTrailEnabled !== false;
  const rainbowBorderActive = rainbowActive && behavior.rainbowBorderEnabled !== false;
  const rainbowTextActive = rainbowActive && Boolean(behavior.rainbowTextEnabled);
  const rainbowCursorActive = rainbowActive;
  const rainbowMouseColors = useMemo(() => normalizeRainbowColors(behavior.rainbowMouseColors), [behavior.rainbowMouseColors]);
  const rainbowBorderColors = useMemo(() => normalizeRainbowColors(behavior.rainbowBorderColors), [behavior.rainbowBorderColors]);
  const rainbowTextColors = useMemo(() => normalizeRainbowColors(behavior.rainbowTextColors), [behavior.rainbowTextColors]);
  const rainbowMouseColorKey = rainbowMouseColors.join('|');

  useEffect(() => {
    if (!rainbowActive) {
      setRainbowTrail([]);
      setRainbowCursor({ x: -999, y: -999, visible: false });
      return;
    }

    let hueIndex = 0;
    let lastX = -999;
    let lastY = -999;
    const lifeMs = Math.max(180, Math.min(2400, Math.round(behavior.rainbowMouseTrailLifeMs ?? 720)));
    const maxCount = Math.max(4, Math.min(48, Math.round(behavior.rainbowMouseTrailCount ?? 18)));

    function prune(now = Date.now()) {
      setRainbowTrail((points) => points.filter((point) => now - point.t < lifeMs));
    }

    function handlePointerMove(event: PointerEvent) {
      lastX = event.clientX;
      lastY = event.clientY;
      setRainbowCursor({ x: lastX, y: lastY, visible: true });
    }

    function handlePointerLeave() {
      setRainbowCursor((current) => ({ ...current, visible: false }));
    }

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('mouseleave', handlePointerLeave);
    const pruneTimer = window.setInterval(() => prune(), 80);
    const trailTimer = rainbowMouseTrailActive
      ? window.setInterval(() => {
          if (lastX < 0 || lastY < 0) return;
          const now = Date.now();
          const sizeBase = Math.max(4, Math.min(42, Math.round(behavior.rainbowMouseTrailSize ?? 16)));
          const size = Math.max(3, Math.round(sizeBase * (0.28 + Math.random() * 0.48)));
          const color = rainbowMouseColors[hueIndex % rainbowMouseColors.length] || DEFAULT_RAINBOW_COLORS[0];
          const point: RainbowTrailPoint = { id: now + Math.random(), x: lastX, y: lastY, t: now, hue: hueIndex * 30, size, color };
          hueIndex += 1;
          setRainbowTrail((points) => {
            const fresh = points.filter((item) => now - item.t < lifeMs);
            return [...fresh, point].slice(-maxCount);
          });
        }, 40)
      : 0;

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('mouseleave', handlePointerLeave);
      window.clearInterval(pruneTimer);
      if (trailTimer) window.clearInterval(trailTimer);
    };
  }, [rainbowActive, rainbowMouseTrailActive, behavior.rainbowMouseTrailLifeMs, behavior.rainbowMouseTrailCount, behavior.rainbowMouseTrailSize, rainbowMouseColorKey]);


  useEffect(() => {
    let timeoutId = 0;
    function handleNotice(event: Event) {
      const message = typeof (event as CustomEvent<string>).detail === 'string' ? (event as CustomEvent<string>).detail : '';
      if (!message) return;
      window.clearTimeout(timeoutId);
      setLauncherNotice(message);
      timeoutId = window.setTimeout(() => setLauncherNotice(''), 1600);
    }
    window.addEventListener('launcher-show-notice', handleNotice);
    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener('launcher-show-notice', handleNotice);
    };
  }, []);

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

  useEffect(() => {
    let cancelled = false;
    const raw = display.backgroundImage?.trim() ?? '';
    if (!display.backgroundEnabled || !raw) {
      setBackgroundImageCss('none');
      return;
    }

    if (/^(data:image\/|blob:|https?:\/\/|asset:|tauri:)/i.test(raw)) {
      setBackgroundImageCss(cssUrl(raw));
      return;
    }

    // Local Windows paths are most reliable as data URLs inside CSS backgrounds.
    // convertFileSrc is kept as a fallback for unusual paths.
    invoke<string>('read_icon_as_data_url', { path: raw })
      .then((dataUrl) => {
        if (!cancelled && dataUrl) setBackgroundImageCss(cssUrl(dataUrl));
      })
      .catch(() => {
        if (!cancelled) setBackgroundImageCss(cssUrl(raw));
      });

    return () => { cancelled = true; };
  }, [display.backgroundEnabled, display.backgroundImage]);

  useStableEdgeDock({
    enabled: behavior.edgeAutoHide || behavior.autoEdgeHide,
    dockAutoHide: behavior.edgeAutoHide,
    hideDelayMs: behavior.edgeHideDelaySeconds <= 0.05 ? 0 : Math.round(behavior.edgeHideDelaySeconds * 1000),
    paused: edgeDockPauseActive || edgeDockInteractiveHold || settingsOpen || Boolean(contextMenu) || dropPaths.length > 0 || globalSearchOpen || transferStationOpen || imageBrowserOpen,
    stripSize: behavior.edgeStripSize ?? 10,
    edgeTolerance: 24,
    animationMs: behavior.edgeAnimationMs ?? 90,
    animationStyle: behavior.edgeAnimationStyle ?? 'animate-window',
    autoEdgeHide: behavior.autoEdgeHide ?? true,
    autoEdgeBounce: behavior.autoEdgeBounce ?? true,
    autoEdgeHideDelay: behavior.autoEdgeHideDelay ?? 1000,
    edgeVisiblePixels: behavior.edgeVisiblePixels ?? 5,
    ghostFrameFix: behavior.edgeGhostFrameFix ?? true,
    mouseLeaveHideMs: behavior.edgeMouseLeaveHideMs ?? behavior.edgeAnimationMs ?? 90,
    useMainWindowStrip: behavior.edgeUseMainWindowStrip ?? true
  });

  useEffect(() => {
    void invoke('set_close_behavior', { closeToTray: behavior.closeAction !== 'exit' }).catch(() => undefined);
  }, [behavior.closeAction]);
  useWindowBoundsGuard(true);
  const startWindowDrag = useWindowDrag();
  const handleDropPaths = useCallback((paths: string[]) => {
    // 文件中转站/图片浏览器打开时，外部拖入只进入对应面板，不再同时弹出“添加快捷项目”。
    if (transferStationOpen || imageBrowserOpen) return;
    if (paths.length) setDropPaths(paths);
  }, [transferStationOpen, imageBrowserOpen]);
  const { dragHover } = useDragDrop(handleDropPaths, !transferStationOpen && !imageBrowserOpen);

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
      if (isEditableTarget(event.target)) return;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setGlobalSearchOpen(true);
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
        const ids = visibleItemIds();
        if (ids.length) {
          event.preventDefault();
          useAppStore.getState().selectItems(ids);
        }
        return;
      }

      if (event.key !== 'Delete') return;
      const state = useAppStore.getState();
      if (state.selectedItemIds.length > 0) {
        event.preventDefault();
        if (await uiConfirm(`确定删除选中的 ${state.selectedItemIds.length} 个项目吗？`)) {
          state.deleteSelectedItems();
        }
        return;
      }

      const selectedNavTarget = state.selectedNavTarget;
      if (selectedNavTarget?.kind === 'group') {
        const group = state.groups.find((entry) => entry.id === selectedNavTarget.id);
        if (group && state.groups.length > 1) {
          event.preventDefault();
          if (await uiConfirm(`确定删除父目录「${group.name}」及其中所有子目录吗？`)) {
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
          if (await uiConfirm(`确定删除子目录「${directory.name}」吗？`)) {
            state.deleteDirectory(directory.id);
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const shellStyle = {
    '--menu-font-size': `${display.menuFontSize}px`,
    '--menu-item-height': `${display.menuItemHeight}px`,
    '--menu-min-width': `${display.menuMinWidth}px`,
    '--top-tab-width': `${display.topTabWidth}px`,
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
    '--launcher-bg-image': backgroundImageCss,
    '--launcher-bg-opacity': String(display.backgroundEnabled ? (display.backgroundOpacity ?? 0.42) : 0),
    '--launcher-bg-dim': String(display.backgroundDim ?? 0.18),
    '--launcher-bg-blur': `${display.backgroundBlur ?? 0}px`,
    '--launcher-bg-size': backgroundSize(display.backgroundFit),
    '--launcher-bg-repeat': backgroundRepeat(display.backgroundFit),
    '--launcher-bg-position': display.backgroundPosition ?? 'center',
    '--launcher-panel-alpha': `${Math.round((display.backgroundPanelOpacity ?? 0.86) * 100)}%`,
    '--rainbow-border-speed': `${behavior.rainbowBorderSpeedSeconds ?? 18}s`,
    '--rainbow-border-gradient': cssConicRainbow(rainbowBorderColors),
    '--rainbow-text-gradient': cssLinearRainbow(rainbowTextColors),
    '--rainbow-cursor-gradient': cssConicRainbow(rainbowMouseColors),
    '--rainbow-cursor-linear-gradient': cssLinearRainbow(rainbowMouseColors),
    '--rainbow-border-glow': String(behavior.rainbowBorderGlow ?? 0.58),
    '--rainbow-border-width': `${behavior.rainbowBorderWidth ?? 2}px`,
    '--rainbow-text-speed': `${behavior.rainbowTextSpeedSeconds ?? 22}s`,
    '--rainbow-trail-size': `${behavior.rainbowMouseTrailSize ?? 16}px`,
    '--rainbow-trail-brightness': String(behavior.rainbowMouseTrailBrightness ?? 0.72)
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

  function closeFloatingPanelsFromMainClick(target: HTMLElement) {
    if (!globalSearchOpen && !transferStationOpen && !imageBrowserOpen && !settingsOpen) return false;

    // 点击浮层自身、菜单、弹窗、输入控件时不关闭；只有点击主界面空白/内容区域才关闭。
    if (target.closest('.global-search-modal, .transfer-station-panel, .image-browser-panel, .floating-settings-panel, .modal-card, .menu-surface, .edit-dialog, input, textarea, select')) {
      return false;
    }

    if (globalSearchOpen) setGlobalSearchOpen(false);
    if (transferStationOpen) setTransferStationOpen(false);
    if (imageBrowserOpen) setImageBrowserOpen(false);
    if (settingsOpen) setSettingsOpen(false);
    pauseEdgeDockAfterOverlayClose(900);
    return true;
  }

  return (
    <div
      className={`app-shell ${display.backgroundEnabled && display.backgroundImage ? 'app-background-enabled' : ''} ${rainbowBorderActive ? 'rainbow-border-enabled' : ''} ${behavior.rainbowBorderMode === 'fixed' ? 'rainbow-border-fixed' : ''} ${rainbowTextActive ? 'rainbow-text-enabled' : ''} ${rainbowTextActive && behavior.rainbowTextParentEnabled !== false ? 'rainbow-text-parent-enabled' : ''} ${rainbowTextActive && behavior.rainbowTextChildEnabled !== false ? 'rainbow-text-child-enabled' : ''} ${rainbowTextActive && behavior.rainbowTextSettingsEnabled !== false ? 'rainbow-text-settings-enabled' : ''} ${rainbowCursorActive ? 'rainbow-cursor-custom-enabled' : ''} ${rainbowCursorActive && rainbowCursor.visible ? 'rainbow-cursor-inside' : ''}`}
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
      <div className="app-background-layer" aria-hidden="true" />
      {rainbowBorderActive && <div className="rainbow-border-layer" aria-hidden="true" />}
      {rainbowMouseTrailActive && rainbowTrail.length > 0 && (
        <div className="rainbow-trail-layer" aria-hidden="true">
          {rainbowTrail.map((point, index) => (
            <span
              key={point.id}
              className="rainbow-trail-dot"
              style={{
                left: point.x,
                top: point.y,
                '--rainbow-trail-index': index,
                '--rainbow-trail-total': Math.max(1, rainbowTrail.length),
                '--rainbow-trail-progress': Math.max(0, Math.min(1, (index + 1) / Math.max(1, rainbowTrail.length))),
                '--rainbow-trail-hue': `${point.hue}deg`,
                '--rainbow-trail-color': point.color,
                '--rainbow-trail-dot-size': `${point.size}px`
              } as CSSProperties}
            />
          ))}
        </div>
      )}
      {rainbowCursorActive && (
        <div
          className={`rainbow-custom-cursor rainbow-cursor-${behavior.rainbowCursorStyle ?? 'dot'} ${rainbowCursor.visible ? 'visible' : ''}`}
          style={{ left: rainbowCursor.x, top: rainbowCursor.y } as CSSProperties}
          aria-hidden="true"
        >
          {(behavior.rainbowCursorStyle ?? 'dot') === 'macos-wheel' ? (
            <span className="rainbow-cursor-wheel" />
          ) : (behavior.rainbowCursorStyle ?? 'dot') === 'dot' ? (
            <span className="rainbow-cursor-dot" />
          ) : (
            <svg className="rainbow-cursor-arrow" viewBox="0 0 32 32" focusable="false">
              <defs>
                <linearGradient id="rainbowCursorGradient" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
                  {rainbowMouseColors.map((color, index) => (
                    <stop
                      key={`${color}-${index}`}
                      offset={`${rainbowMouseColors.length <= 1 ? 0 : Math.round((index / (rainbowMouseColors.length - 1)) * 100)}%`}
                      stopColor={color}
                    />
                  ))}
                </linearGradient>
              </defs>
              <path className="rainbow-cursor-arrow-main" d="M4 2 L4 25 L10.2 19.4 L14.2 29 L18.8 27.1 L14.7 17.8 L23.7 17.8 Z" />
            </svg>
          )}
        </div>
      )}
      <div className="app-main-layer">
        <TopBar
          onContextMenuGroup={(groupId, x, y) => setContextMenu({ kind: 'group', groupId, x, y })}
          onOpenGlobalSearch={() => setGlobalSearchOpen(true)}
          onOpenTransferStation={() => setTransferStationOpen(true)}
          onOpenImageBrowser={() => setImageBrowserOpen(true)}
        />
        <div className="main-layout">
          <Sidebar
            onContextMenuDirectory={(directoryId, x, y) => setContextMenu({ kind: 'directory', directoryId, x, y })}
            onContextMenuArea={(x, y) => setContextMenu({ kind: 'area', x, y })}
          />
          <ContentArea
            onContextMenuItem={(itemId, x, y) => setContextMenu({ kind: 'item', itemId, x, y })}
            onContextMenuArea={(x, y) => setContextMenu({ kind: 'area', x, y })}
          />
        </div>
        {dragHover && <div className="drag-overlay">松开鼠标添加到启动器</div>}
        {launcherNotice && <div className="special-tag-notice">{launcherNotice}</div>}
        {contextMenu?.kind === 'item' && <ItemContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} />}
        {contextMenu?.kind === 'area' && <AreaContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} />}
        {contextMenu?.kind === 'group' && <GroupContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} />}
        {contextMenu?.kind === 'directory' && <DirectoryContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} />}
        {dropPaths.length > 0 && <DropImportDialog paths={dropPaths} onClose={() => setDropPaths([])} />}
        <GlobalSearch open={globalSearchOpen} onClose={() => { pauseEdgeDockAfterOverlayClose(); setGlobalSearchOpen(false); }} />
        <TransferStation open={transferStationOpen} onClose={() => { pauseEdgeDockAfterOverlayClose(); setTransferStationOpen(false); }} />
        <ImageBrowser open={imageBrowserOpen} onClose={() => { pauseEdgeDockAfterOverlayClose(); setImageBrowserOpen(false); }} />
      </div>
      <SettingsPanel />
    </div>
  );
}

export default App;
