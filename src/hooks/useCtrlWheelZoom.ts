import { useEffect } from 'react';
import { useAppStore } from '../stores/appStore';

const MIN_SCALE = 0.65;
const MAX_SCALE = 1.8;
const STEP = 0.05;

function clamp(value: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
}

function roundScale(value: number) {
  return Math.round(value * 100) / 100;
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
  const mainUiScale = useAppStore((state) => state.display.mainUiScale ?? state.display.uiScale ?? 1);
  const settingsUiScale = useAppStore((state) => state.display.settingsUiScale ?? state.display.uiScale ?? 1);
  const updateDisplay = useAppStore((state) => state.updateDisplay);

  useEffect(() => {
    document.documentElement.style.setProperty('--main-ui-scale', String(mainUiScale));
    document.documentElement.style.setProperty('--settings-ui-scale', String(settingsUiScale));
    document.documentElement.style.setProperty('--ui-scale', String(mainUiScale));
    (window as unknown as { __launcherUiScale?: number; __launcherMainScale?: number; __launcherSettingsScale?: number }).__launcherUiScale = mainUiScale;
    (window as unknown as { __launcherUiScale?: number; __launcherMainScale?: number; __launcherSettingsScale?: number }).__launcherMainScale = mainUiScale;
    (window as unknown as { __launcherUiScale?: number; __launcherMainScale?: number; __launcherSettingsScale?: number }).__launcherSettingsScale = settingsUiScale;
  }, [mainUiScale, settingsUiScale]);

  useEffect(() => {
    function handleWheel(event: WheelEvent) {
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      event.stopPropagation();

      const state = useAppStore.getState();
      const direction = event.deltaY < 0 ? 1 : -1;
      if (isSettingsTarget(event.target, event)) {
        const current = state.display.settingsUiScale ?? state.display.uiScale ?? 1;
        const next = roundScale(clamp(current + direction * STEP));
        if (next !== current) updateDisplay({ settingsUiScale: next });
        return;
      }

      const current = state.display.mainUiScale ?? state.display.uiScale ?? 1;
      const next = roundScale(clamp(current + direction * STEP));
      if (next !== current) updateDisplay({ mainUiScale: next, uiScale: next });
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key !== '0') return;
      event.preventDefault();
      if (isSettingsTarget(event.target, event)) {
        updateDisplay({ settingsUiScale: 1 });
      } else {
        updateDisplay({ mainUiScale: 1, uiScale: 1 });
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
