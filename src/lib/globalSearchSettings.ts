import { DEFAULT_GLOBAL_SEARCH_SETTINGS, type GlobalSearchSettings } from '../utils/v16Types';

function booleanOr(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function numberInRange(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

export function normalizeGlobalSearchSettings(value?: Partial<GlobalSearchSettings> | null): GlobalSearchSettings {
  const raw = (value ?? {}) as Record<string, unknown>;
  const defaults = DEFAULT_GLOBAL_SEARCH_SETTINGS;
  const iconResolveMode = ['auto', 'read_icon_as_data_url', 'get_file_icon'].includes(String(raw.iconResolveMode))
    ? raw.iconResolveMode as GlobalSearchSettings['iconResolveMode']
    : defaults.iconResolveMode;
  const enterAction = raw.enterAction === 'locate' ? 'locate' : 'open';
  const ctrlEnterAction = raw.ctrlEnterAction === 'open' ? 'open' : 'locate';
  return {
    enabled: booleanOr(raw.enabled, defaults.enabled),
    placeholder: typeof raw.placeholder === 'string' ? raw.placeholder.replace(/[\r\n\t]/g, ' ').trim().slice(0, 120) || defaults.placeholder : defaults.placeholder,
    maxResults: Math.round(numberInRange(raw.maxResults, 10, 300, defaults.maxResults)),
    debounceMs: Math.round(numberInRange(raw.debounceMs, 0, 1000, defaults.debounceMs)),
    iconSize: Math.round(numberInRange(raw.iconSize, 16, 48, defaults.iconSize)),
    iconResolveMode,
    iconParallelTasks: Math.round(numberInRange(raw.iconParallelTasks, 1, 8, defaults.iconParallelTasks)),
    showItemIcon: booleanOr(raw.showItemIcon, defaults.showItemIcon),
    showGroupPath: booleanOr(raw.showGroupPath, defaults.showGroupPath),
    showFullPath: booleanOr(raw.showFullPath, defaults.showFullPath),
    highlightMatches: booleanOr(raw.highlightMatches, defaults.highlightMatches),
    searchInName: booleanOr(raw.searchInName, defaults.searchInName),
    searchInPath: booleanOr(raw.searchInPath, defaults.searchInPath),
    searchInUrl: booleanOr(raw.searchInUrl, defaults.searchInUrl),
    searchInGroup: booleanOr(raw.searchInGroup, defaults.searchInGroup),
    searchInSubGroup: booleanOr(raw.searchInSubGroup, defaults.searchInSubGroup),
    includeNotes: booleanOr(raw.includeNotes, defaults.includeNotes),
    includeSystemTools: booleanOr(raw.includeSystemTools, defaults.includeSystemTools),
    includeDirectories: booleanOr(raw.includeDirectories, defaults.includeDirectories),
    includeSettings: booleanOr(raw.includeSettings, defaults.includeSettings),
    includeCommands: booleanOr(raw.includeCommands, defaults.includeCommands),
    enablePinyin: booleanOr(raw.enablePinyin, defaults.enablePinyin),
    preferRecent: booleanOr(raw.preferRecent, defaults.preferRecent),
    showResultType: booleanOr(raw.showResultType, defaults.showResultType),
    enterAction,
    ctrlEnterAction,
  };
}
