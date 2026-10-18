import { lazy, Suspense, useEffect, useRef, useState, type ComponentProps } from 'react';
import { SETTINGS_TAB_EVENT } from '../lib/settingsCatalog';

// v162: 设置面板、全局搜索、中转站、图片浏览器、拖入导入对话框改为按需加载。
// 它们在启动时都不可见，却占了主包的一大块；拆成独立 chunk 后首屏要解析的 JS 明显变少。
// 启动后空闲时会预加载，所以第一次打开时基本不会感到延迟。

const loadSettingsPanel = () => import('./Settings/SettingsPanel');
const loadGlobalSearch = () => import('./GlobalSearch/GlobalSearch');
const loadTransferStation = () => import('./TransferStation/TransferStation');
const loadImageBrowser = () => import('./ImageBrowser/ImageBrowser');
const loadDropImportDialog = () => import('./DropImportDialog/DropImportDialog');

const SettingsPanel = lazy(() => loadSettingsPanel().then((m) => ({ default: m.SettingsPanel })));
const GlobalSearch = lazy(() => loadGlobalSearch().then((m) => ({ default: m.GlobalSearch })));
const TransferStation = lazy(() => loadTransferStation().then((m) => ({ default: m.TransferStation })));
const ImageBrowser = lazy(() => loadImageBrowser().then((m) => ({ default: m.ImageBrowser })));
const DropImportDialog = lazy(() => loadDropImportDialog().then((m) => ({ default: m.DropImportDialog })));

/** 空闲时把所有按需面板的代码预先拉下来。失败无所谓，真正打开时会再加载一次。 */
export function preloadDeferredPanels() {
  return Promise.all([
    loadSettingsPanel(),
    loadGlobalSearch(),
    loadTransferStation(),
    loadImageBrowser(),
    loadDropImportDialog(),
  ]).catch(() => undefined);
}

/** 启动后延迟一会儿、并等浏览器空闲时再预加载，不和首屏渲染抢时间。 */
export function useDeferredPanelPreload(delayMs = 1500) {
  useEffect(() => {
    let idleHandle: number | undefined;
    const timer = window.setTimeout(() => {
      if (typeof window.requestIdleCallback === 'function') {
        idleHandle = window.requestIdleCallback(() => void preloadDeferredPanels(), { timeout: 4000 });
      } else {
        void preloadDeferredPanels();
      }
    }, delayMs);
    return () => {
      window.clearTimeout(timer);
      if (idleHandle !== undefined && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleHandle);
      }
    };
  }, [delayMs]);
}

/**
 * 第一次需要时才挂载，之后一直保持挂载。
 * 这样关闭动画、面板内部状态（当前页签、滚动位置等）和以前完全一样。
 */
function useMountedOnce(active: boolean) {
  const [mounted, setMounted] = useState(active);
  useEffect(() => {
    if (active) setMounted(true);
  }, [active]);
  return mounted || active;
}

type OverlayProps = { open: boolean; onClose: () => void };

export function DeferredGlobalSearch(props: OverlayProps) {
  const mounted = useMountedOnce(props.open);
  if (!mounted) return null;
  return (
    <Suspense fallback={null}>
      <GlobalSearch {...props} />
    </Suspense>
  );
}

export function DeferredTransferStation(props: OverlayProps) {
  const mounted = useMountedOnce(props.open);
  if (!mounted) return null;
  return (
    <Suspense fallback={null}>
      <TransferStation {...props} />
    </Suspense>
  );
}

export function DeferredImageBrowser(props: OverlayProps) {
  const mounted = useMountedOnce(props.open);
  if (!mounted) return null;
  return (
    <Suspense fallback={null}>
      <ImageBrowser {...props} />
    </Suspense>
  );
}

/** 拖入导入对话框本来就是有路径时才渲染，这里只负责按需加载。 */
export function DeferredDropImportDialog(props: ComponentProps<typeof DropImportDialog>) {
  return (
    <Suspense fallback={null}>
      <DropImportDialog {...props} />
    </Suspense>
  );
}

/**
 * 设置面板除了 settingsOpen 之外，还通过 window 事件 SETTINGS_TAB_EVENT 接收"打开到某个页签 / 设置项"的请求
 * （快捷设置菜单、命令面板、全局搜索都会发）。面板代码还没加载时这个事件没人接，
 * 所以这里先代收，等面板挂载、它自己的监听注册好之后再原样重发一遍。
 */
export function DeferredSettingsPanel({ open }: { open: boolean }) {
  const pending = useRef<unknown[]>([]);
  const readyRef = useRef(false);
  const [requested, setRequested] = useState(false);
  const mounted = useMountedOnce(open || requested);

  useEffect(() => {
    function capture(event: Event) {
      if (readyRef.current) return;
      pending.current.push((event as CustomEvent<unknown>).detail);
      setRequested(true);
    }
    window.addEventListener(SETTINGS_TAB_EVENT, capture);
    return () => window.removeEventListener(SETTINGS_TAB_EVENT, capture);
  }, []);

  if (!mounted) return null;
  return (
    <Suspense fallback={null}>
      <SettingsPanelRelay pending={pending} readyRef={readyRef} />
    </Suspense>
  );
}

function SettingsPanelRelay({
  pending,
  readyRef,
}: {
  pending: { current: unknown[] };
  readyRef: { current: boolean };
}) {
  useEffect(() => {
    // 子组件的 effect 先于父组件执行：走到这里时 SettingsPanel 的 SETTINGS_TAB_EVENT 监听已经注册。
    readyRef.current = true;
    const queued = pending.current.splice(0);
    for (const detail of queued) {
      window.dispatchEvent(new CustomEvent(SETTINGS_TAB_EVENT, { detail }));
    }
  }, [pending, readyRef]);
  return <SettingsPanel />;
}
