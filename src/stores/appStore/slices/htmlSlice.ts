import {
  allowHtmlPreview,
  getHtmlPath,
  isHtmlDirectory,
  listHtmlFolder,
  resolveHtmlView,
  type HtmlPage,
} from '../../../lib/htmlFolder';
import type { Directory, Group } from '../../../types';
import type { AppSliceCreator, HtmlActions } from '../types';

/** 未加载时返回同一个空数组，避免每次调用都产生新引用导致重渲染。 */
const EMPTY_PAGES: HtmlPage[] = [];

function findDirectory(groups: Group[], directoryId: string): Directory | undefined {
  for (const group of groups) {
    const found = group.directories.find((directory) => directory.id === directoryId);
    if (found) return found;
  }
  return undefined;
}

/**
 * HTML 子目录的运行时切片（v173）。
 *
 * 页面列表是**运行时扫出来的**，不进配置 —— 文件夹里删掉一个 html，
 * 下次刷新卡片就消失，不需要任何同步逻辑。
 *
 * 刷新流程刻意是「先授权、后扫描」：
 * 1. `allow_html_preview(root)` 把根目录递归塞进 asset 协议作用域，
 *    否则 iframe 里的 `http://asset.localhost/...` 会被协议层拒掉（白屏）；
 * 2. 再 `list_html_folder` 拿页面清单。
 *
 * 授权失败只记日志不阻断扫描：卡片照样能列出来，只是预览区会是空的，
 * 用户还能看到文件名并手动打开 —— 比整片区域报错更有用。
 */
export const createHtmlSlice: AppSliceCreator<HtmlActions> = (set, get) => {
  function rootOf(directoryId: string): string {
    const directory = findDirectory(get().groups, directoryId);
    return isHtmlDirectory(directory) ? getHtmlPath(directory) : '';
  }

  return {
    refreshHtmlFolder: async (directoryId: string) => {
      const directory = findDirectory(get().groups, directoryId);
      const root = rootOf(directoryId);
      if (!root) {
        set({
          htmlError: { ...get().htmlError, [directoryId]: '该 HTML 子目录还没有选择文件夹' },
          htmlPages: { ...get().htmlPages, [directoryId]: EMPTY_PAGES },
        });
        return 0;
      }
      // 已经有一轮在跑时直接复用，避免切目录时反复扫盘。
      if (get().htmlLoading[directoryId]) return get().getHtmlPages(directoryId).length;

      set({
        htmlLoading: { ...get().htmlLoading, [directoryId]: true },
        htmlError: { ...get().htmlError, [directoryId]: null },
      });
      try {
        await allowHtmlPreview(root).catch((error) => {
          console.warn('allow_html_preview failed', error);
        });
        const recursive = resolveHtmlView(directory).recursive;
        const pages = await listHtmlFolder(root, recursive);
        set({
          htmlPages: { ...get().htmlPages, [directoryId]: pages },
          htmlLoadedAt: { ...get().htmlLoadedAt, [directoryId]: Date.now() },
          htmlLoading: { ...get().htmlLoading, [directoryId]: false },
          htmlError: { ...get().htmlError, [directoryId]: null },
        });
        return pages.length;
      } catch (error) {
        set({
          htmlLoading: { ...get().htmlLoading, [directoryId]: false },
          htmlError: { ...get().htmlError, [directoryId]: String(error) },
        });
        return get().getHtmlPages(directoryId).length;
      }
    },

    getHtmlPages: (directoryId: string) => get().htmlPages[directoryId] ?? EMPTY_PAGES,

    clearHtmlFolder: (directoryId: string) => {
      const pages = { ...get().htmlPages };
      delete pages[directoryId];
      const loadedAt = { ...get().htmlLoadedAt };
      delete loadedAt[directoryId];
      set({ htmlPages: pages, htmlLoadedAt: loadedAt });
    },
  };
};
