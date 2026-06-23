import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { Archive, BookOpen, Database, Globe, HeartHandshake, Image, MonitorCog, MousePointerClick, Move, Palette, Search, Sparkles, StickyNote, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useAppStore } from '../../stores/appStore';
import type { AppConfig, EdgeAnimationStyle } from '../../types';
import { DisplaySettings } from './DisplaySettings';
import { ThemePicker } from './ThemePicker';
import { ImageBrowserSettingsSection, SearchSettingsSection, TransferStationSettingsSection } from './GlobalSearchSettingsSection';
import { ThemeGallerySection } from './ThemeGallerySection';
import { NoteSettingsSection } from './NoteSettingsSection';
import { getAutoSaveTargetPath, saveConfigToPath } from '../../hooks/useAutoSave';
import { uiAlert } from '../../lib/uiDialog';
import sponsorQr from '../../assets/sponsor-qr.png';

type SettingsTab = 'general' | 'behavior' | 'drag' | 'rainbow' | 'window' | 'interface' | 'icons' | 'notes' | 'search' | 'transfer' | 'image' | 'help' | 'sponsor' | 'data';

const tabs: Array<{ id: SettingsTab; label: string; icon: typeof Palette }> = [
  { id: 'general', label: '常规', icon: Palette },
  { id: 'behavior', label: '操作', icon: MousePointerClick },
  { id: 'drag', label: '拖动', icon: Move },
  { id: 'rainbow', label: '彩虹', icon: Sparkles },
  { id: 'window', label: '窗口行为', icon: Move },
  { id: 'interface', label: '界面', icon: MonitorCog },
  { id: 'icons', label: '图标', icon: Globe },
  { id: 'notes', label: '便签', icon: StickyNote },
  { id: 'search', label: '搜索', icon: Search },
  { id: 'transfer', label: '中转', icon: Archive },
  { id: 'image', label: '图片预览', icon: Image },
  { id: 'help', label: '说明', icon: BookOpen },
  { id: 'sponsor', label: '赞助', icon: HeartHandshake },
  { id: 'data', label: '数据', icon: Database }
];

type SettingsPanelRect = { left: number; top: number; width: number; height: number };

const PANEL_RECT_STORAGE_KEY = 'win-launcher-settings-panel-rect';
const APP_DISPLAY_VERSION = 'v44';
const APP_PACKAGE_VERSION = '0.1.44';


function SliderRow({ label, value, min, max, step = 1, onChange, unit = '' }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="field-row">
      <label>{label}：{value}{unit}</label>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </div>
  );
}


const DEFAULT_RAINBOW_COLORS = ['#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#00C7FF', '#5856D6', '#FF2D55'];
const RAINBOW_BAR_STOPS = [
  '#FF0000', '#FF3300', '#FF6600', '#FF9900', '#FFCC00', '#FFFF00', '#CCFF00', '#66FF00',
  '#00FF44', '#00FFAA', '#00FFEE', '#00CCFF', '#0088FF', '#0044FF', '#2200FF', '#6600FF',
  '#9900FF', '#CC00FF', '#FF00CC', '#FF0088', '#FF0044', '#FF0000'
];
const RAINBOW_PRESET_COLORS = [
  '#FF6B6B', '#FF9F43', '#FECA57', '#48DBFB', '#1DD1A1', '#54A0FF', '#5F27CD', '#FF6EB4', '#00D2D3', '#C44569',
  '#F8A5C2', '#F9CA24', '#6AB04C', '#22A6B3', '#E55039', '#FD79A8', '#A29BFE', '#74B9FF', '#55EFC4', '#FDCB6E',
  '#E17055', '#0984E3', '#6C5CE7', '#00CEC9', '#BADC58', '#FF4757', '#2ED573', '#1E90FF', '#ECCC68', '#A4B0BE'
];

function normalizeColorList(value: unknown): string[] {
  const source = Array.isArray(value) ? value : DEFAULT_RAINBOW_COLORS;
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of source) {
    const hex = String(item ?? '').trim().toUpperCase();
    if (!/^#[0-9A-F]{6}$/.test(hex) || seen.has(hex)) continue;
    seen.add(hex);
    result.push(hex);
    if (result.length >= 24) break;
  }
  return result.length ? result : DEFAULT_RAINBOW_COLORS;
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0').toUpperCase();
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function colorAtRatio(ratio: number): string {
  const h = Math.max(0, Math.min(1, ratio)) * 360;
  return hslToHex(h >= 360 ? 0 : h, 100, 58);
}

function gradientFromColors(colors: string[]) {
  const clean = normalizeColorList(colors);
  return `linear-gradient(90deg, ${clean.concat(clean[0]).join(', ')})`;
}

function conicGradientFromColors(colors: string[]) {
  const clean = normalizeColorList(colors);
  return `conic-gradient(${clean.concat(clean[0]).join(', ')})`;
}

function clampRatio(value: number) {
  return Math.max(0, Math.min(1, value));
}

function RainbowColorBar({ title, hint, value, onChange }: {
  title: string;
  hint: string;
  value?: string[];
  onChange: (colors: string[]) => void;
}) {
  const colors = useMemo(() => normalizeColorList(value), [value]);
  const [posA, setPosA] = useState(0.06);
  const [posB, setPosB] = useState(0.62);
  const [activeLine, setActiveLine] = useState<'A' | 'B'>('A');
  const barRef = useRef<HTMLDivElement | null>(null);
  const dragLineRef = useRef<'A' | 'B' | null>(null);
  const colorA = colorAtRatio(posA);
  const colorB = colorAtRatio(posB);

  function commitColors(next: string[]) {
    onChange(normalizeColorList(next));
  }

  function addColor(hex: string) {
    const clean = String(hex).toUpperCase();
    if (!/^#[0-9A-F]{6}$/.test(clean)) return;
    if (colors.includes(clean)) return;
    commitColors([...colors, clean]);
  }

  function replaceWithDefaults() {
    commitColors(DEFAULT_RAINBOW_COLORS);
  }

  function ratioFromClientX(clientX: number) {
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return 0;
    return clampRatio((clientX - rect.left) / rect.width);
  }

  function setLinePosition(which: 'A' | 'B', ratio: number) {
    if (which === 'A') setPosA(ratio);
    else setPosB(ratio);
  }

  function handleBarPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest('.rainbow-color-handle')) return;
    const ratio = ratioFromClientX(event.clientX);
    setLinePosition(activeLine, ratio);
    addColor(colorAtRatio(ratio));
  }

  function startHandleDrag(which: 'A' | 'B', event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    dragLineRef.current = which;
    setActiveLine(which);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setLinePosition(which, ratioFromClientX(event.clientX));
  }

  function handleDragMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const which = dragLineRef.current;
    if (!which) return;
    setLinePosition(which, ratioFromClientX(event.clientX));
  }

  function stopHandleDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!dragLineRef.current) return;
    try { event.currentTarget.releasePointerCapture?.(event.pointerId); } catch { /* ignore */ }
    dragLineRef.current = null;
  }

  function useRangeColors() {
    const start = Math.min(posA, posB);
    const end = Math.max(posA, posB);
    const count = 8;
    const next = Array.from({ length: count }, (_, index) => {
      const ratio = start + (end - start) * (index / Math.max(1, count - 1));
      return colorAtRatio(ratio);
    });
    commitColors(next);
  }

  function removeColor(index: number) {
    const next = colors.filter((_, i) => i !== index);
    commitColors(next.length ? next : DEFAULT_RAINBOW_COLORS);
  }

  return (
    <div className="rainbow-color-editor">
      <div className="rainbow-color-editor-title">
        <strong>{title}</strong>
        <small>{hint}</small>
      </div>
      <div
        className="rainbow-color-bar"
        ref={barRef}
        style={{ '--rainbow-picker-bar': `linear-gradient(90deg, ${RAINBOW_BAR_STOPS.join(', ')})` } as CSSProperties}
        onPointerDown={handleBarPointerDown}
      >
        <span className="rainbow-color-line line-a" style={{ left: `${posA * 100}%` }} />
        <button
          type="button"
          className="rainbow-color-handle handle-a"
          title="竖线 A"
          style={{ left: `${posA * 100}%`, background: colorA } as CSSProperties}
          onPointerDown={(event) => startHandleDrag('A', event)}
          onPointerMove={handleDragMove}
          onPointerUp={stopHandleDrag}
          onPointerCancel={stopHandleDrag}
        />
        <span className="rainbow-color-line line-b" style={{ left: `${posB * 100}%` }} />
        <button
          type="button"
          className="rainbow-color-handle handle-b"
          title="竖线 B"
          style={{ left: `${posB * 100}%`, background: colorB } as CSSProperties}
          onPointerDown={(event) => startHandleDrag('B', event)}
          onPointerMove={handleDragMove}
          onPointerUp={stopHandleDrag}
          onPointerCancel={stopHandleDrag}
        />
      </div>
      <div className="rainbow-line-tools">
        <span>点击设定竖线：</span>
        <button type="button" className={`btn-secondary btn-compact ${activeLine === 'A' ? 'active-soft' : ''}`} onClick={() => setActiveLine('A')}>竖线 A</button>
        <button type="button" className={`btn-secondary btn-compact ${activeLine === 'B' ? 'active-soft' : ''}`} onClick={() => setActiveLine('B')}>竖线 B</button>
        <button type="button" className="btn-secondary btn-compact" onClick={useRangeColors}>使用 A-B 范围</button>
      </div>
      <div className="rainbow-hex-row">
        <span className="rainbow-hex-badge"><b>A</b><i style={{ background: colorA }} />{colorA}<button type="button" onClick={() => addColor(colorA)}>加入</button></span>
        <span className="rainbow-hex-badge"><b>B</b><i style={{ background: colorB }} />{colorB}<button type="button" onClick={() => addColor(colorB)}>加入</button></span>
      </div>
      <div className="rainbow-selected-strip" style={{ '--rainbow-selected-gradient': gradientFromColors(colors) } as CSSProperties} />
      <div className="rainbow-swatch-row">
        {colors.map((hex, index) => (
          <button type="button" className="rainbow-swatch" key={`${hex}-${index}`} title={`${hex}，点击删除`} style={{ background: hex }} onClick={() => removeColor(index)}>
            <span>×</span>
          </button>
        ))}
      </div>
      <div className="rainbow-preset-strip">
        {RAINBOW_PRESET_COLORS.map((hex) => (
          <button type="button" key={hex} className="rainbow-preset-swatch" title={`加入 ${hex}`} style={{ background: hex }} onClick={() => addColor(hex)} />
        ))}
      </div>
      <div className="rainbow-color-actions">
        <button type="button" className="btn-secondary btn-compact" onClick={replaceWithDefaults}>恢复默认彩虹色</button>
      </div>
    </div>
  );
}


