import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { DEFAULT_GLOBAL_SEARCH_SETTINGS, type GlobalSearchSettings } from '../../utils/v16Types';
import { chooseIconResolveCommand, getCachedIcon, isDirectImageSource, resolveIconDataUrl, setIconParallelTasks, type IconResolveCommand } from '../../lib/iconCache';
import './GlobalSearchModal.css';

type ShortcutLike = {
  id: string;
  name: string;
  path: string;
  icon?: string;
  type?: 'file' | 'folder' | 'url' | 'command' | string;
};

type SearchResult = {
  id: string;
  item: ShortcutLike;
  groupId: string;
  groupName: string;
  subId: string;
  subName: string;
  note?: boolean;
  score: number;
};

type GroupLike = {
  id: string;
  name: string;
  children?: any[];
  subGroups?: any[];
  tabs?: any[];
  directories?: any[];
  items?: ShortcutLike[];
};

export interface GlobalSearchModalProps {
  open: boolean;
  groups: GroupLike[];
  settings?: Partial<GlobalSearchSettings>;
  onClose: () => void;
  onLocate?: (groupId: string, subId: string, itemId?: string) => void;
  onOpenItem?: (item: ShortcutLike) => void | Promise<void>;
}

const normalize = (value: string) => value.toLowerCase().trim();

function flattenGroups(groups: GroupLike[], settings: GlobalSearchSettings): SearchResult[] {
  const rows: SearchResult[] = [];
  for (const group of groups || []) {
    const subGroups = group.children || group.subGroups || group.tabs || group.directories || [];
    for (const sub of subGroups) {
      const subType = sub.type || sub.kind || 'normal';
      if ((subType === 'note' || subType === 'notes') && !settings.includeNotes) continue;
      const items = Array.isArray(sub.items) ? sub.items : [];
      for (const item of items) {
        if (!settings.includeSystemTools && item.type === 'command' && /system32|\.msc|\.cpl/i.test(item.path || '')) continue;
        rows.push({
          id: `${group.id}:${sub.id}:${item.id}`,
          item,
          groupId: group.id,
          groupName: group.name,
          subId: sub.id,
          subName: sub.name,
          score: 0,
        });
      }
      if ((subType === 'note' || subType === 'notes') && settings.includeNotes && (sub.noteContent || sub.note)) {
        rows.push({
          id: `${group.id}:${sub.id}:note`,
          item: { id: `${sub.id}:note`, name: sub.name || '便签', path: sub.noteContent || sub.note, type: 'note' },
          groupId: group.id,
          groupName: group.name,
          subId: sub.id,
          subName: sub.name,
          note: true,
          score: 0,
        });
      }
    }
  }
  return rows;
}

function scoreRow(row: SearchResult, query: string, settings: GlobalSearchSettings) {
  if (!query) return 1;
  const q = normalize(query);
  const fields: Array<[string, number]> = [];
  if (settings.searchInName) fields.push([row.item.name || '', 8]);
  if (settings.searchInPath) fields.push([row.item.path || '', 3]);
  if (settings.searchInUrl) fields.push([row.item.type === 'url' ? row.item.path || '' : '', 4]);
  if (settings.searchInGroup) fields.push([row.groupName || '', 2]);
  if (settings.searchInSubGroup) fields.push([row.subName || '', 2]);

  let score = 0;
  for (const [raw, weight] of fields) {
    const value = normalize(raw);
    if (!value) continue;
    if (value === q) score += 100 * weight;
    else if (value.startsWith(q)) score += 40 * weight;
    else if (value.includes(q)) score += 12 * weight;
    else {
      // very small fuzzy support: all chars appear in order
      let j = 0;
      for (const ch of value) if (ch === q[j]) j++;
      if (j === q.length) score += 2 * weight;
    }
  }
  return score;
}

function highlight(text: string, query: string, enabled: boolean) {
  if (!enabled || !query.trim()) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return text;
  return <>{text.slice(0, idx)}<mark>{text.slice(idx, idx + query.length)}</mark>{text.slice(idx + query.length)}</>;
}

function getSearchIconTarget(item: ShortcutLike, mode: GlobalSearchSettings['iconResolveMode']): { direct?: string; command?: IconResolveCommand; path?: string } {
  const rawIcon = item.icon?.trim();
  if (rawIcon) {
    if (isDirectImageSource(rawIcon)) return { direct: rawIcon };
    const command = chooseIconResolveCommand(rawIcon, false, mode);
    return { command, path: rawIcon };
  }
  if (item.type !== 'url' && item.path?.trim()) return { command: chooseIconResolveCommand(item.path.trim(), true, mode), path: item.path.trim() };
  return {};
}

