import { describe, expect, it } from 'vitest';
import { normalizeBrowserRouter, normalizeBrowserRouteOverride, resolveBrowserRoute } from '../browserRouter';
import type { Group, ShortcutItem } from '../../types';

const item: ShortcutItem = {
  id: 'url-1', name: 'OpenAI', path: 'https://openai.com', type: 'url', order: 0,
};

function groups(groupRoute?: any, itemRoute?: any): Group[] {
  return [{
    id: 'g1', name: 'AI', order: 0, browserRoute: groupRoute,
    directories: [{ id: 'd1', name: '常用', order: 0, items: [{ ...item, browserRoute: itemRoute }] }],
  }];
}

describe('browser router', () => {
  it('migrates v107 foreground mode when browserRouter is missing', () => {
    expect(normalizeBrowserRouter(undefined, 'foreground-browser').mode).toBe('foreground-browser');
    expect(normalizeBrowserRouter(undefined, 'default').mode).toBe('default');
  });

  it('normalizes route overrides', () => {
    expect(normalizeBrowserRouteOverride({ mode: 'specified', browserId: 'floorp', profileId: 'AI' })).toEqual({
      mode: 'specified', browserId: 'floorp', profileId: 'AI',
    });
    expect(normalizeBrowserRouteOverride({ mode: 'bad' })).toBeUndefined();
  });

  it('uses item > group > global priority', () => {
    const router = normalizeBrowserRouter({ mode: 'specified', specifiedBrowserId: 'chrome', specifiedProfileId: 'Default' });
    const groupOnly = groups({ mode: 'specified', browserId: 'floorp', profileId: 'AI' });
    expect(resolveBrowserRoute(groupOnly[0].directories[0].items[0], groupOnly, router)).toMatchObject({ source: 'group', browserId: 'floorp', profileId: 'AI' });

    const withItem = groups(
      { mode: 'specified', browserId: 'floorp', profileId: 'AI' },
      { mode: 'specified', browserId: 'edge', profileId: 'Profile 1' },
    );
    expect(resolveBrowserRoute(withItem[0].directories[0].items[0], withItem, router)).toMatchObject({ source: 'item', browserId: 'edge', profileId: 'Profile 1' });

    const inherited = groups({ mode: 'inherit' }, { mode: 'inherit' });
    expect(resolveBrowserRoute(inherited[0].directories[0].items[0], inherited, router)).toMatchObject({ source: 'global', browserId: 'chrome' });
  });
});
