import type { AppConfig, Directory, Group, ShortcutItem } from '../types';
import { makeId } from './id';

export type ImportMode = 'merge' | 'replace';
export type ImportConflictResolution = 'keep' | 'replace' | 'both';
export type ImportConflictKind = 'item' | 'note' | 'directoryKind';

export interface ImportConflict {
  id: string;
  kind: ImportConflictKind;
  groupName: string;
  directoryName: string;
  title: string;
  currentSummary: string;
  importedSummary: string;
}

export interface ImportPreview {
  addedGroups: number;
  addedDirectories: number;
  addedItems: number;
  addedNotes: number;
  duplicates: number;
  conflicts: ImportConflict[];
  importedGroups: number;
  importedDirectories: number;
  importedItems: number;
}

export interface ImportApplySummary {
  addedGroups: number;
  addedDirectories: number;
  addedItems: number;
  addedNotes: number;
  duplicates: number;
  resolvedConflicts: number;
}

function normalizedName(value: string) {
  return value.trim().toLocaleLowerCase('zh-CN').replace(/\s+/g, ' ');
}

function stripBalancedQuotes(value: string) {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'")))) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

export function normalizeImportIdentity(rawValue: string) {
  const value = stripBalancedQuotes(rawValue);
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      url.hostname = url.hostname.toLowerCase();
      if ((url.protocol === 'http:' && url.port === '80') || (url.protocol === 'https:' && url.port === '443')) url.port = '';
      const normalizedPath = url.pathname === '/' ? '' : url.pathname.replace(/\/+$/, '');
      return `${url.protocol.toLowerCase()}//${url.host.toLowerCase()}${normalizedPath}${url.search}${url.hash}`;
    } catch {
      return value.toLowerCase();
    }
  }
  if (/^[a-z]:[\\/]/i.test(value) || /^\\\\/.test(value)) {
    return value.replace(/\//g, '\\').replace(/\\+/g, '\\').toLowerCase();
  }
  return value.replace(/\s+/g, ' ').toLowerCase();
}

function itemKey(item: ShortcutItem) {
  return normalizeImportIdentity(item.path || item.name);
}

function itemEquivalent(a: ShortcutItem, b: ShortcutItem) {
  return normalizedName(a.name) === normalizedName(b.name)
    && itemKey(a) === itemKey(b)
    && a.type === b.type
    && String(a.icon ?? '') === String(b.icon ?? '')
    && (a.labelLines ?? null) === (b.labelLines ?? null);
}

function kindLabel(kind: Directory['kind']) {
  if (kind === 'notes') return '便签';
  if (kind === 'all') return '全部';
  return '普通目录';
}

function conflictId(kind: ImportConflictKind, group: Group, directory: Directory, suffix = '') {
  return [kind, normalizedName(group.name), normalizedName(directory.name), suffix].join('::');
}

function summarizeItem(item: ShortcutItem) {
  const target = item.path || '(无路径)';
  return `${item.name} · ${target}`;
}

export function buildImportPreview(current: AppConfig, incoming: AppConfig): ImportPreview {
  const preview: ImportPreview = {
    addedGroups: 0,
    addedDirectories: 0,
    addedItems: 0,
    addedNotes: 0,
    duplicates: 0,
    conflicts: [],
    importedGroups: incoming.groups?.length ?? 0,
    importedDirectories: 0,
    importedItems: 0,
  };

  const currentGroups = current.groups ?? [];
  for (const incomingGroup of incoming.groups ?? []) {
    preview.importedDirectories += incomingGroup.directories.length;
    preview.importedItems += incomingGroup.directories.reduce((sum, dir) => sum + dir.items.length, 0);
    const currentGroup = currentGroups.find((group) => normalizedName(group.name) === normalizedName(incomingGroup.name));
    if (!currentGroup) {
      preview.addedGroups += 1;
      preview.addedDirectories += incomingGroup.directories.length;
      preview.addedItems += incomingGroup.directories.reduce((sum, dir) => sum + dir.items.length, 0);
      preview.addedNotes += incomingGroup.directories.filter((dir) => Boolean(dir.note?.trim())).length;
      continue;
    }

    for (const incomingDir of incomingGroup.directories) {
      const currentDir = currentGroup.directories.find((dir) => normalizedName(dir.name) === normalizedName(incomingDir.name));
      if (!currentDir) {
        preview.addedDirectories += 1;
        preview.addedItems += incomingDir.items.length;
        if (incomingDir.note?.trim()) preview.addedNotes += 1;
        continue;
      }

      if ((currentDir.kind ?? 'normal') !== (incomingDir.kind ?? 'normal')) {
        preview.conflicts.push({
          id: conflictId('directoryKind', incomingGroup, incomingDir),
          kind: 'directoryKind',
          groupName: incomingGroup.name,
          directoryName: incomingDir.name,
          title: '目录类型不同',
          currentSummary: kindLabel(currentDir.kind),
          importedSummary: kindLabel(incomingDir.kind),
        });
        continue;
      }

      const incomingNote = incomingDir.note?.trim() ?? '';
      const currentNote = currentDir.note?.trim() ?? '';
      if (incomingNote) {
        if (!currentNote) preview.addedNotes += 1;
        else if (incomingNote === currentNote) preview.duplicates += 1;
        else {
          preview.conflicts.push({
            id: conflictId('note', incomingGroup, incomingDir),
            kind: 'note',
            groupName: incomingGroup.name,
            directoryName: incomingDir.name,
            title: '便签正文不同',
            currentSummary: currentNote.slice(0, 110),
            importedSummary: incomingNote.slice(0, 110),
          });
        }
      }

      const existingItems = new Map(currentDir.items.map((item) => [itemKey(item), item]));
      for (const incomingItem of incomingDir.items) {
        const key = itemKey(incomingItem);
        const existing = existingItems.get(key);
        if (!existing) {
          preview.addedItems += 1;
          continue;
        }
        if (itemEquivalent(existing, incomingItem)) {
          preview.duplicates += 1;
          continue;
        }
        preview.conflicts.push({
          id: conflictId('item', incomingGroup, incomingDir, key),
          kind: 'item',
          groupName: incomingGroup.name,
          directoryName: incomingDir.name,
          title: `项目冲突：${incomingItem.name}`,
          currentSummary: summarizeItem(existing),
          importedSummary: summarizeItem(incomingItem),
        });
      }
    }
  }
  return preview;
}

