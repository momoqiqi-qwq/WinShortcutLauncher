import type { SettingsTabId } from '../types';

export interface QuickSettingDefinition {
  id: string;
  label: string;
  description: string;
  tab: SettingsTabId;
  section?: string;
  group: '外观' | '操作' | '内容' | '工具';
}

export const QUICK_SETTINGS_CATALOG: QuickSettingDefinition[] = [
  { id: 'theme', label: '主题', description: '主题与配色预设', tab: 'general', group: '外观' },
  { id: 'background', label: '主界面背景', description: '图片、视频、位置与透明度', tab: 'interface', section: 'background', group: '外观' },
  { id: 'settingsBackground', label: '设置窗口背景', description: '独立背景与毛玻璃效果', tab: 'interface', section: 'settingsBackground', group: '外观' },
  { id: 'interface', label: '界面布局', description: '缩放、滚动条、侧栏与顶栏', tab: 'interface', group: '外观' },
  { id: 'font', label: '字体', description: '字体、生效区域与预览', tab: 'font', group: '外观' },
  { id: 'icons', label: '图标', description: '图标解析、缓存与来源', tab: 'icons', group: '外观' },
  { id: 'rainbow', label: '彩虹效果', description: '鼠标、拖尾、边框与文字', tab: 'rainbow', group: '外观' },
  { id: 'behavior', label: '操作', description: '启动、贴边与开机行为', tab: 'behavior', group: '操作' },
  { id: 'drag', label: '拖动', description: '网站拖入、长按与视觉反馈', tab: 'drag', group: '操作' },
  { id: 'window', label: '窗口行为', description: '窗口位置、回弹与动画', tab: 'window', group: '操作' },
  { id: 'shortcuts', label: '快捷键', description: '键盘快捷键与冲突检查', tab: 'shortcuts', group: '操作' },
  { id: 'navigation', label: '导航', description: '父目录、子目录与导航行为', tab: 'navigation', group: '内容' },
  { id: 'contextMenus', label: '右键菜单', description: '显示项目、图标与菜单紧凑度', tab: 'contextMenus', group: '内容' },
  { id: 'notes', label: '便签', description: '行号、字体与自动保存', tab: 'notes', group: '内容' },
  { id: 'search', label: '搜索', description: '命令面板、索引与匹配规则', tab: 'search', group: '工具' },
  { id: 'transfer', label: '文件中转', description: '文件中转和临时内容', tab: 'transfer', group: '工具' },
  { id: 'image', label: '图片预览', description: '截图、裁剪与图片管理', tab: 'image', group: '工具' },
  { id: 'experience', label: '体验', description: '动画、记忆、提示与简洁模式', tab: 'experience', group: '工具' },
  { id: 'diagnostics', label: '自检', description: '配置健康检查与问题诊断', tab: 'diagnostics', group: '工具' },
  { id: 'data', label: '数据与导入', description: '导入中心、备份、回滚与恢复', tab: 'data', group: '工具' },
];

export interface QuickSettingsPreferences {
  order: string[];
  hidden: string[];
  favorites: string[];
}

const QUICK_SETTINGS_STORAGE_KEY = 'yue-launcher-quick-settings-v2';
const DEFAULT_FAVORITES = ['background', 'font', 'shortcuts', 'experience'];

export function defaultQuickSettingsPreferences(): QuickSettingsPreferences {
  return {
    order: QUICK_SETTINGS_CATALOG.map((entry) => entry.id),
    hidden: [],
    favorites: DEFAULT_FAVORITES.slice(),
  };
}

export function normalizeQuickSettingsPreferences(value?: Partial<QuickSettingsPreferences> | null): QuickSettingsPreferences {
  const valid = new Set(QUICK_SETTINGS_CATALOG.map((entry) => entry.id));
  const order: string[] = [];
  for (const id of value?.order ?? []) if (valid.has(id) && !order.includes(id)) order.push(id);
  for (const entry of QUICK_SETTINGS_CATALOG) if (!order.includes(entry.id)) order.push(entry.id);
  const hidden = (value?.hidden ?? []).filter((id, index, list) => valid.has(id) && list.indexOf(id) === index);
  const favorites = (value?.favorites ?? DEFAULT_FAVORITES).filter((id, index, list) => valid.has(id) && list.indexOf(id) === index);
  return { order, hidden, favorites };
}

export function loadQuickSettingsPreferences(): QuickSettingsPreferences {
  try {
    const raw = localStorage.getItem(QUICK_SETTINGS_STORAGE_KEY);
    return normalizeQuickSettingsPreferences(raw ? JSON.parse(raw) as Partial<QuickSettingsPreferences> : null);
  } catch {
    return defaultQuickSettingsPreferences();
  }
}

export function saveQuickSettingsPreferences(preferences: QuickSettingsPreferences) {
  localStorage.setItem(QUICK_SETTINGS_STORAGE_KEY, JSON.stringify(normalizeQuickSettingsPreferences(preferences)));
}
