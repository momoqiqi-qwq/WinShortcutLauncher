import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { ShortcutItem } from '../types';
import { useAppStore } from '../stores/appStore';
import { showLauncherNotice } from './notify';
import { resolveBrowserRoute } from './browserRouter';

type AppSnapshot = ReturnType<typeof useAppStore.getState>;

/** 启动之后的统一收尾：最小化 / 隐藏窗口。项目和 HTML 卡片共用这一套。 */
async function applyAfterLaunch(state: AppSnapshot) {
  const appWindow = getCurrentWindow();
  if (state.experience.afterLaunchAction === 'minimize') {
    await appWindow.minimize().catch((error) => console.warn('minimize after launch failed', error));
  } else if (state.experience.afterLaunchAction === 'hide') {
    await invoke('hide_main_window_to_tray').catch((error) => console.warn('hide after launch failed', error));
  }
}

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

  await applyAfterLaunch(state);
}

/**
 * v173: 打开 HTML 子目录里的一张页面卡片。
 *
 * 走的是同一个 `launch_item`（本地文件 → ShellExecute → 默认浏览器），
 * 也复用「启动后最小化 / 隐藏」这套体验设置；但它没有对应的 `ShortcutItem`，
 * 所以不记使用次数、也不弹「已打开」提示。
 */
export async function launchHtmlPage(path: string) {
  const state = useAppStore.getState();
  await invoke('launch_item', {
    path,
    asAdmin: false,
    urlOpenMode: 'default',
    specifiedBrowserId: '',
    specifiedProfileId: '',
    customBrowsers: state.browserRouter.customBrowsers,
  });
  await applyAfterLaunch(state);
}