const ResultIcon = memo(function ResultIcon({ item, size, mode }: { item: ShortcutLike; size: number; mode: GlobalSearchSettings['iconResolveMode'] }) {
  const holderRef = useRef<HTMLDivElement>(null);
  const target = useMemo(() => getSearchIconTarget(item, mode), [item.id, item.icon, item.path, item.type, mode]);
  const [visible, setVisible] = useState(false);
  const [icon, setIcon] = useState(() => {
    if (target.direct) return target.direct;
    if (target.command && target.path) return getCachedIcon(target.command, target.path);
    return undefined;
  });

  useEffect(() => {
    const element = holderRef.current;
    if (!element || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const root = element.closest('.global-search-results');
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    }, { root, rootMargin: '160px 0px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, [item.id]);

  useEffect(() => {
    let cancelled = false;
    if (target.direct) {
      setIcon(target.direct);
      return;
    }
    if (!target.command || !target.path) {
      setIcon(undefined);
      return;
    }
    const cached = getCachedIcon(target.command, target.path);
    if (cached) {
      setIcon(cached);
      return;
    }
    if (!visible) return;
    setIcon(undefined);
    resolveIconDataUrl(target.command, target.path).then((next) => {
      if (!cancelled && next) setIcon(next);
    });
    return () => { cancelled = true; };
  }, [target.direct, target.command, target.path, visible]);

  return (
    <div ref={holderRef} className="global-search-icon-holder" style={{ width: size, height: size }}>
      {icon
        ? <img className="global-search-icon-img" src={icon} width={size} height={size} alt="" loading="lazy" decoding="async" />
        : <div className="global-search-icon-fallback" style={{ width: size, height: size }}>{item.type === 'folder' ? '📁' : item.type === 'url' ? '↗' : '◇'}</div>}
    </div>
  );
});

export function GlobalSearchModal({ open, groups, settings: settingsPatch, onClose, onLocate, onOpenItem }: GlobalSearchModalProps) {
  const settings = { ...DEFAULT_GLOBAL_SEARCH_SETTINGS, ...settingsPatch };

  useEffect(() => {
    setIconParallelTasks(settings.iconParallelTasks ?? 6);
  }, [settings.iconParallelTasks]);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const wheelLockRef = useRef(false);
  const wheelUnlockTimerRef = useRef<number | null>(null);

  const allRows = useMemo(() => flattenGroups(groups, settings), [groups, settings.includeNotes, settings.includeSystemTools]);
  const rows = useMemo(() => {
    const scored = allRows
      .map((row) => ({ ...row, score: scoreRow(row, query, settings) }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name, 'zh-Hans-CN'));
    return scored.slice(0, settings.maxResults);
  }, [allRows, query, settings.maxResults, settings.searchInName, settings.searchInPath, settings.searchInUrl, settings.searchInGroup, settings.searchInSubGroup, settings.highlightMatches]);

  useEffect(() => {
    if (!open) return;
    window.setTimeout(() => inputRef.current?.focus(), 30);
    setActive(0);
  }, [open]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => () => {
    if (wheelUnlockTimerRef.current !== null) window.clearTimeout(wheelUnlockTimerRef.current);
  }, []);

  if (!open || !settings.enabled) return null;

  async function openItem(row: SearchResult) {
    if (onOpenItem) await onOpenItem(row.item);
    else await invoke('launch_item', { path: row.item.path, asAdmin: false });
    onClose();
  }

  function locate(row: SearchResult) {
    onLocate?.(row.groupId, row.subId, row.item.id);
    onClose();
  }

  return (
    <div className="global-search-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="global-search-modal" role="dialog" aria-label="全局搜索">
        <div className="global-search-input-row">
          <span className="global-search-lens">⌕</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((v) => Math.min(v + 1, rows.length - 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setActive((v) => Math.max(v - 1, 0)); }
              if (e.key === 'Enter' && rows[active]) {
                e.preventDefault();
                const action = e.ctrlKey ? settings.ctrlEnterAction : settings.enterAction;
                action === 'locate' ? locate(rows[active]) : openItem(rows[active]);
              }
            }}
            placeholder={settings.placeholder}
          />
          <span className="global-search-count">{rows.length}</span>
          <button className="global-search-close" onClick={onClose}>×</button>
        </div>
        <div
          className="global-search-results"
          onWheel={() => {
            wheelLockRef.current = true;
            if (wheelUnlockTimerRef.current !== null) window.clearTimeout(wheelUnlockTimerRef.current);
            wheelUnlockTimerRef.current = window.setTimeout(() => { wheelLockRef.current = false; }, 140);
          }}
        >
          {rows.map((row, idx) => (
            <div
              key={row.id}
              className={`global-search-row ${idx === active ? 'active' : ''}`}
              onMouseEnter={() => { if (!wheelLockRef.current && idx !== active) setActive(idx); }}
              onDoubleClick={() => openItem(row)}
            >
              {settings.showItemIcon && <ResultIcon item={row.item} size={settings.iconSize} mode={settings.iconResolveMode} />}
              <div className="global-search-main">
                <div className="global-search-title">{highlight(row.item.name, query, settings.highlightMatches)}</div>
                {settings.showGroupPath && <div className="global-search-group">{row.groupName} / {row.subName}</div>}
                {settings.showFullPath && <div className="global-search-path">{highlight(row.item.path || '', query, settings.highlightMatches)}</div>}
              </div>
              <div className="global-search-actions">
                <button onClick={() => locate(row)}>定位</button>
                <button className="primary" onClick={() => openItem(row)}>打开</button>
              </div>
            </div>
          ))}
          {rows.length === 0 && <div className="global-search-empty">没有找到匹配项目</div>}
        </div>
      </div>
    </div>
  );
}
