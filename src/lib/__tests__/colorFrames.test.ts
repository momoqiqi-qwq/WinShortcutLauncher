import { describe, expect, it } from 'vitest';
import {
  clampGroupSize,
  clampGroupTint,
  isHexColor,
  resolveColorFrameColors,
  tintColor,
} from '../colorFrames';

const AMBER = '#f59e0b';
const EMERALD = '#10b981';
const SKY = '#0ea5e9';
const PINK = '#ec4899';

describe('color frame blending', () => {
  it('accepts only well formed hex colors', () => {
    expect(isHexColor('#abc')).toBe(true);
    expect(isHexColor('#abcd')).toBe(true);
    expect(isHexColor('#aabbcc')).toBe(true);
    expect(isHexColor('#AABBCC88')).toBe(true);
    expect(isHexColor(' #aabbcc ')).toBe(true);
    expect(isHexColor('javascript:bad')).toBe(false);
    expect(isHexColor('#ab')).toBe(false);
    expect(isHexColor('var(--accent)')).toBe(false);
    expect(isHexColor(undefined)).toBe(false);
  });

  it('tints a color toward white while keeping its alpha', () => {
    expect(tintColor(AMBER, 0)).toBe(AMBER);
    expect(tintColor(AMBER, 0.22)).toBe('#f7b341');
    expect(tintColor('#8b5cf680', 0.5)).toBe('#c5aefb80');
    // 非法色值原样返回，绝不抛出或产生垃圾字符串。
    expect(tintColor('javascript:bad', 0.5)).toBe('javascript:bad');
  });

  it('clamps the group size and tint to their documented ranges', () => {
    expect(clampGroupSize(1)).toBe(2);
    expect(clampGroupSize(9)).toBe(6);
    expect(clampGroupSize(3.4)).toBe(3);
    expect(clampGroupSize(Number.NaN)).toBe(3);
    expect(clampGroupTint(-1)).toBe(0);
    expect(clampGroupTint(9)).toBe(0.6);
    expect(clampGroupTint(Number.NaN)).toBe(0.22);
  });

  it('passes every color through untouched in independent mode', () => {
    const colors = resolveColorFrameColors(
      [
        { id: 'a', color: AMBER },
        { id: 'b' },
        { id: 'c', color: SKY },
      ],
      { blend: 'independent', groupSize: 3, groupTint: 0.22 },
    );
    expect(colors).toEqual({ a: AMBER, c: SKY });
  });

  it('shares one base color family inside each adjacent group', () => {
    const colors = resolveColorFrameColors(
      [
        { id: 'a', color: AMBER },
        { id: 'b', color: EMERALD },
        { id: 'c', color: SKY },
        { id: 'd', color: PINK },
      ],
      { blend: 'adjacent', groupSize: 3, groupTint: 0.22 },
    );
    // 第一组三个共用琥珀基色，逐格变浅；第四个自成一组，用自己的颜色。
    expect(colors.a).toBe(AMBER);
    expect(colors.b).toBe('#f7b341');
    expect(colors.c).toBe('#f9c976');
    expect(colors.d).toBe(PINK);
  });

  it('uses the first colored member as the base and never invents colors', () => {
    const colors = resolveColorFrameColors(
      [
        { id: 'plain-1' },
        { id: 'colored', color: EMERALD },
        { id: 'plain-2' },
        { id: 'plain-3' },
      ],
      { blend: 'adjacent', groupSize: 3, groupTint: 0.3 },
    );
    expect(colors.colored).toBe(EMERALD);
    // 组内没有上色的项保持跟随主题，不会被基色染上。
    expect(Object.keys(colors)).toEqual(['colored']);
  });

  it('makes a group a single flat block when the tint is zero', () => {
    const colors = resolveColorFrameColors(
      [
        { id: 'a', color: AMBER },
        { id: 'b', color: EMERALD },
        { id: 'c', color: SKY },
      ],
      { blend: 'adjacent', groupSize: 4, groupTint: 0 },
    );
    expect(colors).toEqual({ a: AMBER, b: AMBER, c: AMBER });
  });

  it('starts a new group on every size boundary', () => {
    const colors = resolveColorFrameColors(
      [
        { id: 'a', color: AMBER },
        { id: 'b', color: EMERALD },
        { id: 'c', color: SKY },
        { id: 'd', color: PINK },
      ],
      { blend: 'adjacent', groupSize: 2, groupTint: 0 },
    );
    expect(colors).toEqual({ a: AMBER, b: AMBER, c: SKY, d: SKY });
  });

  it('caps how light the deepest member of a group can get', () => {
    const colors = resolveColorFrameColors(
      Array.from({ length: 6 }, (_, index) => ({ id: `i${index}`, color: AMBER })),
      { blend: 'adjacent', groupSize: 6, groupTint: 0.6 },
    );
    for (const value of Object.values(colors)) expect(isHexColor(value)).toBe(true);
    // 累计落差被压在 80% 以内，所以最后一格不会糊成纯白。
    expect(colors.i5).toBe(tintColor(AMBER, 0.8));
    expect(colors.i5).not.toBe('#ffffff');
  });

  it('returns an empty map for an empty list', () => {
    expect(resolveColorFrameColors([], { blend: 'adjacent', groupSize: 3, groupTint: 0.22 })).toEqual({});
  });
});
