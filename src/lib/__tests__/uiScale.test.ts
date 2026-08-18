import { describe, expect, it } from 'vitest';
import { MAX_UI_SCALE, MIN_UI_SCALE, normalizeUiScale } from '../uiScale';

describe('ui scale guard', () => {
  it('allows x0.1 scaling and never goes below it', () => {
    expect(normalizeUiScale(0.1)).toBe(MIN_UI_SCALE);
    expect(normalizeUiScale(0.65)).toBe(0.65);
    expect(normalizeUiScale(-2)).toBe(MIN_UI_SCALE);
  });

  it('caps excessive scale and rounds stable values', () => {
    expect(normalizeUiScale(9)).toBe(MAX_UI_SCALE);
    expect(normalizeUiScale(1.249)).toBe(1.25);
  });

  it('uses a safe fallback for invalid values', () => {
    expect(normalizeUiScale('bad')).toBe(1);
  });
});
