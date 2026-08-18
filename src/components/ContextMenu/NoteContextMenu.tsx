import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { invoke } from '@tauri-apps/api/core';
import { ChevronRight, ClipboardList, Minus, Ruler, Sparkles } from 'lucide-react';

interface NoteContextMenuProps {
  x: number;
  y: number;
  separatorLength: number;
  dashSeparator: string;
  starSeparator: string;
  onSeparatorLengthChange?: (length: number) => void;
  onInsertSeparator: (separator: string) => void;
  onClose: () => void;
}

type SubmenuSide = 'left' | 'right';

const SEPARATOR_LENGTHS = [8, 14, 20, 28, 40, 56, 72];
const SEPARATOR_TYPES = [
  { label: '横线', char: '—', icon: Minus },
  { label: '细线', char: '─', icon: Minus },
  { label: '粗线', char: '━', icon: Minus },
  { label: '短横线', char: '-', icon: Minus },
  { label: '星号', char: '*', icon: Sparkles },
  { label: '等号', char: '=', icon: Minus },
  { label: '点线', char: '·', icon: Sparkles },
  { label: '波浪线', char: '~', icon: Sparkles },
  { label: '井号', char: '#', icon: Sparkles },
  { label: '菱形', char: '◆', icon: Sparkles },
];

function normalizeSeparator(value: string, fallback: string) {
  const trimmed = value.trim();
  return trimmed || fallback;
}

function clamp(value: number, min: number, max: number) {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}

function makeSeparator(char: string, length: number) {
  const glyph = Array.from((char || '—').trim())[0] ?? '—';
  return glyph.repeat(Math.max(4, Math.min(80, Math.round(Number(length) || 14))));
}

function getFirstChar(separator: string, fallback: string) {
  return Array.from((separator || fallback).trim())[0] ?? fallback;
}

function useNoteMenuPosition(x: number, y: number) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [style, setStyle] = useState<CSSProperties>({ left: x, top: y, opacity: 0 });

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const menuElement = element;

    function update() {
      const rect = menuElement.getBoundingClientRect();
      const menuWidth = Math.max(1, rect.width || menuElement.offsetWidth || 230);
      const menuHeight = Math.max(1, rect.height || menuElement.offsetHeight || 210);
      const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const margin = 10;
      const gap = 3;

      const openLeft = x + gap + menuWidth + margin > viewportWidth && x - gap - menuWidth >= margin;
      const openUp = y + gap + menuHeight + margin > viewportHeight && y - gap - menuHeight >= margin;
      let left = openLeft ? x - gap - menuWidth : x + gap;
      let top = openUp ? y - gap - menuHeight : y + gap;

      left = clamp(left, margin, viewportWidth - menuWidth - margin);
      top = clamp(top, margin, viewportHeight - menuHeight - margin);
      setStyle({ left, top, opacity: 1 });
    }

    update();
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
    };
  }, [x, y]);

  return { ref, style };
}

