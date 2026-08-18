import type { BehaviorSettings } from '../types';

export interface WindowPersistenceSettingsPayload {
  manualWindowStateEnabled: boolean;
  restoreWindowStateOnLaunch: boolean;
  saveWindowStateOnExit: boolean;
}

export interface ManualWindowStateSummary {
  width: number;
  height: number;
  x: number;
  y: number;
  maximized: boolean;
  savedAt: number;
}

export interface WindowPersistenceStatus {
  settings: WindowPersistenceSettingsPayload;
  manualState: ManualWindowStateSummary | null;
  automaticStateAvailable: boolean;
  startupSource: 'manual' | 'automatic' | 'default' | string;
}

export type WindowRestoreSource = 'manual' | 'automatic' | 'default';

export function getWindowPersistenceSettings(
  behavior: Pick<
    BehaviorSettings,
    'manualWindowStateEnabled' | 'restoreWindowStateOnLaunch' | 'saveWindowStateOnExit'
  >,
): WindowPersistenceSettingsPayload {
  return {
    manualWindowStateEnabled: behavior.manualWindowStateEnabled === true,
    restoreWindowStateOnLaunch: behavior.restoreWindowStateOnLaunch !== false,
    saveWindowStateOnExit: behavior.saveWindowStateOnExit !== false,
  };
}

export function resolveWindowRestoreSource(
  settings: WindowPersistenceSettingsPayload,
  hasManualState: boolean,
  hasAutomaticState: boolean,
): WindowRestoreSource {
  if (!settings.restoreWindowStateOnLaunch) return 'default';
  if (settings.manualWindowStateEnabled && hasManualState) return 'manual';
  if (settings.saveWindowStateOnExit && hasAutomaticState) return 'automatic';
  return 'default';
}

export function formatManualWindowState(state: ManualWindowStateSummary | null | undefined): string {
  if (!state) return '尚未手动保存';
  const mode = state.maximized ? '，最大化' : '';
  return `${state.width} × ${state.height}${mode}`;
}
