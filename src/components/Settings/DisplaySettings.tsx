import { useEffect, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { getEffectiveDisplay, useAppStore } from '../../stores/appStore';
import type { DisplaySettings, WindowControlId } from '../../types';
import { MAX_UI_SCALE, MIN_UI_SCALE, UI_SCALE_STEP, normalizeUiScale } from '../../lib/uiScale';
import { BackgroundMediaLayer, detectBackgroundMediaKind, inspectBackgroundImageAnimation, isAnimatedBackgroundSource, sourceExtension, type BackgroundImageAnimationStatus } from '../BackgroundMedia/BackgroundMedia';
import { showLauncherNotice } from '../../lib/notify';
import { uiConfirm } from '../../lib/uiDialog';
import { SettingsSliderRow as SliderRow } from './SettingsSliderRow';
import { SettingsSurfaceAppearanceControls } from './SettingsSurfaceAppearanceControls';
import { ParentGroupAppearanceControls } from './ParentGroupAppearanceControls';


const WINDOW_CONTROL_LABELS: Array<{ id: WindowControlId; label: string; hint?: string }> = [
  { id: 'search', label: '全局搜索' },
  { id: 'transfer', label: '文件中转站' },
  { id: 'image', label: '图片预览' },
  { id: 'profiles', label: '多配置', hint: '管理多个独立配置并切换当前配置' },
  { id: 'sortGroups', label: '父目录 A-Z 排列', hint: '点击后把顶部父目录按名称排序' },
  { id: 'add', label: '新增父目录' },
  { id: 'settingsQuick', label: '设置快捷入口', hint: '打开常用子设置菜单' },
  { id: 'settings', label: '设置' },
  { id: 'pin', label: '置顶钉子' },
  { id: 'minimize', label: '最小化' },
  { id: 'close', label: '关闭' },
];

export type InterfaceSectionId =
  | 'global'
  | 'scale'
  | 'menu'
  | 'scrollbar'
  | 'sidebar'
  | 'topbar'
  | 'controls'
  | 'background'
  | 'settingsBackground'
  | 'local'
  | 'preview';

const ALL_SECTION_IDS: InterfaceSectionId[] = ['global', 'scale', 'menu', 'scrollbar', 'sidebar', 'topbar', 'controls', 'background', 'settingsBackground', 'local', 'preview'];
const DEFAULT_COLLAPSED_SECTIONS = new Set<InterfaceSectionId>(ALL_SECTION_IDS);


interface BackgroundMediaInfo {
  sizeBytes: number;
  extension: string;
  alreadyCached: boolean;
  requiresConfirmation: boolean;
}

function isDirectBackgroundSource(value: string) {
  return /^(data:|blob:|https?:\/\/|asset:|tauri:)/i.test(value.trim());
}

function formatMediaSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '未知大小';
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function ColorRow({ label, value, disabled, onChange, hint }: {
  label: string;
  value: string;
  disabled?: boolean;
  hint?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="field-row">
      <label>{label}</label>
      <div className="color-pick-row">
        <input type="color" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
        {hint && <span className="settings-hint">{hint}</span>}
      </div>
    </div>
  );
}

function CollapsibleSection({ id, title, hint, collapsed, onToggle, children }: {
  id: InterfaceSectionId;
  title: string;
  hint?: string;
  collapsed: boolean;
  onToggle: (id: InterfaceSectionId) => void;
  children: ReactNode;
}) {
  return (
    <div id={`settings-interface-section-${id}`} className="settings-collapse-block" data-settings-section={id}>
      <button
        type="button"
        className="settings-collapse-header"
        aria-expanded={!collapsed}
        onClick={() => onToggle(id)}
      >
        <span className="settings-collapse-arrow" aria-hidden="true">{collapsed ? '▸' : '▾'}</span>
        <span className="settings-collapse-title">{title}</span>
        {hint && <span className="settings-collapse-hint">{hint}</span>}
      </button>
      {!collapsed && <div className="settings-collapse-content">{children}</div>}
    </div>
  );
}


const BACKGROUND_POSITION_PRESETS = [
  { x: 0, y: 0, label: '左上' }, { x: 50, y: 0, label: '上中' }, { x: 100, y: 0, label: '右上' },
  { x: 0, y: 50, label: '左中' }, { x: 50, y: 50, label: '居中' }, { x: 100, y: 50, label: '右中' },
  { x: 0, y: 100, label: '左下' }, { x: 50, y: 100, label: '下中' }, { x: 100, y: 100, label: '右下' },
] as const;

function BackgroundPositionPicker({ x, y, onChange }: { x: number; y: number; onChange: (x: number, y: number) => void }) {
  return (
    <div className="background-position-editor">
      <div className="background-position-grid" aria-label="背景焦点快捷位置">
        {BACKGROUND_POSITION_PRESETS.map((preset) => (
          <button
            type="button"
            key={`${preset.x}-${preset.y}`}
            className={Math.abs(x - preset.x) < 2 && Math.abs(y - preset.y) < 2 ? 'active' : ''}
            title={preset.label}
            aria-label={preset.label}
            onClick={() => onChange(preset.x, preset.y)}
          >
            <span />
          </button>
        ))}
      </div>
      <div className="background-position-sliders">
        <SliderRow label="水平焦点" min={0} max={100} step={1} value={Math.round(x)} unit="%" onChange={(value) => onChange(value, y)} />
        <SliderRow label="垂直焦点" min={0} max={100} step={1} value={Math.round(y)} unit="%" onChange={(value) => onChange(x, value)} />
      </div>
    </div>
  );
}

interface WallpaperPreviewProps {
  title: string;
  source: string;
  enabled: boolean;
  mediaKind: DisplaySettings['backgroundMediaKind'];
  fit: DisplaySettings['backgroundFit'];
  x: number;
  y: number;
  opacity: number;
  dim: number;
  blur: number;
  motionEnabled: boolean;
  playbackRate: number;
  pauseWhenHidden: boolean;
  containAmbient: boolean;
  panelOpacity: number;
  reduceMotion: boolean;
  glass?: boolean;
  glassBlur?: number;
  glassSaturation?: number;
  glassHighlight?: number;
  onPositionChange?: (x: number, y: number) => void;
}

function wallpaperMediaLabel(
  source: string,
  kind: ReturnType<typeof detectBackgroundMediaKind>,
  animation: BackgroundImageAnimationStatus,
) {
  if (kind === 'video') return '视频壁纸';
  const normalizedSource = String(source ?? '').trim().toLowerCase();
  const extension = sourceExtension(source);
  const isPng = extension === 'png' || extension === 'apng' || normalizedSource.startsWith('data:image/png');
  const isWebp = extension === 'webp' || normalizedSource.startsWith('data:image/webp');
  if (extension === 'gif' || normalizedSource.startsWith('data:image/gif')) return '动态图片';
  if (animation === 'animated') return '动态图片';
  if (isWebp && animation === 'static') return 'WebP 图片';
  if ((isPng || isWebp || normalizedSource.startsWith('blob:')) && animation === 'unknown') return '图片，可能包含动画';
  return '静态图片';
}

function WallpaperPreview(props: WallpaperPreviewProps) {
  const detectedKind = detectBackgroundMediaKind(props.source, props.mediaKind);
  const [animationStatus, setAnimationStatus] = useState<BackgroundImageAnimationStatus>(() => isAnimatedBackgroundSource(props.source) ? 'animated' : 'unknown');
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [draggingFocus, setDraggingFocus] = useState(false);
  const [draftFocus, setDraftFocus] = useState({ x: props.x, y: props.y });

  useEffect(() => setDraftFocus({ x: props.x, y: props.y }), [props.x, props.y]);
  useEffect(() => {
    let cancelled = false;
    if (detectedKind === 'video') {
      setAnimationStatus('animated');
      return;
    }
    setAnimationStatus(isAnimatedBackgroundSource(props.source) ? 'animated' : 'unknown');
    void inspectBackgroundImageAnimation(props.source).then((status) => {
      if (!cancelled) setAnimationStatus(status);
    });
    return () => { cancelled = true; };
  }, [detectedKind, props.source]);
  useEffect(() => setPreviewPlaying(false), [props.source]);

  const dynamic = detectedKind === 'video' || animationStatus === 'animated';
  const freezePreview = props.reduceMotion || !props.motionEnabled || (dynamic && !previewPlaying);

  function updateFocus(event: ReactPointerEvent<HTMLButtonElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * 100));
    const y = Math.max(0, Math.min(100, ((event.clientY - bounds.top) / Math.max(1, bounds.height)) * 100));
    setDraftFocus({ x: Math.round(x), y: Math.round(y) });
  }

  function commitFocus(event: ReactPointerEvent<HTMLButtonElement>) {
    updateFocus(event);
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * 100));
    const y = Math.max(0, Math.min(100, ((event.clientY - bounds.top) / Math.max(1, bounds.height)) * 100));
    props.onPositionChange?.(Math.round(x), Math.round(y));
  }

  return (
    <div className={`wallpaper-live-preview ${props.glass ? 'glass-preview-enabled' : ''} ${draggingFocus ? 'dragging-focus' : ''}`}>
      <BackgroundMediaLayer
        className="wallpaper-live-preview-media"
        enabled={props.enabled}
        source={props.source}
        mediaKind={props.mediaKind}
        fit={props.fit}
        positionX={draftFocus.x}
        positionY={draftFocus.y}
        opacity={props.opacity}
        dim={props.dim}
        blur={props.blur}
        motionEnabled={props.motionEnabled && previewPlaying}
        playbackRate={props.playbackRate}
        pauseWhenHidden={props.pauseWhenHidden}
        containAmbient={props.containAmbient}
        reduceMotion={freezePreview}
        showFallback
      />
      <div
        className="wallpaper-preview-ui"
        style={{
          '--wallpaper-preview-panel-alpha': `${Math.round(props.panelOpacity * 100)}%`,
          '--wallpaper-preview-glass-blur': `${props.glassBlur ?? 22}px`,
          '--wallpaper-preview-glass-saturation': String(props.glassSaturation ?? 1.32),
          '--wallpaper-preview-glass-highlight': String(props.glassHighlight ?? 0.72),
        } as CSSProperties}
      >
        <div className="wallpaper-preview-topbar">
          <span>{props.title}</span>
          <span className="wallpaper-preview-actions">
            <span className="wallpaper-preview-badge">{wallpaperMediaLabel(props.source, detectedKind, animationStatus)}</span>
            {dynamic && props.motionEnabled && !props.reduceMotion && (
              <button type="button" onClick={() => setPreviewPlaying((playing) => !playing)}>{previewPlaying ? '暂停预览' : '播放预览'}</button>
            )}
            {props.reduceMotion && dynamic && <span className="wallpaper-preview-badge">已冻结</span>}
          </span>
        </div>
        <div className="wallpaper-preview-body">
          <div className="wallpaper-preview-sidebar"><i /><i /><i className="active" /><i /></div>
          <div className="wallpaper-preview-content"><b /><b /><b /><b /><b /><b /></div>
        </div>
      </div>
      {props.onPositionChange && (
        <button
          type="button"
          className="wallpaper-preview-focus-layer"
          aria-label="拖动调整壁纸焦点"
          title="在预览中单击或拖动，松开后保存画面焦点"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            setDraggingFocus(true);
            updateFocus(event);
          }}
          onPointerMove={(event) => {
            if (draggingFocus && event.currentTarget.hasPointerCapture(event.pointerId)) updateFocus(event);
          }}
          onPointerUp={(event) => {
            commitFocus(event);
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
            setDraggingFocus(false);
          }}
          onPointerCancel={() => {
            setDraftFocus({ x: props.x, y: props.y });
            setDraggingFocus(false);
          }}
        >
          <span className="wallpaper-preview-focus-target" style={{ left: `${draftFocus.x}%`, top: `${draftFocus.y}%` }} />
          <small>拖动焦点</small>
        </button>
      )}
    </div>
  );
}

