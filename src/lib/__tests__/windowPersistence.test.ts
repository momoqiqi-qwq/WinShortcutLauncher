import { describe, expect, it } from 'vitest';
import {
  getWindowPersistenceSettings,
  resolveWindowRestoreSource,
} from '../windowPersistence';

describe('window persistence priority', () => {
  it('uses the manual snapshot before the shutdown snapshot', () => {
    expect(resolveWindowRestoreSource({
      manualWindowStateEnabled: true,
      restoreWindowStateOnLaunch: true,
      saveWindowStateOnExit: true,
    }, true, true)).toBe('manual');
  });

  it('falls back to the shutdown snapshot when manual saving is disabled or missing', () => {
    expect(resolveWindowRestoreSource({
      manualWindowStateEnabled: false,
      restoreWindowStateOnLaunch: true,
      saveWindowStateOnExit: true,
    }, true, true)).toBe('automatic');
    expect(resolveWindowRestoreSource({
      manualWindowStateEnabled: true,
      restoreWindowStateOnLaunch: true,
      saveWindowStateOnExit: true,
    }, false, true)).toBe('automatic');
  });

  it('opens at the default size when startup restore is disabled', () => {
    expect(resolveWindowRestoreSource({
      manualWindowStateEnabled: true,
      restoreWindowStateOnLaunch: false,
      saveWindowStateOnExit: true,
    }, true, true)).toBe('default');
  });

  it('normalizes behavior settings for Rust synchronization', () => {
    expect(getWindowPersistenceSettings({
      manualWindowStateEnabled: true,
      restoreWindowStateOnLaunch: false,
      saveWindowStateOnExit: true,
    })).toEqual({
      manualWindowStateEnabled: true,
      restoreWindowStateOnLaunch: false,
      saveWindowStateOnExit: true,
    });
  });
});
