import type { CommandUsage, Group, SettingsTabId, ShortcutItem } from '../types';
import type { GlobalSearchSettings } from '../utils/v16Types';
import { FONT_PRESETS } from './fontCatalog';
import { SETTINGS_CATALOG } from './settingsCatalog';
import { themes } from '../themes';
import { normalizeSearchText, toFullPinyin, toPinyinInitials as toSharedPinyinInitials } from './pinyinSearch';

export type PaletteEntryKind = 'item' | 'group' | 'directory' | 'note' | 'setting' | 'command' | 'theme' | 'font';

export interface PaletteEntry {
  id: string;
  kind: PaletteEntryKind;
  title: string;
  subtitle: string;
  detail?: string;
  keywords: string[];
  aliases?: string[];
  favorite?: boolean;
  dangerous?: boolean;
  usageKey: string;
  groupId?: string;
  directoryId?: string;
  groupName?: string;
  directoryName?: string;
  item?: ShortcutItem;
  settingTab?: SettingsTabId;
  value?: string;
  useCount?: number;
  recentAt?: number;
  score?: number;
}

export const normalizePaletteText = normalizeSearchText;
export const toPinyinInitials = toSharedPinyinInitials;

function fuzzySubsequenceScore(value: string, query: string) {
  let queryIndex = 0;
  let first = -1;
  let last = -1;
  let consecutive = 0;
  let bestConsecutive = 0;
  for (let index = 0; index < value.length && queryIndex < query.length; index += 1) {
    if (value[index] !== query[queryIndex]) {
      consecutive = 0;
      continue;
    }
    if (first < 0) first = index;
    last = index;
    queryIndex += 1;
    consecutive += 1;
    bestConsecutive = Math.max(bestConsecutive, consecutive);
  }
  if (queryIndex !== query.length) return 0;
  const span = Math.max(1, last - first + 1);
  return 120 + bestConsecutive * 22 - (span - query.length) * 4 - first * 2;
}

function pinyinVariantScore(value: string, query: string, exact: number, prefix: number, contains: number) {
  if (!value) return 0;
  if (value === query) return exact;
  if (value.startsWith(query)) return prefix - Math.min(180, Math.max(0, value.length - query.length) * 4);
  if (value.includes(query)) return contains;
  return fuzzySubsequenceScore(value, query);
}

function fieldScore(raw: unknown, query: string, enablePinyin: boolean) {
  const value = normalizePaletteText(raw);
  if (!value) return 0;
  if (value === query) return 1400;
  if (value.startsWith(query)) return 900 - Math.min(200, value.length - query.length);
  const index = value.indexOf(query);
  if (index >= 0) return 560 - Math.min(260, index * 8);
  let score = fuzzySubsequenceScore(value, query);
  if (enablePinyin) {
    const text = typeof raw === 'string' ? raw : String(raw ?? '');
    score = Math.max(
      score,
      pinyinVariantScore(toFullPinyin(text), query, 1180, 820, 520),
      pinyinVariantScore(toPinyinInitials(text), query, 1100, 760, 480),
    );
  }
  return score;
}

function usageBoost(usage: CommandUsage | undefined, preferRecent: boolean, entry?: PaletteEntry) {
  if (!preferRecent) return 0;
  const count = Math.max(usage?.count ?? 0, entry?.useCount ?? 0);
  const lastUsedAt = Math.max(usage?.lastUsedAt ?? 0, entry?.recentAt ?? 0);
  if (!count && !lastUsedAt) return 0;
  const countBoost = Math.log2(count + 1) * 34;
  if (!lastUsedAt) return countBoost;
  const ageHours = Math.max(0, (Date.now() - lastUsedAt) / 3_600_000);
  const recencyBoost = Math.max(0, 180 - Math.log2(ageHours + 1) * 32);
  return countBoost + recencyBoost;
}

