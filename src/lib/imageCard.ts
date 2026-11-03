import { invoke } from '@tauri-apps/api/core';
import type { ImageCardSize, ShortcutItem } from '../types';

/**
 * 「图片卡片」：项目一旦带上 `item.imageSize`，就不再画成「图标 + 名字」，
 * 而是把图片本身铺满整张卡片，并且能用八个方向的手柄拖拽改大小（v188）。
 *
 * 和 HTML 目录卡片的区别：图片卡片是**项目级**的（跟着项目走，能排序、能拖进别的
 * 子目录），HTML 卡片是目录级扫描出来的临时卡片。尺寸规则照着 HTML 那套写，
 * 手感一致。
 *
 * v198: 卡片框架的尺寸（`imageSize`）和图片本体的缩放（`imageZoom`）是两件事 ——
 * Ctrl + 滚轮（触控板双指捏合）只改后者，框一个像素都不动。
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

/**
 * v198: 图片卡片内部的「缩放」倍数（框不动，只放大/缩小框里的那张图）。
 *
 * 1 = 按铺法原样显示；上限 6 倍。**下限就是 1**，不往下走 —— 铺满模式下缩到 1 以下
 * 图片会比框小、露出卡片底色，看起来像坏掉了，所以缩放只往「看得更细」这个方向走。
 */
export const IMAGE_CARD_ZOOM_MIN = 1;
export const IMAGE_CARD_ZOOM_MAX = 6;

/** 一次滚轮事件（或一次捏合）的缩放步进比例。 */
export const IMAGE_CARD_ZOOM_STEP = 1.12;

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
 * v198: 把缩放倍数夹进合法区间；缺项 / 脏值一律回到 1（原样显示）。
 *
 * 保留三位小数：滚轮是一路乘上去的，不留小数位会让连续缩放越来越粗糙。
 */
export function clampImageCardZoom(value: unknown): number {
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw <= 0) return IMAGE_CARD_ZOOM_MIN;
  const clamped = Math.min(IMAGE_CARD_ZOOM_MAX, Math.max(IMAGE_CARD_ZOOM_MIN, raw));
  return Math.round(clamped * 1000) / 1000;
}

/** v198: 这个项目当前的图片缩放倍数（没设过就是 1）。 */
export function resolveImageCardZoom(item: Pick<ShortcutItem, 'imageZoom'> | null | undefined): number {
  return clampImageCardZoom(item?.imageZoom);
}

/**
 * v198: 一次滚轮/捏合的缩放结果。
 *
 * `deltaY < 0`（往上滚 / 双指张开）放大，反方向缩小。乘性步进所以大倍数时手感一致；
 * 到边界直接返回边界值，调用方拿返回值跟当前值比一下就能知道「到头了」。
 */
export function stepImageCardZoom(current: number, deltaY: number): number {
  const direction = deltaY < 0 ? 1 : -1;
  const base = clampImageCardZoom(current);
  const next = direction > 0 ? base * IMAGE_CARD_ZOOM_STEP : base / IMAGE_CARD_ZOOM_STEP;
  return clampImageCardZoom(next);
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