type BehaviorSectionId = 'edgeAutoHide' | 'edgeTrigger' | 'launchClose';
const BEHAVIOR_SECTION_IDS: BehaviorSectionId[] = ['edgeAutoHide', 'edgeTrigger', 'launchClose'];
const DEFAULT_BEHAVIOR_COLLAPSED_SECTIONS = new Set<BehaviorSectionId>(BEHAVIOR_SECTION_IDS);
const BEHAVIOR_COLLAPSE_STORAGE_KEY = 'settings.behavior';

function readStoredBool(key: string, fallback = false) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === '1') return true;
    if (raw === '0') return false;
    return fallback;
  } catch {
    return fallback;
  }
}

function readStoredBehaviorSections(key: string) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set(DEFAULT_BEHAVIOR_COLLAPSED_SECTIONS);
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set(DEFAULT_BEHAVIOR_COLLAPSED_SECTIONS);
    const next = new Set(parsed.filter((id): id is BehaviorSectionId => BEHAVIOR_SECTION_IDS.includes(id as BehaviorSectionId)));
    return next.size ? next : new Set(DEFAULT_BEHAVIOR_COLLAPSED_SECTIONS);
  } catch {
    return new Set(DEFAULT_BEHAVIOR_COLLAPSED_SECTIONS);
  }
}

function useBehaviorCollapsedSections() {
  const rememberKey = `${BEHAVIOR_COLLAPSE_STORAGE_KEY}:remember`;
  const collapsedKey = `${BEHAVIOR_COLLAPSE_STORAGE_KEY}:collapsed`;
  const [rememberBehaviorCollapseState, setRememberBehaviorCollapseStateValue] = useState(() => readStoredBool(rememberKey, false));
  const [collapsedBehaviorSections, setCollapsedBehaviorSections] = useState<Set<BehaviorSectionId>>(() => {
    if (!readStoredBool(rememberKey, false)) return new Set(DEFAULT_BEHAVIOR_COLLAPSED_SECTIONS);
    return readStoredBehaviorSections(collapsedKey);
  });

  useEffect(() => {
    if (!rememberBehaviorCollapseState) {
      setCollapsedBehaviorSections(new Set(DEFAULT_BEHAVIOR_COLLAPSED_SECTIONS));
      return;
    }
    setCollapsedBehaviorSections(readStoredBehaviorSections(collapsedKey));
  }, [rememberBehaviorCollapseState, collapsedKey]);

  function persist(next: Set<BehaviorSectionId>, remember = rememberBehaviorCollapseState) {
    if (!remember) return;
    try {
      localStorage.setItem(collapsedKey, JSON.stringify(Array.from(next)));
    } catch {
      // ignore storage errors
    }
  }

  function setRememberBehaviorCollapseState(enabled: boolean) {
    setRememberBehaviorCollapseStateValue(enabled);
    try {
      localStorage.setItem(rememberKey, enabled ? '1' : '0');
    } catch {
      // ignore storage errors
    }
    if (enabled) {
      persist(collapsedBehaviorSections, true);
    } else {
      setCollapsedBehaviorSections(new Set(DEFAULT_BEHAVIOR_COLLAPSED_SECTIONS));
    }
  }

  function applyBehaviorCollapsedSections(next: Set<BehaviorSectionId>) {
    setCollapsedBehaviorSections(next);
    persist(next);
  }

  function toggleBehaviorSection(id: BehaviorSectionId) {
    setCollapsedBehaviorSections((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      persist(next);
      return next;
    });
  }

  return {
    collapsedBehaviorSections,
    rememberBehaviorCollapseState,
    setRememberBehaviorCollapseState,
    applyBehaviorCollapsedSections,
    toggleBehaviorSection
  };
}

