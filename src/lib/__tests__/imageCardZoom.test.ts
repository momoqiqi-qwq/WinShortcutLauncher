import { describe, expect, it } from 'vitest';
import {
  IMAGE_CARD_ZOOM_MAX,
  IMAGE_CARD_ZOOM_MIN,
  clampImageCardZoom,
  resolveImageCardZoom,
  stepImageCardZoom
} from '../imageCard';

describe('图片卡片的缩放倍数', () => {
  it('缺省和脏值一律回到 1（原样显示）', () => {
    expect(resolveImageCardZoom(undefined)).toBe(1);
    expect(resolveImageCardZoom({})).toBe(1);
    expect(clampImageCardZoom(undefined)).toBe(1);
    expect(clampImageCardZoom('bad')).toBe(1);
    expect(clampImageCardZoom(0)).toBe(1);
    expect(clampImageCardZoom(-3)).toBe(1);
  });

  it('不会缩到比框小，也不会无限放大', () => {
    expect(clampImageCardZoom(0.4)).toBe(IMAGE_CARD_ZOOM_MIN);
    expect(clampImageCardZoom(99)).toBe(IMAGE_CARD_ZOOM_MAX);
    expect(clampImageCardZoom(2.5)).toBe(2.5);
  });

  it('超过 1 的合法值原样读回，并保留三位小数', () => {
    expect(resolveImageCardZoom({ imageZoom: 1.8 })).toBe(1.8);
    expect(clampImageCardZoom(1.23456)).toBe(1.235);
  });

  it('往上滚放大、往下滚缩小，到边界就停住', () => {
    const bigger = stepImageCardZoom(1, -100);
    expect(bigger).toBeGreaterThan(1);
    expect(stepImageCardZoom(bigger, 100)).toBe(1);
    // 已经在最小/最大倍数时再滚也不会越界
    expect(stepImageCardZoom(1, 100)).toBe(IMAGE_CARD_ZOOM_MIN);
    expect(stepImageCardZoom(IMAGE_CARD_ZOOM_MAX, -100)).toBe(IMAGE_CARD_ZOOM_MAX);
  });

  it('连续放大是乘性的，步长手感一致', () => {
    let zoom = 1;
    for (let i = 0; i < 5; i += 1) zoom = stepImageCardZoom(zoom, -100);
    // 每一档都取三位小数，累计误差会有一点，量级对得上就够
    expect(zoom).toBeCloseTo(1.12 ** 5, 2);
  });
});
