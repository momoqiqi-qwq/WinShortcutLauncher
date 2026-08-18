import { describe, expect, it } from 'vitest';
import { defaultBehavior, defaultDisplay, defaultRainbow } from '../../stores/appStore/defaults';
import { normalizeBehavior } from '../../stores/appStore/normalizers';

describe('v113 first-run defaults', () => {
  it('starts with rainbow disabled and four-grid window controls', () => {
    expect(defaultRainbow.enabled).toBe(false);
    expect(defaultDisplay.windowControlStyle).toBe('pad');
  });

  it('shows the dropped-website rename dialog by default and allows disabling it', () => {
    expect(defaultBehavior.promptRenameDroppedWebsite).toBe(true);
    expect(normalizeBehavior({}).promptRenameDroppedWebsite).toBe(true);
    expect(normalizeBehavior({ promptRenameDroppedWebsite: false }).promptRenameDroppedWebsite).toBe(false);
  });
});
