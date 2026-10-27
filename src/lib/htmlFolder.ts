import { invoke } from '@tauri-apps/api/core';
import type { Directory, HtmlCardSize, HtmlViewSettings } from '../types';

/**
 * 「HTML 子目录」= 用户自选根目录里的 .html / .htm 页面画廊（v173）。
 *
 * 和映射子目录的区别：
 * 1. 只收 html / htm，且**递归**扫子文件夹（可关）；
 * 2. 每个页面是一张带**实时首页预览**的卡片（iframe + asset 协议），
 *    卡片边框可以拖拽改大小，尺寸按文件绝对路径存在 `Directory.htmlCards` 里；
 * 3. 内容不落盘到 items —— 每次切进来重新扫，文件删了卡片就没了。
 */

export interface HtmlPage {
  name: string;
  stem: string;
  path: string;
  extension: string;
  relative: string;
  directory: string;
  isIndex: boolean;
  modified?: number;
}

export const HTML_DEFAULT_NAME = 'HTML 目录';
/** 卡片默认尺寸（px）—— 拖拽边框之前的样子。 */
export const HTML_CARD_DEFAULT_WIDTH = 320;
export const HTML_CARD_DEFAULT_HEIGHT = 250;
export const HTML_CARD_MIN_WIDTH = 160;
export const HTML_CARD_MIN_HEIGHT = 120;
export const HTML_CARD_MAX_WIDTH = 1600;
export const HTML_CARD_MAX_HEIGHT = 1200;

export function isHtmlDirectory(directory?: Directory | null): boolean {
  return (directory?.kind ?? 'normal') === 'html';
}

/** HTML 目录的根路径；未配置时返回空串。 */
export function getHtmlPath(directory?: Directory | null): string {
  return directory?.htmlPath?.trim() ?? '';
}

export function hasHtmlPath(directory?: Directory | null): boolean {
  return isHtmlDirectory(directory) && Boolean(getHtmlPath(directory));
}

/** 从路径里取最后一段作为展示用名称。 */
export function htmlFolderLabel(path: string): string {
  const trimmed = path.trim().replace(/[\\/]+$/, '');
  if (!trimmed) return '';
  const parts = trimmed.split(/[\\/]/);
  return parts[parts.length - 1] || trimmed;
}

export function clampCardSize(size: Partial<HtmlCardSize>): HtmlCardSize {
  const width = Number.isFinite(size.width) ? Math.round(size.width as number) : HTML_CARD_DEFAULT_WIDTH;
  const height = Number.isFinite(size.height) ? Math.round(size.height as number) : HTML_CARD_DEFAULT_HEIGHT;
  return {
    width: Math.min(HTML_CARD_MAX_WIDTH, Math.max(HTML_CARD_MIN_WIDTH, width)),
    height: Math.min(HTML_CARD_MAX_HEIGHT, Math.max(HTML_CARD_MIN_HEIGHT, height)),
  };
}

/** 单个页面卡片的有效尺寸：单卡覆盖 > 目录默认 > 内置默认。 */
export function resolveCardSize(directory: Directory | null | undefined, path: string): HtmlCardSize {
  const override = directory?.htmlCards?.[path];
  const view = directory?.htmlView;
  return clampCardSize({
    width: override?.width ?? view?.cardWidth ?? HTML_CARD_DEFAULT_WIDTH,
    height: override?.height ?? view?.cardHeight ?? HTML_CARD_DEFAULT_HEIGHT,
  });
}

/** 目录级显示设置的有效值（补齐默认）。 */
export function resolveHtmlView(directory: Directory | null | undefined): Required<HtmlViewSettings> {
  const view = directory?.htmlView;
  return {
    cardWidth: view?.cardWidth ?? HTML_CARD_DEFAULT_WIDTH,
    cardHeight: view?.cardHeight ?? HTML_CARD_DEFAULT_HEIGHT,
    preview: view?.preview ?? true,
    previewScale: view?.previewScale ?? 'fit',
    recursive: view?.recursive ?? true,
  };
}

export function validateHtmlFolder(path: string): Promise<string> {
  return invoke<string>('validate_html_folder', { path });
}

/** v175: 把拖进来的页面 / 页面文件夹复制进 HTML 根目录后的结果。 */
export interface HtmlCopyResult {
  /** 真正落盘的文件或文件夹（绝对路径）。 */
  copied: string[];
  /** 被跳过的来源，附带原因，直接拿来提示用户。 */
  skipped: string[];
}

/**
 * v175: 复制 .html / .htm（或整个页面文件夹）到 HTML 根目录。
 *
 * 只复制不移动；同名文件不会覆盖，会自动变成 `xxx (2).html`。
 */
export function copyHtmlIntoFolder(path: string, sources: string[]): Promise<HtmlCopyResult> {
  return invoke<HtmlCopyResult>('copy_html_into_folder', { path, sources });
}

/**
 * v175: 取目录指纹（页面清单 + 每个文件的修改时间 / 大小）。
 *
 * 卡片墙拿它做自动刷新：指纹没变就不重扫，变了才重新列页面。
 */
export function htmlFolderSignature(path: string, recursive = true): Promise<string> {
  return invoke<string>('html_folder_signature', { path, recursive });
}

/** v175: 卡片标题 —— 用户改过名就用改过的，否则用文件名（不含扩展名）。 */
export function resolveHtmlPageName(directory: Directory | null | undefined, page: HtmlPage): string {
  const custom = directory?.htmlNames?.[page.path]?.trim();
  return custom || page.stem;
}

/** v175: 卡片颜色 —— 没上色返回 undefined（跟随主题）。 */
export function resolveHtmlPageColor(directory: Directory | null | undefined, page: HtmlPage): string | undefined {
  const color = directory?.htmlColors?.[page.path]?.trim();
  return color || undefined;
}

export function listHtmlFolder(path: string, recursive = true): Promise<HtmlPage[]> {
  return invoke<HtmlPage[]>('list_html_folder', { path, recursive });
}

/**
 * 把根目录递归加进 asset 协议作用域。
 *
 * 必须在 iframe 渲染之前调 —— 否则 `http://asset.localhost/...` 会被协议层拒掉，
 * 卡片里只会是一片空白。重复调用是幂等的，每次扫描顺手调一次最省心。
 */
export function allowHtmlPreview(path: string): Promise<string> {
  return invoke<string>('allow_html_preview', { path });
}

export function openHtmlFolderLocation(path: string): Promise<void> {
  return invoke<void>('open_html_folder_location', { path });
}
