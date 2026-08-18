import { memo, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  AlertTriangle,
  Command as CommandIcon,
  FileText,
  Folder,
  Palette,
  Search,
  Settings,
  StickyNote,
  Type,
  X,
} from 'lucide-react';
import type { GlobalSearchSettings } from '../../utils/v16Types';
import { normalizeGlobalSearchSettings } from '../../lib/globalSearchSettings';
import { chooseIconResolveCommand, getCachedIcon, isDirectImageSource, resolveIconDataUrl, setIconParallelTasks, type IconResolveCommand } from '../../lib/iconCache';
import type { CommandUsage, ShortcutItem } from '../../types';
import type { PaletteEntry, PaletteEntryKind } from '../../lib/commandPalette';
import { searchPaletteEntries } from '../../lib/commandPalette';
import { useAppStore } from '../../stores/appStore';
import { shortcutMatchesEvent } from '../../lib/keyboardShortcuts';
import './GlobalSearchModal.css';

export interface GlobalSearchModalProps {
  open: boolean;
  entries: PaletteEntry[];
  usage: Record<string, CommandUsage>;
  settings?: Partial<GlobalSearchSettings>;
  onClose: () => void;
  onExecute: (entry: PaletteEntry, alternate?: boolean) => void | Promise<void>;
}

function getSearchIconTarget(item: ShortcutItem, mode: GlobalSearchSettings['iconResolveMode']): { direct?: string; command?: IconResolveCommand; path?: string } {
  const rawIcon = typeof item.icon === 'string' ? item.icon.trim() : '';
  if (rawIcon) {
    if (isDirectImageSource(rawIcon)) return { direct: rawIcon };
    return { command: chooseIconResolveCommand(rawIcon, false, mode), path: rawIcon };
  }
  const itemPath = typeof item.path === 'string' ? item.path.trim() : '';
  if (item.type !== 'url' && itemPath) return { command: chooseIconResolveCommand(itemPath, true, mode), path: itemPath };
  return {};
}