function BehaviorCollapseBlock({ id, title, hint, collapsed, onToggle, children }: {
  id: BehaviorSectionId;
  title: string;
  hint?: string;
  collapsed: boolean;
  onToggle: (id: BehaviorSectionId) => void;
  children: ReactNode;
}) {
  return (
    <div className="settings-collapse-block">
      <button type="button" className="settings-collapse-header" aria-expanded={!collapsed} onClick={() => onToggle(id)}>
        <span className="settings-collapse-arrow" aria-hidden="true">{collapsed ? '▸' : '▾'}</span>
        <span className="settings-collapse-title">{title}</span>
        {hint && <span className="settings-collapse-hint">{hint}</span>}
      </button>
      {!collapsed && <div className="settings-collapse-content">{children}</div>}
    </div>
  );
}


type RainbowSectionId = 'rainbowMaster' | 'rainbowMouse' | 'rainbowBorder' | 'rainbowText';
const RAINBOW_SECTION_IDS: RainbowSectionId[] = ['rainbowMaster', 'rainbowMouse', 'rainbowBorder', 'rainbowText'];
const DEFAULT_RAINBOW_COLLAPSED_SECTIONS = new Set<RainbowSectionId>(RAINBOW_SECTION_IDS);
const RAINBOW_COLLAPSE_STORAGE_KEY = 'settings.rainbow';

function readStoredRainbowSections(key: string) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set(DEFAULT_RAINBOW_COLLAPSED_SECTIONS);
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set(DEFAULT_RAINBOW_COLLAPSED_SECTIONS);
    const next = new Set(parsed.filter((id): id is RainbowSectionId => RAINBOW_SECTION_IDS.includes(id as RainbowSectionId)));
    return next.size ? next : new Set(DEFAULT_RAINBOW_COLLAPSED_SECTIONS);
  } catch {
    return new Set(DEFAULT_RAINBOW_COLLAPSED_SECTIONS);
  }
}

function useRainbowCollapsedSections() {
  const rememberKey = `${RAINBOW_COLLAPSE_STORAGE_KEY}:remember`;
  const collapsedKey = `${RAINBOW_COLLAPSE_STORAGE_KEY}:collapsed`;
  const [rememberRainbowCollapseState, setRememberRainbowCollapseStateValue] = useState(() => readStoredBool(rememberKey, false));
  const [collapsedRainbowSections, setCollapsedRainbowSections] = useState<Set<RainbowSectionId>>(() => {
    if (!readStoredBool(rememberKey, false)) return new Set(DEFAULT_RAINBOW_COLLAPSED_SECTIONS);
    return readStoredRainbowSections(collapsedKey);
  });

  useEffect(() => {
    if (!rememberRainbowCollapseState) {
      setCollapsedRainbowSections(new Set(DEFAULT_RAINBOW_COLLAPSED_SECTIONS));
      return;
    }
    setCollapsedRainbowSections(readStoredRainbowSections(collapsedKey));
  }, [rememberRainbowCollapseState, collapsedKey]);

  function persist(next: Set<RainbowSectionId>, remember = rememberRainbowCollapseState) {
    if (!remember) return;
    try {
      localStorage.setItem(collapsedKey, JSON.stringify(Array.from(next)));
    } catch {
      // ignore storage errors
    }
  }

  function setRememberRainbowCollapseState(enabled: boolean) {
    setRememberRainbowCollapseStateValue(enabled);
    try {
      localStorage.setItem(rememberKey, enabled ? '1' : '0');
    } catch {
      // ignore storage errors
    }
    if (enabled) {
      persist(collapsedRainbowSections, true);
    } else {
      setCollapsedRainbowSections(new Set(DEFAULT_RAINBOW_COLLAPSED_SECTIONS));
    }
  }

  function applyRainbowCollapsedSections(next: Set<RainbowSectionId>) {
    setCollapsedRainbowSections(next);
    persist(next);
  }

  function toggleRainbowSection(id: RainbowSectionId) {
    setCollapsedRainbowSections((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      persist(next);
      return next;
    });
  }

  return {
    collapsedRainbowSections,
    rememberRainbowCollapseState,
    setRememberRainbowCollapseState,
    applyRainbowCollapsedSections,
    toggleRainbowSection
  };
}

function RainbowCollapseBlock({ id, title, hint, collapsed, onToggle, children }: {
  id: RainbowSectionId;
  title: string;
  hint?: string;
  collapsed: boolean;
  onToggle: (id: RainbowSectionId) => void;
  children: ReactNode;
}) {
  return (
    <div className="settings-collapse-block rainbow-collapse-block">
      <button type="button" className="settings-collapse-header" aria-expanded={!collapsed} onClick={() => onToggle(id)}>
        <span className="settings-collapse-arrow" aria-hidden="true">{collapsed ? '▸' : '▾'}</span>
        <span className="settings-collapse-title">{title}</span>
        {hint && <span className="settings-collapse-hint">{hint}</span>}
      </button>
      {!collapsed && <div className="settings-collapse-content">{children}</div>}
    </div>
  );
}

function viewportSize() {
  if (typeof window === 'undefined') return { width: 1280, height: 800 };
  return { width: window.innerWidth, height: window.innerHeight };
}

function defaultPanelRect(): SettingsPanelRect {
  const viewport = viewportSize();
  const width = Math.min(980, Math.max(640, viewport.width - 72));
  const height = Math.min(680, Math.max(440, viewport.height - 72));
  return {
    left: Math.round(Math.max(16, (viewport.width - width) / 2)),
    top: Math.round(Math.max(16, (viewport.height - height) / 2)),
    width,
    height
  };
}

function sanitizePanelRect(rect: Partial<SettingsPanelRect>): SettingsPanelRect {
  const viewport = viewportSize();
  const fallback = defaultPanelRect();
  const width = Math.round(Math.min(Math.max(Number(rect.width) || fallback.width, 520), Math.max(520, viewport.width + 240)));
  const height = Math.round(Math.min(Math.max(Number(rect.height) || fallback.height, 360), Math.max(360, viewport.height + 180)));
  const minVisible = 120;
  const rawLeft = Number.isFinite(rect.left) ? Number(rect.left) : fallback.left;
  const rawTop = Number.isFinite(rect.top) ? Number(rect.top) : fallback.top;
  const left = Math.round(Math.min(viewport.width - minVisible, Math.max(-width + minVisible, rawLeft)));
  const top = Math.round(Math.min(viewport.height - minVisible, Math.max(-height + minVisible, rawTop)));
  return { left, top, width, height };
}

