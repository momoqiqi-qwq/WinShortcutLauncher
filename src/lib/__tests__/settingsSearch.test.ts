import { describe, expect, it } from 'vitest';
import { filterSettingsEntries, normalizeSettingsQuery } from '../settingsSearch';
import { searchSettingsItems } from '../settingsSearchIndex';

const entries = [
  { id: 'icons', label: '图标', keywords: ['favicon', '缓存', '测速'] },
  { id: 'window', label: '窗口行为', keywords: ['大小', '位置', '回弹'] },
  { id: 'notes', label: '便签', keywords: ['行号', '分界线'] },
  { id: 'browser', label: '浏览器', keywords: ['浏览器路由中心', '网址'] },
];

describe('settings keyword search', () => {
  it('matches labels, ids and hidden keywords', () => {
    expect(filterSettingsEntries(entries, '便签').map((item) => item.id)).toEqual(['notes']);
    expect(filterSettingsEntries(entries, 'favicon').map((item) => item.id)).toEqual(['icons']);
    expect(filterSettingsEntries(entries, 'window').map((item) => item.id)).toEqual(['window']);
  });

  it('supports full pinyin, partial pinyin and pinyin initials', () => {
    expect(filterSettingsEntries(entries, 'liulanqi').map((item) => item.id)).toContain('browser');
    expect(filterSettingsEntries(entries, 'liu').map((item) => item.id)).toContain('browser');
    expect(filterSettingsEntries(entries, 'llq').map((item) => item.id)).toContain('browser');
  });

  it('uses phrase pinyin aliases for detailed settings results', () => {
    expect(searchSettingsItems('llq').map((item) => item.id)).toContain('url-browser-mode');
    expect(searchSettingsItems('liu').map((item) => item.id)).toContain('url-browser-mode');
    expect(searchSettingsItems('hh').map((item) => item.id)).toContain('note-lines');
  });

  it('keeps a precise section and control target for collapsed search results', () => {
    const autostart = searchSettingsItems('zqd').find((item) => item.id === 'autostart');
    expect(autostart).toMatchObject({ section: 'launchClose', targetId: 'autostart', focusText: '开机自启动' });
    const debounce = searchSettingsItems('防抖').find((item) => item.id === 'search-debounce');
    expect(debounce).toMatchObject({ section: 'search', targetId: 'search-debounce' });
  });

  it('trims and normalizes the query', () => {
    expect(normalizeSettingsQuery('  FAVICON  ')).toBe('favicon');
  });
});
