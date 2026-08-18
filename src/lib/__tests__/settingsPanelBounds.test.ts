import { describe, expect, it } from 'vitest';
import {
  getAdaptiveSettingsPanelRect,
  getSettingsPanelViewportState,
} from '../settingsPanelBounds';

describe('adaptive settings panel bounds', () => {
  it('fills the main window while keeping a safe margin', () => {
    expect(getAdaptiveSettingsPanelRect({ width: 1180, height: 880 })).toEqual({
      left: 18,
      top: 18,
      width: 1144,
      height: 844,
    });
  });

  it('uses a smaller margin for compact windows', () => {
    expect(getAdaptiveSettingsPanelRect({ width: 520, height: 400 })).toEqual({
      left: 8,
      top: 8,
      width: 504,
      height: 384,
    });
  });

  it('accounts for settings UI scaling without overflowing the viewport', () => {
    expect(getAdaptiveSettingsPanelRect({ width: 1000, height: 700 }, 1.25)).toEqual({
      left: 15,
      top: 15,
      width: 771,
      height: 531,
    });
  });

  it('still fits an abnormally small but supported main window', () => {
    expect(getAdaptiveSettingsPanelRect({ width: 250, height: 250 })).toEqual({
      left: 8,
      top: 8,
      width: 234,
      height: 234,
    });
  });

  it('stays centered and visible at x0.1 settings scale', () => {
    const rect = getAdaptiveSettingsPanelRect({ width: 900, height: 640 }, 0.1);
    expect(rect).toEqual({
      left: 180,
      top: 180,
      width: 8640,
      height: 6040,
    });
    expect(rect.left * 0.1).toBe(18);
    expect(rect.top * 0.1).toBe(18);
  });

  it('requests both safety scrollbars when the adaptive panel is smaller than usable content', () => {
    expect(getSettingsPanelViewportState({ width: 420, height: 320 })).toEqual({
      constrained: true,
      needsHorizontalScroll: true,
      needsVerticalScroll: true,
    });
  });

  it('does not request outer scrollbars when the panel can fully display the settings layout', () => {
    expect(getSettingsPanelViewportState({ width: 900, height: 680 })).toEqual({
      constrained: false,
      needsHorizontalScroll: false,
      needsVerticalScroll: false,
    });
  });

  it('uses the rendered scale only for compact presentation, not unscaled content overflow', () => {
    expect(getSettingsPanelViewportState({ width: 580, height: 420 }, 0.75)).toEqual({
      constrained: true,
      needsHorizontalScroll: false,
      needsVerticalScroll: false,
    });
  });
});