export function SettingsPanel() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [panelRect, setPanelRect] = useState(() => {
    try {
      const saved = localStorage.getItem(PANEL_RECT_STORAGE_KEY);
      if (saved) return sanitizePanelRect(JSON.parse(saved));
    } catch {
      // ignore damaged local storage data
    }
    return defaultPanelRect();
  });
  const settingsOpen = useAppStore((state) => state.settingsOpen);
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen);
  const behavior = useAppStore((state) => state.behavior);
  const currentTheme = useAppStore((state) => state.theme);
  const setTheme = useAppStore((state) => state.setTheme);
  const display = useAppStore((state) => state.display);
  const settingsUiScale = display.settingsUiScale ?? display.uiScale ?? 1;
  const autoSave = useAppStore((state) => state.autoSave);
  const updateAutoSave = useAppStore((state) => state.updateAutoSave);
  const updateBehavior = useAppStore((state) => state.updateBehavior);
  const updateDisplay = useAppStore((state) => state.updateDisplay);
  const globalSearch = useAppStore((state) => state.globalSearch);
  const transferStation = useAppStore((state) => state.transferStation);
  const imageBrowser = useAppStore((state) => state.imageBrowser);
  const notes = useAppStore((state) => state.notes);
  const updateGlobalSearch = useAppStore((state) => state.updateGlobalSearch);
  const updateTransferStation = useAppStore((state) => state.updateTransferStation);
  const updateImageBrowser = useAppStore((state) => state.updateImageBrowser);
  const updateNoteSettings = useAppStore((state) => state.updateNoteSettings);
  const exportConfig = useAppStore((state) => state.exportConfig);
  const importConfig = useAppStore((state) => state.importConfig);
  const behaviorCollapse = useBehaviorCollapsedSections();
  const rainbowCollapse = useRainbowCollapsedSections();

  useEffect(() => {
    if (!settingsOpen) return;
    localStorage.setItem(PANEL_RECT_STORAGE_KEY, JSON.stringify(panelRect));
  }, [panelRect, settingsOpen]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && settingsOpen) setSettingsOpen(false);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setSettingsOpen, settingsOpen]);

  function startPanelDrag(event: ReactMouseEvent<HTMLElement>) {
    if (event.button !== 0 || !panelRef.current) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('button, input, textarea, select, a, .settings-content, .settings-nav, .settings-footer-close')) return;
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startY = event.clientY;
    const startRect = { ...panelRect };

    function handleMove(moveEvent: MouseEvent) {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      const next = sanitizePanelRect({
        ...startRect,
        left: startRect.left + dx,
        top: startRect.top + dy
      });
      setPanelRect(next);
    }

    function handleUp() {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    }

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  }

  useEffect(() => {
    if (!settingsOpen) return;
    setPanelRect((current) => sanitizePanelRect(current));
  }, [settingsOpen, settingsUiScale]);


  if (!settingsOpen) return null;

  async function handleExport() {
    const target = await save({
      title: '导出配置',
      defaultPath: 'win-launcher-config.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (!target) return;
    await invoke('save_config', { config: JSON.stringify(exportConfig(), null, 2), path: target });
  }

  async function handleImport() {
    const selected = await open({
      title: '导入配置',
      multiple: false,
      filters: [
        { name: '支持的配置', extensions: ['json', 'db'] },
        { name: 'JSON 配置', extensions: ['json'] },
        { name: 'Lucy / Maye 数据库', extensions: ['db'] }
      ]
    });
    if (!selected || Array.isArray(selected)) return;
    const selectedPath = String(selected);
    try {
      if (selectedPath.toLowerCase().endsWith('.db')) {
        const raw = await invoke<string>('import_legacy_db_config', { path: selectedPath });
        importConfig(JSON.parse(raw) as AppConfig);
        void uiAlert('DB 数据导入完成。若同目录存在 icon.db，已自动导入图标缓存。');
        return;
      }
      const raw = await invoke<string>('load_config', { path: selectedPath });
      importConfig(JSON.parse(raw) as AppConfig);
    } catch (error) {
      console.error('import failed', error);
      void uiAlert(`导入失败：${String(error)}`);
    }
  }

  async function chooseAutoSaveDirectory() {
    const selected = await open({
      title: '选择自动保存目录',
      multiple: false,
      directory: true
    });
    if (!selected || Array.isArray(selected)) return;
    updateAutoSave({ directory: selected });
  }

  async function saveAutoNow() {
    const targetPath = getAutoSaveTargetPath(autoSave.directory, autoSave.fileName);
    if (!targetPath) {
      void uiAlert('请先选择自动保存目录');
      return;
    }
    await saveConfigToPath(targetPath);
    void uiAlert(`已保存到：${targetPath}`);
  }

  const panelStyle = {
    left: panelRect.left,
    top: panelRect.top,
    width: panelRect.width,
    height: panelRect.height,
    '--settings-ui-scale': settingsUiScale
  } as CSSProperties;

  return (
    <div className="modal-backdrop settings-floating-layer">
      <div
        ref={panelRef}
        className="modal-card settings-panel categorized-settings-panel floating-settings-panel"
        style={panelStyle}
        onMouseDown={(event) => {
          event.stopPropagation();
        }}
      >
        <div className="settings-drag-edge settings-drag-edge-top" title="拖动设置窗口" onMouseDown={startPanelDrag} />
        <div className="settings-drag-edge settings-drag-edge-left" title="拖动设置窗口" onMouseDown={startPanelDrag} />
        <div className="settings-drag-edge settings-drag-edge-right" title="拖动设置窗口" onMouseDown={startPanelDrag} />
        <div className="settings-drag-edge settings-drag-edge-bottom" title="拖动设置窗口" onMouseDown={startPanelDrag} />
        <div className="settings-header compact-settings-header settings-drag-header" onMouseDown={startPanelDrag}>
          <div className="settings-title-block">
            <div className="settings-title-line">
              <h2>设置</h2>
            </div>
            <p>拖动标题栏或边框可移动；右下角可缩放；Ctrl+滚轮只缩放鼠标所在区域。</p>
          </div>
          <button className="icon-button" onClick={() => setSettingsOpen(false)}><X size={17} /></button>
        </div>

        <div className="settings-layout">
          <nav className="settings-nav" aria-label="设置分类">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button key={tab.id} className={activeTab === tab.id ? 'active' : ''} onClick={() => setActiveTab(tab.id)}>
                  <Icon size={16} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="settings-content">
            {activeTab === 'general' && (
              <div className="settings-category-grid">
                <ThemePicker />
                <ThemeGallerySection currentTheme={currentTheme} onSelectTheme={(theme) => setTheme(theme.id)} />
              </div>
            )}

            {activeTab === 'interface' && <DisplaySettings />}

            {activeTab === 'icons' && (
              <section className="settings-section narrow-section">
                <h3>图标</h3>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={display.autoSaveWebsiteIcon !== false}
                    onChange={(event) => updateDisplay({ autoSaveWebsiteIcon: event.target.checked })}
                  />
                  自动获取网站 favicon 时保存到本地
                </label>
                <p className="settings-hint">开启后，添加网站或刷新网址图标时会把 favicon 下载到本地缓存；之后添加同一网站或其子域名时，会优先复用已下载的本地图标。关闭后只使用在线 favicon 地址。</p>
              </section>
            )}

            {activeTab === 'notes' && (
              <NoteSettingsSection notes={notes} onChangeNotes={updateNoteSettings} />
            )}

            {activeTab === 'behavior' && (
              <section className="settings-section settings-section-stack narrow-section">
                <div className="settings-section-title-row">
                  <h3>操作行为</h3>
                  <span className="settings-hint">贴边隐藏、触发条、启动与关闭</span>
                </div>
                <div className="settings-collapse-tools settings-collapse-tools-spread">
                  <label className="settings-inline-switch" title="开启后会记住操作设置页每个分组的展开/收起状态；关闭后每次进入都默认全部收起。">
                    <input
                      type="checkbox"
                      checked={behaviorCollapse.rememberBehaviorCollapseState}
                      onChange={(event) => behaviorCollapse.setRememberBehaviorCollapseState(event.target.checked)}
                    />
                    记住展开/收起状态
                  </label>
                  <span className="settings-collapse-actions">
                    <button className="btn-secondary btn-compact" onClick={() => behaviorCollapse.applyBehaviorCollapsedSections(new Set(BEHAVIOR_SECTION_IDS))}>全部收起</button>
                    <button className="btn-secondary btn-compact" onClick={() => behaviorCollapse.applyBehaviorCollapsedSections(new Set())}>全部展开</button>
                  </span>
                </div>

                <BehaviorCollapseBlock
                  id="edgeAutoHide"
                  title="贴边隐藏与动画"
                  hint="自动隐藏、速度、残影修复"
                  collapsed={behaviorCollapse.collapsedBehaviorSections.has('edgeAutoHide')}
                  onToggle={behaviorCollapse.toggleBehaviorSection}
                >
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={behavior.edgeAutoHide}
                      onChange={(event) => updateBehavior({ edgeAutoHide: event.target.checked })}
                    />
                    自动贴边隐藏
                  </label>
                  <div className="field-row">
                    <label>贴边隐藏延迟：{behavior.edgeHideDelaySeconds === 0 ? '立即' : `${behavior.edgeHideDelaySeconds.toFixed(1)} 秒`}</label>
                    <div className="delay-row">
                      <button
                        className={behavior.edgeHideDelaySeconds === 0 ? 'btn-primary' : 'btn-secondary'}
                        onClick={() => updateBehavior({ edgeHideDelaySeconds: 0 })}
                      >
                        立即
                      </button>
                      <input
                        type="range"
                        min={0.5}
                        max={10}
                        step={0.5}
                        value={behavior.edgeHideDelaySeconds === 0 ? 0.5 : behavior.edgeHideDelaySeconds}
                        onChange={(event) => updateBehavior({ edgeHideDelaySeconds: Number(event.target.value) })}
                      />
                    </div>
                  </div>
                  <div className="field-row">
                    <label>贴边动画速度：{behavior.edgeAnimationStyle === 'instant' ? '无动画' : `${behavior.edgeAnimationMs ?? 90} ms`}</label>
                    <input
                      type="range"
                      min={45}
                      max={220}
                      step={5}
                      value={behavior.edgeAnimationMs ?? 90}
                      disabled={behavior.edgeAnimationStyle === 'instant'}
                      onChange={(event) => updateBehavior({ edgeAnimationMs: Number(event.target.value) })}
                    />
                    <small>推荐 70～100ms；选择“无动画”时速度滑块会停用。</small>
                  </div>
                  <div className="field-row">
                    <label>鼠标移出主界面后隐藏速度：{behavior.edgeMouseLeaveHideMs ?? behavior.edgeAnimationMs ?? 90} ms</label>
                    <input
                      type="range"
                      min={45}
                      max={260}
                      step={5}
                      value={behavior.edgeMouseLeaveHideMs ?? behavior.edgeAnimationMs ?? 90}
                      disabled={behavior.edgeAnimationStyle === 'instant'}
                      onChange={(event) => updateBehavior({ edgeMouseLeaveHideMs: Number(event.target.value) })}
                    />
                    <small>窗口从触发条展开后，鼠标移出主界面时使用这个速度收回。数值越小越快。</small>
                  </div>
                  <div className="field-row">
                    <label>动画方式</label>
                    <select
                      className="soft-input"
                      value={behavior.edgeAnimationStyle ?? 'animate-window'}
                      onChange={(event) => updateBehavior({ edgeAnimationStyle: event.target.value as EdgeAnimationStyle })}
                    >
                      <option value="animate-window">AnimateWindow 系统滑动（硬件加速，部分透明窗口有残影）</option>
                      <option value="setwindowpos">SetWindowPos 无残影滑动（推荐，EaseOutQuint）</option>
                      <option value="setwindowpos-cubic">SetWindowPos 柔和滑动（EaseOutCubic）</option>
                      <option value="setwindowpos-linear">SetWindowPos 匀速滑动</option>
                      <option value="setwindowpos-back">SetWindowPos 回弹滑动</option>
                      <option value="fade-slide">位置滑动 + 淡入淡出</option>
                      <option value="fade">淡入淡出（AW_BLEND）</option>
                      <option value="instant">无动画（瞬间切换）</option>
                    </select>
                    <small>如果看到透明框残影，切到“SetWindowPos 无残影滑动”；如果想更柔和，可以试“柔和滑动”或“位置滑动 + 淡入淡出”。</small>
                  </div>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={behavior.edgeGhostFrameFix !== false}
                      onChange={(event) => updateBehavior({ edgeGhostFrameFix: event.target.checked })}
                    />
                    隐藏后强制清理透明框残影
                  </label>
                  <p className="settings-hint">开启后，隐藏动画结束会强制隐藏并停放主窗口，减少透明 WebView / AnimateWindow 偶发留下的小透明框。若影响动画手感，可以关闭后对比。</p>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={behavior.edgeUseMainWindowStrip !== false}
                      onChange={(event) => updateBehavior({ edgeUseMainWindowStrip: event.target.checked })}
                    />
                    隐藏后直接保留主窗口边缘（解决透明触发框）
                  </label>
                  <p className="settings-hint">开启后不再显示独立 edge-strip 触发窗，而是把主窗口滑出屏幕并保留一条边缘；如果你看到隐藏后有透明框，优先开启这个开关。关闭后恢复旧的独立触发条方式。</p>
                </BehaviorCollapseBlock>

                <BehaviorCollapseBlock
                  id="edgeTrigger"
                  title="贴边触发条显示"
                  hint="宽度、透明度、颜色"
                  collapsed={behaviorCollapse.collapsedBehaviorSections.has('edgeTrigger')}
                  onToggle={behaviorCollapse.toggleBehaviorSection}
                >
                  <SliderRow label="触发条宽度" min={4} max={32} step={1} value={behavior.edgeStripSize ?? 10} unit="px" onChange={(value) => updateBehavior({ edgeStripSize: value })} />
                  <SliderRow label="触发条透明度" min={0.25} max={1} step={0.05} value={behavior.edgeStripOpacity ?? 0.88} unit="" onChange={(value) => updateBehavior({ edgeStripOpacity: Math.round(value * 100) / 100 })} />
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={behavior.edgeStripUseThemeColor !== false}
                      onChange={(event) => updateBehavior({ edgeStripUseThemeColor: event.target.checked })}
                    />
                    触发条颜色跟随当前主题 accent
                  </label>
                  <div className="field-row">
                    <label>自定义触发条颜色</label>
                    <div className="color-pick-row">
                      <input
                        type="color"
                        value={behavior.edgeStripColor || '#C36A2D'}
                        disabled={behavior.edgeStripUseThemeColor !== false}
                        onChange={(event) => updateBehavior({ edgeStripColor: event.target.value, edgeStripUseThemeColor: false })}
                      />
                      <span className="settings-hint">关闭“跟随主题”后生效</span>
                    </div>
                    <div
                      className="edge-strip-preview"
                      style={{
                        '--preview-edge-color': behavior.edgeStripUseThemeColor !== false ? 'var(--accent)' : (behavior.edgeStripColor || '#C36A2D'),
                        '--preview-edge-opacity': behavior.edgeStripOpacity ?? 0.88,
                        '--preview-edge-size': `${behavior.edgeStripSize ?? 10}px`
                      } as CSSProperties}
                    />
                  </div>
                </BehaviorCollapseBlock>

                <BehaviorCollapseBlock
                  id="launchClose"
                  title="启动与关闭"
                  hint="单/双击、托盘、自启动、快捷键"
                  collapsed={behaviorCollapse.collapsedBehaviorSections.has('launchClose')}
                  onToggle={behaviorCollapse.toggleBehaviorSection}
                >
                  <div className="field-row">
                    <label>启动方式</label>
                    <select
                      className="soft-input"
                      value={behavior.launchMode}
                      onChange={(event) => updateBehavior({ launchMode: event.target.value as 'single' | 'double' })}
                    >
                      <option value="single">单击启动</option>
                      <option value="double">双击启动</option>
                    </select>
                  </div>
                  <div className="field-row">
                    <label>关闭按钮行为</label>
                    <select
                      className="soft-input"
                      value={behavior.closeAction ?? 'tray'}
                      onChange={(event) => updateBehavior({ closeAction: event.target.value as 'tray' | 'exit' })}
                    >
                      <option value="tray">隐藏到系统托盘</option>
                      <option value="exit">直接退出应用</option>
                    </select>
                  </div>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={behavior.autoStart}
                      onChange={(event) => updateBehavior({ autoStart: event.target.checked })}
                    />
                    开机自启动（状态已保存，后端注册可继续扩展）
                  </label>
                  <p className="settings-hint">多选：Ctrl + 左键/右键；Ctrl + A 选中当前页；Delete 删除选中项目或当前目录。</p>
                </BehaviorCollapseBlock>
              </section>
            )}


            {activeTab === 'drag' && (
              <section className="settings-section narrow-section">
                <h3>拖动</h3>
                <p className="settings-hint">这里控制子目录/标签页里面的快捷项目拖动排序。开启“单击启动”时，普通单击会先打开项目，只有长按达到时间后才会进入拖动。</p>
                <SliderRow
                  label="项目长按进入拖动"
                  min={80}
                  max={1200}
                  step={10}
                  value={behavior.itemDragLongPressMs ?? 220}
                  unit=" ms"
                  onChange={(value) => updateBehavior({ itemDragLongPressMs: value })}
                />
                <SliderRow
                  label="拖动前允许抖动"
                  min={2}
                  max={28}
                  step={1}
                  value={behavior.itemDragTolerance ?? 10}
                  unit=" px"
                  onChange={(value) => updateBehavior({ itemDragTolerance: value })}
                />
                <div className="settings-subtitle settings-subtitle-spaced">拖动外观</div>
                <div className="field-row">
                  <label>拖动时项目背景颜色</label>
                  <div className="color-pick-row">
                    <input
                      type="color"
                      value={behavior.itemDragBackgroundColor || '#5b8def'}
                      onChange={(event) => updateBehavior({ itemDragBackgroundColor: event.target.value })}
                    />
                    <span className="settings-hint">拖动中的项目底色</span>
                  </div>
                </div>
                <div className="field-row">
                  <label>拖动时发光颜色</label>
                  <div className="color-pick-row">
                    <input
                      type="color"
                      value={behavior.itemDragGlowColor || '#5b8def'}
                      onChange={(event) => updateBehavior({ itemDragGlowColor: event.target.value })}
                    />
                    <span className="settings-hint">拖动边缘和光晕颜色</span>
                  </div>
                </div>
                <SliderRow
                  label="拖动发光亮度"
                  min={0}
                  max={1}
                  step={0.05}
                  value={Number((behavior.itemDragGlowBrightness ?? 0.72).toFixed(2))}
                  onChange={(value) => updateBehavior({ itemDragGlowBrightness: Math.round(value * 100) / 100 })}
                />
                <div className="drag-preview-wrap">
                  <div
                    className="drag-preview-card"
                    style={{
                      '--item-drag-bg': behavior.itemDragBackgroundColor || '#5b8def',
                      '--item-drag-glow': behavior.itemDragGlowColor || '#5b8def',
                      '--item-drag-glow-brightness': String(behavior.itemDragGlowBrightness ?? 0.72)
                    } as CSSProperties}
                  >
                    <span className="drag-preview-icon">Aa</span>
                    <span>拖动效果预览</span>
                  </div>
                </div>
              </section>
            )}


            {activeTab === 'rainbow' && (
              <section className="settings-section settings-section-stack narrow-section rainbow-settings-section">
                <div className="settings-section-title-row">
                  <h3>彩虹</h3>
                  <span className="settings-hint">鼠标拖尾、窗口边框、文字渐变</span>
                </div>
                <div className="settings-collapse-tools settings-collapse-tools-spread">
                  <label className="settings-inline-switch" title="开启后会记住彩虹设置页每个分组的展开/收起状态；关闭后每次进入都默认全部收起。">
                    <input
                      type="checkbox"
                      checked={rainbowCollapse.rememberRainbowCollapseState}
                      onChange={(event) => rainbowCollapse.setRememberRainbowCollapseState(event.target.checked)}
                    />
                    记住展开/收起状态
                  </label>
                  <span className="settings-collapse-actions">
                    <button className="btn-secondary btn-compact" onClick={() => rainbowCollapse.applyRainbowCollapsedSections(new Set(RAINBOW_SECTION_IDS))}>全部收起</button>
                    <button className="btn-secondary btn-compact" onClick={() => rainbowCollapse.applyRainbowCollapsedSections(new Set())}>全部展开</button>
                  </span>
                </div>

                <RainbowCollapseBlock
                  id="rainbowMaster"
                  title="总开关"
                  hint="打开后下面各项才生效"
                  collapsed={rainbowCollapse.collapsedRainbowSections.has('rainbowMaster')}
                  onToggle={rainbowCollapse.toggleRainbowSection}
                >
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={Boolean(behavior.rainbowEnabled)}
                      onChange={(event) => updateBehavior({ rainbowEnabled: event.target.checked })}
                    />
                    启用彩虹效果
                  </label>
                  <p className="settings-hint">关闭总开关时，鼠标拖尾、窗口边框炫彩、文字彩虹渐变都会暂停；单独分项设置会保留。</p>
                </RainbowCollapseBlock>

                <RainbowCollapseBlock
                  id="rainbowMouse"
                  title="彩虹鼠标拖尾"
                  hint="鼠标移动时留下慢速彩虹光点"
                  collapsed={rainbowCollapse.collapsedRainbowSections.has('rainbowMouse')}
                  onToggle={rainbowCollapse.toggleRainbowSection}
                >
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={behavior.rainbowMouseTrailEnabled !== false}
                      onChange={(event) => updateBehavior({ rainbowMouseTrailEnabled: event.target.checked })}
                    />
                    开启鼠标彩虹拖尾
                  </label>
                  <div className="field-row">
                    <label>鼠标样式</label>
                    <select
                      className="soft-input"
                      value={behavior.rainbowCursorStyle ?? 'dot'}
                      onChange={(event) => updateBehavior({ rainbowCursorStyle: event.target.value as any })}
                    >
                      <option value="dot">彩点 + 光环</option>
                      <option value="windows-border">经典 Windows 箭头：边框炫彩</option>
                      <option value="windows-full">经典 Windows 箭头：全炫彩</option>
                      <option value="windows-inner">经典 Windows 箭头：内部炫彩</option>
                      <option value="macos-wheel">macOS 旋转彩虹盘</option>
                    </select>
                    <small>开启彩虹总开关后生效；拖尾效果按你给的 HTML 示例改为定时淡出光点。</small>
                  </div>
                  <SliderRow
                    label="拖尾停留时间"
                    min={180}
                    max={2400}
                    step={20}
                    value={behavior.rainbowMouseTrailLifeMs ?? 720}
                    unit=" ms"
                    onChange={(value) => updateBehavior({ rainbowMouseTrailLifeMs: value })}
                  />
                  <SliderRow
                    label="拖尾数量"
                    min={4}
                    max={48}
                    step={1}
                    value={behavior.rainbowMouseTrailCount ?? 18}
                    unit=" 个"
                    onChange={(value) => updateBehavior({ rainbowMouseTrailCount: value })}
                  />
                  <SliderRow
                    label="拖尾大小"
                    min={4}
                    max={42}
                    step={1}
                    value={behavior.rainbowMouseTrailSize ?? 16}
                    unit=" px"
                    onChange={(value) => updateBehavior({ rainbowMouseTrailSize: value })}
                  />
                  <SliderRow
                    label="拖尾亮度"
                    min={0.1}
                    max={1}
                    step={0.05}
                    value={Number((behavior.rainbowMouseTrailBrightness ?? 0.72).toFixed(2))}
                    onChange={(value) => updateBehavior({ rainbowMouseTrailBrightness: Math.round(value * 100) / 100 })}
                  />
                  <div className="rainbow-trail-preview" style={{ '--rainbow-trail-size': `${behavior.rainbowMouseTrailSize ?? 16}px`, '--rainbow-trail-brightness': String(behavior.rainbowMouseTrailBrightness ?? 0.72) } as CSSProperties}>
                    {Array.from({ length: 7 }).map((_, index) => (
                      <span key={index} style={{ '--rainbow-trail-hue': `${index * 52}deg`, '--rainbow-trail-progress': (index + 1) / 7 } as CSSProperties} />
                    ))}
                  </div>
                  <RainbowColorBar
                    title="鼠标颜色条"
                    hint="控制鼠标样式和拖尾光点使用哪些颜色；支持双竖线选色。"
                    value={behavior.rainbowMouseColors}
                    onChange={(colors) => updateBehavior({ rainbowMouseColors: colors })}
                  />
                </RainbowCollapseBlock>

                <RainbowCollapseBlock
                  id="rainbowBorder"
                  title="边框炫彩"
                  hint="窗口边框缓慢流动发光"
                  collapsed={rainbowCollapse.collapsedRainbowSections.has('rainbowBorder')}
                  onToggle={rainbowCollapse.toggleRainbowSection}
                >
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={behavior.rainbowBorderEnabled !== false}
                      onChange={(event) => updateBehavior({ rainbowBorderEnabled: event.target.checked })}
                    />
                    开启边框炫彩
                  </label>
                  <div className="field-row">
                    <label>边框模式</label>
                    <select
                      className="soft-input"
                      value={behavior.rainbowBorderMode ?? 'rotate'}
                      onChange={(event) => updateBehavior({ rainbowBorderMode: event.target.value as any })}
                    >
                      <option value="rotate">旋转流动</option>
                      <option value="fixed">固定不旋转</option>
                    </select>
                    <small>固定模式会保留彩虹边框和发光，但不旋转；旋转模式可用下面速度调节。</small>
                  </div>
                  <SliderRow
                    label="边框流动速度"
                    min={3}
                    max={120}
                    step={1}
                    value={behavior.rainbowBorderSpeedSeconds ?? 18}
                    unit=" 秒"
                    onChange={(value) => updateBehavior({ rainbowBorderSpeedSeconds: value })}
                  />
                  <p className="settings-hint">秒数越大，流动越慢。默认是慢速 18 秒一圈。</p>
                  <SliderRow
                    label="边框发光亮度"
                    min={0}
                    max={1}
                    step={0.05}
                    value={Number((behavior.rainbowBorderGlow ?? 0.58).toFixed(2))}
                    onChange={(value) => updateBehavior({ rainbowBorderGlow: Math.round(value * 100) / 100 })}
                  />
                  <SliderRow
                    label="边框宽度"
                    min={1}
                    max={8}
                    step={1}
                    value={behavior.rainbowBorderWidth ?? 2}
                    unit=" px"
                    onChange={(value) => updateBehavior({ rainbowBorderWidth: value })}
                  />
                  <RainbowColorBar
                    title="边框颜色条"
                    hint="控制窗口边框炫彩和光晕使用哪些颜色。"
                    value={behavior.rainbowBorderColors}
                    onChange={(colors) => updateBehavior({ rainbowBorderColors: colors })}
                  />
                  <div
                    className={`rainbow-border-preview ${behavior.rainbowBorderMode === 'fixed' ? 'rainbow-border-preview-fixed' : ''}`}
                    style={{
                      '--rainbow-border-speed': `${behavior.rainbowBorderSpeedSeconds ?? 18}s`,
                      '--rainbow-border-glow': String(behavior.rainbowBorderGlow ?? 0.58),
                      '--rainbow-border-width': `${behavior.rainbowBorderWidth ?? 2}px`,
                      '--rainbow-border-gradient': conicGradientFromColors(behavior.rainbowBorderColors ?? DEFAULT_RAINBOW_COLORS)
                    } as CSSProperties}
                  >
                    <span>边框炫彩预览</span>
                  </div>
                </RainbowCollapseBlock>

                <RainbowCollapseBlock
                  id="rainbowText"
                  title="文字彩虹渐变"
                  hint="文字慢速渐变流动"
                  collapsed={rainbowCollapse.collapsedRainbowSections.has('rainbowText')}
                  onToggle={rainbowCollapse.toggleRainbowSection}
                >
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={Boolean(behavior.rainbowTextEnabled)}
                      onChange={(event) => updateBehavior({ rainbowTextEnabled: event.target.checked })}
                    />
                    开启文字彩虹渐变
                  </label>
                  <div className="settings-subtitle settings-subtitle-spaced">生效范围</div>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={behavior.rainbowTextParentEnabled !== false}
                      onChange={(event) => updateBehavior({ rainbowTextParentEnabled: event.target.checked })}
                    />
                    在父目录标签生效
                  </label>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={behavior.rainbowTextChildEnabled !== false}
                      onChange={(event) => updateBehavior({ rainbowTextChildEnabled: event.target.checked })}
                    />
                    在子目录标签生效
                  </label>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={behavior.rainbowTextSettingsEnabled !== false}
                      onChange={(event) => updateBehavior({ rainbowTextSettingsEnabled: event.target.checked })}
                    />
                    在设置界面生效
                  </label>
                  <SliderRow
                    label="文字渐变速度"
                    min={8}
                    max={120}
                    step={1}
                    value={behavior.rainbowTextSpeedSeconds ?? 22}
                    unit=" 秒"
                    onChange={(value) => updateBehavior({ rainbowTextSpeedSeconds: value })}
                  />
                  <p className="settings-hint">秒数越大，文字流动越慢。默认慢速 22 秒。</p>
                  <RainbowColorBar
                    title="文字颜色条"
                    hint="控制父目录、子目录和设置界面彩虹文字使用哪些颜色。"
                    value={behavior.rainbowTextColors}
                    onChange={(colors) => updateBehavior({ rainbowTextColors: colors })}
                  />
                  <div className="rainbow-text-preview" style={{ '--rainbow-text-speed': `${behavior.rainbowTextSpeedSeconds ?? 22}s`, '--rainbow-text-gradient': gradientFromColors(behavior.rainbowTextColors ?? DEFAULT_RAINBOW_COLORS) } as CSSProperties}>
                    文字彩虹渐变预览 Aa 123
                  </div>
                </RainbowCollapseBlock>
              </section>
            )}


            {activeTab === 'window' && (
              <section className="settings-section narrow-section">
                <h3>窗口行为</h3>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={(behavior.autoEdgeHide ?? true) && (behavior.autoEdgeBounce ?? true)}
                    onChange={(event) => updateBehavior({ autoEdgeHide: event.target.checked, autoEdgeBounce: event.target.checked })}
                  />
                  自动回弹
                </label>
                <p className="settings-hint">
                  开启后，把主窗口拖出屏幕超过 20px 会自动隐藏到对应边缘，只保留一条可触发区域；鼠标移入保留区域后 200ms 平滑回弹。
                </p>
                <div className="field-row">
                  <label>隐藏延迟：{behavior.autoEdgeHideDelay ?? 1000} ms</label>
                  <input
                    type="range"
                    min={0}
                    max={5000}
                    step={100}
                    value={behavior.autoEdgeHideDelay ?? 1000}
                    disabled={!((behavior.autoEdgeHide ?? true) && (behavior.autoEdgeBounce ?? true))}
                    onChange={(event) => updateBehavior({ autoEdgeHideDelay: Number(event.target.value) })}
                  />
                  <small>0ms 表示拖出阈值后立即隐藏；默认 1000ms。</small>
                </div>
                <div className="field-row">
                  <label>保留边缘：{behavior.edgeVisiblePixels ?? 5} px</label>
                  <input
                    type="range"
                    min={2}
                    max={24}
                    step={1}
                    value={behavior.edgeVisiblePixels ?? 5}
                    disabled={!((behavior.autoEdgeHide ?? true) && (behavior.autoEdgeBounce ?? true))}
                    onChange={(event) => updateBehavior({ edgeVisiblePixels: Number(event.target.value) })}
                  />
                  <small>拖出屏幕后仍保留在屏幕内的可见宽度，默认 5px。</small>
                </div>
              </section>
            )}

            {activeTab === 'search' && (
              <SearchSettingsSection
                globalSearch={globalSearch}
                display={display}
                onChangeGlobalSearch={updateGlobalSearch}
                onChangeDisplay={updateDisplay}
              />
            )}

            {activeTab === 'transfer' && (
              <TransferStationSettingsSection
                transferStation={transferStation}
                onChangeTransferStation={updateTransferStation}
              />
            )}

            {activeTab === 'image' && (
              <ImageBrowserSettingsSection
                imageBrowser={imageBrowser}
                onChangeImageBrowser={updateImageBrowser}
              />
            )}


            {activeTab === 'help' && (
              <section className="settings-section narrow-section help-settings-section">
                <div className="settings-section-title-row">
                  <h3>说明</h3>
                  <span className="settings-version-badge">当前版本 {APP_DISPLAY_VERSION}</span>
                </div>
                <p className="settings-hint">这里集中说明软件的主要使用方法。版本号用于你反馈问题时定位当前功能状态。</p>

                <div className="help-version-card">
                  <div>
                    <span className="help-card-label">修改版</span>
                    <strong>{APP_DISPLAY_VERSION}</strong>
                  </div>
                  <div>
                    <span className="help-card-label">程序版本</span>
                    <strong>{APP_PACKAGE_VERSION}</strong>
                  </div>
                </div>

                <div className="help-grid">
                  <div className="help-card">
                    <h4>添加项目</h4>
                    <p>在空白处或项目区右键，可以添加文件、文件夹、网站和系统功能。添加网站时可填写名称与网址，也可选择这次是否自动获取网站图标。</p>
                  </div>
                  <div className="help-card">
                    <h4>启动项目</h4>
                    <p>在“设置 - 操作”里可切换单击启动或双击启动。单击启动时，普通点击会打开项目；需要拖动排序时按住到“设置 - 拖动”里的长按时间。</p>
                  </div>
                  <div className="help-card">
                    <h4>标签与子目录</h4>
                    <p>左侧是子目录/标签。可右键管理标签、合并、排序或清空本页应用。“全部”是特殊入口，只用于查看所有项目。</p>
                  </div>
                  <div className="help-card">
                    <h4>便签</h4>
                    <p>切换到便签入口可以写文本。右键便签可以插入分割线或打开 Windows 剪贴板历史。便签样式在“设置 - 便签”中调整。</p>
                  </div>
                  <div className="help-card">
                    <h4>搜索 / 中转 / 图片预览</h4>
                    <p>顶部工具可打开全局搜索、中转站和图片预览。图片预览支持改名、截图裁剪；相关选项分别在对应设置页里调整。</p>
                  </div>
                  <div className="help-card">
                    <h4>数据与备份</h4>
                    <p>在“设置 - 数据”中可导入/导出配置，也可开启自动保存。建议大改标签或图标前手动导出一份备份。</p>
                  </div>
                </div>
              </section>
            )}

            {activeTab === 'sponsor' && (
              <section className="settings-section narrow-section sponsor-settings-section">
                <div className="settings-section-title-row">
                  <h3>赞助</h3>
                  <span className="settings-hint">感谢支持开发</span>
                </div>
                <p className="settings-hint">如果这个工具帮你节省了整理快捷方式和启动应用的时间，可以扫码赞助。收款码会跟随软件一起离线显示。</p>
                <div className="sponsor-qr-card">
                  <img src={sponsorQr} alt="微信/支付宝赞助收款码" />
                </div>
                <div className="sponsor-note">
                  <strong>微信 / 支付宝</strong>
                  <span>扫码后输入金额即可支持。感谢每一次反馈和赞助。</span>
                </div>
              </section>
            )}


            {activeTab === 'data' && (
              <section className="settings-section narrow-section">
                <h3>数据</h3>
                <div className="button-row">
                  <button className="btn-secondary" onClick={handleExport}>导出配置</button>
                  <button className="btn-primary" onClick={handleImport}>导入配置</button>
                </div>
                <p className="settings-hint">支持导入本应用 JSON 配置，也支持选择 Lucy / Maye 的 link.db；如果同目录存在 icon.db，会自动导入图标缓存。</p>
                <div className="settings-subtitle settings-subtitle-spaced">自动保存</div>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={autoSave.enabled}
                    onChange={(event) => updateAutoSave({ enabled: event.target.checked })}
                  />
                  开启自动保存数据
                </label>
                <div className="field-row">
                  <label>保存目录</label>
                  <div className="path-pick-row">
                    <input className="soft-input" value={autoSave.directory} placeholder="选择一个用于自动保存 JSON 的目录" onChange={(event) => updateAutoSave({ directory: event.target.value })} />
                    <button className="btn-secondary" onClick={chooseAutoSaveDirectory}>浏览</button>
                  </div>
                </div>
                <div className="field-row">
                  <label>保存文件名</label>
                  <input className="soft-input" value={autoSave.fileName} onChange={(event) => updateAutoSave({ fileName: event.target.value })} />
                </div>
                <div className="field-row">
                  <label>保存间隔：{autoSave.intervalMinutes} 分钟</label>
                  <input type="range" min={1} max={120} step={1} value={autoSave.intervalMinutes} onChange={(event) => updateAutoSave({ intervalMinutes: Number(event.target.value) })} />
                </div>
                <p className="settings-hint">当前目标：{getAutoSaveTargetPath(autoSave.directory, autoSave.fileName) || '未选择目录'}</p>
                <button className="btn-secondary" onClick={saveAutoNow}>立即保存一次</button>
              </section>
            )}
          </div>
        </div>
        <div className="settings-resize-hint settings-footer-bar">
          <span>右下角可缩放；拖动标题栏或边框可移动；Ctrl+滚轮单独缩放当前区域；Ctrl+0 重置当前区域缩放</span>
          <button className="settings-footer-close" onClick={() => setSettingsOpen(false)} title="关闭设置"><X size={14} /></button>
        </div>
      </div>
    </div>
  );
}
