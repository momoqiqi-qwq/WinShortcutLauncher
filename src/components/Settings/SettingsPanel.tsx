import {
  Archive,
  ArrowUp,
  Info,
  Database,
  Globe,
  HeartHandshake,
  Image,
  Keyboard,
  ListTree,
  Menu,
  MonitorCog,
  MousePointerClick,
  Move,
  Palette,
  ScanSearch,
  Search,
  SlidersHorizontal,
  StickyNote,
  Type,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import { filterSettingsEntries, normalizeSettingsQuery } from '../../lib/settingsSearch';
import { searchSettingsItems, type SettingsSearchItem } from '../../lib/settingsSearchIndex';
import { formatShortcut, shortcutMatchesEvent } from '../../lib/keyboardShortcuts';
import { ThemePicker } from './ThemePicker';
import { ThemeGallerySection } from './ThemeGallerySection';
import { InterfaceSettingsSection } from './InterfaceSettingsSection';
import { FontSettingsSection } from './FontSettingsSection';
import { IconSettingsSection } from './IconSettingsSection';
import { RainbowSettingsSection } from './RainbowSettingsSection';
import { NoteSettingsSection } from './NoteSettingsSection';
import { BehaviorSettingsSection } from './BehaviorSettingsSection';
import { DragSettingsSection } from './DragSettingsSection';
import { WindowBehaviorSettingsSection } from './WindowBehaviorSettingsSection';
import { ExperienceSettingsSection } from './ExperienceSettingsSection';
import { NavigationSettingsSection } from './NavigationSettingsSection';
import { ContextMenuSettingsSection } from './ContextMenuSettingsSection';
import { ShortcutSettingsSection } from './ShortcutSettingsSection';
import { DiagnosticsSettingsSection } from './DiagnosticsSettingsSection';
import { ImageBrowserSettingsSection, SearchSettingsSection, TransferStationSettingsSection } from './GlobalSearchSettingsSection';
import { AboutSettingsSection } from './AboutSettingsSection';
import { SponsorSettingsSection } from './SponsorSettingsSection';
import { DataSettingsSection } from './DataSettingsSection';
import { useSettingsPanelLayout } from './useSettingsPanelLayout';
import type { SettingsTabId } from '../../types';
import { SETTINGS_CATALOG, SETTINGS_TAB_EVENT, type SettingsOpenRequest } from '../../lib/settingsCatalog';
import { BackgroundMediaLayer } from '../BackgroundMedia/BackgroundMedia';
import './SettingsSearchResults.css';

type SettingsTab = SettingsTabId;

const tabIcons: Record<SettingsTab, typeof Palette> = {
  general: Palette, behavior: MousePointerClick, drag: Move, window: Move, interface: MonitorCog, font: Type,
  experience: SlidersHorizontal, navigation: ListTree, contextMenus: Menu, shortcuts: Keyboard,
  diagnostics: ScanSearch, icons: Globe, rainbow: Palette, notes: StickyNote, search: Search, transfer: Archive,
  image: Image, about: Info, sponsor: HeartHandshake, data: Database,
};

const tabs: Array<{ id: SettingsTab; label: string; icon: typeof Palette; keywords: string[] }> = SETTINGS_CATALOG.map((entry) => ({
  id: entry.id, label: entry.label, icon: tabIcons[entry.id], keywords: [...entry.keywords, entry.description],
}));

const SETTINGS_TAB_STORAGE_KEY = 'yue-launcher-last-settings-tab';

export function SettingsPanel() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [settingsFilter, setSettingsFilter] = useState('');
  const [requestedSection, setRequestedSection] = useState<string | null>(null);
  const [requestedFocusText, setRequestedFocusText] = useState<string | null>(null);
  const [requestedTargetId, setRequestedTargetId] = useState<string | null>(null);
  const requestedNavigationRef = useRef(false);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const settingsOpen = useAppStore((state) => state.settingsOpen);
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen);
  const display = useAppStore((state) => state.display);
  const behavior = useAppStore((state) => state.behavior);
  const experience = useAppStore((state) => state.experience);
  const shortcuts = useAppStore((state) => state.shortcuts);
  const currentTheme = useAppStore((state) => state.theme);
  const setTheme = useAppStore((state) => state.setTheme);
  const globalSearch = useAppStore((state) => state.globalSearch);
  const transferStation = useAppStore((state) => state.transferStation);
  const imageBrowser = useAppStore((state) => state.imageBrowser);
  const notes = useAppStore((state) => state.notes);
  const rainbow = useAppStore((state) => state.rainbow);
  const updateDisplay = useAppStore((state) => state.updateDisplay);
  const updateGlobalSearch = useAppStore((state) => state.updateGlobalSearch);
  const updateTransferStation = useAppStore((state) => state.updateTransferStation);
  const updateImageBrowser = useAppStore((state) => state.updateImageBrowser);
  const updateNoteSettings = useAppStore((state) => state.updateNoteSettings);
  const updateRainbow = useAppStore((state) => state.updateRainbow);
  const rememberPanel = behavior.rememberSettingsPanelBounds !== false;
  const adaptivePanel = behavior.settingsPanelAdaptiveSize !== false;
  const settingsUiScale = display.settingsUiScale ?? display.uiScale ?? 1;
  const normalizedFilter = normalizeSettingsQuery(settingsFilter);
  const directlyFilteredTabs = useMemo(() => filterSettingsEntries(tabs, settingsFilter), [settingsFilter]);
  const detailedSearchResults = useMemo(() => searchSettingsItems(settingsFilter, 9), [settingsFilter]);
  const filteredTabs = useMemo(() => {
    if (!normalizedFilter) return tabs;
    const directIds = new Set(directlyFilteredTabs.map((tab) => tab.id));
    const resultTabIds = new Set(detailedSearchResults.map((result) => result.tab));
    return tabs.filter((tab) => directIds.has(tab.id) || resultTabIds.has(tab.id));
  }, [detailedSearchResults, directlyFilteredTabs, normalizedFilter]);

  const {
    panelRef,
    contentRef,
    panelStyle,
    constrained,
    expectedOuterScrollbars,
    outerOverflowing,
    showBackToTop,
    startPanelDrag,
    handleContentScroll,
    scrollToTop,
  } = useSettingsPanelLayout({
    settingsOpen,
    adaptivePanel,
    rememberPanel,
    rememberScrollPosition: experience.rememberSettingsScrollPosition !== false,
    uiScale: settingsUiScale,
    activeTab,
  });

  useEffect(() => {
    if (!settingsOpen) return;
    if (requestedNavigationRef.current) {
      requestedNavigationRef.current = false;
      return;
    }
    if (!experience.rememberSettingsTab) return setActiveTab('general');
    try {
      const saved = localStorage.getItem(SETTINGS_TAB_STORAGE_KEY) as SettingsTab | null;
      if (saved && tabs.some((tab) => tab.id === saved)) setActiveTab(saved);
    } catch {}
  }, [settingsOpen, experience.rememberSettingsTab]);

  useEffect(() => {
    if (!settingsOpen || !experience.rememberSettingsTab) return;
    try {
      localStorage.setItem(SETTINGS_TAB_STORAGE_KEY, activeTab);
    } catch {}
  }, [activeTab, settingsOpen, experience.rememberSettingsTab]);

  useEffect(() => {
    function handleRequestedTab(event: Event) {
      const raw = (event as CustomEvent<SettingsOpenRequest | SettingsTab>).detail;
      const request = typeof raw === 'string' ? { tab: raw } : raw;
      const tab = request?.tab;
      if (!tab || !tabs.some((entry) => entry.id === tab)) return;
      requestedNavigationRef.current = !useAppStore.getState().settingsOpen;
      setSettingsFilter('');
      setRequestedSection(request.section ?? null);
      setRequestedFocusText(null);
      setRequestedTargetId(null);
      setActiveTab(tab);
      setSettingsOpen(true);
    }
    window.addEventListener(SETTINGS_TAB_EVENT, handleRequestedTab);
    return () => window.removeEventListener(SETTINGS_TAB_EVENT, handleRequestedTab);
  }, [setSettingsOpen]);

  useEffect(() => {
    if (normalizedFilter && filteredTabs.length && !filteredTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(filteredTabs[0].id);
    }
  }, [activeTab, filteredTabs, normalizedFilter]);

  useEffect(() => {
    if (!settingsOpen || !requestedFocusText) return;
    let cancelled = false;
    let focusTimer = 0;
    const focusText = requestedFocusText.trim().toLocaleLowerCase('zh-CN');

    const locateTarget = (attempt = 0) => {
      if (cancelled) return;
      const root = contentRef.current;
      if (!root) return;

      if (requestedSection) {
        const section = root.querySelector<HTMLElement>(`[data-settings-section="${CSS.escape(requestedSection)}"]`);
        const collapsedHeader = section?.querySelector<HTMLButtonElement>('.settings-collapse-header[aria-expanded="false"]');
        if (collapsedHeader) {
          collapsedHeader.click();
          focusTimer = window.setTimeout(() => locateTarget(attempt + 1), experience.reduceMotion ? 20 : 70);
          return;
        }
      }

      const exactTarget = requestedTargetId
        ? root.querySelector<HTMLElement>(`[data-settings-target="${CSS.escape(requestedTargetId)}"]`)
        : null;
      const tagged = Array.from(root.querySelectorAll<HTMLElement>('[data-settings-focus]')).find((element) =>
        (element.dataset.settingsFocus ?? '').toLocaleLowerCase('zh-CN').includes(focusText),
      );
      const candidates = Array.from(root.querySelectorAll<HTMLElement>('h3, h4, label, strong, button, .settings-row, .settings-subtitle, .settings-collapse-title, .settings-layout-help-card'));
      const textTarget = candidates.find((element) => (element.textContent ?? '').trim().toLocaleLowerCase('zh-CN').includes(focusText));
      const target = exactTarget ?? tagged ?? textTarget;

      if (!target && attempt < 5) {
        focusTimer = window.setTimeout(() => locateTarget(attempt + 1), 60);
        return;
      }

      const fallback = requestedSection
        ? root.querySelector<HTMLElement>(`[data-settings-section="${CSS.escape(requestedSection)}"]`)
        : root.querySelector<HTMLElement>('.settings-section');
      const resolvedTarget = target ?? fallback;
      if (!resolvedTarget) return;

      const highlightTarget = resolvedTarget.closest<HTMLElement>('.settings-row, .field-row, .check-row, .button-row, .settings-layout-help-card') ?? resolvedTarget;
      highlightTarget.scrollIntoView({ behavior: experience.reduceMotion ? 'auto' : 'smooth', block: 'center' });
      highlightTarget.classList.remove('settings-search-highlight');
      void highlightTarget.offsetWidth;
      highlightTarget.classList.add('settings-search-highlight');
      const control = highlightTarget.matches('input, select, button, textarea')
        ? highlightTarget
        : highlightTarget.querySelector<HTMLElement>('input, select, button, textarea');
      if (exactTarget && control && typeof control.focus === 'function') {
        try { control.focus({ preventScroll: true }); } catch { control.focus(); }
      }
      window.setTimeout(() => highlightTarget.classList.remove('settings-search-highlight'), experience.reduceMotion ? 500 : 1900);
      setRequestedSection(null);
      setRequestedFocusText(null);
      setRequestedTargetId(null);
    };

    focusTimer = window.setTimeout(() => locateTarget(), 80);
    return () => {
      cancelled = true;
      window.clearTimeout(focusTimer);
    };
  }, [activeTab, contentRef, experience.reduceMotion, requestedFocusText, requestedSection, requestedTargetId, settingsOpen]);

  function openSearchResult(result: SettingsSearchItem) {
    setRequestedSection(result.section ?? null);
    setRequestedFocusText(result.focusText ?? result.label);
    setRequestedTargetId(result.targetId ?? null);
    setActiveTab(result.tab);
    setSettingsFilter('');
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!settingsOpen) return;
      if (shortcutMatchesEvent(shortcuts.focusPageSearch, event)) {
        event.preventDefault();
        event.stopPropagation();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      if (shortcutMatchesEvent(shortcuts.closeOverlay, event)) {
        event.preventDefault();
        event.stopPropagation();
        if (settingsFilter) setSettingsFilter('');
        else setSettingsOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [setSettingsOpen, settingsFilter, settingsOpen, shortcuts]);

  if (!settingsOpen) return null;

  const scrollSafetyActive = adaptivePanel && (expectedOuterScrollbars || outerOverflowing);

  return (
    <div className={`modal-backdrop settings-floating-layer ${scrollSafetyActive ? 'settings-floating-layer-scrollable' : ''}`}>
      <div
        ref={panelRef}
        className={`modal-card settings-panel categorized-settings-panel floating-settings-panel ${adaptivePanel ? 'settings-panel-adaptive' : ''} ${constrained ? 'settings-panel-constrained' : ''} ${scrollSafetyActive ? 'settings-panel-needs-scroll' : ''} ${experience.showSettingsDescriptions === false ? 'settings-descriptions-hidden' : ''} ${experience.reduceMotion ? 'settings-reduce-motion' : ''}`}
        style={panelStyle}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <BackgroundMediaLayer
          className="settings-background-media-layer"
          enabled={display.settingsBackgroundEnabled}
          source={display.settingsBackgroundImage}
          mediaKind={display.settingsBackgroundMediaKind}
          fit={display.settingsBackgroundFit}
          positionX={display.settingsBackgroundPositionX ?? 50}
          positionY={display.settingsBackgroundPositionY ?? 50}
          opacity={display.settingsBackgroundOpacity ?? 0.62}
          dim={display.settingsBackgroundDim ?? 0.18}
          blur={display.settingsBackgroundBlur ?? 0}
          motionEnabled={display.settingsBackgroundMotionEnabled !== false}
          playbackRate={display.settingsBackgroundPlaybackRate ?? 1}
          pauseWhenHidden={display.settingsBackgroundPauseWhenHidden !== false}
          containAmbient={display.settingsBackgroundContainAmbient !== false}
          reduceMotion={experience.reduceMotion}
        />
        <div className={`settings-header compact-settings-header ${adaptivePanel ? '' : 'settings-drag-header'}`} onMouseDown={startPanelDrag}>
          <div className="settings-title-block">
            <div className="settings-title-line">
              <h2>设置</h2>
              <span className="settings-layout-status">{adaptivePanel ? '自动适配' : rememberPanel ? '自定义 · 记忆' : '自定义 · 不记忆'}</span>
              {experience.showSettingsDescriptions === false && <span className="settings-layout-status">简洁模式</span>}
              {scrollSafetyActive && <span className="settings-layout-status warning">滚动保护</span>}
             </div>
            <p>{adaptivePanel ? '设置窗口自动适配主界面可用空间；分类和内容超出时会独立滚动。' : rememberPanel ? '可拖动标题栏并拖拽右下角调整大小；关闭后会记住当前位置和尺寸。' : '可拖动标题栏并拖拽右下角调整大小；重新打开时恢复默认位置和尺寸。'}</p>
          </div>
          <button className="icon-button" onClick={() => setSettingsOpen(false)} title="关闭设置"><X size={17} /></button>
        </div>
        <div className="settings-layout">
          <nav className={`settings-nav ${experience.compactSettingsNav ? 'compact' : ''}`} aria-label="设置分类">
            <div className="settings-nav-search-wrap">
              <input
                ref={searchRef}
                className="settings-nav-search"
                value={settingsFilter}
                onChange={(event) => setSettingsFilter(event.target.value)}
                placeholder="搜索设置 / 拼音 / 首字母"
                title={`搜索设置，支持中文、拼音和首字母（${formatShortcut(shortcuts.focusPageSearch) || '未设置快捷键'}）`}
                aria-label={`搜索设置分类和关键词，支持中文、拼音和首字母，快捷键 ${formatShortcut(shortcuts.focusPageSearch) || '未设置'}`}
              />
              {settingsFilter && <button type="button" className="settings-nav-search-clear" title="清空搜索" onClick={() => setSettingsFilter('')}><X size={13} /></button>}
            </div>
            {filteredTabs.map((tab) => {
              const Icon = tab.icon;
              return <button type="button" key={tab.id} className={activeTab === tab.id ? 'active' : ''} aria-current={activeTab === tab.id ? 'page' : undefined} title={tab.label} onClick={() => { setRequestedSection(null); setRequestedFocusText(null); setRequestedTargetId(null); setSettingsFilter(''); setActiveTab(tab.id); }}><Icon size={16} /><span>{tab.label}</span></button>;
            })}
            {filteredTabs.length === 0 && <div className="settings-nav-empty" role="status" aria-live="polite">没有匹配的设置分类</div>}
          </nav>
          <div ref={contentRef} className="settings-content" onScroll={handleContentScroll}>
            {normalizedFilter ? (
              <section className="settings-detailed-search-page" aria-label="具体设置搜索结果">
                <div className="settings-detailed-search-heading">
                  <div><h3>搜索结果</h3><p>直接定位到具体设置，进入后会自动滚动并高亮。</p></div>
                  <span>{detailedSearchResults.length} 项</span>
                 </div>
                {detailedSearchResults.length > 0 ? (
                  <div className="settings-detailed-search-list">
                    {detailedSearchResults.map((result) => (
                      <button type="button" className="settings-detailed-search-result" key={result.id} onClick={() => openSearchResult(result)}>
                        <span><strong>{result.label}</strong><small>{result.description}</small></span>
                        <span>{tabs.find((tab) => tab.id === result.tab)?.label ?? result.tab}</span>
                      </button>
                    ))}
                   </div>
                ) : (
                  <div className="settings-detailed-search-empty">没有匹配到具体设置。支持中文、完整拼音和拼音首字母，例如“浏览器 / liulanqi / llq”。</div>
                )}
              </section>
            ) : (
              <>
            {activeTab === 'general' && <div className="settings-category-grid"><ThemePicker /><ThemeGallerySection currentTheme={currentTheme} onSelectTheme={(theme) => setTheme(theme.id)} /></div>}
            {activeTab === 'interface' && <InterfaceSettingsSection requestedSection={requestedSection} onRequestedSectionHandled={() => setRequestedSection(null)} />}
            {activeTab === 'font' && <FontSettingsSection />}
            {activeTab === 'icons' && <IconSettingsSection />}
            {activeTab === 'rainbow' && <RainbowSettingsSection rainbow={rainbow} onChangeRainbow={updateRainbow} />}
            {activeTab === 'notes' && <NoteSettingsSection notes={notes} onChangeNotes={updateNoteSettings} />}
            {activeTab === 'behavior' && <BehaviorSettingsSection />}
            {activeTab === 'drag' && <DragSettingsSection />}
            {activeTab === 'window' && <WindowBehaviorSettingsSection />}
            {activeTab === 'experience' && <ExperienceSettingsSection />}
            {activeTab === 'navigation' && <NavigationSettingsSection />}
            {activeTab === 'contextMenus' && <ContextMenuSettingsSection />}
            {activeTab === 'shortcuts' && <ShortcutSettingsSection />}
            {activeTab === 'diagnostics' && <DiagnosticsSettingsSection />}
            {activeTab === 'search' && <SearchSettingsSection globalSearch={globalSearch} display={display} onChangeGlobalSearch={updateGlobalSearch} onChangeDisplay={updateDisplay} />}
            {activeTab === 'transfer' && <TransferStationSettingsSection transferStation={transferStation} onChangeTransferStation={updateTransferStation} />}
            {activeTab === 'image' && <ImageBrowserSettingsSection imageBrowser={imageBrowser} onChangeImageBrowser={updateImageBrowser} />}
            {activeTab === 'about' && <AboutSettingsSection />}
            {activeTab === 'sponsor' && <SponsorSettingsSection />}
            {activeTab === 'data' && <DataSettingsSection onReset={() => setActiveTab('general')} />}
              </>
            )}
          </div>
        </div>
        {showBackToTop && (
          <button type="button" className="settings-back-to-top" onClick={scrollToTop} title="返回当前设置分类顶部">
            <ArrowUp size={15} />
          </button>
        )}
        <div className="settings-resize-hint settings-footer-bar">
          <span>
            {scrollSafetyActive
              ? '可用空间较小，已启用滚动保护'
              : '固定居中 · 分类与内容独立滚动'}
          </span>
          <button className="settings-footer-close" onClick={() => setSettingsOpen(false)} title="关闭设置"><X size={14} /></button>
        </div>
      </div>
    </div>
  );
}
