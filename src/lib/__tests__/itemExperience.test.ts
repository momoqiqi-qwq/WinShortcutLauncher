import { describe, expect, it } from 'vitest';
import type { ShortcutItem } from '../../types';
import {
  buildItemTooltip,
  matchesItemQuery,
  nextKeyboardItemIndex,
  shouldLaunchItemFromInteraction,
  normalizeAfterLaunchAction,
} from '../itemExperience';

const item: ShortcutItem = {
  id: 'item-1',
  name: 'GitHub 项目',
  path: 'https://github.com/example/project',
  type: 'url',
  order: 0,
  launchCount: 3,
  lastLaunchedAt: 1_700_000_000_000,
};

describe('item experience helpers', () => {
  it('supports name-only and path-inclusive search', () => {
    expect(matchesItemQuery(item, 'github', false)).toBe(true);
    expect(matchesItemQuery(item, 'example/project', false)).toBe(false);
    expect(matchesItemQuery(item, 'example/project', true)).toBe(true);
  });

  it('supports full pinyin, partial pinyin and initials for project names', () => {
    const chineseItem = { ...item, name: '浏览器' };
    expect(matchesItemQuery(chineseItem, 'liulanqi', false)).toBe(true);
    expect(matchesItemQuery(chineseItem, 'liu', false)).toBe(true);
    expect(matchesItemQuery(chineseItem, 'llq', false)).toBe(true);
  });

  it('builds configurable item tooltips', () => {
    expect(buildItemTooltip(item, 'off')).toBeUndefined();
    expect(buildItemTooltip(item, 'name')).toBe('GitHub 项目');
    expect(buildItemTooltip(item, 'details')).toContain('启动次数：3');
    expect(buildItemTooltip(item, 'details')).toContain(item.path);
  });

  it('moves keyboard selection with wrap-around', () => {
    expect(nextKeyboardItemIndex(-1, 3, 'ArrowRight')).toBe(0);
    expect(nextKeyboardItemIndex(2, 3, 'ArrowRight')).toBe(0);
    expect(nextKeyboardItemIndex(0, 3, 'ArrowLeft')).toBe(2);
    expect(nextKeyboardItemIndex(1, 3, 'Home')).toBe(0);
    expect(nextKeyboardItemIndex(1, 3, 'End')).toBe(2);
  });

  it('normalizes after-launch actions safely', () => {
    expect(normalizeAfterLaunchAction('minimize')).toBe('minimize');
    expect(normalizeAfterLaunchAction('hide')).toBe('hide');
    expect(normalizeAfterLaunchAction('unknown')).toBe('keep');
  });
});


describe('item click activation', () => {
  it('launches only on pointer-up in single-click mode', () => {
    expect(shouldLaunchItemFromInteraction('single', 'pointer-up')).toBe(true);
    expect(shouldLaunchItemFromInteraction('single', 'double-click')).toBe(false);
  });

  it('launches only on double-click in double-click mode', () => {
    expect(shouldLaunchItemFromInteraction('double', 'pointer-up')).toBe(false);
    expect(shouldLaunchItemFromInteraction('double', 'double-click')).toBe(true);
  });

  it('blocks modified clicks and drag releases', () => {
    expect(shouldLaunchItemFromInteraction('single', 'pointer-up', { modified: true })).toBe(false);
    expect(shouldLaunchItemFromInteraction('single', 'pointer-up', { dragged: true })).toBe(false);
    expect(shouldLaunchItemFromInteraction('double', 'double-click', { button: 2 })).toBe(false);
  });
});
