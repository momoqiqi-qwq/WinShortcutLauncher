import type { ShortcutActionId, ShortcutSettings } from '../types';

export const SHORTCUT_ACTIONS: Array<{ id: ShortcutActionId; label: string; hint: string; group: string }> = [
  { id: 'openSettings', label: '打开设置', hint: '打开或聚焦设置界面。', group: '窗口与工具' },
  { id: 'openGlobalSearch', label: '打开全局命令面板', hint: '搜索项目、目录、便签、设置和功能命令。', group: '窗口与工具' },
  { id: 'openTransferStation', label: '打开文件中转', hint: '打开文件中转站。', group: '窗口与工具' },
  { id: 'openImageBrowser', label: '打开图片预览', hint: '打开图片预览界面。', group: '窗口与工具' },
  { id: 'toggleAlwaysOnTop', label: '切换窗口置顶', hint: '在置顶与普通窗口状态之间切换。', group: '窗口与工具' },
  { id: 'focusPageSearch', label: '搜索当前页', hint: '聚焦当前子目录的搜索框；在设置中聚焦设置搜索。', group: '当前页面' },
  { id: 'selectAllItems', label: '全选当前页项目', hint: '选择当前页全部快捷项目。', group: '当前页面' },
  { id: 'launchSelectedItem', label: '启动选中项目', hint: '启动当前选中的快捷项目。', group: '当前页面' },
  { id: 'deleteSelection', label: '删除选中内容', hint: '删除选中的项目、父目录或子目录。', group: '当前页面' },
  { id: 'closeOverlay', label: '关闭浮层 / 清空搜索', hint: '关闭当前浮层，或清空正在使用的搜索。', group: '当前页面' },
];

export const defaultShortcutSettings: ShortcutSettings = {
  openSettings: 'Ctrl+,',
  openGlobalSearch: 'Ctrl+K',
  openTransferStation: 'Ctrl+Shift+V',
  openImageBrowser: 'Ctrl+Shift+I',
  toggleAlwaysOnTop: 'Ctrl+Shift+P',
  focusPageSearch: 'Ctrl+F',
  selectAllItems: 'Ctrl+A',
  launchSelectedItem: 'Enter',
  deleteSelection: 'Delete',
  closeOverlay: 'Escape',
};

const MODIFIER_ORDER = ['Ctrl', 'Alt', 'Shift', 'Meta'] as const;
const MODIFIER_KEYS = new Set(['Control', 'Alt', 'Shift', 'Meta']);

function normalizeKeyName(raw: string): string {
  const key = raw.trim();
  if (!key) return '';
  const lowered = key.toLowerCase();
  const aliases: Record<string, string> = {
    ctrl: 'Ctrl', control: 'Ctrl', alt: 'Alt', shift: 'Shift', meta: 'Meta', cmd: 'Meta', command: 'Meta', win: 'Meta', windows: 'Meta',
    esc: 'Escape', escape: 'Escape', del: 'Delete', delete: 'Delete', return: 'Enter', enter: 'Enter', space: 'Space', spacebar: 'Space',
    arrowup: 'ArrowUp', arrowdown: 'ArrowDown', arrowleft: 'ArrowLeft', arrowright: 'ArrowRight', home: 'Home', end: 'End', tab: 'Tab',
    backspace: 'Backspace', insert: 'Insert', pageup: 'PageUp', pagedown: 'PageDown', comma: ',', period: '.', slash: '/', semicolon: ';', quote: "'",
  };
  if (aliases[lowered]) return aliases[lowered];
  if (/^f([1-9]|1[0-2])$/i.test(key)) return key.toUpperCase();
  if (key.length === 1) return /[a-z]/i.test(key) ? key.toUpperCase() : key;
  return key.length > 1 ? key[0].toUpperCase() + key.slice(1) : key;
}

export function normalizeShortcut(binding: string | undefined | null): string {
  if (!binding) return '';
  const tokens = binding.split('+').map((token) => normalizeKeyName(token)).filter(Boolean);
  const modifiers = new Set(tokens.filter((token) => MODIFIER_ORDER.includes(token as typeof MODIFIER_ORDER[number])));
  const main = tokens.find((token) => !MODIFIER_ORDER.includes(token as typeof MODIFIER_ORDER[number])) ?? '';
  if (!main) return '';
  return [...MODIFIER_ORDER.filter((modifier) => modifiers.has(modifier)), main].join('+');
}

export function normalizeShortcutSettings(settings?: Partial<ShortcutSettings>): ShortcutSettings {
  const result = { ...defaultShortcutSettings };
  for (const action of SHORTCUT_ACTIONS) {
    const raw = settings?.[action.id];
    if (raw === '') result[action.id] = '';
    else if (typeof raw === 'string') result[action.id] = normalizeShortcut(raw) || defaultShortcutSettings[action.id];
  }
  return result;
}

export function keyboardEventToShortcut(event: KeyboardEvent): string {
  if (MODIFIER_KEYS.has(event.key)) return '';
  const key = normalizeKeyName(event.key === ' ' ? 'Space' : event.key);
  if (!key) return '';
  const parts: string[] = [];
  if (event.ctrlKey) parts.push('Ctrl');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  if (event.metaKey) parts.push('Meta');
  parts.push(key);
  return normalizeShortcut(parts.join('+'));
}

export function shortcutMatchesEvent(binding: string | undefined, event: KeyboardEvent): boolean {
  const expected = normalizeShortcut(binding);
  if (!expected) return false;
  return keyboardEventToShortcut(event) === expected;
}

export function isShortcutSafe(binding: string): boolean {
  const normalized = normalizeShortcut(binding);
  if (!normalized) return true;
  const parts = normalized.split('+');
  const main = parts[parts.length - 1] ?? '';
  const hasModifier = parts.length > 1;
  if (hasModifier) return true;
  return ['Enter', 'Delete', 'Escape', 'Home', 'End', 'Tab', 'Backspace', 'Insert', 'PageUp', 'PageDown', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ...Array.from({ length: 12 }, (_, index) => `F${index + 1}`)].includes(main);
}

export function findShortcutConflicts(settings: ShortcutSettings): Partial<Record<ShortcutActionId, ShortcutActionId[]>> {
  const byBinding = new Map<string, ShortcutActionId[]>();
  for (const action of SHORTCUT_ACTIONS) {
    const binding = normalizeShortcut(settings[action.id]);
    if (!binding) continue;
    const list = byBinding.get(binding) ?? [];
    list.push(action.id);
    byBinding.set(binding, list);
  }
  const conflicts: Partial<Record<ShortcutActionId, ShortcutActionId[]>> = {};
  for (const actions of byBinding.values()) {
    if (actions.length < 2) continue;
    for (const action of actions) conflicts[action] = actions.filter((other) => other !== action);
  }
  return conflicts;
}

export function formatShortcut(binding: string): string {
  return normalizeShortcut(binding).replace('Meta', 'Win');
}
