import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import {
  ExternalLink,
  Eye,
  EyeOff,
  FolderOpen,
  FolderSearch,
  RefreshCw,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';
import { getEffectiveDisplay, useAppStore } from '../../../stores/appStore';
import type { Directory, HtmlCardSize } from '../../../types';
import {
  clampCardSize,
  getHtmlPath,
  htmlFolderSignature,
  openHtmlFolderLocation,
  resolveCardSize,
  resolveHtmlPageColor,
  resolveHtmlPageName,
  resolveHtmlView,
  validateHtmlFolder,
  type HtmlPage,
} from '../../../lib/htmlFolder';
import { resolveColorFrameClusters, resolveColorFrameColors } from '../../../lib/colorFrames';
import { getSystemDoubleClickTimeMs, primeSystemDoubleClickTime } from '../../../lib/doubleClickTiming';
import { launchHtmlPage } from '../../../lib/launchShortcut';
import { showLauncherNotice } from '../../../lib/notify';
import { ColorClusterFrames } from '../../ColorClusterFrames';
import './HtmlGallery.css';

/**
 * 预览用的「虚拟视口」宽度。
 *
 * 页面按 1280 宽（桌面版式）渲染，再整体 scale 到卡片宽度 —— 这样卡片里看到的
 * 就是真实的首页排版，而不是手机窄屏版或被强行拉伸的样子。
 */
const PREVIEW_VIEWPORT_WIDTH = 1280;
/** 卡片头部高度，预览区高度 = 卡片高度 - 它。 */
const CARD_HEADER_HEIGHT = 34;
/** 8 个方向的缩放手柄；`dir` 里的字母决定往哪边推、用哪种光标。 */
const HANDLE_DIRS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as const;
type HandleDir = typeof HANDLE_DIRS[number];

/** v175: 自动刷新的轮询间隔 —— 只 stat 不读内容，2 秒一次几乎感觉不到开销。 */
const AUTO_REFRESH_POLL_MS = 2000;
/** v175: 判断「这算点击还是拖拽」的像素阈值（缩放卡片的手柄另走一套，不受影响）。 */
const CLICK_TOLERANCE_PX = 6;

const HANDLE_CURSOR: Record<HandleDir, string> = {
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  nw: 'nwse-resize',
  se: 'nwse-resize',
};

interface DragState {
  path: string;
  dir: HandleDir;
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
}

interface HtmlGalleryProps {
  directory: Directory;
  /** v175: 右键卡片时把位置抛给 App，由统一的菜单层渲染。 */
  onContextMenuPage?: (pagePath: string, x: number, y: number) => void;
}

/**
 * HTML 子目录（v173）：把文件夹里的每个 .html 渲染成一张**带实时首页预览**的卡片。
 *
 * 关键点：
 * 1. 预览是 iframe + Tauri asset 协议（`convertFileSrc`），相对路径的图片/CSS
 *    天然能解析，不需要另建服务器；作用域由 `refreshHtmlFolder` 里的
 *    `allow_html_preview` 打开；
 * 2. 卡片边框有 8 个拖拽手柄，鼠标移上去变双向箭头，尺寸按文件路径存在目录配置里；
 * 3. iframe 用 IntersectionObserver 懒挂载 —— 一个目录几十个页面时，
 *    同时挂几十个 WebView 会直接卡死。
 * 4. v175：点击动作跟随全局「单击 / 双击」设置；卡片可以单独改名、上色，
 *    颜色同样参与「相邻颜色组合」和「同色相邻成组框」；文件夹里有变化会自动刷新。
 */
export function HtmlGallery({ directory, onContextMenuPage }: HtmlGalleryProps) {
  const pages = useAppStore((state) => state.getHtmlPages(directory.id));
  const loading = useAppStore((state) => state.htmlLoading[directory.id] ?? false);
  const error = useAppStore((state) => state.htmlError[directory.id] ?? null);
  const refreshHtmlFolder = useAppStore((state) => state.refreshHtmlFolder);
  const setDirectoryHtmlPath = useAppStore((state) => state.setDirectoryHtmlPath);
  const setHtmlCardSize = useAppStore((state) => state.setHtmlCardSize);
  const resetHtmlCardSizes = useAppStore((state) => state.resetHtmlCardSizes);
  const updateHtmlView = useAppStore((state) => state.updateHtmlView);
  const behavior = useAppStore((state) => state.behavior);
  const globalDisplay = useAppStore((state) => state.display);
  const display = useMemo(
    () => getEffectiveDisplay(globalDisplay, directory),
    [globalDisplay, directory],
  );

  const root = getHtmlPath(directory);
  const view = resolveHtmlView(directory);
  const [query, setQuery] = useState('');
  const [drag, setDrag] = useState<DragState | null>(null);
  // 拖拽过程中的实时尺寸：不落盘，松手才写进配置（否则每帧都触发一次 persist）。
  const [liveSizes, setLiveSizes] = useState<Record<string, HtmlCardSize>>({});
  const liveSizesRef = useRef<Record<string, HtmlCardSize>>({});
  const [reloadNonce, setReloadNonce] = useState<Record<string, number>>({});
  const cardsRef = useRef<HTMLDivElement | null>(null);
  // v175: 单击模式下「刚开过一次」的时间戳，用来吃掉同一次双击里的第二下。
  const lastSingleOpenRef = useRef(0);
  const doubleClickMsRef = useRef(420);
  const pressRef = useRef<{ path: string; x: number; y: number } | null>(null);
  // v175: 自动刷新 —— 记住上一次的目录指纹，变了才重新列页面。
  const signatureRef = useRef<string | null>(null);
  const checkSignatureRef = useRef<() => void>(() => {});

  useEffect(() => {
    primeSystemDoubleClickTime();
    void getSystemDoubleClickTimeMs().then((value) => {
      doubleClickMsRef.current = value;
    });
  }, []);

  const filteredPages = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return pages;
    return pages.filter((page) => {
      const name = resolveHtmlPageName(directory, page).toLowerCase();
      return name.includes(keyword)
        || page.name.toLowerCase().includes(keyword)
        || page.stem.toLowerCase().includes(keyword)
        || page.relative.toLowerCase().includes(keyword);
    });
  }, [pages, query, directory]);

  // v175: 相邻颜色组合 —— 与内容区项目卡片同一套规则（按当前显示顺序分组，组内共用基色系）。
  const frameColors = useMemo(() => resolveColorFrameColors(
    filteredPages.map((page) => ({ id: page.path, color: resolveHtmlPageColor(directory, page) })),
    {
      blend: display.colorFrameBlend,
      groupSize: display.colorFrameGroupSize,
      groupTint: display.colorFrameGroupTint,
    },
  ), [filteredPages, directory, display.colorFrameBlend, display.colorFrameGroupSize, display.colorFrameGroupTint]);
  // 同色相邻成组框：用组合后的最终颜色判断，用户看到同色才会被圈在一起。
  const colorClusters = useMemo(
    () => resolveColorFrameClusters(filteredPages.map((page) => ({ id: page.path, color: frameColors[page.path] }))),
    [filteredPages, frameColors],
  );
  const showColorClusters = (display.colorFrameClusterFrame ?? true) && colorClusters.length > 0;

  const pickFolder = useCallback(async () => {
    const picked = await open({ directory: true, multiple: false, title: '选择 HTML 所在文件夹' });
    if (typeof picked !== 'string' || !picked.trim()) return;
    try {
      const valid = await validateHtmlFolder(picked);
      setDirectoryHtmlPath(directory.id, valid);
      setLiveSizes({});
      liveSizesRef.current = {};
    } catch (pickError) {
      showLauncherNotice(`无法使用该文件夹：${String(pickError)}`);
    }
  }, [directory.id, setDirectoryHtmlPath]);

  const reloadPage = useCallback((path: string) => {
    setReloadNonce((current) => ({ ...current, [path]: (current[path] ?? 0) + 1 }));
  }, []);

  const openPage = useCallback((page: HtmlPage) => {
    void launchHtmlPage(page.path).catch((launchError) => showLauncherNotice(String(launchError)));
  }, []);

  /**
   * v175: 单击启动 —— 只在全局设置成「单击」时生效。
   *
   * 双击判定期间按下的第二下也会走到这里，用「刚开过」的时间戳挡掉，
   * 免得一次双击打开两次浏览器窗口。
   */
  const handleCardPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>, page: HtmlPage) => {
    const start = pressRef.current;
    pressRef.current = null;
    if (behavior.launchMode !== 'single') return;
    if (event.button !== 0) return;
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    if (!start || start.path !== page.path) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > CLICK_TOLERANCE_PX) return;
    const now = Date.now();
    if (now - lastSingleOpenRef.current < doubleClickMsRef.current) return;
    lastSingleOpenRef.current = now;
    openPage(page);
  }, [behavior.launchMode, openPage]);

  const handleCardPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>, page: HtmlPage) => {
    if (event.button !== 0) return;
    // 卡片头部的小按钮 / 缩放手柄有自己的动作，不能被算成「点击卡片」。
    if ((event.target as HTMLElement).closest('button')) return;
    pressRef.current = { path: page.path, x: event.clientX, y: event.clientY };
  }, []);

  const handleCardDoubleClick = useCallback((event: React.MouseEvent<HTMLDivElement>, page: HtmlPage) => {
    event.preventDefault();
    event.stopPropagation();
    // 单击模式在 pointerup 里已经打开过了，这里不再重复。
    if (behavior.launchMode === 'single') return;
    openPage(page);
  }, [behavior.launchMode, openPage]);

  const handleCardContextMenu = useCallback((event: React.MouseEvent<HTMLDivElement>, page: HtmlPage) => {
    event.preventDefault();
    event.stopPropagation();
    onContextMenuPage?.(page.path, event.clientX, event.clientY);
  }, [onContextMenuPage]);

  // 拖拽：监听挂在 window 上，鼠标滑出手柄（甚至滑出卡片）也不会丢事件。
  useEffect(() => {
    if (!drag) return;
    const previousCursor = document.body.style.cursor;
    const previousSelect = document.body.style.userSelect;
    document.body.style.cursor = HANDLE_CURSOR[drag.dir];
    document.body.style.userSelect = 'none';

    function handleMove(event: PointerEvent) {
      if (!drag) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      let width = drag.startWidth;
      let height = drag.startHeight;
      if (drag.dir.includes('e')) width = drag.startWidth + dx;
      if (drag.dir.includes('w')) width = drag.startWidth - dx;
      if (drag.dir.includes('s')) height = drag.startHeight + dy;
      if (drag.dir.includes('n')) height = drag.startHeight - dy;
      const next = clampCardSize({ width, height });
      liveSizesRef.current = { ...liveSizesRef.current, [drag.path]: next };
      setLiveSizes(liveSizesRef.current);
    }

    function handleUp() {
      if (!drag) return;
      const size = liveSizesRef.current[drag.path];
      if (size) setHtmlCardSize(directory.id, drag.path, size);
      setDrag(null);
    }

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousSelect;
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };
  }, [drag, directory.id, setHtmlCardSize]);

  /**
   * v175: 自动刷新。
   *
   * 轮询目录指纹（页面清单 + 修改时间 + 大小），变了才重新扫描 —— 用户把页面
   * 复制进文件夹后卡片墙自己长出来，不用再去点右上角的刷新。
   * 窗口重新获得焦点时也立刻比对一次（从资源管理器复制完切回来马上就更新）。
   */
  useEffect(() => {
    signatureRef.current = null;
    if (!root) return;
    let cancelled = false;
    let running = false;
    const recursive = view.recursive;

    async function check() {
      if (cancelled || running) return;
      // 窗口在后台时没必要扫盘 —— 切回来时 focus/visibilitychange 会立刻补一次。
      if (typeof document !== 'undefined' && document.hidden) return;
      running = true;
      try {
        const next = await htmlFolderSignature(root, recursive);
        if (cancelled) return;
        if (signatureRef.current === null) {
          signatureRef.current = next;
        } else if (signatureRef.current !== next) {
          signatureRef.current = next;
          await refreshHtmlFolder(directory.id);
        }
      } catch {
        // 文件夹被删 / 暂时没权限：静默重试，不要每 2 秒弹一次错误。
      } finally {
        running = false;
      }
    }

    checkSignatureRef.current = () => { void check(); };
    void check();
    const timer = window.setInterval(() => { void check(); }, AUTO_REFRESH_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      checkSignatureRef.current = () => {};
    };
  }, [root, view.recursive, directory.id, refreshHtmlFolder]);

  useEffect(() => {
    function handleFocus() {
      checkSignatureRef.current();
    }
    function handleVisibility() {
      if (document.visibilityState === 'visible') checkSignatureRef.current();
    }
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  const startResize = useCallback((event: React.PointerEvent, page: HtmlPage, dir: HandleDir) => {
    if (event.button !== 0) return;
    // 手柄按下不能冒泡到卡片（会触发「打开页面」），也不能让窗口开始拖动。
    event.preventDefault();
    event.stopPropagation();
    pressRef.current = null;
    const size = liveSizesRef.current[page.path] ?? resolveCardSize(directory, page.path);
    setDrag({
      path: page.path,
      dir,
      startX: event.clientX,
      startY: event.clientY,
      startWidth: size.width,
      startHeight: size.height,
    });
  }, [directory]);

  const cardSizeOf = useCallback((page: HtmlPage) => (
    liveSizes[page.path] ?? resolveCardSize(directory, page.path)
  ), [directory, liveSizes]);

  if (!root) {
    return (
      <div className="html-gallery empty">
        <div className="html-empty">
          <FolderSearch size={34} />
          <strong>还没有选择 HTML 文件夹</strong>
          <span>选一个文件夹，它会自动认出里面所有 .html / .htm 页面并生成预览卡片。</span>
          <button type="button" className="html-empty-action" onClick={() => void pickFolder()}>
            选择文件夹
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="html-gallery">
      <div className="content-toolbar html-toolbar" onMouseDown={(event) => event.stopPropagation()}>
        <Search size={15} />
        <input
          value={query}
          placeholder="搜索页面名称或相对路径"
          onChange={(event) => setQuery(event.target.value)}
        />
        {query && (
          <button type="button" className="toolbar-clear" onClick={() => setQuery('')} title="清除搜索">
            <X size={14} />
          </button>
        )}
        <span>{filteredPages.length}/{pages.length}</span>
        <button
          type="button"
          className="toolbar-clear"
          title={view.preview ? '关闭首页预览（省性能）' : '打开首页预览'}
          onClick={() => updateHtmlView(directory.id, { preview: !view.preview })}
        >
          {view.preview ? <Eye size={14} /> : <EyeOff size={14} />}
        </button>
        <button
          type="button"
          className="toolbar-clear"
          title="把卡片恢复成默认大小"
          onClick={() => {
            liveSizesRef.current = {};
            setLiveSizes({});
            resetHtmlCardSizes(directory.id);
          }}
        >
          <RotateCcw size={14} />
        </button>
        <button
          type="button"
          className="toolbar-clear"
          title={`打开文件夹：${root}`}
          onClick={() => void openHtmlFolderLocation(root).catch((openError) => showLauncherNotice(String(openError)))}
        >
          <FolderOpen size={14} />
        </button>
        <button
          type="button"
          className="toolbar-clear"
          title="重新扫描这个文件夹（放新页面进来会自动刷新，这里是手动兜底）"
          onClick={() => void refreshHtmlFolder(directory.id)}
          disabled={loading}
        >
          <RefreshCw size={14} className={loading ? 'html-spin' : undefined} />
        </button>
        <button type="button" className="toolbar-clear" title="换一个文件夹" onClick={() => void pickFolder()}>
          <FolderSearch size={14} />
        </button>
      </div>

      {error && <div className="html-error">{error}</div>}

      {!loading && filteredPages.length === 0 && (
        <div className="html-empty">
          <FolderSearch size={30} />
          <strong>{query ? '没有匹配的页面' : '这个文件夹里没有 .html 页面'}</strong>
          <span>
            {query
              ? '换个关键词试试。'
              : '把 .html / .htm 文件（或整个页面文件夹）拖到这个子目录上，会自动复制进来；也可以直接放进文件夹，卡片墙会自己刷新。'}
          </span>
        </div>
      )}

      <div className="html-cards" ref={cardsRef}>
        {filteredPages.map((page) => {
          const size = cardSizeOf(page);
          const previewHeight = Math.max(40, size.height - CARD_HEADER_HEIGHT - 2);
          const scale = view.previewScale === 'actual'
            ? 1
            : Math.min(1, size.width / PREVIEW_VIEWPORT_WIDTH);
          const iframeHeight = view.previewScale === 'actual' ? previewHeight : previewHeight / scale;
          const iframeWidth = view.previewScale === 'actual' ? size.width : PREVIEW_VIEWPORT_WIDTH;
          const frameColor = frameColors[page.path];
          const title = resolveHtmlPageName(directory, page);
          return (
            <div
              key={page.path}
              className={`html-card ${drag?.path === page.path ? 'resizing' : ''} ${frameColor ? 'has-custom-color' : ''}`}
              style={{
                width: `${size.width}px`,
                height: `${size.height}px`,
                ...(frameColor ? { '--html-accent': frameColor } : {}),
              } as CSSProperties}
              title={[title, page.relative, behavior.launchMode === 'single' ? '单击打开；右键管理' : '双击打开；右键管理'].filter(Boolean).join('\n')}
              data-html-path={page.path}
              data-launch-mode={behavior.launchMode}
              onPointerDown={(event) => handleCardPointerDown(event, page)}
              onPointerUp={(event) => handleCardPointerUp(event, page)}
              onDoubleClick={(event) => handleCardDoubleClick(event, page)}
              onContextMenu={(event) => handleCardContextMenu(event, page)}
            >
              <div className="html-card-head">
                <span className="html-card-name">{title}</span>
                {page.isIndex && <span className="html-card-badge">首页</span>}
                {page.directory && <span className="html-card-dir">{page.directory}</span>}
                <span className="html-card-actions">
                  <button
                    type="button"
                    title="重新加载预览"
                    onClick={(event) => { event.stopPropagation(); reloadPage(page.path); }}
                  >
                    <RefreshCw size={12} />
                  </button>
                  <button
                    type="button"
                    title="在浏览器里打开"
                    onClick={(event) => {
                      event.stopPropagation();
                      openPage(page);
                    }}
                  >
                    <ExternalLink size={12} />
                  </button>
                  <button
                    type="button"
                    title="在资源管理器里显示"
                    onClick={(event) => {
                      event.stopPropagation();
                      void invoke('open_file_location', { path: page.path }).catch((openError) => showLauncherNotice(String(openError)));
                    }}
                  >
                    <FolderOpen size={12} />
                  </button>
                </span>
              </div>
              <div className="html-card-preview">
                {view.preview ? (
                  <HtmlPreviewFrame
                    page={page}
                    scale={scale}
                    iframeWidth={iframeWidth}
                    iframeHeight={iframeHeight}
                    nonce={reloadNonce[page.path] ?? 0}
                  />
                ) : (
                  <div className="html-card-placeholder">
                    <span>{page.extension.toUpperCase()}</span>
                  </div>
                )}
              </div>
              {HANDLE_DIRS.map((dir) => (
                <span
                  key={dir}
                  className={`html-card-handle handle-${dir}`}
                  style={{ cursor: HANDLE_CURSOR[dir] }}
                  onPointerDown={(event) => startResize(event, page, dir)}
                />
              ))}
            </div>
          );
        })}
        {showColorClusters && (
          <ColorClusterFrames
            clusters={colorClusters}
            containerRef={cardsRef}
            itemSelector=".html-card[data-html-path]"
            dataKey="htmlPath"
            className="html-color-clusters"
            segmentClassName="html-color-cluster-segment"
            pad={6}
          />
        )}
      </div>
    </div>
  );
}

interface HtmlPreviewFrameProps {
  page: HtmlPage;
  scale: number;
  iframeWidth: number;
  iframeHeight: number;
  nonce: number;
}

/**
 * 单个页面的预览 iframe。
 *
 * 只有真正滚到眼前（或离视口 240px 内）才挂载 —— 几十个页面同时挂 WebView
 * 会把内存和合成器吃干。挂上之后不卸载：滚回来不用重新加载，体验更稳。
 */
function HtmlPreviewFrame({ page, scale, iframeWidth, iframeHeight, nonce }: HtmlPreviewFrameProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const src = useMemo(() => convertFileSrc(page.path), [page.path]);

  useEffect(() => {
    const node = hostRef.current;
    if (!node || mounted) return;
    if (typeof IntersectionObserver === 'undefined') {
      setMounted(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setMounted(true);
        observer.disconnect();
      }
    }, { rootMargin: '240px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [mounted]);

  return (
    <div className="html-preview-host" ref={hostRef}>
      {mounted ? (
        <iframe
          key={`${page.path}-${nonce}`}
          className="html-preview-frame"
          src={src}
          title={page.name}
          loading="lazy"
          style={{
            width: `${iframeWidth}px`,
            height: `${iframeHeight}px`,
            transform: `scale(${scale})`,
          }}
        />
      ) : (
        <div className="html-card-placeholder"><span>{page.extension.toUpperCase()}</span></div>
      )}
    </div>
  );
}
