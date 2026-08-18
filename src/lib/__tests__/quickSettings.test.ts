import { describe, expect, it } from 'vitest';
import { QUICK_SETTINGS_CATALOG, normalizeQuickSettingsPreferences } from '../quickSettings';

describe('quick settings preferences', () => {
  it('keeps custom order while appending newly introduced entries', () => {
    const normalized = normalizeQuickSettingsPreferences({ order: ['data', 'font'], hidden: ['font', 'unknown'], favorites: ['data', 'data'] });
    expect(normalized.order[0]).toBe('data');
    expect(normalized.order[1]).toBe('font');
    expect(normalized.order).toHaveLength(QUICK_SETTINGS_CATALOG.length);
    expect(normalized.hidden).toEqual(['font']);
    expect(normalized.favorites).toEqual(['data']);
  });
});
