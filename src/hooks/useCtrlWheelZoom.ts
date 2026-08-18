import { useEffect } from 'react';
import { useAppStore } from '../stores/appStore';
import { UI_SCALE_STEP, normalizeUiScale } from '../lib/uiScale';

function nextScale(current: number, direction: -1 | 1) {
  return normalizeUiScale(current + direction * UI_SCALE_STEP, current);
}

function isSettingsTarget(target: EventTarget | null, event?: WheelEvent | KeyboardEvent) {
  const element = target as HTMLElement | null;
  if (element?.closest('.floating-settings-panel')) return true;

  if (event && 'clientX' in event && 'clientY' in event) {
    const panel = document.querySelector('.floating-settings-panel') as HTMLElement | null;
    if (!panel) return false;
    const rect = panel.getBoundingClientRect();
    return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
  }

  const active = document.activeElement as HTMLElement | null;
  return Boolean(active?.closest('.floating-settings-panel'));
}

export function useCtrlWheelZoom() {
  const rawMainUiScale = useAppStore((state) => state.display.mainUiScale ?? state.display.uiScale ?? 1);
  const rawSettingsUiScale = useAppStore((state) => state.display.settingsUiScale ?? state.display.uiScale ?? 1);
  const updateDisplay = useAppStore((state) => state.updateDisplay);
  const mainUiScale = normalizeUiScale(rawMainUiScale);
  const settingsUiScale = normalizeUiScale(rawSettingsUiScale);

  useEffect(() => {
    document.documentElement.style.setProperty('--main-ui-scale', String(mainUiScale));
    document.documentElement.style.setProperty('--settings-ui-scale', String(settingsUiScale));
    document.documentElement.style.setProperty('--ui-scale', String(mainUiScale));
    (window as unknown as { __launcherUiScale?: number; __launcherMainScale?: number; __launcherSettingsScale?: number }).__launcherUiScale = mainUiScale;
    (window as unknown as { __launcherUiScale?: number; __launcherMainScale?: number; __launcherSettingsScale?: number }).__launcherMainScale = mainUiScale;
    (window as unknown as { __launcherUiScale?: number; __launcherMainScale?: number; __launcherSettingsScale?: number }).__launcherSettingsScale = settingsUiScale;
  }, [mainUiScale, settingsUiScale]);

  useEffect(() => {
    function applyScale(targetSettings: boolean, next: number) {
      if (targetSettings) updateDisplay({ settingsUiScale: normalizeUiScale(next) });
      else updateDisplay({ mainUiScale: normalizeUiScale(next), uiScale: normalizeUiScale(next) });
    }

    function handleWheel(event: WheelEvent) {
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      event.stopPropagation();

      const state = useAppStore.getState();
      const direction: -1 | 1 = event.deltaY < 0 ? 1 : -1;
      const targetSettings = isSettingsTarget(event.target, event);
      const current = targetSettings
        ? normalizeUiScale(state.display.settingsUiScale ?? state.display.uiScale ?? 1)
        : normalizeUiScale(state.display.mainUiScale ?? state.display.uiScale ?? 1);
      const next = nextScale(current, direction);
      if (next !== current) applyScale(targetSettings, next);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey)) return;
      const targetSettings = isSettingsTarget(event.target, event);
      const state = useAppStore.getState();
      const current = targetSettings
        ? normalizeUiScale(state.display.settingsUiScale ?? state.display.uiScale ?? 1)
        : normalizeUiScale(state.display.mainUiScale ?? state.display.uiScale ?? 1);

      if (event.key === '0') {
        event.preventDefault();
        event.stopPropagation();
        applyScale(targetSettings, 1);
        return;
      }

      if (event.key === '-' || event.key === '_' || event.key === '+' || event.key === '=') {
        event.preventDefault();
        event.stopPropagation();
        const direction: -1 | 1 = event.key === '-' || event.key === '_' ? -1 : 1;
        const next = nextScale(current, direction);
        if (next !== current) applyScale(targetSettings, next);
      }
    }

    window.addEventListener('wheel', handleWheel, { capture: true, passive: false });
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener('wheel', handleWheel, { capture: true });
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [updateDisplay]);
}

