import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useAppStore } from '../../../stores/appStore';
import type { Directory, HtmlCardSize } from '../../../types';
import {
  clampCardSize,
  getHtmlPath,
  openHtmlFolderLocation,
  resolveCardSize,
  resolveHtmlView,
  validateHtmlFolder,
  type HtmlPage,
} from '../../../lib/htmlFolder';
import { launchHtmlPage } from '../../../lib/launchShortcut';
import { showLauncherNotice } from '../../../lib/notify';
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
}

/**
 * HTML 子目录（v173）：把文件夹里的每个 .html 渲染成一张**带实时首页预览**的卡片。
 *
 * 三个关键点：
 * 1. 预览是 iframe + Tauri asset 协议（`convertFileSrc`），相对路径的图片/CSS
 *    天然能解析，不需要另建服务器；作用域由 `refreshHtmlFolder` 里的
 *    `allow_html_preview` 打开；
 * 2. 卡片边框有 8 个拖拽手柄，鼠标移上去变双向箭头，尺寸按文件路径存在目录配置里；
 * 3. iframe 用 IntersectionObserver 懒挂载 —— 一个目录几十个页面时，
 *    同时挂几十个 WebView 会直接卡死。
 */
export function HtmlGallery({ directory }: HtmlGalleryProps) {
  const pages = useAppStore((state) => state.getHtmlPages(directory.id));
  const loading = useAppStore((state) => state.htmlLoading[directory.id] ?? false);
  const error = useAppStore((state) => state.htmlError[directory.id] ?? null);
  const refreshHtmlFolder = useAppStore((state) => state.refreshHtmlFolder);
  const setDirectoryHtmlPath = useAppStore((state) => state.setDirectoryHtmlPath);
  const setHtmlCardSize = useAppStore((state) => state.setHtmlCardSize);
  const resetHtmlCardSizes = useAppStore((state) => state.resetHtmlCardSizes);
  const updateHtmlView = useAppStore((state) => state.updateHtmlView);

  const root = getHtmlPath(directory);
  const view = resolveHtmlView(directory);
  const [query, setQuery] = useState('');
  const [drag, setDrag] = useState<DragState | null>(null);
  // 拖拽过程中的实时尺寸：不落盘，松手才写进配置（否则每帧都触发一次 persist）。
  const [liveSizes, setLiveSizes] = useState<Record<string, HtmlCardSize>>({});
  const liveSizesRef = useRef<Record<string, HtmlCardSize>>({});
  const [reloadNonce, setReloadNonce] = useState<Record<string, number>>({});

  const filteredPages = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return pages;
    return pages.filter((page) => (
      page.name.toLowerCase().includes(keyword)
      || page.stem.toLowerCase().includes(keyword)
      || page.relative.toLowerCase().includes(keyword)
    ));
  }, [pages, query]);

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

  const startResize = useCallback((event: React.PointerEvent, page: HtmlPage, dir: HandleDir) => {
    if (event.button !== 0) return;
    // 手柄按下不能冒泡到卡片（会触发「打开页面」），也不能让窗口开始拖动。
    event.preventDefault();
    event.stopPropagation();
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
          title="重新扫描这个文件夹"
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
          <span>{query ? '换个关键词试试。' : '把网页文件放进这个文件夹，再点右上角的刷新。'}</span>
        </div>
      )}

      <div className="html-cards">
        {filteredPages.map((page) => {
          const size = cardSizeOf(page);
          const previewHeight = Math.max(40, size.height - CARD_HEADER_HEIGHT - 2);
          const scale = view.previewScale === 'actual'
            ? 1
            : Math.min(1, size.width / PREVIEW_VIEWPORT_WIDTH);
          const iframeHeight = view.previewScale === 'actual' ? previewHeight : previewHeight / scale;
          const iframeWidth = view.previewScale === 'actual' ? size.width : PREVIEW_VIEWPORT_WIDTH;
          return (
            <div
              key={page.path}
              className={`html-card ${drag?.path === page.path ? 'resizing' : ''}`}
              style={{ width: `${size.width}px`, height: `${size.height}px` }}
              title={page.relative}
              onDoubleClick={() => void launchHtmlPage(page.path).catch((launchError) => showLauncherNotice(String(launchError)))}
            >
              <div className="html-card-head">
                <span className="html-card-name">{page.stem}</span>
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
                      void launchHtmlPage(page.path).catch((launchError) => showLauncherNotice(String(launchError)));
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