export function scorePaletteEntry(entry: PaletteEntry, rawQuery: string, settings: GlobalSearchSettings, usage?: CommandUsage) {
  const query = normalizePaletteText(rawQuery);
  if (!query) {
    return (entry.favorite ? 1000 : 0) + usageBoost(usage, settings.preferRecent, entry) + (entry.kind === 'command' ? 25 : 0);
  }
  const weightedFields: Array<[string, number]> = [];
  const isProjectItem = entry.kind === 'item';
  if (isProjectItem) {
    if (settings.searchInName) weightedFields.push([entry.title, 1]);
    if (settings.searchInGroup && entry.groupName) weightedFields.push([entry.groupName, 0.6]);
    if (settings.searchInSubGroup && entry.directoryName) weightedFields.push([entry.directoryName, 0.66]);
    if (entry.item?.type === 'url') {
      if (settings.searchInUrl) weightedFields.push([entry.detail ?? '', 0.32]);
    } else if (settings.searchInPath) {
      weightedFields.push([entry.detail ?? '', 0.32]);
    }
  } else if (entry.kind === 'group') {
    if (settings.searchInGroup) weightedFields.push([entry.title, 1]);
  } else if (entry.kind === 'directory' || entry.kind === 'note') {
    if (settings.searchInSubGroup) weightedFields.push([entry.title, 1]);
    if (settings.searchInGroup && entry.groupName) weightedFields.push([entry.groupName, 0.62]);
    if (entry.kind === 'note') weightedFields.push([entry.detail ?? '', 0.34]);
  } else {
    weightedFields.push([entry.title, 1], [entry.subtitle, 0.58], [entry.detail ?? '', 0.32]);
  }
  weightedFields.push(
    ...entry.keywords.map((keyword) => [keyword, isProjectItem ? 0.28 : 0.52] as [string, number]),
    ...(entry.aliases ?? []).map((alias) => [alias, 0.92] as [string, number]),
  );
  let best = 0;
  let total = 0;
  for (const [field, weight] of weightedFields) {
    const score = fieldScore(field, query, settings.enablePinyin) * weight;
    best = Math.max(best, score);
    if (score > 0) total += score * 0.12;
  }
  if (best <= 0) return 0;
  return best + total + usageBoost(usage, settings.preferRecent, entry) + (entry.favorite ? 80 : 0);
}

export function searchPaletteEntries(
  entries: PaletteEntry[],
  query: string,
  settings: GlobalSearchSettings,
  usage: Record<string, CommandUsage>,
) {
  return entries
    .map((entry) => ({ ...entry, score: scorePaletteEntry(entry, query, settings, usage[entry.usageKey]) }))
    .filter((entry) => (entry.score ?? 0) > 0)
    .sort((left, right) => (right.score ?? 0) - (left.score ?? 0) || Number(Boolean(right.favorite)) - Number(Boolean(left.favorite)) || String(left.title ?? '').localeCompare(String(right.title ?? ''), 'zh-Hans-CN'))
    .slice(0, settings.maxResults);
}

