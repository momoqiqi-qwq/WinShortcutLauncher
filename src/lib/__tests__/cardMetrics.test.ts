import { describe, expect, it } from 'vitest';
import { getEffectiveCardMinHeight, getEffectiveCardWidth, getLabelDrivenCardWidth, ITEM_CARD_LABEL_PADDING } from '../cardMetrics';
import type { DisplaySettings } from '../../types';

const base = {
  itemWidth: 108,
  itemHeight: 100,
  iconSize: 32,
  fontSize: 12,
  labelLines: 2,
  charsPerLine: 8,
  viewMode: 'grid',
} as unknown as DisplaySettings;

describe('card metrics driven by 每行字数', () => {
  it('converts the per-line character count into a card width', () => {
    expect(getLabelDrivenCardWidth({ charsPerLine: 8, fontSize: 12, labelLines: 2 })).toBe(8 * 12 + ITEM_CARD_LABEL_PADDING);
    expect(getLabelDrivenCardWidth({ charsPerLine: 4, fontSize: 12, labelLines: 2 })).toBe(48 + ITEM_CARD_LABEL_PADDING);
    expect(getLabelDrivenCardWidth({ charsPerLine: 20, fontSize: 12, labelLines: 2 })).toBe(240 + ITEM_CARD_LABEL_PADDING);
  });

  it('ignores the per-line character count while 完整显示项目名称 is on', () => {
    expect(getLabelDrivenCardWidth({ charsPerLine: 20, fontSize: 12, labelLines: 0 })).toBe(0);
  });

  it('never lets the card clamp the requested characters per line', () => {
    // v154 回归：默认卡片 108px 时，标签可用宽只有 96px = 8 个 12px 汉字，
    // 于是 8→20 整段滑块都点不动换行位置。放宽卡片后每一档都必须真的放得下。
    for (let charsPerLine = 4; charsPerLine <= 20; charsPerLine += 1) {
      const display = { ...base, charsPerLine };
      const labelWidth = getEffectiveCardWidth(display) - ITEM_CARD_LABEL_PADDING;
      expect(labelWidth).toBeGreaterThanOrEqual(charsPerLine * display.fontSize);
    }
  });

  it('keeps the user width when it is already wide enough', () => {
    expect(getEffectiveCardWidth({ ...base, itemWidth: 260 })).toBe(260);
    expect(getEffectiveCardWidth({ ...base, itemWidth: 108, charsPerLine: 20 })).toBe(20 * 12 + ITEM_CARD_LABEL_PADDING);
  });

  it('still reserves room for the icon in compact and grid views', () => {
    expect(getEffectiveCardWidth({ ...base, itemWidth: 40, iconSize: 48, charsPerLine: 4, viewMode: 'compact' })).toBe(76);
    expect(getEffectiveCardWidth({ ...base, itemWidth: 40, iconSize: 48, charsPerLine: 4, viewMode: 'grid' })).toBe(94);
  });

  it('derives the minimum height from icon, lines and font size', () => {
    expect(getEffectiveCardMinHeight({ ...base, itemHeight: 40, iconSize: 48 })).toBeCloseTo(48 + 2 * 12 * 1.4 + 28, 5);
    expect(getEffectiveCardMinHeight({ ...base, itemHeight: 100 })).toBe(100);
    expect(getEffectiveCardMinHeight({ ...base, itemHeight: 400 })).toBe(400);
  });
});