function nextUniqueId(preferred: string | undefined, used: Set<string>, prefix: string) {
  let candidate = preferred?.trim() || makeId(prefix);
  while (used.has(candidate)) candidate = makeId(prefix);
  used.add(candidate);
  return candidate;
}

function uniqueName(base: string, used: Set<string>, suffix = '（导入）') {
  let candidate = `${base}${suffix}`;
  let index = 2;
  while (used.has(normalizedName(candidate))) {
    candidate = `${base}${suffix.replace('）', ` ${index}）`)}`;
    index += 1;
  }
  used.add(normalizedName(candidate));
  return candidate;
}

function cloneItem(item: ShortcutItem, usedIds: Set<string>, name?: string): ShortcutItem {
  return { ...item, id: nextUniqueId(item.id, usedIds, 'import_item'), name: name ?? item.name };
}

function cloneDirectory(directory: Directory, usedDirIds: Set<string>, usedItemIds: Set<string>, name?: string): Directory {
  return {
    ...directory,
    id: nextUniqueId(directory.id, usedDirIds, 'import_dir'),
    name: name ?? directory.name,
    items: directory.items.map((item, index) => ({ ...cloneItem(item, usedItemIds), order: index })),
  };
}

function cloneGroup(group: Group, usedGroupIds: Set<string>, usedDirIds: Set<string>, usedItemIds: Set<string>): Group {
  return {
    ...group,
    id: nextUniqueId(group.id, usedGroupIds, 'import_group'),
    directories: group.directories.map((dir, index) => ({ ...cloneDirectory(dir, usedDirIds, usedItemIds), order: index })),
  };
}

function collectIds(groups: Group[]) {
  const groupIds = new Set<string>();
  const dirIds = new Set<string>();
  const itemIds = new Set<string>();
  for (const group of groups) {
    groupIds.add(group.id);
    for (const dir of group.directories) {
      dirIds.add(dir.id);
      for (const item of dir.items) itemIds.add(item.id);
    }
  }
  return { groupIds, dirIds, itemIds };
}

