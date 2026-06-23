import { invoke } from '@tauri-apps/api/core';
import { ClipboardList, Minus, Sparkles } from 'lucide-react';
import { useSmartMenuPosition } from './useSmartMenuPosition';

interface NoteContextMenuProps {
  x: number;
  y: number;
  dashSeparator: string;
  starSeparator: string;
  onInsertSeparator: (separator: string) => void;
  onClose: () => void;
}

function normalizeSeparator(value: string, fallback: string) {
  const trimmed = value.trim();
  return trimmed || fallback;
}

export function NoteContextMenu({ x, y, dashSeparator, starSeparator, onInsertSeparator, onClose }: NoteContextMenuProps) {
  const { ref, style } = useSmartMenuPosition(x, y, 8, 260);
  const dash = normalizeSeparator(dashSeparator, '——————');
  const star = normalizeSeparator(starSeparator, '********');

  async function openClipboardHistory() {
    onClose();
    await invoke('open_windows_clipboard_history').catch(() => {
      // Fallback only dispatches a browser event; native Win+V is handled by Tauri on Windows.
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', code: 'KeyV', metaKey: true, bubbles: true }));
    });
  }

  return (
    <div
      ref={ref}
      className="menu-surface item-context-menu note-context-menu"
      style={style}
      onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="menu-item" onClick={() => { onInsertSeparator(dash); onClose(); }}>
        <span>插入横线分割线</span><Minus size={14} />
      </div>
      <div className="menu-preview-line" title={dash}>{dash}</div>
      <div className="menu-item" onClick={() => { onInsertSeparator(star); onClose(); }}>
        <span>插入符号分割线</span><Sparkles size={14} />
      </div>
      <div className="menu-preview-line" title={star}>{star}</div>
      <div className="menu-separator" />
      <div className="menu-item" onClick={openClipboardHistory}>
        <span>剪贴板（Win+V）</span><ClipboardList size={14} />
      </div>
    </div>
  );
}
