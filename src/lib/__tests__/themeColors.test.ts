import { describe, expect, it } from 'vitest';
import { parseCssColor, toOpaqueThemeSurface } from '../themeColors';

describe('theme color helpers', () => {
  it('parses compact alpha values used by bundled themes', () => {
    expect(parseCssColor('rgba(255,255,255,.62)')).toEqual({ r: 255, g: 255, b: 255, a: 0.62 });
  });

  it('keeps already opaque theme colors unchanged', () => {
    expect(toOpaqueThemeSurface('#252525', '#1E1E1E')).toBe('#252525');
  });

  it('flattens translucent panel colors over the theme background', () => {
    expect(toOpaqueThemeSurface('rgba(255,255,255,.62)', '#eaf3ff')).toBe('rgb(247, 250, 255)');
    expect(toOpaqueThemeSurface('rgba(221,235,255,.72)', '#eaf3ff')).toBe('rgb(225, 237, 255)');
  });
});
