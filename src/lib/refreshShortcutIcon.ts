import { invoke } from '@tauri-apps/api/core';
import type { DisplaySettings, ShortcutItem } from '../types';
import { buildOnlineFaviconUrl } from './faviconProviders';

function addCacheBust(url: string) {
  if (!url) return '';
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}yue_refresh=${Date.now()}`;
}

/**
 * Re-resolve an item's icon from its original source.
 * Page-level icon completion reuses an existing same-site cache whenever possible.
 * A single-item manual refresh can opt into forceRefresh to replace that cache.
 */
export async function refreshShortcutIcon(
  item: ShortcutItem,
  display: DisplaySettings,
  options: { forceRefresh?: boolean } = {}
) {
  const forceRefresh = options.forceRefresh === true;
  if (item.type === 'url') {
    if (display.autoSaveWebsiteIcon !== false) {
      const localIcon = await invoke<string>('fetch_website_favicon', {
        url: item.path,
        providerId: display.faviconProvider ?? 'auto',
        fallback: display.faviconProviderFallback !== false,
        forceRefresh
      }).catch(() => '');
      if (localIcon) return localIcon;
    }

    const onlineIcon = buildOnlineFaviconUrl(item.path, display.faviconProvider ?? 'auto');
    return forceRefresh ? addCacheBust(onlineIcon) : onlineIcon;
  }

  return invoke<string>('get_file_icon', { path: item.path }).catch(() => '');
}
