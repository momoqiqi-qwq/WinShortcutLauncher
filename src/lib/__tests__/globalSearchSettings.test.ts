import { describe, expect, it } from 'vitest';
import { normalizeGlobalSearchSettings } from '../globalSearchSettings';

describe('global search settings normalization', () => {
  it('preserves a custom search placeholder', () => {
    const settings = normalizeGlobalSearchSettings({ placeholder: '我的自定义搜索提示' });
    expect(settings.placeholder).toBe('我的自定义搜索提示');
  });

  it('repairs invalid legacy values', () => {
    const settings = normalizeGlobalSearchSettings({
      maxResults: 'bad' as never,
      iconSize: 999,
      iconParallelTasks: -4,
      placeholder: { bad: true } as never,
      enterAction: 'bad' as never,
    });
    expect(settings.maxResults).toBe(80);
    expect(settings.iconSize).toBe(48);
    expect(settings.iconParallelTasks).toBe(1);
    expect(typeof settings.placeholder).toBe('string');
    expect(settings.enterAction).toBe('open');
  });
});
