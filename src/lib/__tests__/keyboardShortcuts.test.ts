import { describe, expect, it } from 'vitest';
import {
  defaultShortcutSettings,
  findShortcutConflicts,
  formatShortcut,
  isShortcutSafe,
  keyboardEventToShortcut,
  normalizeShortcut,
  normalizeShortcutSettings,
  shortcutMatchesEvent,
} from '../keyboardShortcuts';

describe('keyboard shortcuts', () => {
  it('normalizes modifier order and key names', () => {
    expect(normalizeShortcut('shift+ctrl+k')).toBe('Ctrl+Shift+K');
    expect(normalizeShortcut('control+comma')).toBe('Ctrl+,');
    expect(formatShortcut('Meta+K')).toBe('Win+K');
  });

  it('converts and matches keyboard events', () => {
    const event = { key: 'k', ctrlKey: true, altKey: false, shiftKey: false, metaKey: false } as KeyboardEvent;
    expect(keyboardEventToShortcut(event)).toBe('Ctrl+K');
    expect(shortcutMatchesEvent('Ctrl+K', event)).toBe(true);
    expect(shortcutMatchesEvent('Ctrl+Shift+K', event)).toBe(false);
  });

  it('keeps disabled shortcuts empty while filling missing defaults', () => {
    const settings = normalizeShortcutSettings({ openSettings: '', openGlobalSearch: 'Alt+G' });
    expect(settings.openSettings).toBe('');
    expect(settings.openGlobalSearch).toBe('Alt+G');
    expect(settings.focusPageSearch).toBe(defaultShortcutSettings.focusPageSearch);
  });

  it('detects duplicate bindings', () => {
    const settings = { ...defaultShortcutSettings, openSettings: 'Ctrl+K' };
    const conflicts = findShortcutConflicts(settings);
    expect(conflicts.openSettings).toContain('openGlobalSearch');
    expect(conflicts.openGlobalSearch).toContain('openSettings');
  });

  it('rejects bare printable keys but accepts function and action keys', () => {
    expect(isShortcutSafe('A')).toBe(false);
    expect(isShortcutSafe('Ctrl+A')).toBe(true);
    expect(isShortcutSafe('Delete')).toBe(true);
    expect(isShortcutSafe('F8')).toBe(true);
  });
});
