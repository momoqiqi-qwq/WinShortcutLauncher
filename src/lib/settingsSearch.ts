import { SETTINGS_PINYIN_ALIASES } from './settingsPinyinAliases';
import { getSearchTextVariants, matchSearchText, normalizeSearchText } from './pinyinSearch';

export interface SearchableSettingEntry {
  id: string;
  label: string;
  keywords: readonly string[];
}

export type SettingsTextMatch = 'exact' | 'prefix' | 'contains' | null;

export function normalizeSettingsQuery(value: string) {
  return normalizeSearchText(value);
}

export function getSettingsSearchVariants(value: string): string[] {
  return getSearchTextVariants(value, SETTINGS_PINYIN_ALIASES[value] ?? []);
}

export function matchSettingsText(value: string, query: string): SettingsTextMatch {
  return matchSearchText(value, query, SETTINGS_PINYIN_ALIASES[value] ?? []);
}

export function settingsTextMatches(value: string, query: string) {
  return matchSettingsText(value, query) !== null;
}

export function filterSettingsEntries<T extends SearchableSettingEntry>(entries: readonly T[], query: string): T[] {
  const normalized = normalizeSettingsQuery(query);
  if (!normalized) return entries.slice();
  return entries.filter((entry) => [entry.label, entry.id, ...entry.keywords]
    .some((value) => settingsTextMatches(value, query)));
}
