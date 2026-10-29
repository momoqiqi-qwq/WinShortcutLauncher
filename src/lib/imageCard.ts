import { invoke } from '@tauri-apps/api/core';
import type { ImageCardSize, ShortcutItem } from '../types';

/**
 * 「图片卡片」：项目一旦带上 `item.imageSize`，就不再画成「图标 + 名字」，
 * 而是把图片本身铺满整张卡片，并且能用八个方向的手柄拖拽改大小（v188）。
 *
 * 和 HTML 目录卡片的区别：图片卡片是**项目级**的（跟着项目走，能排序、能拖进别的
 * 子目录），HTML 卡片是目录级扫描出来的临时卡片。尺寸规则照着 HTML 那套写，
 * 手感一致。
 */

/** 对话框里筛选的图片扩展名（不含点）。 */
export const IMAGE_CARD_EXTENSIONS = [
  'png',
  'apng',
  'jpg',
  'jpeg',
  'jfif',
  'webp',
  'gif',
  'bmp',
  'avif',
  'svg',
  'ico'
];

const IMAGE_CARD_FILE_RE = new RegExp(`\\.(${IMAGE_CARD_EXTENSIONS.join('|')})$`, 'i');

export const IMAGE_CARD_DEFAULT_WIDTH = 240;
export const IMAGE_CARD_DEFAULT_HEIGHT = 180;
export const IMAGE_CARD_MIN_WIDTH = 96;
export const IMAGE_CARD_MIN_HEIGHT = 96;
export const IMAGE_CARD_MAX_WIDTH = 960;
export const IMAGE_CARD_MAX_HEIGHT = 960;

/** 路径/网址是不是图片文件（按扩展名判断，够用且不必读盘）。 */
export function isImageFilePath(path: string): boolean {
  return IMAGE_CARD_FILE_RE.test((path ?? '').trim());
}

/** 把任意输入夹进合法区间；缺项按默认值补齐。 */
export function clampImageCardSize(size: Partial<ImageCardSize> | undefined | null): ImageCardSize {
  const rawWidth = Number(size?.width);
  const rawHeight = Number(size?.height);
  const width = Number.isFinite(rawWidth) ? Math.round(rawWidth) : IMAGE_CARD_DEFAULT_WIDTH;
  const height = Number.isFinite(rawHeight) ? Math.round(rawHeight) : IMAGE_CARD_DEFAULT_HEIGHT;
  return {
    width: Math.min(IMAGE_CARD_MAX_WIDTH, Math.max(IMAGE_CARD_MIN_WIDTH, width)),
    height: Math.min(IMAGE_CARD_MAX_HEIGHT, Math.max(IMAGE_CARD_MIN_HEIGHT, height))
  };
}

export function defaultImageCardSize(): ImageCardSize {
  return { width: IMAGE_CARD_DEFAULT_WIDTH, height: IMAGE_CARD_DEFAULT_HEIGHT };
}

/** 这个项目是不是图片卡片；是的话返回它的有效尺寸。 */
export function resolveImageCardSize(item: Pick<ShortcutItem, 'imageSize'> | null | undefined): ImageCardSize | null {
  if (!item?.imageSize) return null;
  return clampImageCardSize(item.imageSize);
}

export function isImageCardItem(item: Pick<ShortcutItem, 'imageSize'> | null | undefined): boolean {
  return Boolean(item?.imageSize);
}

/**
 * 把图片所在的**文件**加进 asset 协议作用域，之后 `convertFileSrc(path)` 才能读到它。
 *
 * 作用域是运行时的，重启应用就没了 —— 所以每次渲染图片卡片前都调一次，
 * 重复调用是幂等的。
 */
export function allowImagePreview(path: string): Promise<string> {
  return invoke<string>('allow_image_preview', { path });
}
