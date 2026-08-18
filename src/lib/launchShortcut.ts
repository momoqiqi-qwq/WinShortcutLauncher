import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { ShortcutItem } from '../types';
import { useAppStore } from '../stores/appStore';
import { showLauncherNotice } from './notify';
import { resolveBrowserRoute } from './browserRouter';

export async function launchShortcutItem(item: ShortcutItem, asAdmin = false) {
  const state = useAppStore.getState();
  const browserRoute = item.type === 'url'
    ? resolveBrowserRoute(item, state.groups, state.browserRouter)
    : { mode: 'default' as const, source: 'global' as const };
  await invoke('launch_item', {
    path: item.path,
    asAdmin,
    urlOpenMode: browserRoute.mode,
    specifiedBrowserId: browserRoute.mode === 'specified' ? browserRoute.browserId ?? '' : '',
    specifiedProfileId: browserRoute.mode === 'specified' ? browserRoute.profileId ?? '' : '',
    customBrowsers: state.browserRouter.customBrowsers,
  });
  state.recordItemLaunch(item.id);
  if (state.experience.clearSelectionAfterLaunch) state.clearSelection();
  if (state.experience.showLaunchNotice && state.experience.afterLaunchAction === 'keep') {
    showLauncherNotice(`已打开：${item.name}`);
  }

  const appWindow = getCurrentWindow();
  if (state.experience.afterLaunchAction === 'minimize') {
    await appWindow.minimize().catch((error) => console.warn('minimize after launch failed', error));
  } else if (state.experience.afterLaunchAction === 'hide') {
    await invoke('hide_main_window_to_tray').catch((error) => console.warn('hide after launch failed', error));
  }
}