export function buildPaletteEntries(
  groups: Group[],
  settings: GlobalSearchSettings,
): PaletteEntry[] {
  const entries: PaletteEntry[] = [];

  for (const group of Array.isArray(groups) ? groups : []) {
    if (!settings.includeSystemTools && group.id === 'group_system_tools') continue;
    const groupName = typeof group.name === 'string' ? group.name : String(group.name ?? '未命名父目录');
    if (settings.includeDirectories) {
      entries.push({
        id: `group:${group.id}`,
        kind: 'group',
        title: groupName,
        subtitle: '父目录',
        keywords: ['父目录', '分组'],
        usageKey: `group:${group.id}`,
        groupId: group.id,
        groupName,
      });
    }
    for (const directory of Array.isArray(group?.directories) ? group.directories : []) {
      const directoryName = typeof directory.name === 'string' ? directory.name : String(directory.name ?? '未命名目录');
      if (settings.includeDirectories && (directory.kind !== 'notes' || settings.includeNotes)) {
        entries.push({
          id: `directory:${directory.id}`,
          kind: directory.kind === 'notes' ? 'note' : 'directory',
          title: directoryName,
          subtitle: `${groupName} / ${directory.kind === 'notes' ? '便签' : '子目录'}`,
          detail: directory.kind === 'notes' ? String(directory.note ?? '') : `${Array.isArray(directory.items) ? directory.items.length : 0} 个项目`,
          keywords: ['目录', '子目录', directory.kind === 'notes' ? '便签' : '打开目录'],
          usageKey: `directory:${directory.id}`,
          groupId: group.id,
          directoryId: directory.id,
          groupName,
          directoryName,
        });
      }
      const noteText = typeof directory.note === 'string' ? directory.note : String(directory.note ?? '');
      if (directory.kind === 'notes' && settings.includeNotes && noteText.trim()) {
        entries.push({
          id: `note:${directory.id}`,
          kind: 'note',
          title: `便签正文：${directoryName.trim() ? directoryName : '未命名便签'}`,
          subtitle: `${groupName} / 便签`,
          detail: noteText.slice(0, 240),
          keywords: ['便签', '笔记'],
          usageKey: `note:${directory.id}`,
          groupId: group.id,
          directoryId: directory.id,
          groupName,
          directoryName,
        });
      }
      for (const item of Array.isArray(directory.items) ? directory.items : []) {
        entries.push({
          id: `item:${item.id}`,
          kind: 'item',
          title: typeof item.name === 'string' ? item.name : String(item.name ?? '未命名项目'),
          subtitle: `${groupName} / ${directoryName}`,
          detail: typeof item.path === 'string' ? item.path : String(item.path ?? ''),
          keywords: [item.type, item.type === 'url' ? '网址' : '项目'],
          aliases: [],
          favorite: Boolean(item.pinned),
          usageKey: `item:${item.id}`,
          groupId: group.id,
          directoryId: directory.id,
          groupName,
          directoryName,
          item,
          useCount: item.launchCount ?? 0,
          recentAt: item.lastLaunchedAt ?? 0,
        });
      }
    }
  }

  if (settings.includeSettings) {
    for (const setting of SETTINGS_CATALOG) {
      entries.push({
        id: `setting:${setting.id}`,
        kind: 'setting',
        title: `打开设置：${setting.label}`,
        subtitle: setting.description,
        keywords: ['设置', ...setting.keywords],
        usageKey: `setting:${setting.id}`,
        settingTab: setting.id,
      });
    }
  }

  if (settings.includeCommands) {
    const builtIns: PaletteEntry[] = [
      { id: 'command:open-settings', kind: 'command', title: '打开设置', subtitle: '打开常规设置', keywords: ['设置', '偏好'], usageKey: 'command:open-settings', settingTab: 'general' },
      { id: 'command:export-config', kind: 'command', title: '导出配置备份', subtitle: '选择位置保存 JSON 配置', keywords: ['导出', '备份', '配置', '数据'], usageKey: 'command:export-config' },
      { id: 'command:toggle-pin', kind: 'command', title: '切换窗口置顶', subtitle: '在置顶与普通窗口之间切换', keywords: ['置顶', '取消置顶', '窗口'], usageKey: 'command:toggle-pin' },
      { id: 'command:clear-stats', kind: 'command', title: '清除启动统计', subtitle: '清除最近启动时间和启动次数', keywords: ['清除', '统计', '最近使用'], dangerous: true, usageKey: 'command:clear-stats' },
      { id: 'command:reset-settings', kind: 'command', title: '恢复默认设置', subtitle: '保留项目和便签，仅恢复设置', keywords: ['重置', '恢复默认', '设置'], dangerous: true, usageKey: 'command:reset-settings' },
    ];
    entries.push(...builtIns);

    for (const theme of themes) {
      entries.push({
        id: `theme:${theme.id}`,
        kind: 'theme',
        title: `切换主题：${theme.name}`,
        subtitle: theme.preview,
        keywords: ['主题', '皮肤', '外观', theme.name],
        usageKey: `theme:${theme.id}`,
        value: theme.id,
      });
    }
    for (const font of FONT_PRESETS) {
      entries.push({
        id: `font:${font.id}`,
        kind: 'font',
        title: `切换字体：${font.label}`,
        subtitle: font.hint,
        keywords: ['字体', '字形', font.label],
        usageKey: `font:${font.id}`,
        value: font.value,
      });
    }
  }

  return entries;
}