export function DisplaySettings({ requestedSection, onRequestedSectionHandled }: { requestedSection?: InterfaceSectionId | null; onRequestedSectionHandled?: () => void }) {
  const globalDisplay = useAppStore((state) => state.display);
  const experience = useAppStore((state) => state.experience);
  const activeDirectory = useAppStore((state) => state.getActiveDirectory());
  const updateDisplay = useAppStore((state) => state.updateDisplay);
  const updateDirectoryDisplay = useAppStore((state) => state.updateDirectoryDisplay);
  const clearDirectoryDisplay = useAppStore((state) => state.clearDirectoryDisplay);
  const localDisplay = getEffectiveDisplay(globalDisplay, activeDirectory);
  const localOverrideCount = activeDirectory?.display ? Object.keys(activeDirectory.display).length : 0;
  const rememberCollapseState = globalDisplay.rememberInterfaceCollapseState === true;
  const [mainBackgroundDraft, setMainBackgroundDraft] = useState(globalDisplay.backgroundImage || '');
  const [settingsBackgroundDraft, setSettingsBackgroundDraft] = useState(globalDisplay.settingsBackgroundImage || '');
  const [backgroundApplying, setBackgroundApplying] = useState<'main' | 'settings' | null>(null);

  useEffect(() => setMainBackgroundDraft(globalDisplay.backgroundImage || ''), [globalDisplay.backgroundImage]);
  useEffect(() => setSettingsBackgroundDraft(globalDisplay.settingsBackgroundImage || ''), [globalDisplay.settingsBackgroundImage]);
  const [collapsedSections, setCollapsedSections] = useState<Set<InterfaceSectionId>>(() => {
    if (!globalDisplay.rememberInterfaceCollapseState) return new Set(DEFAULT_COLLAPSED_SECTIONS);
    const saved = new Set((globalDisplay.interfaceCollapsedSections ?? []).filter((id): id is InterfaceSectionId => ALL_SECTION_IDS.includes(id as InterfaceSectionId)));
    return saved.size ? saved : new Set(DEFAULT_COLLAPSED_SECTIONS);
  });

  useEffect(() => {
    if (!rememberCollapseState) {
      setCollapsedSections(new Set(DEFAULT_COLLAPSED_SECTIONS));
      return;
    }
    const saved = new Set((globalDisplay.interfaceCollapsedSections ?? []).filter((id): id is InterfaceSectionId => ALL_SECTION_IDS.includes(id as InterfaceSectionId)));
    setCollapsedSections(saved.size ? saved : new Set(DEFAULT_COLLAPSED_SECTIONS));
  }, [rememberCollapseState]);

  useEffect(() => {
    if (!requestedSection || !ALL_SECTION_IDS.includes(requestedSection)) return;
    setCollapsedSections((current) => {
      const next = new Set(current);
      next.delete(requestedSection);
      if (rememberCollapseState) updateDisplay({ interfaceCollapsedSections: Array.from(next) } as Partial<DisplaySettings>);
      return next;
    });
    const timer = window.setTimeout(() => {
      document.getElementById(`settings-interface-section-${requestedSection}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      onRequestedSectionHandled?.();
    }, 80);
    return () => window.clearTimeout(timer);
  }, [onRequestedSectionHandled, rememberCollapseState, requestedSection, updateDisplay]);

  function setGlobal(patch: Partial<DisplaySettings>) {
    updateDisplay(patch);
  }

  function setWindowControlVisible(id: WindowControlId, visible: boolean) {
    const currentHidden = new Set(globalDisplay.windowControlHidden ?? []);
    if (visible) currentHidden.delete(id);
    else currentHidden.add(id);
    setGlobal({ windowControlHidden: Array.from(currentHidden) } as Partial<DisplaySettings>);
  }

  function showAllWindowControls() {
    setGlobal({ windowControlHidden: [] } as Partial<DisplaySettings>);
  }

  function hideNonEssentialWindowControls() {
    setGlobal({ windowControlHidden: ['search', 'transfer', 'image', 'profiles', 'sortGroups', 'add', 'settingsQuick', 'pin'] } as Partial<DisplaySettings>);
  }

  function setLocal(patch: Partial<DisplaySettings>) {
    if (!activeDirectory) return;
    updateDirectoryDisplay(activeDirectory.id, patch);
  }

  function applyCollapsedSections(next: Set<InterfaceSectionId>) {
    setCollapsedSections(next);
    if (rememberCollapseState) {
      updateDisplay({ interfaceCollapsedSections: Array.from(next) } as Partial<DisplaySettings>);
    }
  }

  function toggleSection(id: InterfaceSectionId) {
    setCollapsedSections((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      if (rememberCollapseState) {
        updateDisplay({ interfaceCollapsedSections: Array.from(next) } as Partial<DisplaySettings>);
      }
      return next;
    });
  }

  function setRememberCollapseState(enabled: boolean) {
    if (enabled) {
      updateDisplay({ rememberInterfaceCollapseState: true, interfaceCollapsedSections: Array.from(collapsedSections) } as Partial<DisplaySettings>);
      return;
    }
    updateDisplay({ rememberInterfaceCollapseState: false, interfaceCollapsedSections: [] } as Partial<DisplaySettings>);
    setCollapsedSections(new Set(DEFAULT_COLLAPSED_SECTIONS));
  }

  function applyStoredBackground(target: 'main' | 'settings', storedPath: string) {
    if (target === 'main') {
      setMainBackgroundDraft(storedPath);
      updateDisplay({ backgroundImage: storedPath, backgroundEnabled: true, backgroundMediaKind: 'auto' });
    } else {
      setSettingsBackgroundDraft(storedPath);
      updateDisplay({ settingsBackgroundImage: storedPath, settingsBackgroundEnabled: true, settingsBackgroundMediaKind: 'auto' });
    }
  }

  async function cacheAndApplyLocalBackground(target: 'main' | 'settings', path: string) {
    setBackgroundApplying(target);
    try {
      const info = await invoke<BackgroundMediaInfo>('inspect_background_media', { path });
      let allowLarge = false;
      if (info.requiresConfirmation) {
        allowLarge = await uiConfirm(
          `该背景媒体大小为 ${formatMediaSize(info.sizeBytes)}。复制到应用缓存可能需要较长时间并占用磁盘空间，是否继续？`,
          '导入大型动态壁纸',
        );
        if (!allowLarge) {
          showLauncherNotice('已取消导入大型背景媒体');
          return false;
        }
      }
      const storedPath = await invoke<string>('cache_background_media', { path, allowLarge });
      applyStoredBackground(target, storedPath);
      showLauncherNotice(info.alreadyCached ? '已使用应用壁纸缓存并应用' : '已复制到应用壁纸缓存并应用');
      return true;
    } catch (error) {
      console.warn('cache background media failed', error);
      showLauncherNotice(`壁纸缓存失败，未应用：${String(error).replace('LARGE_MEDIA_CONFIRMATION_REQUIRED', '需要确认大型文件')}`);
      return false;
    } finally {
      setBackgroundApplying(null);
    }
  }

  async function applyBackgroundDraft(target: 'main' | 'settings') {
    const value = (target === 'main' ? mainBackgroundDraft : settingsBackgroundDraft).trim();
    if (!value) {
      if (target === 'main') updateDisplay({ backgroundImage: '', backgroundEnabled: false });
      else updateDisplay({ settingsBackgroundImage: '', settingsBackgroundEnabled: false });
      showLauncherNotice('已清除背景媒体');
      return;
    }
    if (isDirectBackgroundSource(value)) {
      applyStoredBackground(target, value);
      showLauncherNotice('已直接使用网络或内嵌背景地址');
      return;
    }
    await cacheAndApplyLocalBackground(target, value);
  }

  async function chooseBackgroundMedia(target: 'main' | 'settings') {
    const selected = await open({
      title: target === 'main' ? '选择主界面背景或动态壁纸' : '选择设置界面背景或动态壁纸',
      multiple: false,
      filters: [
        { name: '背景媒体', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'apng', 'svg', 'mp4', 'webm', 'ogv', 'ogg'] },
        { name: '动态图片', extensions: ['gif', 'apng', 'webp', 'png'] },
        { name: '视频壁纸', extensions: ['mp4', 'webm', 'ogv', 'ogg'] },
      ],
    });
    if (!selected || Array.isArray(selected)) return;
    await cacheAndApplyLocalBackground(target, selected);
  }

  function resetMainBackgroundPresentation() {
    setGlobal({
      backgroundOpacity: 0.62,
      backgroundDim: 0.18,
      backgroundBlur: 0,
      backgroundFit: 'cover',
      backgroundPosition: 'center',
      backgroundPositionX: 50,
      backgroundPositionY: 50,
      backgroundMotionEnabled: true,
      backgroundPlaybackRate: 1,
      backgroundPauseWhenHidden: true,
      backgroundContainAmbient: true,
      backgroundPanelOpacity: 0.86,
    });
  }

  function resetSettingsBackgroundPresentation() {
    setGlobal({
      settingsBackgroundOpacity: 0.62,
      settingsBackgroundDim: 0.18,
      settingsBackgroundBlur: 0,
      settingsBackgroundFit: 'cover',
      settingsBackgroundPosition: 'center',
      settingsBackgroundPositionX: 50,
      settingsBackgroundPositionY: 50,
      settingsBackgroundMotionEnabled: true,
      settingsBackgroundPlaybackRate: 1,
      settingsBackgroundPauseWhenHidden: true,
      settingsBackgroundContainAmbient: true,
      settingsBackgroundPanelOpacity: 0.9,
      settingsBackgroundGlassEffect: false,
      settingsBackgroundGlassBlur: 22,
      settingsBackgroundGlassSaturation: 1.32,
      settingsBackgroundGlassHighlight: 0.72,
    });
  }

  const scrollbarThumbColor = globalDisplay.scrollbarUseThemeColor === false ? (globalDisplay.scrollbarThumbColor || '#8A8F98') : '#5B8DEF';
  const scrollbarThumbHoverColor = globalDisplay.scrollbarUseThemeColor === false ? (globalDisplay.scrollbarThumbHoverColor || '#5B8DEF') : '#3F7BEE';

  return (
    <section className="settings-section settings-section-stack">
      <div className="settings-section-title-row">
        <h3>界面设置</h3>
        <label className="settings-inline-switch" title="开启后会记住每个折叠分组的展开/收起状态；关闭后每次进入界面设置都恢复默认全部收起。">
          <input
            type="checkbox"
            checked={rememberCollapseState}
            onChange={(event) => setRememberCollapseState(event.target.checked)}
          />
          记住展开/收起状态
        </label>
      </div>
      <div className="settings-collapse-tools">
        <button className="btn-secondary btn-compact" onClick={() => applyCollapsedSections(new Set(DEFAULT_COLLAPSED_SECTIONS))}>全部收起</button>
        <button className="btn-secondary btn-compact" onClick={() => applyCollapsedSections(new Set())}>全部展开</button>
        <span className="settings-hint">默认进入此页时全部收起；打开上方开关后保留你上次的展开状态。</span>
      </div>

      <CollapsibleSection
        id="global"
        title="文字与项目布局"
        hint="统一默认设置"
        collapsed={collapsedSections.has('global')}
        onToggle={toggleSection}
      >
        <div className="settings-subtitle">统一默认设置</div>
        <div className="field-row">
          <label>全局显示行数</label>
          <div className="segmented">
            {[1, 2, 3, 4, 5].map((line) => (
              <button key={line} className={globalDisplay.labelLines === line ? 'active' : ''} onClick={() => setGlobal({ labelLines: line })}>{line}</button>
            ))}
          </div>
        </div>
        <SliderRow label="换行字数" min={4} max={20} value={globalDisplay.charsPerLine} onChange={(value) => setGlobal({ charsPerLine: value })} />
        <SliderRow label="字体大小" min={10} max={16} value={globalDisplay.fontSize} unit="px" onChange={(value) => setGlobal({ fontSize: value })} />
        <SliderRow label="图标大小" min={32} max={128} step={4} value={globalDisplay.iconSize} unit="px" onChange={(value) => setGlobal({ iconSize: value })} />
        <SliderRow label="项目占位宽度" min={72} max={260} step={4} value={globalDisplay.itemWidth} unit="px" onChange={(value) => setGlobal({ itemWidth: value })} />
        <SliderRow label="项目占位高度" min={82} max={320} step={4} value={globalDisplay.itemHeight} unit="px" onChange={(value) => setGlobal({ itemHeight: value })} />
        <SliderRow label="项目间距" min={4} max={40} step={2} value={globalDisplay.gridGap} unit="px" onChange={(value) => setGlobal({ gridGap: value })} />
      </CollapsibleSection>

      <CollapsibleSection
        id="scale"
        title="界面缩放"
        hint="主界面 / 设置界面分开缩放"
        collapsed={collapsedSections.has('scale')}
        onToggle={toggleSection}
      >
        <SliderRow label="主界面缩放" min={MIN_UI_SCALE} max={MAX_UI_SCALE} step={UI_SCALE_STEP} value={normalizeUiScale(globalDisplay.mainUiScale ?? globalDisplay.uiScale ?? 1)} unit="x" onChange={(value) => setGlobal({ mainUiScale: normalizeUiScale(value), uiScale: normalizeUiScale(value) })} />
        <SliderRow label="设置界面缩放" min={MIN_UI_SCALE} max={MAX_UI_SCALE} step={UI_SCALE_STEP} value={normalizeUiScale(globalDisplay.settingsUiScale ?? globalDisplay.uiScale ?? 1)} unit="x" onChange={(value) => setGlobal({ settingsUiScale: normalizeUiScale(value) })} />
        <div className="button-row compact-button-row">
          <button className="btn-secondary" onClick={() => setGlobal({ mainUiScale: 1, uiScale: 1 })}>重置主界面缩放</button>
          <button className="btn-secondary" onClick={() => setGlobal({ settingsUiScale: 1 })}>重置设置缩放</button>
        </div>
        <p className="settings-hint">缩放范围为 10%–180%，最小可调到 x0.1。Ctrl + 滚轮或 Ctrl + +/- 调整当前区域，Ctrl + 0 重置。</p>
      </CollapsibleSection>

      <CollapsibleSection
        id="menu"
        title="右键菜单大小"
        collapsed={collapsedSections.has('menu')}
        onToggle={toggleSection}
      >
        <SliderRow label="菜单字体大小" min={12} max={20} step={1} value={globalDisplay.menuFontSize} unit="px" onChange={(value) => setGlobal({ menuFontSize: value })} />
        <SliderRow label="菜单行高" min={28} max={52} step={2} value={globalDisplay.menuItemHeight} unit="px" onChange={(value) => setGlobal({ menuItemHeight: value })} />
        <SliderRow label="菜单最小宽度" min={160} max={360} step={10} value={globalDisplay.menuMinWidth} unit="px" onChange={(value) => setGlobal({ menuMinWidth: value })} />
        <div className="field-row">
          <label>默认查看方式</label>
          <div className="segmented">
            <button className={globalDisplay.viewMode === 'grid' ? 'active' : ''} onClick={() => setGlobal({ viewMode: 'grid' })}>图标</button>
            <button className={globalDisplay.viewMode === 'compact' ? 'active' : ''} onClick={() => setGlobal({ viewMode: 'compact' })}>紧凑</button>
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        id="scrollbar"
        title="滚动条 / 滑动条"
        hint="左侧目录、设置页等滚动区域"
        collapsed={collapsedSections.has('scrollbar')}
        onToggle={toggleSection}
      >
        <SliderRow label="滚动条宽度" min={4} max={26} step={1} value={globalDisplay.scrollbarSize ?? 12} unit="px" onChange={(value) => setGlobal({ scrollbarSize: value })} />
        <SliderRow label="滚动条圆角" min={0} max={999} step={1} value={globalDisplay.scrollbarRadius ?? 999} unit="px" onChange={(value) => setGlobal({ scrollbarRadius: value })} />
        <label className="check-row">
          <input
            type="checkbox"
            checked={globalDisplay.scrollbarUseThemeColor !== false}
            onChange={(event) => setGlobal({ scrollbarUseThemeColor: event.target.checked })}
          />
          滑块颜色跟随当前主题 accent
        </label>
        <ColorRow
          label="滑块颜色"
          value={globalDisplay.scrollbarThumbColor || '#8A8F98'}
          disabled={globalDisplay.scrollbarUseThemeColor !== false}
          hint="关闭“跟随主题”后生效"
          onChange={(value) => setGlobal({ scrollbarThumbColor: value, scrollbarUseThemeColor: false })}
        />
        <ColorRow
          label="滑块悬停颜色"
          value={globalDisplay.scrollbarThumbHoverColor || '#5B8DEF'}
          disabled={globalDisplay.scrollbarUseThemeColor !== false}
          hint="鼠标悬停滚动条时使用"
          onChange={(value) => setGlobal({ scrollbarThumbHoverColor: value, scrollbarUseThemeColor: false })}
        />
        <ColorRow
          label="轨道颜色"
          value={globalDisplay.scrollbarTrackColor?.startsWith('#') ? globalDisplay.scrollbarTrackColor : '#2B2B2B'}
          onChange={(value) => setGlobal({ scrollbarTrackColor: value })}
        />
        <div
          className="scrollbar-preview"
          style={{
            '--scrollbar-size': `${globalDisplay.scrollbarSize ?? 12}px`,
            '--scrollbar-radius': `${globalDisplay.scrollbarRadius ?? 999}px`,
            '--scrollbar-thumb-color': scrollbarThumbColor,
            '--scrollbar-thumb-hover-color': scrollbarThumbHoverColor,
            '--scrollbar-track-color': globalDisplay.scrollbarTrackColor || 'rgba(0, 0, 0, 0.08)'
          } as CSSProperties}
        >
          <div className="scrollbar-preview-content">滚动条实时预览<br />拖动或滚动此区域查看效果<br />颜色与大小会同步到主界面、左侧目录和设置面板。</div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        id="sidebar"
        title="左侧子目录列表"
        collapsed={collapsedSections.has('sidebar')}
        onToggle={toggleSection}
      >
        <SliderRow label="左侧栏宽度" min={120} max={360} step={4} value={globalDisplay.sidebarWidth} unit="px" onChange={(value) => setGlobal({ sidebarWidth: value })} />
        <SliderRow label="子目录文字大小" min={11} max={22} step={1} value={globalDisplay.sidebarFontSize} unit="px" onChange={(value) => setGlobal({ sidebarFontSize: value })} />
        <SliderRow label="子目录项高度" min={28} max={72} step={2} value={globalDisplay.sidebarItemHeight} unit="px" onChange={(value) => setGlobal({ sidebarItemHeight: value })} />
        <SliderRow label="子目录项间距" min={0} max={24} step={1} value={globalDisplay.sidebarItemGap} unit="px" onChange={(value) => setGlobal({ sidebarItemGap: value })} />
        <SliderRow label="子目录圆角" min={0} max={28} step={1} value={globalDisplay.sidebarItemRadius} unit="px" onChange={(value) => setGlobal({ sidebarItemRadius: value })} />
      </CollapsibleSection>

      <CollapsibleSection
        id="topbar"
        title="父目录标签"
        collapsed={collapsedSections.has('topbar')}
        onToggle={toggleSection}
      >
        <ParentGroupAppearanceControls display={globalDisplay} onChange={setGlobal} />
      </CollapsibleSection>

      <CollapsibleSection
        id="controls"
        title="右上角功能按钮"
        hint="搜索 / 中转 / 图片 / A-Z / 加号 / 设置 / 置顶 / 最小化 / 关闭"
        collapsed={collapsedSections.has('controls')}
        onToggle={toggleSection}
      >
        <div className="field-row">
          <label>按钮显示方式</label>
          <div className="segmented segmented-wide">
            <button className={globalDisplay.windowControlStyle === 'round' ? 'active' : ''} onClick={() => setGlobal({ windowControlStyle: 'round' })}>圆形</button>
            <button className={globalDisplay.windowControlStyle === 'square' ? 'active' : ''} onClick={() => setGlobal({ windowControlStyle: 'square' })}>方形</button>
            <button className={globalDisplay.windowControlStyle === 'bar' ? 'active' : ''} onClick={() => setGlobal({ windowControlStyle: 'bar' })}>横条</button>
            <button className={globalDisplay.windowControlStyle === 'pad' ? 'active' : ''} onClick={() => setGlobal({ windowControlStyle: 'pad' })}>四宫格</button>
          </div>
        </div>
        <SliderRow label="按钮大小" min={24} max={48} step={1} value={globalDisplay.windowControlSize ?? 34} unit="px" onChange={(value) => setGlobal({ windowControlSize: value })} />
        <SliderRow label="按钮间距" min={0} max={18} step={1} value={globalDisplay.windowControlGap ?? 8} unit="px" onChange={(value) => setGlobal({ windowControlGap: value })} />
        <div className={`window-control-preview window-control-preview-${globalDisplay.windowControlStyle ?? 'round'}`} style={{ '--window-control-size': `${globalDisplay.windowControlSize ?? 34}px`, '--window-control-gap': `${globalDisplay.windowControlGap ?? 8}px` } as CSSProperties}>
          <span>⌕</span><span>⇅</span><span>▤</span><span>A-Z</span><span>＋</span><span>⚙</span><span>📌</span><span>－</span><span>×</span>
        </div>
        <div className="field-row">
          <label>右上角功能是否显示</label>
          <div className="window-control-visibility-list">
            {WINDOW_CONTROL_LABELS.map((item) => (
              <label className="check-row compact-check-row" key={item.id} title={item.hint}>
                <input
                  type="checkbox"
                  checked={!(globalDisplay.windowControlHidden ?? []).includes(item.id)}
                  onChange={(event) => setWindowControlVisible(item.id, event.target.checked)}
                />
                {item.label}
              </label>
            ))}
          </div>
          <div className="button-row compact-button-row">
            <button className="btn-secondary" onClick={showAllWindowControls}>全部显示</button>
            <button className="btn-secondary" onClick={hideNonEssentialWindowControls}>只留基础按钮</button>
          </div>
          <small>关闭某个开关后，主界面右上角对应功能按钮会隐藏；按钮顺序仍可在主界面右上角拖动调整。</small>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        id="background"
        title="主界面背景与动态壁纸"
        hint="图片、GIF / 动态 WebP、MP4 / WebM"
        collapsed={collapsedSections.has('background')}
        onToggle={toggleSection}
      >
        <div className="background-setting-toolbar">
          <label className="check-row">
            <input
              type="checkbox"
              checked={globalDisplay.backgroundEnabled === true}
              onChange={(event) => setGlobal({ backgroundEnabled: event.target.checked })}
            />
            启用主界面背景
          </label>
          <button className="btn-secondary btn-compact" type="button" onClick={resetMainBackgroundPresentation}>恢复推荐显示</button>
        </div>
        <div className="field-row">
          <label>背景媒体路径</label>
          <div className="path-pick-row">
            <input
              className="soft-input"
              value={mainBackgroundDraft}
              placeholder="输入地址后点击应用；本地文件建议用“浏览”选择"
              onChange={(event) => setMainBackgroundDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void applyBackgroundDraft('main');
              }}
            />
            <button className="btn-secondary" type="button" disabled={backgroundApplying !== null} onClick={() => void applyBackgroundDraft('main')}>{backgroundApplying === 'main' ? '处理中…' : '应用'}</button>
            <button className="btn-secondary" type="button" disabled={backgroundApplying !== null} onClick={() => void chooseBackgroundMedia('main')}>浏览</button>
          </div>
          <small>本地文件通过“浏览”导入后会复制到应用壁纸目录，避免原文件移动后失效。</small>
        </div>
        <div className="button-row compact-button-row">
          <button className="btn-secondary" type="button" disabled={backgroundApplying !== null} onClick={() => void chooseBackgroundMedia('main')}>选择图片 / 动态壁纸</button>
          <button className="btn-secondary" type="button" onClick={() => { setMainBackgroundDraft(''); setGlobal({ backgroundImage: '', backgroundEnabled: false }); }}>清除背景</button>
        </div>
        <div className="background-controls-grid">
          <div className="field-row">
            <label>媒体类型</label>
            <select className="soft-input" value={globalDisplay.backgroundMediaKind ?? 'auto'} onChange={(event) => setGlobal({ backgroundMediaKind: event.target.value as DisplaySettings['backgroundMediaKind'] })}>
              <option value="auto">自动识别</option>
              <option value="image">图片 / 动态图片</option>
              <option value="video">视频壁纸</option>
            </select>
          </div>
          <div className="field-row">
            <label>适应界面</label>
            <select className="soft-input" value={globalDisplay.backgroundFit ?? 'cover'} onChange={(event) => setGlobal({ backgroundFit: event.target.value as DisplaySettings['backgroundFit'] })}>
              <option value="cover">智能裁切铺满</option>
              <option value="contain">完整显示</option>
              <option value="stretch">拉伸铺满</option>
              <option value="tile">原尺寸平铺（图片）</option>
            </select>
          </div>
        </div>
        {globalDisplay.backgroundFit === 'contain' && (
          <label className="check-row background-ambient-toggle">
            <input type="checkbox" checked={globalDisplay.backgroundContainAmbient !== false} onChange={(event) => setGlobal({ backgroundContainAmbient: event.target.checked })} />
            <span><strong>柔化填充留白</strong><small>完整显示图片时，用同一张图的模糊放大层填充两侧空白。</small></span>
          </label>
        )}
        <div className="background-slider-grid">
          <SliderRow label="背景可见度" min={0} max={1} step={0.05} value={globalDisplay.backgroundOpacity ?? 0.62} onChange={(value) => setGlobal({ backgroundOpacity: Math.round(value * 100) / 100 })} />
          <SliderRow label="背景压暗" min={0} max={0.9} step={0.05} value={globalDisplay.backgroundDim ?? 0.18} onChange={(value) => setGlobal({ backgroundDim: Math.round(value * 100) / 100 })} />
          <SliderRow label="背景模糊" min={0} max={32} step={1} value={globalDisplay.backgroundBlur ?? 0} unit="px" onChange={(value) => setGlobal({ backgroundBlur: value })} />
          <SliderRow label="面板不透明度" min={0.2} max={1} step={0.05} value={globalDisplay.backgroundPanelOpacity ?? 0.86} onChange={(value) => setGlobal({ backgroundPanelOpacity: Math.round(value * 100) / 100 })} />
        </div>
        <div className="field-row">
          <label>画面焦点位置</label>
          <BackgroundPositionPicker
            x={globalDisplay.backgroundPositionX ?? 50}
            y={globalDisplay.backgroundPositionY ?? 50}
            onChange={(x, y) => setGlobal({ backgroundPositionX: x, backgroundPositionY: y })}
          />
          <small>“智能裁切铺满”时，焦点决定优先保留画面的哪一部分。</small>
        </div>
        <div className="background-motion-card">
          <label className="check-row">
            <input type="checkbox" checked={globalDisplay.backgroundMotionEnabled !== false} onChange={(event) => setGlobal({ backgroundMotionEnabled: event.target.checked })} />
            <span><strong>播放视频壁纸</strong><small>视频会自动静音循环；GIF、APNG、动态 WebP 由图片文件自身播放。</small></span>
          </label>
          <label className="check-row">
            <input type="checkbox" checked={globalDisplay.backgroundPauseWhenHidden !== false} onChange={(event) => setGlobal({ backgroundPauseWhenHidden: event.target.checked })} />
            <span><strong>窗口不可见时暂停视频</strong><small>降低后台 CPU、GPU 与耗电；重新显示窗口时继续播放。</small></span>
          </label>
          <SliderRow label="视频播放速度" min={0.25} max={2} step={0.25} value={globalDisplay.backgroundPlaybackRate ?? 1} unit="×" onChange={(value) => setGlobal({ backgroundPlaybackRate: value })} />
        </div>
        <WallpaperPreview
          title="主界面实时预览"
          source={globalDisplay.backgroundImage || ''}
          enabled={globalDisplay.backgroundEnabled === true}
          mediaKind={globalDisplay.backgroundMediaKind ?? 'auto'}
          fit={globalDisplay.backgroundFit ?? 'cover'}
          x={globalDisplay.backgroundPositionX ?? 50}
          y={globalDisplay.backgroundPositionY ?? 50}
          opacity={globalDisplay.backgroundOpacity ?? 0.62}
          dim={globalDisplay.backgroundDim ?? 0.18}
          blur={globalDisplay.backgroundBlur ?? 0}
          motionEnabled={globalDisplay.backgroundMotionEnabled !== false}
          playbackRate={globalDisplay.backgroundPlaybackRate ?? 1}
          pauseWhenHidden={globalDisplay.backgroundPauseWhenHidden !== false}
          containAmbient={globalDisplay.backgroundContainAmbient !== false}
          panelOpacity={globalDisplay.backgroundPanelOpacity ?? 0.86}
          reduceMotion={experience.reduceMotion}
          onPositionChange={(x, y) => setGlobal({ backgroundPositionX: x, backgroundPositionY: y })}
        />
      </CollapsibleSection>

      <CollapsibleSection
        id="settingsBackground"
        title="设置界面背景与动态壁纸"
        hint="与主界面背景完全分开"
        collapsed={collapsedSections.has('settingsBackground')}
        onToggle={toggleSection}
      >
        <div className="background-setting-toolbar">
          <label className="check-row">
            <input
              type="checkbox"
              checked={globalDisplay.settingsBackgroundEnabled === true}
              onChange={(event) => setGlobal({ settingsBackgroundEnabled: event.target.checked })}
            />
            启用设置界面背景
          </label>
          <button className="btn-secondary btn-compact" type="button" onClick={resetSettingsBackgroundPresentation}>恢复推荐显示</button>
        </div>
        <div className="field-row">
          <label>设置背景媒体路径</label>
          <div className="path-pick-row">
            <input
              className="soft-input"
              value={settingsBackgroundDraft}
              placeholder="输入地址后点击应用；本地文件建议用“浏览”选择"
              onChange={(event) => setSettingsBackgroundDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void applyBackgroundDraft('settings');
              }}
            />
            <button className="btn-secondary" type="button" disabled={backgroundApplying !== null} onClick={() => void applyBackgroundDraft('settings')}>{backgroundApplying === 'settings' ? '处理中…' : '应用'}</button>
            <button className="btn-secondary" type="button" disabled={backgroundApplying !== null} onClick={() => void chooseBackgroundMedia('settings')}>浏览</button>
          </div>
        </div>
        <div className="button-row compact-button-row">
          <button className="btn-secondary" type="button" disabled={backgroundApplying !== null} onClick={() => void chooseBackgroundMedia('settings')}>选择设置背景</button>
          <button className="btn-secondary" type="button" onClick={() => { setSettingsBackgroundDraft(''); setGlobal({ settingsBackgroundImage: '', settingsBackgroundEnabled: false }); }}>清除设置背景</button>
        </div>
        <div className="background-controls-grid">
          <div className="field-row">
            <label>媒体类型</label>
            <select className="soft-input" value={globalDisplay.settingsBackgroundMediaKind ?? 'auto'} onChange={(event) => setGlobal({ settingsBackgroundMediaKind: event.target.value as DisplaySettings['settingsBackgroundMediaKind'] })}>
              <option value="auto">自动识别</option>
              <option value="image">图片 / 动态图片</option>
              <option value="video">视频壁纸</option>
            </select>
          </div>
          <div className="field-row">
            <label>适应界面</label>
            <select className="soft-input" value={globalDisplay.settingsBackgroundFit ?? 'cover'} onChange={(event) => setGlobal({ settingsBackgroundFit: event.target.value as DisplaySettings['settingsBackgroundFit'] })}>
              <option value="cover">智能裁切铺满</option>
              <option value="contain">完整显示</option>
              <option value="stretch">拉伸铺满</option>
              <option value="tile">原尺寸平铺（图片）</option>
            </select>
          </div>
        </div>
        {globalDisplay.settingsBackgroundFit === 'contain' && (
          <label className="check-row background-ambient-toggle">
            <input type="checkbox" checked={globalDisplay.settingsBackgroundContainAmbient !== false} onChange={(event) => setGlobal({ settingsBackgroundContainAmbient: event.target.checked })} />
            <span><strong>柔化填充留白</strong><small>完整显示时自动柔化填充空白区域。</small></span>
          </label>
        )}
        <div className="background-slider-grid">
          <SliderRow label="背景可见度" min={0} max={1} step={0.05} value={globalDisplay.settingsBackgroundOpacity ?? 0.62} onChange={(value) => setGlobal({ settingsBackgroundOpacity: Math.round(value * 100) / 100 })} />
          <SliderRow label="背景压暗" min={0} max={0.9} step={0.05} value={globalDisplay.settingsBackgroundDim ?? 0.18} onChange={(value) => setGlobal({ settingsBackgroundDim: Math.round(value * 100) / 100 })} />
          <SliderRow label="背景模糊" min={0} max={32} step={1} value={globalDisplay.settingsBackgroundBlur ?? 0} unit="px" onChange={(value) => setGlobal({ settingsBackgroundBlur: value })} />
        </div>
        <SettingsSurfaceAppearanceControls display={globalDisplay} onChange={setGlobal} />
        <div className="field-row">
          <label>画面焦点位置</label>
          <BackgroundPositionPicker
            x={globalDisplay.settingsBackgroundPositionX ?? 50}
            y={globalDisplay.settingsBackgroundPositionY ?? 50}
            onChange={(x, y) => setGlobal({ settingsBackgroundPositionX: x, settingsBackgroundPositionY: y })}
          />
        </div>
        <div className="background-motion-card">
          <label className="check-row">
            <input type="checkbox" checked={globalDisplay.settingsBackgroundMotionEnabled !== false} onChange={(event) => setGlobal({ settingsBackgroundMotionEnabled: event.target.checked })} />
            <span><strong>播放视频壁纸</strong><small>设置窗口打开期间播放视频；动态图片按文件自身播放。</small></span>
          </label>
          <label className="check-row">
            <input type="checkbox" checked={globalDisplay.settingsBackgroundPauseWhenHidden !== false} onChange={(event) => setGlobal({ settingsBackgroundPauseWhenHidden: event.target.checked })} />
            <span><strong>应用失焦或隐藏时暂停视频</strong><small>切换到其他窗口或最小化时暂停，返回后继续播放。</small></span>
          </label>
          <SliderRow label="视频播放速度" min={0.25} max={2} step={0.25} value={globalDisplay.settingsBackgroundPlaybackRate ?? 1} unit="×" onChange={(value) => setGlobal({ settingsBackgroundPlaybackRate: value })} />
        </div>
        <WallpaperPreview
          title="设置界面实时预览"
          source={globalDisplay.settingsBackgroundImage || ''}
          enabled={globalDisplay.settingsBackgroundEnabled === true}
          mediaKind={globalDisplay.settingsBackgroundMediaKind ?? 'auto'}
          fit={globalDisplay.settingsBackgroundFit ?? 'cover'}
          x={globalDisplay.settingsBackgroundPositionX ?? 50}
          y={globalDisplay.settingsBackgroundPositionY ?? 50}
          opacity={globalDisplay.settingsBackgroundOpacity ?? 0.62}
          dim={globalDisplay.settingsBackgroundDim ?? 0.18}
          blur={globalDisplay.settingsBackgroundBlur ?? 0}
          motionEnabled={globalDisplay.settingsBackgroundMotionEnabled !== false}
          playbackRate={globalDisplay.settingsBackgroundPlaybackRate ?? 1}
          pauseWhenHidden={globalDisplay.settingsBackgroundPauseWhenHidden !== false}
          containAmbient={globalDisplay.settingsBackgroundContainAmbient !== false}
          panelOpacity={globalDisplay.settingsBackgroundPanelOpacity ?? 0.9}
          reduceMotion={experience.reduceMotion}
          glass={globalDisplay.settingsBackgroundGlassEffect === true}
          glassBlur={globalDisplay.settingsBackgroundGlassBlur ?? 22}
          glassSaturation={globalDisplay.settingsBackgroundGlassSaturation ?? 1.32}
          glassHighlight={globalDisplay.settingsBackgroundGlassHighlight ?? 0.72}
          onPositionChange={(x, y) => setGlobal({ settingsBackgroundPositionX: x, settingsBackgroundPositionY: y })}
        />
      </CollapsibleSection>

      <CollapsibleSection
        id="local"
        title={`当前子目录独立设置${activeDirectory ? `：${activeDirectory.name}` : ''}`}
        hint={`已覆盖 ${localOverrideCount} 项`}
        collapsed={collapsedSections.has('local')}
        onToggle={toggleSection}
      >
        <p className="settings-hint">这里的修改只影响当前子目录；不设置时继承上面的统一默认设置。</p>
        <div className="field-row">
          <label>当前目录显示行数</label>
          <div className="segmented">
            {[1, 2, 3, 4, 5].map((line) => (
              <button key={line} className={localDisplay.labelLines === line ? 'active' : ''} disabled={!activeDirectory} onClick={() => setLocal({ labelLines: line })}>{line}</button>
            ))}
          </div>
        </div>
        <SliderRow label="当前目录图标大小" min={32} max={128} step={4} value={localDisplay.iconSize} unit="px" onChange={(value) => setLocal({ iconSize: value })} />
        <SliderRow label="当前目录占位宽度" min={72} max={260} step={4} value={localDisplay.itemWidth} unit="px" onChange={(value) => setLocal({ itemWidth: value })} />
        <SliderRow label="当前目录占位高度" min={82} max={320} step={4} value={localDisplay.itemHeight} unit="px" onChange={(value) => setLocal({ itemHeight: value })} />
        <SliderRow label="当前目录间距" min={4} max={40} step={2} value={localDisplay.gridGap} unit="px" onChange={(value) => setLocal({ gridGap: value })} />
        <div className="field-row">
          <label>当前目录查看方式</label>
          <div className="segmented">
            <button className={localDisplay.viewMode === 'grid' ? 'active' : ''} disabled={!activeDirectory} onClick={() => setLocal({ viewMode: 'grid' })}>图标</button>
            <button className={localDisplay.viewMode === 'compact' ? 'active' : ''} disabled={!activeDirectory} onClick={() => setLocal({ viewMode: 'compact' })}>紧凑</button>
          </div>
        </div>
        <div className="button-row">
          <button className="btn-secondary" disabled={!activeDirectory} onClick={() => activeDirectory && updateDirectoryDisplay(activeDirectory.id, { ...globalDisplay })}>复制统一默认到当前目录</button>
          <button className="btn-secondary" disabled={!activeDirectory || !localOverrideCount} onClick={() => activeDirectory && clearDirectoryDisplay(activeDirectory.id)}>恢复继承统一默认</button>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        id="preview"
        title="实时预览"
        collapsed={collapsedSections.has('preview')}
        onToggle={toggleSection}
      >
        <div className="preview-card" style={{ width: localDisplay.itemWidth, minHeight: localDisplay.itemHeight }}>
          <div className="preview-icon" style={{ width: localDisplay.iconSize, height: localDisplay.iconSize }}>⌘</div>
          <div
            className="item-label"
            style={{
              '--label-lines': localDisplay.labelLines,
              '--label-chars': localDisplay.charsPerLine,
              '--label-font-size': localDisplay.fontSize
            } as CSSProperties}
            title="这是一段用于预览的很长的快捷方式名称"
          >
            这是一段用于预览的很长的快捷方式名称
          </div>
        </div>
      </CollapsibleSection>
    </section>
  );
}
