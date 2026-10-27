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
