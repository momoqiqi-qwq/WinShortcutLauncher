import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
  type UIEvent as ReactUIEvent,
} from 'react';
import {
  getAdaptiveSettingsPanelRect,
  getSettingsPanelViewportState,
  type SettingsPanelRect,
} from '../../lib/settingsPanelBounds';

const PANEL_RECT_STORAGE_KEY = 'win-launcher-settings-panel-rect';
const PANEL_SCROLL_STORAGE_KEY = 'yue-launcher-settings-scroll-positions';
export const RESET_SETTINGS_PANEL_LAYOUT_EVENT = 'yue:reset-settings-panel-layout';

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
    height,
  };
}

function adaptivePanelRect(uiScale = 1): SettingsPanelRect {
  return getAdaptiveSettingsPanelRect(viewportSize(), uiScale);
}

function sanitizePanelRect(rect: Partial<SettingsPanelRect>): SettingsPanelRect {
  const viewport = viewportSize();
  const fallback = defaultPanelRect();
  const width = Math.round(Math.min(Math.max(Number(rect.width) || fallback.width, 520), Math.max(520, viewport.width + 240)));
  const height = Math.round(Math.min(Math.max(Number(rect.height) || fallback.height, 360), Math.max(360, viewport.height + 180)));
  const minVisible = 120;
  const rawLeft = Number.isFinite(rect.left) ? Number(rect.left) : fallback.left;
  const rawTop = Number.isFinite(rect.top) ? Number(rect.top) : fallback.top;
  return {
    left: Math.round(Math.min(viewport.width - minVisible, Math.max(-width + minVisible, rawLeft))),
    top: Math.round(Math.min(viewport.height - minVisible, Math.max(-height + minVisible, rawTop))),
    width,
    height,
  };
}

function readSavedPanelRect(): SettingsPanelRect {
  try {
    const saved = localStorage.getItem(PANEL_RECT_STORAGE_KEY);
    if (saved) return sanitizePanelRect(JSON.parse(saved));
  } catch {}
  return defaultPanelRect();
}

function readScrollPositions(): Record<string, number> {
  try {
    const raw = localStorage.getItem(PANEL_SCROLL_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const positions: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed)) {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) positions[key] = Math.max(0, numeric);
    }
    return positions;
  } catch {
    return {};
  }
}

interface UseSettingsPanelLayoutOptions {
  settingsOpen: boolean;
  adaptivePanel: boolean;
  rememberPanel: boolean;
  rememberScrollPosition: boolean;
  uiScale: number;
  activeTab: string;
}

interface UseSettingsPanelLayoutResult {
  panelRef: RefObject<HTMLDivElement>;
  contentRef: RefObject<HTMLDivElement>;
  panelStyle: CSSProperties;
  constrained: boolean;
  expectedOuterScrollbars: boolean;
  outerOverflowing: boolean;
  showBackToTop: boolean;
  startPanelDrag: (event: ReactMouseEvent<HTMLElement>) => void;
  handleContentScroll: (event: ReactUIEvent<HTMLDivElement>) => void;
  scrollToTop: () => void;
}

