import { beforeEach, describe, expect, it } from 'vitest';
import { SETTINGS_SEARCH_ITEMS } from '../settingsSearchIndex';
import { useAppStore } from '../../stores/appStore';
import { normalizeBehavior } from '../../stores/appStore/normalizers';

describe('v114 settings effect fixes', () => {
  beforeEach(() => {
    useAppStore.getState().resetAll();
  });

  it('preserves explicit settings-panel layout switches', () => {
    expect(normalizeBehavior({ settingsPanelAdaptiveSize: false }).settingsPanelAdaptiveSize).toBe(false);
    expect(normalizeBehavior({ rememberSettingsPanelBounds: false }).rememberSettingsPanelBounds).toBe(false);
  });

  it('keeps the legacy windowState edgeAutoHide shadow synchronized with behavior', () => {
    useAppStore.getState().updateWindowState({ edgeAutoHide: false });
    expect(useAppStore.getState().behavior.edgeAutoHide).toBe(false);
    expect(useAppStore.getState().windowState.edgeAutoHide).toBe(false);

    useAppStore.getState().updateBehavior({ edgeAutoHide: true });
    expect(useAppStore.getState().behavior.edgeAutoHide).toBe(true);
    expect(useAppStore.getState().windowState.edgeAutoHide).toBe(true);
  });

  it('routes settings search to real window-layout and always-on-top controls', () => {
    expect(SETTINGS_SEARCH_ITEMS.find((item) => item.id === 'always-on-top')).toMatchObject({ tab: 'window' });
    expect(SETTINGS_SEARCH_ITEMS.some((item) => item.id === 'settings-panel-adaptive')).toBe(true);
    expect(SETTINGS_SEARCH_ITEMS.some((item) => item.id === 'settings-panel-remember-bounds')).toBe(true);
  });
});
