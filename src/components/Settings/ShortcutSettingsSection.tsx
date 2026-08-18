import { Keyboard, RotateCcw, Trash2, XCircle } from 'lucide-react';
import { useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useAppStore } from '../../stores/appStore';
import type { ShortcutActionId } from '../../types';
import {
  SHORTCUT_ACTIONS,
  defaultShortcutSettings,
  findShortcutConflicts,
  formatShortcut,
  isShortcutSafe,
  keyboardEventToShortcut,
} from '../../lib/keyboardShortcuts';
import { showLauncherNotice } from '../../lib/notify';

export function ShortcutSettingsSection() {
  const shortcuts = useAppStore((state) => state.shortcuts);
  const updateShortcuts = useAppStore((state) => state.updateShortcuts);
  const [recording, setRecording] = useState<ShortcutActionId | null>(null);
  const [error, setError] = useState('');
  const conflicts = useMemo(() => findShortcutConflicts(shortcuts), [shortcuts]);
  const actionById = useMemo(() => new Map(SHORTCUT_ACTIONS.map((action) => [action.id, action])), []);
  const groups = useMemo(() => Array.from(new Set(SHORTCUT_ACTIONS.map((action) => action.group))), []);

  function recordShortcut(actionId: ShortcutActionId, event: ReactKeyboardEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape') {
      setRecording(null);
      setError('');
      return;
    }
    const binding = keyboardEventToShortcut(event.nativeEvent);
    if (!binding) return;
    if (!isShortcutSafe(binding)) {
      setError('单独的字母、数字或符号容易影响正常输入，请至少搭配 Ctrl / Alt / Shift / Win。');
      return;
    }
    const duplicate = SHORTCUT_ACTIONS.find((action) => action.id !== actionId && shortcuts[action.id] === binding);
    if (duplicate) {
      setError(`“${binding}”已用于“${duplicate.label}”，请换一个组合。`);
      return;
    }
    updateShortcuts({ [actionId]: binding });
    setRecording(null);
    setError('');
    showLauncherNotice(`已设置：${actionById.get(actionId)?.label} = ${formatShortcut(binding)}`);
  }

  function resetAll() {
    updateShortcuts(defaultShortcutSettings);
    setRecording(null);
    setError('');
    showLauncherNotice('已恢复默认快捷键');
  }

  return (
    <div className="settings-category-grid shortcut-settings-grid">
      <section className="settings-section narrow-section shortcut-settings-section">
        <div className="settings-section-title-row">
          <h3><Keyboard size={17} /> 自定义快捷键</h3>
          <button type="button" className="btn-secondary btn-compact" onClick={resetAll}>
            <RotateCcw size={13} /> 全部恢复默认
          </button>
        </div>
        <p className="settings-hint">点击某一项的快捷键按钮，然后按下新的组合。按 Esc 取消录制；清空后该功能不再响应快捷键。</p>
        {error && <div className="shortcut-error"><XCircle size={15} /> {error}</div>}
        {groups.map((group) => (
          <div className="shortcut-group" key={group}>
            <div className="settings-subtitle">{group}</div>
            {SHORTCUT_ACTIONS.filter((action) => action.group === group).map((action) => {
              const binding = shortcuts[action.id];
              const conflictNames = (conflicts[action.id] ?? []).map((id) => actionById.get(id)?.label).filter(Boolean);
              return (
                <div className={`shortcut-setting-row ${conflictNames.length ? 'has-conflict' : ''}`} key={action.id}>
                  <span className="shortcut-setting-copy">
                    <strong>{action.label}</strong>
                    <small>{action.hint}</small>
                    {conflictNames.length > 0 && <em>与“{conflictNames.join('、')}”冲突</em>}
                  </span>
                  <span className="shortcut-setting-actions">
                    <button
                      type="button"
                      className={`shortcut-capture-button ${recording === action.id ? 'recording' : ''}`}
                      onClick={() => { setRecording(action.id); setError(''); }}
                      onKeyDown={(event) => recording === action.id && recordShortcut(action.id, event)}
                      autoFocus={recording === action.id}
                      aria-label={`设置${action.label}快捷键`}
                    >
                      {recording === action.id ? '请按新快捷键…' : (binding ? formatShortcut(binding) : '未设置')}
                    </button>
                    <button
                      type="button"
                      className="icon-button shortcut-clear-button"
                      title="清空快捷键"
                      disabled={!binding}
                      onClick={() => { updateShortcuts({ [action.id]: '' }); setRecording(null); setError(''); }}
                    >
                      <Trash2 size={14} />
                    </button>
                    <button
                      type="button"
                      className="btn-secondary btn-compact"
                      disabled={binding === defaultShortcutSettings[action.id]}
                      onClick={() => { updateShortcuts({ [action.id]: defaultShortcutSettings[action.id] }); setRecording(null); setError(''); }}
                    >
                      默认
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </section>
    </div>
  );
}
