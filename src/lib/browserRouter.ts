import type {
  BrowserProfileOverride,
  BrowserRouteMode,
  BrowserRouteOverride,
  BrowserRouterSettings,
  CustomBrowserConfig,
  DetectedBrowser,
  DetectedBrowserProfile,
  Group,
  ShortcutItem,
} from '../types';

export const DEFAULT_BROWSER_PROFILE_COLORS = [
  '#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#f97316', '#64748b',
];

export const defaultBrowserRouter: BrowserRouterSettings = {
  mode: 'default',
  specifiedBrowserId: '',
  specifiedProfileId: '',
  customBrowsers: [],
  profileOverrides: {},
};

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function cleanText(value: unknown, max = 1024) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function normalizeMode(value: unknown, fallback: BrowserRouteMode = 'default'): BrowserRouteMode {
  return value === 'foreground-browser' || value === 'specified' || value === 'default' ? value : fallback;
}

export function normalizeBrowserRouteOverride(value: unknown): BrowserRouteOverride | undefined {
  const raw = asRecord(value);
  const mode = raw.mode;
  if (mode !== 'inherit' && mode !== 'default' && mode !== 'foreground-browser' && mode !== 'specified') return undefined;
  const browserId = cleanText(raw.browserId, 160);
  const profileId = cleanText(raw.profileId, 240);
  return {
    mode,
    ...(browserId ? { browserId } : {}),
    ...(profileId ? { profileId } : {}),
  };
}

function normalizeCustomBrowser(value: unknown, index: number): CustomBrowserConfig | null {
  const raw = asRecord(value);
  const executable = cleanText(raw.executable, 4096);
  if (!executable) return null;
  const engine = raw.engine === 'chromium' || raw.engine === 'gecko' ? raw.engine : 'generic';
  const id = cleanText(raw.id, 160) || `custom-${index + 1}`;
  const name = cleanText(raw.name, 160) || `自定义浏览器 ${index + 1}`;
  const profileRoot = cleanText(raw.profileRoot, 4096);
  return {
    id,
    name,
    executable,
    engine,
    ...(profileRoot ? { profileRoot } : {}),
  };
}

function normalizeProfileOverrides(value: unknown): Record<string, BrowserProfileOverride> {
  const raw = asRecord(value);
  const result: Record<string, BrowserProfileOverride> = {};
  for (const [key, entry] of Object.entries(raw)) {
    const row = asRecord(entry);
    const name = cleanText(row.name, 160);
    const color = cleanText(row.color, 32);
    if (!key || (!name && !/^#[0-9a-f]{6}$/i.test(color))) continue;
    result[key] = {
      ...(name ? { name } : {}),
      ...(/^#[0-9a-f]{6}$/i.test(color) ? { color } : {}),
    };
  }
  return result;
}

export function normalizeBrowserRouter(value: unknown, legacyUrlMode?: unknown): BrowserRouterSettings {
  const raw = asRecord(value);
  const legacyMode = legacyUrlMode === 'foreground-browser' ? 'foreground-browser' : 'default';
  const mode = normalizeMode(raw.mode, legacyMode);
  const customBrowsers = Array.isArray(raw.customBrowsers)
    ? raw.customBrowsers.map(normalizeCustomBrowser).filter(Boolean) as CustomBrowserConfig[]
    : [];
  const seen = new Set<string>();
  const deduped = customBrowsers.filter((browser) => {
    if (seen.has(browser.id)) return false;
    seen.add(browser.id);
    return true;
  });
  return {
    mode,
    specifiedBrowserId: cleanText(raw.specifiedBrowserId, 160),
    specifiedProfileId: cleanText(raw.specifiedProfileId, 240),
    customBrowsers: deduped,
    profileOverrides: normalizeProfileOverrides(raw.profileOverrides),
  };
}

export function browserProfileOverrideKey(browserId: string, profileId: string) {
  return `${browserId}::${profileId}`;
}

export function getBrowserProfileDisplayName(
  router: BrowserRouterSettings,
  browserId: string,
  profile: DetectedBrowserProfile,
) {
  return router.profileOverrides[browserProfileOverrideKey(browserId, profile.id)]?.name || profile.name;
}

export function getBrowserProfileColor(
  router: BrowserRouterSettings,
  browserId: string,
  profile: DetectedBrowserProfile,
  index = 0,
) {
  return router.profileOverrides[browserProfileOverrideKey(browserId, profile.id)]?.color
    || DEFAULT_BROWSER_PROFILE_COLORS[index % DEFAULT_BROWSER_PROFILE_COLORS.length];
}

export function findBrowserProfile(catalog: DetectedBrowser[], browserId?: string, profileId?: string) {
  if (!browserId) return { browser: undefined, profile: undefined };
  const browser = catalog.find((entry) => entry.id === browserId);
  const profile = browser?.profiles.find((entry) => entry.id === profileId);
  return { browser, profile };
}

export interface ResolvedBrowserRoute {
  mode: BrowserRouteMode;
  browserId?: string;
  profileId?: string;
  source: 'item' | 'group' | 'global';
}

function routeFromOverride(route: BrowserRouteOverride | undefined): Omit<ResolvedBrowserRoute, 'source'> | null {
  if (!route || route.mode === 'inherit') return null;
  return {
    mode: route.mode,
    ...(route.browserId ? { browserId: route.browserId } : {}),
    ...(route.profileId ? { profileId: route.profileId } : {}),
  };
}

export function resolveBrowserRoute(
  item: ShortcutItem,
  groups: Group[],
  router: BrowserRouterSettings,
): ResolvedBrowserRoute {
  const itemRoute = routeFromOverride(item.browserRoute);
  if (itemRoute) return { ...itemRoute, source: 'item' };

  const group = groups.find((entry) => entry.directories.some((directory) => directory.items.some((candidate) => candidate.id === item.id)));
  const groupRoute = routeFromOverride(group?.browserRoute);
  if (groupRoute) return { ...groupRoute, source: 'group' };

  return {
    mode: router.mode,
    ...(router.specifiedBrowserId ? { browserId: router.specifiedBrowserId } : {}),
    ...(router.specifiedProfileId ? { profileId: router.specifiedProfileId } : {}),
    source: 'global',
  };
}

export function formatRouteLabel(route: BrowserRouteOverride | ResolvedBrowserRoute | undefined, catalog: DetectedBrowser[], router: BrowserRouterSettings) {
  if (!route || route.mode === 'inherit') return '继承';
  if (route.mode === 'default') return '系统默认浏览器';
  if (route.mode === 'foreground-browser') return '前台浏览器';
  const { browser, profile } = findBrowserProfile(catalog, route.browserId, route.profileId);
  if (!browser) return '指定浏览器（未找到）';
  if (!profile) return browser.name;
  return `${browser.name} · ${getBrowserProfileDisplayName(router, browser.id, profile)}`;
}