const ResultItemIcon = memo(function ResultItemIcon({ item, size, mode }: { item: ShortcutItem; size: number; mode: GlobalSearchSettings['iconResolveMode'] }) {
  const holderRef = useRef<HTMLDivElement>(null);
  const target = useMemo(() => getSearchIconTarget(item, mode), [item.id, item.icon, item.path, item.type, mode]);
  const [visible, setVisible] = useState(false);
  const [icon, setIcon] = useState(() => target.direct || (target.command && target.path ? getCachedIcon(target.command, target.path) : undefined));

  useEffect(() => {
    const element = holderRef.current;
    if (!element || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const root = element.closest('.global-search-results');
    try {
      const observer = new IntersectionObserver((records) => {
        if (records.some((record) => record.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      }, { root, rootMargin: '160px 0px' });
      observer.observe(element);
      return () => observer.disconnect();
    } catch {
      setVisible(true);
    }
  }, [item.id]);

  useEffect(() => {
    let cancelled = false;
    if (target.direct) {
      setIcon(target.direct);
      return;
    }
    if (!target.command || !target.path || !visible) return;
    const cached = getCachedIcon(target.command, target.path);
    if (cached) {
      setIcon(cached);
      return;
    }
    resolveIconDataUrl(target.command, target.path)
      .then((next) => {
        if (!cancelled && next) setIcon(next);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [target.direct, target.command, target.path, visible]);

  return (
    <div ref={holderRef} className="global-search-icon-holder" style={{ width: size, height: size }}>
      {icon
        ? <img className="global-search-icon-img" src={icon} width={size} height={size} alt="" loading="lazy" decoding="async" />
        : <FileText size={Math.max(16, size - 8)} />}
    </div>
  );
});

const KIND_LABELS: Record<PaletteEntryKind, string> = {
  item: '项目', group: '父目录', directory: '子目录', note: '便签', setting: '设置', command: '命令', theme: '主题', font: '字体',
};

function KindIcon({ entry, size, mode }: { entry: PaletteEntry; size: number; mode: GlobalSearchSettings['iconResolveMode'] }) {
  if (entry.kind === 'item' && entry.item) return <ResultItemIcon item={entry.item} size={size} mode={mode} />;
  const iconSize = Math.max(16, size - 7);
  const icon = entry.kind === 'group' || entry.kind === 'directory' ? <Folder size={iconSize} />
    : entry.kind === 'note' ? <StickyNote size={iconSize} />
      : entry.kind === 'setting' ? <Settings size={iconSize} />
        : entry.kind === 'theme' ? <Palette size={iconSize} />
          : entry.kind === 'font' ? <Type size={iconSize} />
            : <CommandIcon size={iconSize} />;
  return <div className={`global-search-kind-icon kind-${entry.kind}`} style={{ width: size, height: size }}>{icon}</div>;
}

function highlightText(text: string, query: string, enabled: boolean) {
  if (!enabled || !query.trim()) return text;
  const normalized = query.trim().toLowerCase();
  const index = text.toLowerCase().indexOf(normalized);
  if (index < 0) return text;
  return <>{text.slice(0, index)}<mark>{text.slice(index, index + normalized.length)}</mark>{text.slice(index + normalized.length)}</>;
}

export function GlobalSearchModal({ open, entries, usage, settings: settingsPatch, onClose, onExecute }: GlobalSearchModalProps) {
  const closeShortcut = useAppStore((state) => state.shortcuts.closeOverlay);
  const settings = useMemo(() => normalizeGlobalSearchSettings(settingsPatch), [settingsPatch]);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [active, setActive] = useState(0);
  const [executing, setExecuting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeRowRef = useRef<HTMLDivElement>(null);

  useEffect(() => setIconParallelTasks(settings.iconParallelTasks ?? 6), [settings.iconParallelTasks]);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), Math.max(0, settings.debounceMs));
    return () => window.clearTimeout(timer);
  }, [query, settings.debounceMs]);

  const rows = useMemo(
    () => searchPaletteEntries(entries, debouncedQuery, settings, usage),
    [entries, debouncedQuery, settings, usage],
  );

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setDebouncedQuery('');
    setActive(0);
    setExecuting(false);
    window.setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);
  useEffect(() => setActive(0), [debouncedQuery]);
  useEffect(() => setActive((value) => rows.length ? Math.min(value, rows.length - 1) : 0), [rows.length]);
  useEffect(() => {
    const row = activeRowRef.current;
    if (row && typeof row.scrollIntoView === 'function') row.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open || !settings.enabled) return null;

  async function requestExecute(entry: PaletteEntry, alternate = false) {
    if (executing) return;
    setExecuting(true);
    try {
      await onExecute(entry, alternate);
    } finally {
      setExecuting(false);
    }
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (shortcutMatchesEvent(closeShortcut, event.nativeEvent)) {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((value) => rows.length ? (value + 1) % rows.length : 0);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((value) => rows.length ? (value - 1 + rows.length) % rows.length : 0);
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActive(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setActive(Math.max(0, rows.length - 1));
    } else if (event.key === 'Enter' && rows[active]) {
      event.preventDefault();
      void requestExecute(rows[active], event.ctrlKey);
    }
  }

  return (
    <div className="global-search-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="global-search-modal" role="dialog" aria-label="全局命令面板" aria-modal="true">
        <div className="global-search-input-row">
          <Search size={21} className="global-search-lens" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={settings.placeholder || '搜索项目、父目录、子目录、拼音或命令'}
            aria-label="搜索项目、父目录、子目录、设置或命令，支持拼音"
            autoComplete="off"
            spellCheck={false}
          />
          {query && <button type="button" className="global-search-clear" onClick={() => setQuery('')} title="清空搜索"><X size={15} /></button>}
          <span className="global-search-count" title="匹配结果数">{rows.length}</span>
          <button type="button" className="global-search-close" onClick={onClose} title="关闭"><X size={16} /></button>
        </div>

        <div className="global-search-context-bar">
          <span>{query ? `搜索“${query}”` : '最近使用与常用入口'}</span>
          <span>支持模糊匹配{settings.enablePinyin ? ' · 完整拼音 · 拼音首字母' : ''}</span>
        </div>

        <div className="global-search-results" role="listbox" aria-label="搜索结果">
          {rows.map((row, index) => (
            <div
              key={row.id}
              ref={index === active ? activeRowRef : undefined}
              className={`global-search-row ${index === active ? 'active' : ''} ${row.dangerous ? 'dangerous' : ''}`}
              role="option"
              aria-selected={index === active}
              onMouseEnter={() => setActive(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setActive(index)}
              onDoubleClick={() => void requestExecute(row)}
            >
              {settings.showItemIcon && <KindIcon entry={row} size={settings.iconSize} mode={settings.iconResolveMode} />}
              <div className="global-search-main">
                <div className="global-search-title-row">
                  <div className="global-search-title">{highlightText(row.title, query, settings.highlightMatches)}</div>
                  {settings.showResultType && <span className={`global-search-kind kind-${row.kind}`}>{KIND_LABELS[row.kind]}</span>}
                  {row.dangerous && <span className="global-search-danger-badge"><AlertTriangle size={12} />确认</span>}
                </div>
                {settings.showGroupPath && <div className="global-search-group">{highlightText(row.subtitle, query, settings.highlightMatches)}</div>}
                {settings.showFullPath && row.detail && <div className="global-search-path">{highlightText(row.detail, query, settings.highlightMatches)}</div>}
              </div>
              <div className="global-search-actions">
                <button type="button" className="primary" disabled={executing} onClick={(event) => { event.stopPropagation(); void requestExecute(row); }}>
                  {row.kind === 'item' ? '打开' : '执行'}
                </button>
              </div>
            </div>
          ))}
          {!rows.length && (
            <div className="global-search-empty">
              <Search size={30} />
              <strong>没有找到匹配内容</strong>
              <span>试试中文、完整拼音或首字母，例如“gongzuo / gz”“wenjianjia / wjj”“liulanqi / llq”。</span>
              <button type="button" className="btn-secondary btn-compact" onClick={() => setQuery('')}>显示常用入口</button>
            </div>
          )}
        </div>

        <div className="global-search-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> 选择</span>
          <span><kbd>Enter</kbd> 执行</span>
          <span><kbd>Ctrl</kbd>+<kbd>Enter</kbd> 项目备用动作</span>
          <span><kbd>Esc</kbd> 关闭</span>
        </div>
      </div>
    </div>
  );
}
