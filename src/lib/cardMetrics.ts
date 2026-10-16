import type { DisplaySettings } from '../types';

/** `.item-card` 左右内边距合计（6px × 2）：项目名称的可用宽度 = 卡片宽 − 该值。 */
export const ITEM_CARD_LABEL_PADDING = 12;

type LabelMetrics = Pick<DisplaySettings, 'charsPerLine' | 'fontSize' | 'labelLines'>;

/**
 * v154：「每行字数（换行）」要真正决定换行点，卡片宽度必须 ≥ 字数宽 + 内边距。
 *
 * 只靠 `.item-label` 的 `max-width: calc(var(--label-chars) * 1em)` 会被卡片内容宽夹住：
 * 默认卡片 108px（内容 96px = 8 字 × 12px），于是滑块从 8 拉到 20 时换行位置一动不动，
 * 看起来就是「多字（更多字）换行没有效果」。这里把字数需求换算成卡片最小宽度，
 * 让 `getEffectiveCardWidth()` 把卡片一起放宽，字数设置在整个 4–20 区间都可见生效。
 */
export function getLabelDrivenCardWidth(display: LabelMetrics): number {
  const chars = Number(display.charsPerLine);
  const fontSize = Number(display.fontSize);
  if (!(Number(display.labelLines) >= 1)) return 0;
  if (!Number.isFinite(chars) || !Number.isFinite(fontSize) || chars <= 0 || fontSize <= 0) return 0;
  return Math.ceil(chars * fontSize + ITEM_CARD_LABEL_PADDING);
}

/** 项目卡片最终宽度：取「用户设置的占位宽度」「视图模式最小值」「每行字数所需宽度」三者中的最大值。 */
export function getEffectiveCardWidth(display: DisplaySettings): number {
  return Math.max(
    display.itemWidth,
    display.viewMode === 'compact' ? display.iconSize + 28 : display.iconSize + 46,
    getLabelDrivenCardWidth(display),
  );
}

/** 项目卡片最小高度：与宽度同一套推导，供内容区网格与设置里的实时预览共用。 */
export function getEffectiveCardMinHeight(display: DisplaySettings): number {
  return Math.max(
    display.itemHeight,
    display.iconSize + Number(display.labelLines) * Number(display.fontSize) * 1.4 + 28,
  );
}
