import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WINDOW_HEIGHT,
  DEFAULT_WINDOW_WIDTH,
  clampWindowBoundsToArea,
  parseSavedWindowBounds
} from '../windowBounds';

describe('saved window bounds', () => {
  it('restores the default size when the visible window is below the safe minimum', () => {
    expect(parseSavedWindowBounds(JSON.stringify({ width: 899, height: 900, x: 10, y: 20 }))).toMatchObject({
      width: DEFAULT_WINDOW_WIDTH,
      height: DEFAULT_WINDOW_HEIGHT,
      x: 10,
      y: 20
    });
    expect(parseSavedWindowBounds(JSON.stringify({ width: 900, height: 639 }))).toMatchObject({
      width: DEFAULT_WINDOW_WIDTH,
      height: DEFAULT_WINDOW_HEIGHT
    });
  });

  it('keeps a valid saved size', () => {
    expect(parseSavedWindowBounds(JSON.stringify({ width: 1200, height: 760, savedAt: 8 }))).toEqual({
      width: 1200,
      height: 760,
      x: undefined,
      y: undefined,
      savedAt: 8
    });
  });

  it('rejects damaged storage values', () => {
    expect(parseSavedWindowBounds('{bad json')).toBeNull();
    expect(parseSavedWindowBounds(JSON.stringify({ width: 'x', height: 700 }))).toBeNull();
  });

  it('clamps an off-screen position into the monitor area', () => {
    expect(clampWindowBoundsToArea(
      { width: 800, height: 600, x: 1800, y: -200, savedAt: 0 },
      { x: 0, y: 0, width: 1920, height: 1080 }
    )).toMatchObject({ x: 1120, y: 0 });
  });
});