export function useSettingsPanelLayout({
  settingsOpen,
  adaptivePanel,
  rememberPanel,
  rememberScrollPosition,
  uiScale,
  activeTab,
}: UseSettingsPanelLayoutOptions): UseSettingsPanelLayoutResult {
  const panelRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const previousTabRef = useRef(activeTab);
  const scrollPositionsRef = useRef<Record<string, number>>(readScrollPositions());
  const [panelRect, setPanelRect] = useState<SettingsPanelRect>(readSavedPanelRect);
  const [outerOverflowing, setOuterOverflowing] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);

  const viewportState = useMemo(
    () => getSettingsPanelViewportState(panelRect, uiScale),
    [panelRect, uiScale],
  );

  const syncOuterOverflow = useCallback(() => {
    const element = panelRef.current;
    if (!element) return setOuterOverflowing(false);
    setOuterOverflowing(
      element.scrollWidth > element.clientWidth + 1
      || element.scrollHeight > element.clientHeight + 1,
    );
  }, []);

  useEffect(() => {
    if (!settingsOpen) return;
    if (adaptivePanel) {
      setPanelRect(adaptivePanelRect(uiScale));
      return;
    }
    if (!rememberPanel) {
      setPanelRect(defaultPanelRect());
      return;
    }
    setPanelRect(readSavedPanelRect());
  }, [adaptivePanel, rememberPanel, settingsOpen, uiScale]);

  useEffect(() => {
    if (!settingsOpen || !adaptivePanel) return;
    const sync = () => setPanelRect(adaptivePanelRect(uiScale));
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, [adaptivePanel, settingsOpen, uiScale]);

  useEffect(() => {
    if (!settingsOpen || !panelRef.current || adaptivePanel) return;
    const element = panelRef.current;
    let timer = 0;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const borderBox = Array.isArray(entry.borderBoxSize) ? entry.borderBoxSize[0] : entry.borderBoxSize;
        const width = Math.round(borderBox?.inlineSize || element.offsetWidth || entry.contentRect.width);
        const height = Math.round(borderBox?.blockSize || element.offsetHeight || entry.contentRect.height);
        setPanelRect((current) => {
          if (Math.abs(current.width - width) < 1 && Math.abs(current.height - height) < 1) return current;
          return sanitizePanelRect({ ...current, width, height });
        });
      }, 160);
    });
    observer.observe(element);
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [adaptivePanel, settingsOpen]);

  useEffect(() => {
    if (!settingsOpen || adaptivePanel || !rememberPanel) return;
    try {
      localStorage.setItem(PANEL_RECT_STORAGE_KEY, JSON.stringify(panelRect));
    } catch {}
  }, [adaptivePanel, panelRect, rememberPanel, settingsOpen]);

  useEffect(() => {
    if (!settingsOpen || !panelRef.current) return;
    const element = panelRef.current;
    const observer = new ResizeObserver(syncOuterOverflow);
    observer.observe(element);
    const frame = window.requestAnimationFrame(syncOuterOverflow);
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [activeTab, settingsOpen, syncOuterOverflow, viewportState.needsHorizontalScroll, viewportState.needsVerticalScroll]);

  useEffect(() => {
    function resetLayout() {
      try {
        localStorage.removeItem(PANEL_RECT_STORAGE_KEY);
        localStorage.removeItem(PANEL_SCROLL_STORAGE_KEY);
      } catch {}
      scrollPositionsRef.current = {};
      setPanelRect(adaptivePanel ? adaptivePanelRect(uiScale) : defaultPanelRect());
      setShowBackToTop(false);
      window.requestAnimationFrame(() => {
        if (contentRef.current) contentRef.current.scrollTop = 0;
        syncOuterOverflow();
      });
    }
    window.addEventListener(RESET_SETTINGS_PANEL_LAYOUT_EVENT, resetLayout);
    return () => window.removeEventListener(RESET_SETTINGS_PANEL_LAYOUT_EVENT, resetLayout);
  }, [adaptivePanel, syncOuterOverflow, uiScale]);

  useEffect(() => {
    if (!settingsOpen || !contentRef.current) return;
    const element = contentRef.current;
    const previousTab = previousTabRef.current;
    if (rememberScrollPosition) {
      scrollPositionsRef.current[previousTab] = element.scrollTop;
      try {
        localStorage.setItem(PANEL_SCROLL_STORAGE_KEY, JSON.stringify(scrollPositionsRef.current));
      } catch {}
    }
    previousTabRef.current = activeTab;
    const nextTop = rememberScrollPosition ? scrollPositionsRef.current[activeTab] ?? 0 : 0;
    const frame = window.requestAnimationFrame(() => {
      element.scrollTop = nextTop;
      setShowBackToTop(nextTop > 240);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeTab, rememberScrollPosition, settingsOpen]);

  useEffect(() => {
    if (settingsOpen) return;
    const element = contentRef.current;
    if (!element || !rememberScrollPosition) return;
    scrollPositionsRef.current[activeTab] = element.scrollTop;
    try {
      localStorage.setItem(PANEL_SCROLL_STORAGE_KEY, JSON.stringify(scrollPositionsRef.current));
    } catch {}
  }, [activeTab, rememberScrollPosition, settingsOpen]);

  const startPanelDrag = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    if (event.button !== 0 || !panelRef.current || adaptivePanel) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('button, input, textarea, select, a, .settings-content, .settings-nav, .settings-footer-close')) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const startRect = { ...panelRect };
    function move(moveEvent: MouseEvent) {
      setPanelRect(sanitizePanelRect({
        ...startRect,
        left: startRect.left + moveEvent.clientX - startX,
        top: startRect.top + moveEvent.clientY - startY,
      }));
    }
    function up() {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    }
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }, [adaptivePanel, panelRect]);

  const handleContentScroll = useCallback((event: ReactUIEvent<HTMLDivElement>) => {
    const top = event.currentTarget.scrollTop;
    setShowBackToTop(top > 240);
    if (!rememberScrollPosition) return;
    scrollPositionsRef.current[activeTab] = top;
  }, [activeTab, rememberScrollPosition]);

  const scrollToTop = useCallback(() => {
    contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const panelStyle = useMemo(() => ({
    left: panelRect.left,
    top: panelRect.top,
    width: panelRect.width,
    height: panelRect.height,
    '--settings-ui-scale': uiScale,
  }) as CSSProperties, [panelRect, uiScale]);

  return {
    panelRef,
    contentRef,
    panelStyle,
    constrained: viewportState.constrained,
    expectedOuterScrollbars: viewportState.needsHorizontalScroll || viewportState.needsVerticalScroll,
    outerOverflowing,
    showBackToTop,
    startPanelDrag,
    handleContentScroll,
    scrollToTop,
  };
}
