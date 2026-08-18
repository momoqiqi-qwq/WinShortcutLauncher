import type { AppConfig, Directory, DirectoryKind, Group, ShortcutItem, ShortcutType } from '../types';
import { makeId } from './id';
import { parseStaticJdbObject } from './safeJdbParser';

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
}

function numberOr(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeIdPart(value: unknown, fallback: string): string {
  const raw = firstString(value, fallback);
  const clean = raw.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
  return clean || fallback;
}

function normalizeUrlOrPath(path: string, args?: string): string {
  const clean = path.trim();
  const extra = (args ?? '').trim();
  if (!clean || !extra || /^https?:\/\//i.test(clean)) return clean;
  if (clean.startsWith('"') || !/\s/.test(clean)) return `${clean} ${extra}`;
  return `"${clean}" ${extra}`;
}

function guessShortcutType(raw: Record<string, any>, path: string): ShortcutType {
  const typeText = firstString(raw.type, raw.kind, raw.t, raw.linkType, raw.itemType).toLowerCase();
  const iconText = firstString(raw.icon, raw.ico).toLowerCase();
  const pathText = path.trim().toLowerCase();
  if (typeText === 'url' || typeText === 'website' || typeText === 'web' || /^https?:\/\//i.test(path)) return 'url';
  if (typeText === 'folder' || typeText === 'dir' || typeText === 'directory' || iconText === '#dir') return 'folder';
  if (typeText === 'file') return 'file';
  if (pathText.endsWith('.lnk') || pathText.endsWith('.txt') || pathText.endsWith('.doc') || pathText.endsWith('.docx') || pathText.endsWith('.pdf') || pathText.endsWith('.png') || pathText.endsWith('.jpg')) return 'file';
  return 'command';
}

function toShortcutItem(rawValue: unknown, index: number, prefix: string): ShortcutItem | null {
  const raw = asRecord(rawValue);
  const path = normalizeUrlOrPath(
    firstString(raw.path, raw.url, raw.u, raw.link, raw.href, raw.target, raw.command, raw.cmd, raw.file, raw.location),
    firstString(raw.parameter, raw.params, raw.args, raw.p)
  );
  const name = firstString(raw.name, raw.title, raw.label, raw.n, raw.text, path, `项目 ${index + 1}`);
  if (!name && !path) return null;
  return {
    id: firstString(raw.id, raw.ID) || `${prefix}_item_${index}_${makeId('legacy')}`,
    name,
    path: path || name,
    icon: firstString(raw.icon, raw.ico, raw.image, raw.logo, raw.iconData, raw.iconPath) || undefined,
    type: guessShortcutType(raw, path),
    order: numberOr(raw.order ?? raw.o ?? raw.pos ?? raw.POS, index),
    labelLines: Number.isFinite(Number(raw.labelLines)) ? Number(raw.labelLines) : undefined,
  };
}

function objectValuesSorted(value: unknown): any[] {
  if (Array.isArray(value)) return value;
  const record = asRecord(value);
  return Object.entries(record)
    .map(([key, entry]) => ({ key, entry: asRecord(entry) }))
    .sort((a, b) => numberOr(a.entry.order ?? a.entry.o ?? a.entry.pos ?? a.entry.POS, 0) - numberOr(b.entry.order ?? b.entry.o ?? b.entry.pos ?? b.entry.POS, 0))
    .map(({ key, entry }) => ({ ...entry, __legacyKey: key }));
}

function extractItems(raw: Record<string, any>, prefix: string): ShortcutItem[] {
  const itemSource = raw.items ?? raw.item ?? raw.links ?? raw.shortcuts ?? raw.apps ?? raw.childrenItems ?? raw.records;
  return objectValuesSorted(itemSource)
    .map((item, index) => toShortcutItem(item, index, prefix))
    .filter((item): item is ShortcutItem => Boolean(item))
    .sort((a, b) => a.order - b.order)
    .map((item, index) => ({ ...item, order: index }));
}

function extractNote(raw: Record<string, any>): string {
  const candidates = [raw.note, raw.noteContent, raw.content, raw.Content, raw.memo, raw.remark, raw.tips, raw.text];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value;
  }
  return '';
}

function isNotesKind(raw: Record<string, any>, note: string, items: ShortcutItem[]): boolean {
  const kindText = firstString(raw.kind, raw.type, raw.groupType, raw.categoryType, raw.mode).toLowerCase();
  if (['note', 'notes', 'sticky', 'memo', 'markdown', '便签', '笔记', '备忘'].includes(kindText)) return true;
  if (raw.isNote === true || raw.noteMode === true) return true;
  // Maye / Lucy 里导出的便签经常是“空标签 + Content/noteContent”。导入时直接识别为便签，避免再手动切换。
  return Boolean(note.trim()) && items.length === 0;
}

function toDirectory(rawValue: unknown, index: number, prefix: string): Directory {
  const raw = asRecord(rawValue);
  const idPart = safeIdPart(raw.id ?? raw.ID ?? raw.__legacyKey, `${index}`);
  const items = extractItems(raw, `${prefix}_${idPart}`);
  const note = extractNote(raw);
  const name = firstString(raw.name, raw.title, raw.label, raw.n, raw.text, `标签 ${index + 1}`);
  const kindText = firstString(raw.kind, raw.type).toLowerCase();
  const kind: DirectoryKind = name === '全部' || kindText === 'all'
    ? 'all'
    : isNotesKind(raw, note, items)
      ? 'notes'
      : 'normal';
  return {
    id: firstString(raw.id, raw.ID) || `${prefix}_dir_${idPart}`,
    name,
    order: numberOr(raw.order ?? raw.o ?? raw.pos ?? raw.POS, index),
    kind,
    items: kind === 'notes' ? [] : items,
    note: note || undefined,
    noteShowLineNumbers: typeof raw.noteShowLineNumbers === 'boolean' ? raw.noteShowLineNumbers : undefined,
    display: raw.display && typeof raw.display === 'object' ? raw.display : undefined,
  };
}

function getRawDirectories(rawGroup: Record<string, any>): any[] {
  const candidates = [rawGroup.directories, rawGroup.children, rawGroup.subGroups, rawGroup.subgroups, rawGroup.tabs, rawGroup.tags, rawGroup.categories, rawGroup.groups];
  for (const value of candidates) {
    const arr = objectValuesSorted(value);
    if (arr.length) return arr;
  }
  return [];
}

function toGroup(rawValue: unknown, index: number): Group {
  const raw = asRecord(rawValue);
  const idPart = safeIdPart(raw.id ?? raw.ID ?? raw.__legacyKey, `${index}`);
  const rawDirectories = getRawDirectories(raw);
  let directories = rawDirectories.map((dir, dirIndex) => toDirectory(dir, dirIndex, `import_${idPart}`));
  if (!directories.length) {
    const asDirectory = toDirectory({ ...raw, name: firstString(raw.directoryName, raw.tabName, '常用') }, 0, `import_${idPart}`);
    directories = [asDirectory];
  }
  directories = directories
    .sort((a, b) => a.order - b.order)
    .map((dir, dirIndex) => ({ ...dir, order: dirIndex }));
  return {
    id: firstString(raw.id, raw.ID) || `import_group_${idPart}`,
    name: firstString(raw.name, raw.title, raw.label, raw.n, `分组 ${index + 1}`),
    order: numberOr(raw.order ?? raw.o ?? raw.pos ?? raw.POS, index),
    directories,
  };
}

function looksLikeMayeJdb(value: unknown): boolean {
  const raw = asRecord(value);
  if (!raw.data || typeof raw.data !== 'object' || Array.isArray(raw.data)) return false;
  const entries = Object.values(raw.data as Record<string, any>).map(asRecord);
  return entries.some((entry) => 'item' in entry || 'fixed' in entry || 'order' in entry || 'name' in entry) && ('CI' in raw || 'DI' in raw || entries.some((entry) => 'item' in entry));
}

function convertMayeJdb(value: unknown): Partial<AppConfig> {
  const raw = asRecord(value);
  const groups = objectValuesSorted(raw.data).map((category, index) => {
    const cat = asRecord(category);
    const idPart = safeIdPart(cat.__legacyKey, `${index}`);
    const items = extractItems(cat, `maye_${idPart}`);
    const note = extractNote(cat);
    const dirKind: DirectoryKind = isNotesKind(cat, note, items) ? 'notes' : 'normal';
    return {
      id: `maye_group_${idPart}`,
      name: firstString(cat.name, cat.n, `分类 ${index + 1}`),
      order: numberOr(cat.order ?? cat.o, index),
      directories: [{
        id: `maye_dir_${idPart}`,
        name: dirKind === 'notes' ? firstString(cat.name, cat.n, '便签') : '常用',
        order: 0,
        kind: dirKind,
        items: dirKind === 'notes' ? [] : items,
        note: note || undefined,
      }],
    } as Group;
  }).sort((a, b) => a.order - b.order).map((group, index) => ({ ...group, order: index }));
  return { groups, theme: 'dark-soft' };
}

export function parseImportedConfigText(rawText: string): unknown {
  const raw = rawText.trim().replace(/^\uFEFF/, '');
  try {
    return JSON.parse(raw);
  } catch {
    if (/\bJDB\b\s*=|^\s*\{[\s\S]*\bCI\b[\s\S]*\bdata\b/.test(raw)) {
      return parseStaticJdbObject(raw);
    }
    throw new Error('不是有效的 JSON，也不是支持的 Maye JDB 配置。');
  }
}

export function adaptImportedConfig(input: unknown): AppConfig {
  const raw = asRecord(input);
  if (looksLikeMayeJdb(raw)) return convertMayeJdb(raw) as AppConfig;

  const base = (raw.config && typeof raw.config === 'object') ? asRecord(raw.config) : raw;
  let sourceGroups: any[] = [];
  for (const value of [base.groups, base.group, base.data?.groups, base.data?.categories, base.categories, base.tabs]) {
    const arr = objectValuesSorted(value);
    if (arr.length) {
      sourceGroups = arr;
      break;
    }
  }

  if (!sourceGroups.length && looksLikeMayeJdb(base)) return convertMayeJdb(base) as AppConfig;
  if (!sourceGroups.length) return base as AppConfig;

  const groups = sourceGroups
    .map((group, index) => toGroup(group, index))
    .sort((a, b) => a.order - b.order)
    .map((group, index) => ({ ...group, order: index }));

  return {
    ...(base as Partial<AppConfig>),
    groups,
  } as AppConfig;
}