export function NoteContextMenu({
  x,
  y,
  separatorLength,
  dashSeparator,
  starSeparator,
  onSeparatorLengthChange,
  onInsertSeparator,
  onClose
}: NoteContextMenuProps) {
  const { ref, style } = useNoteMenuPosition(x, y);
  const [openSubmenu, setOpenSubmenu] = useState<'separator' | null>(null);
  const [submenuSide, setSubmenuSide] = useState<SubmenuSide>('right');
  const [submenuAnchorRect, setSubmenuAnchorRect] = useState<DOMRect | null>(null);
  const [submenuStyle, setSubmenuStyle] = useState<CSSProperties>({ opacity: 0 });
  const submenuRef = useRef<HTMLDivElement | null>(null);
  const submenuCloseTimerRef = useRef<number | null>(null);
  const [currentLength, setCurrentLength] = useState(() => Math.max(4, Math.min(80, Math.round(Number(separatorLength) || 14))));
  const dash = normalizeSeparator(dashSeparator, '——————');
  const star = normalizeSeparator(starSeparator, '********');
  const customSeparators = useMemo(() => {
    const items = [
      { label: '设置里的横线', char: getFirstChar(dash, '—'), icon: Minus },
      { label: '设置里的符号', char: getFirstChar(star, '*'), icon: Sparkles },
    ];
    const seen = new Set<string>();
    return items.filter((item) => {
      if (seen.has(item.char)) return false;
      seen.add(item.char);
      return true;
    });
  }, [dash, star]);

  useEffect(() => {
    setCurrentLength(Math.max(4, Math.min(80, Math.round(Number(separatorLength) || 14))));
  }, [separatorLength]);

  function clearSubmenuCloseTimer() {
    if (submenuCloseTimerRef.current !== null) {
      window.clearTimeout(submenuCloseTimerRef.current);
      submenuCloseTimerRef.current = null;
    }
  }

  function scheduleSubmenuClose() {
    clearSubmenuCloseTimer();
    submenuCloseTimerRef.current = window.setTimeout(() => setOpenSubmenu(null), 180);
  }

  useLayoutEffect(() => {
    if (openSubmenu !== 'separator' || !submenuAnchorRect) return;
    const element = submenuRef.current;
    if (!element) return;
    const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const margin = 8;
    const gap = 7;
    const rect = element.getBoundingClientRect();
    const width = Math.max(256, rect.width || element.offsetWidth || 256);
    const height = Math.max(1, rect.height || element.offsetHeight || 420);
    const maxHeight = Math.max(180, viewportHeight - margin * 2);
    const openLeft = submenuAnchorRect.right + gap + width > viewportWidth - margin && submenuAnchorRect.left - gap - width >= margin;
    const left = openLeft
      ? clamp(submenuAnchorRect.left - gap - width, margin, viewportWidth - width - margin)
      : clamp(submenuAnchorRect.right + gap, margin, viewportWidth - width - margin);
    const top = clamp(submenuAnchorRect.top - 8, margin, viewportHeight - Math.min(height, maxHeight) - margin);
    setSubmenuSide(openLeft ? 'left' : 'right');
    setSubmenuStyle({ position: 'fixed', left, top, maxHeight, opacity: 1 });
  }, [openSubmenu, submenuAnchorRect, currentLength, customSeparators]);

  useEffect(() => () => clearSubmenuCloseTimer(), []);

  async function openClipboardHistory() {
    onClose();
    await invoke('open_windows_clipboard_history').catch(() => {
      // Fallback only dispatches a browser event; native Win+V is handled by Tauri on Windows.
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', code: 'KeyV', metaKey: true, bubbles: true }));
    });
  }

  function openSeparatorSubmenu(event: MouseEvent<HTMLDivElement>) {
    clearSubmenuCloseTimer();
    setSubmenuAnchorRect(event.currentTarget.getBoundingClientRect());
    setSubmenuStyle({ opacity: 0 });
    setOpenSubmenu('separator');
  }

  function changeLength(length: number) {
    const next = Math.max(4, Math.min(80, Math.round(length)));
    setCurrentLength(next);
    onSeparatorLengthChange?.(next);
  }

  function insertWithChar(char: string) {
    onInsertSeparator(makeSeparator(char, currentLength));
    onClose();
  }

  const separatorSubmenu = openSubmenu === 'separator' && (
    <div
      ref={submenuRef}
      className={`menu-surface note-separator-submenu ${submenuSide === 'left' ? 'open-left' : 'open-right'}`}
      style={submenuStyle}
      onMouseEnter={clearSubmenuCloseTimer}
      onMouseLeave={scheduleSubmenuClose}
    >
      <div className="note-submenu-title"><Ruler size={13} />分界线长度</div>
      <div className="note-length-grid">
        {SEPARATOR_LENGTHS.map((length) => (
          <button
            key={length}
            type="button"
            className={currentLength === length ? 'active' : ''}
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => { event.stopPropagation(); changeLength(length); }}
          >
            {length}
          </button>
        ))}
      </div>
      <label className="note-length-custom" onClick={(event) => event.stopPropagation()}>
        <span>自定义</span>
        <input
          value={currentLength}
          min={4}
          max={80}
          type="number"
          onMouseDown={(event) => event.stopPropagation()}
          onChange={(event) => changeLength(Number(event.target.value))}
        />
      </label>
      <div className="menu-separator" />
      <div className="note-submenu-title"><Sparkles size={13} />分界线种类</div>
      {[...customSeparators, ...SEPARATOR_TYPES].map((item, index) => {
        const Icon = item.icon;
        const preview = makeSeparator(item.char, Math.min(currentLength, 28));
        return (
          <div key={`${item.label}-${item.char}-${index}`} className="menu-item note-separator-option" onClick={() => insertWithChar(item.char)}>
            <span>{item.label}</span>
            <span className="note-separator-preview" title={preview}>{preview}</span>
            <Icon size={14} />
          </div>
        );
      })}
    </div>
  );

  const menu = (
    <div
      ref={ref}
      className="menu-surface item-context-menu note-context-menu"
      style={style}
      onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
      onContextMenu={(event) => event.preventDefault()}
      onMouseLeave={scheduleSubmenuClose}
    >
      <div className="menu-item with-submenu note-separator-entry" onMouseEnter={openSeparatorSubmenu} onClick={(event) => { event.stopPropagation(); openSubmenu === 'separator' ? setOpenSubmenu(null) : openSeparatorSubmenu(event); }}>
        <span>插入分界线</span>
        <ChevronRight size={14} />
        {separatorSubmenu}
      </div>
      <div className="menu-preview-line" title={makeSeparator(getFirstChar(dash, '—'), currentLength)}>{makeSeparator(getFirstChar(dash, '—'), Math.min(currentLength, 34))}</div>
      <div className="menu-separator" />
      <div className="menu-item" onClick={openClipboardHistory} onMouseEnter={() => setOpenSubmenu(null)}>
        <span>剪贴板（Win+V）</span><ClipboardList size={14} />
      </div>
    </div>
  );

  return createPortal(menu, document.body);
}
