import { describe, expect, it } from 'vitest';
import { getTheme } from '../../themes';
import { resolveEdgeStripStyle, sameEdgeStripStyle } from '../edgeStripStyle';

describe('resolveEdgeStripStyle (v158)', () => {
  it('falls back to the default theme accent and default size/opacity', () => {
    const accent = getTheme('claude').variables['--accent'] ?? '#C36A2D';
    expect(resolveEdgeStripStyle(undefined)).toEqual({ accent, color: accent, opacity: 0.88, size: 10 });
  });

  it('uses the custom color only when the theme color is turned off', () => {
    const custom = '#123456';
    expect(resolveEdgeStripStyle({ behavior: { edgeStripUseThemeColor: false, edgeStripColor: custom } }).color).toBe(custom);
    const themed = resolveEdgeStripStyle({ behavior: { edgeStripUseThemeColor: true, edgeStripColor: custom } });
    expect(themed.color).toBe(themed.accent);
  });

  it('falls back to the accent when the custom color is empty', () => {
    const style = resolveEdgeStripStyle({ behavior: { edgeStripUseThemeColor: false, edgeStripColor: '' } });
    expect(style.color).toBe(style.accent);
  });

  it('compares styles by value so unchanged settings do not re-apply', () => {
    const a = resolveEdgeStripStyle({ behavior: { edgeStripSize: 12, edgeStripOpacity: 0.5 } });
    const b = resolveEdgeStripStyle({ behavior: { edgeStripSize: 12, edgeStripOpacity: 0.5 } });
    expect(sameEdgeStripStyle(a, b)).toBe(true);
    expect(sameEdgeStripStyle(a, { ...b, size: 13 })).toBe(false);
    expect(sameEdgeStripStyle(null, b)).toBe(false);
  });
});
