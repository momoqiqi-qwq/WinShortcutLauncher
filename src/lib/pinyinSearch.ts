import { PINYIN_SYLLABLE_DATA, PINYIN_TABLE_END, PINYIN_TABLE_START } from './pinyinSyllables';

export type SearchTextMatch = 'exact' | 'prefix' | 'contains' | null;

const SEARCH_CACHE_LIMIT = 12000;
const normalizedCache = new Map<string, string>();
const fullPinyinCache = new Map<string, string>();
const initialsCache = new Map<string, string>();
let syllableTable: string[] | undefined;

// Common polyphonic phrases where character-by-character transliteration is often wrong.
// Keep this list deliberately small: arbitrary names still fall back to the generated ICU table.
const PHRASE_OVERRIDES: ReadonlyArray<readonly [string, string, string]> = [
  ['命令面板', 'minglingmianban', 'mmlb'], // Preserve the v109 command-palette alias.
  ['重庆', 'chongqing', 'cq'],
  ['重复', 'chongfu', 'cf'],
  ['重新', 'chongxin', 'cx'],
  ['重启', 'chongqi', 'cq'],
  ['银行', 'yinhang', 'yh'],
  ['行业', 'hangye', 'hy'],
  ['行号', 'hanghao', 'hh'],
  ['音乐', 'yinyue', 'yy'],
  ['乐器', 'yueqi', 'yq'],
  ['长沙', 'changsha', 'cs'],
  ['长安', 'changan', 'ca'],
  ['长城', 'changcheng', 'cc'],
];

function cacheValue(cache: Map<string, string>, key: string, value: string) {
  cache.set(key, value);
  if (cache.size <= SEARCH_CACHE_LIMIT) return value;
  let remaining = Math.ceil(SEARCH_CACHE_LIMIT * 0.2);
  for (const oldest of cache.keys()) {
    cache.delete(oldest);
    remaining -= 1;
    if (remaining <= 0) break;
  }
  return value;
}

function getSyllableTable() {
  syllableTable ??= PINYIN_SYLLABLE_DATA.split('|');
  return syllableTable;
}

function pinyinForHan(char: string) {
  const codePoint = char.codePointAt(0) ?? 0;
  if (codePoint < PINYIN_TABLE_START || codePoint >= PINYIN_TABLE_END) return '';
  return getSyllableTable()[codePoint - PINYIN_TABLE_START] ?? '';
}

function readPhraseOverride(value: string, index: number) {
  for (const override of PHRASE_OVERRIDES) {
    if (value.startsWith(override[0], index)) return override;
  }
  return undefined;
}

export function normalizeSearchText(value: unknown) {
  const text = typeof value === 'string' ? value : String(value ?? '');
  const cached = normalizedCache.get(text);
  if (cached !== undefined) return cached;
  return cacheValue(
    normalizedCache,
    text,
    text.toLocaleLowerCase('zh-CN').replace(/[^\p{L}\p{N}]+/gu, '').trim(),
  );
}

export function toFullPinyin(value: string) {
  const cached = fullPinyinCache.get(value);
  if (cached !== undefined) return cached;
  let result = '';
  for (let index = 0; index < value.length;) {
    const override = readPhraseOverride(value, index);
    if (override) {
      result += override[1];
      index += override[0].length;
      continue;
    }
    const codePoint = value.codePointAt(index);
    if (codePoint === undefined) break;
    const char = String.fromCodePoint(codePoint);
    if (/[a-z0-9]/i.test(char)) result += char.toLowerCase();
    else if (/\p{Script=Han}/u.test(char)) result += pinyinForHan(char);
    index += char.length;
  }
  return cacheValue(fullPinyinCache, value, result);
}

export function toPinyinInitials(value: string) {
  const cached = initialsCache.get(value);
  if (cached !== undefined) return cached;
  let result = '';
  for (let index = 0; index < value.length;) {
    const override = readPhraseOverride(value, index);
    if (override) {
      result += override[2];
      index += override[0].length;
      continue;
    }
    const codePoint = value.codePointAt(index);
    if (codePoint === undefined) break;
    const char = String.fromCodePoint(codePoint);
    if (/[a-z0-9]/i.test(char)) result += char.toLowerCase();
    else if (/\p{Script=Han}/u.test(char)) result += pinyinForHan(char).charAt(0);
    index += char.length;
  }
  return cacheValue(initialsCache, value, result);
}

export function getSearchTextVariants(value: unknown, aliases: readonly string[] = []) {
  const text = typeof value === 'string' ? value : String(value ?? '');
  return Array.from(new Set([
    normalizeSearchText(text),
    toFullPinyin(text),
    toPinyinInitials(text),
    ...aliases.map((alias) => normalizeSearchText(alias)),
  ].filter(Boolean)));
}

export function matchSearchText(value: unknown, query: string, aliases: readonly string[] = []): SearchTextMatch {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return null;
  let best: SearchTextMatch = null;
  for (const variant of getSearchTextVariants(value, aliases)) {
    if (variant === normalizedQuery) return 'exact';
    if (variant.startsWith(normalizedQuery)) best = 'prefix';
    else if (variant.includes(normalizedQuery) && best === null) best = 'contains';
  }
  return best;
}

export function searchTextMatches(value: unknown, query: string, aliases: readonly string[] = []) {
  return matchSearchText(value, query, aliases) !== null;
}