export function mergeImportedConfig(
  current: AppConfig,
  incoming: AppConfig,
  resolutions: Record<string, ImportConflictResolution> = {},
  defaultResolution: ImportConflictResolution = 'keep',
): { config: AppConfig; summary: ImportApplySummary } {
  const groups = current.groups.map((group) => ({
    ...group,
    directories: group.directories.map((dir) => ({ ...dir, items: dir.items.map((item) => ({ ...item })) })),
  }));
  const ids = collectIds(groups);
  const summary: ImportApplySummary = { addedGroups: 0, addedDirectories: 0, addedItems: 0, addedNotes: 0, duplicates: 0, resolvedConflicts: 0 };

  for (const incomingGroup of incoming.groups ?? []) {
    let group = groups.find((entry) => normalizedName(entry.name) === normalizedName(incomingGroup.name));
    if (!group) {
      group = cloneGroup(incomingGroup, ids.groupIds, ids.dirIds, ids.itemIds);
      group.order = groups.length;
      groups.push(group);
      summary.addedGroups += 1;
      summary.addedDirectories += group.directories.length;
      summary.addedItems += group.directories.reduce((sum, dir) => sum + dir.items.length, 0);
      summary.addedNotes += group.directories.filter((dir) => Boolean(dir.note?.trim())).length;
      continue;
    }

    for (const incomingDir of incomingGroup.directories) {
      let directory = group.directories.find((entry) => normalizedName(entry.name) === normalizedName(incomingDir.name));
      if (!directory) {
        const clone = cloneDirectory(incomingDir, ids.dirIds, ids.itemIds);
        clone.order = group.directories.length;
        group.directories.push(clone);
        summary.addedDirectories += 1;
        summary.addedItems += clone.items.length;
        if (clone.note?.trim()) summary.addedNotes += 1;
        continue;
      }

      const kindConflictKey = conflictId('directoryKind', incomingGroup, incomingDir);
      if ((directory.kind ?? 'normal') !== (incomingDir.kind ?? 'normal')) {
        const resolution = resolutions[kindConflictKey] ?? defaultResolution;
        summary.resolvedConflicts += 1;
        if (resolution === 'both') {
          const usedNames = new Set(group.directories.map((entry) => normalizedName(entry.name)));
          const clone = cloneDirectory(incomingDir, ids.dirIds, ids.itemIds, uniqueName(incomingDir.name, usedNames));
          clone.order = group.directories.length;
          group.directories.push(clone);
          summary.addedDirectories += 1;
          summary.addedItems += clone.items.length;
          if (clone.note?.trim()) summary.addedNotes += 1;
          continue;
        }
        if (resolution === 'replace') {
          const replacement = cloneDirectory(incomingDir, ids.dirIds, ids.itemIds);
          replacement.id = directory.id;
          ids.dirIds.add(directory.id);
          replacement.order = directory.order;
          const index = group.directories.indexOf(directory);
          group.directories[index] = replacement;
          directory = replacement;
          continue;
        }
        // “保留当前”表示整个类型冲突目录不再混入不兼容的数据。
        continue;
      }

      const incomingNote = incomingDir.note?.trim() ?? '';
      const currentNote = directory.note?.trim() ?? '';
      if (incomingNote) {
        if (!currentNote) {
          directory.note = incomingDir.note;
          summary.addedNotes += 1;
        } else if (incomingNote === currentNote) {
          summary.duplicates += 1;
        } else {
          const noteConflictKey = conflictId('note', incomingGroup, incomingDir);
          const resolution = resolutions[noteConflictKey] ?? defaultResolution;
          summary.resolvedConflicts += 1;
          if (resolution === 'replace') directory.note = incomingDir.note;
          if (resolution === 'both') {
            const usedNames = new Set(group.directories.map((entry) => normalizedName(entry.name)));
            const noteDirectory = cloneDirectory({ ...incomingDir, kind: 'notes', items: [] }, ids.dirIds, ids.itemIds, uniqueName(incomingDir.name, usedNames));
            noteDirectory.order = group.directories.length;
            group.directories.push(noteDirectory);
            summary.addedDirectories += 1;
            summary.addedNotes += 1;
          }
        }
      }

      if ((directory.kind ?? 'normal') === 'notes') continue;
      for (const incomingItem of incomingDir.items) {
        const key = itemKey(incomingItem);
        const existingIndex = directory.items.findIndex((item) => itemKey(item) === key);
        if (existingIndex < 0) {
          const clone = cloneItem(incomingItem, ids.itemIds);
          clone.order = directory.items.length;
          directory.items.push(clone);
          summary.addedItems += 1;
          continue;
        }
        const existing = directory.items[existingIndex];
        if (itemEquivalent(existing, incomingItem)) {
          summary.duplicates += 1;
          continue;
        }
        const itemConflictKey = conflictId('item', incomingGroup, incomingDir, key);
        const resolution = resolutions[itemConflictKey] ?? defaultResolution;
        summary.resolvedConflicts += 1;
        if (resolution === 'replace') {
          directory.items[existingIndex] = { ...incomingItem, id: existing.id, order: existing.order };
        } else if (resolution === 'both') {
          const usedNames = new Set(directory.items.map((entry) => normalizedName(entry.name)));
          const clone = cloneItem(incomingItem, ids.itemIds, uniqueName(incomingItem.name, usedNames));
          clone.order = directory.items.length;
          directory.items.push(clone);
          summary.addedItems += 1;
        }
      }
      directory.items = directory.items.map((item, index) => ({ ...item, order: index }));
    }
    group.directories = group.directories.map((dir, index) => ({ ...dir, order: index }));
  }

  return { config: { ...current, groups: groups.map((group, index) => ({ ...group, order: index })) }, summary };
}
