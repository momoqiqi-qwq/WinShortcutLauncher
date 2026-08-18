import type { SettingsTabId } from '../types';

export interface SettingsCatalogEntry {
  id: SettingsTabId;
  label: string;
  description: string;
  keywords: string[];
}

export const SETTINGS_CATALOG: SettingsCatalogEntry[] = [
  { id: 'general', label: '常规', description: '主题、外观和颜色', keywords: ['主题', '外观', '颜色', '浅黑'] },
  { id: 'behavior', label: '操作', description: '启动、关闭、贴边与开机行为', keywords: ['启动', '关闭', '贴边', '开机', '托盘', '单击', '双击', '恢复'] },
  { id: 'drag', label: '拖动', description: '项目拖拽、网站拖入、长按与视觉反馈', keywords: ['长按', '项目拖拽', '网站拖入', '重命名', '发光', '背景'] },
  { id: 'window', label: '窗口行为', description: '窗口大小、位置、回弹与动画', keywords: ['大小', '位置', '回弹', '屏幕外', '动画'] },
  { id: 'interface', label: '界面', description: '缩放、父目录标签、滚动条、背景图、玻璃感和设置窗口布局', keywords: ['缩放', '父目录', '标签', '颜色强度', '按钮', '滚动条', '背景图', '玻璃感', '毛玻璃', '提示时间', '设置窗口', '自适应', '重置布局'] },
  { id: 'font', label: '字体', description: '字体、生效区域与预览', keywords: ['字体', '微软雅黑', 'Segoe UI', '思源黑体', 'MiSans', '便签字体', '生效区域'] },
  { id: 'experience', label: '体验', description: '确认、记忆、动画、提示和简洁模式', keywords: ['确认', '记住', '动画', '性能', '固定', '提示', '描述', '简洁'] },
  { id: 'navigation', label: '导航', description: '父目录配色、子目录和导航行为', keywords: ['父目录', '配色', '背景色', '彩色', '子目录', '新建目录', '重名', '数量', '双击', '管理菜单'] },
  { id: 'contextMenus', label: '右键菜单', description: '项目、目录和空白区域菜单', keywords: ['子目录', '父目录', '空白界面', '显示', '隐藏', '菜单', '紧凑'] },
  { id: 'shortcuts', label: '快捷键', description: '自定义键盘快捷键和冲突检查', keywords: ['自定义', '组合键', '冲突', 'ctrl', 'alt', 'shift', 'win', '搜索'] },
  { id: 'diagnostics', label: '自检', description: '配置健康检查和问题诊断', keywords: ['诊断', '检查', '重复', '无效', '测试', '健康'] },
  { id: 'icons', label: '图标', description: '网站图标、缓存和来源测速', keywords: ['favicon', '网站图标', '测速', '缓存', '国内', '国外'] },
  { id: 'rainbow', label: '彩虹', description: '鼠标、拖尾、边框和文字特效', keywords: ['鼠标', '拖尾', '边框', '文字', '颜色条'] },
  { id: 'notes', label: '便签', description: '行号、分界线、字体和自动保存', keywords: ['行号', '分界线', '字体', '自动保存'] },
  { id: 'search', label: '搜索', description: '全局命令面板、索引和匹配规则', keywords: ['全局搜索', '命令面板', '索引', '关键词', '拼音', '模糊匹配'] },
  { id: 'transfer', label: '中转', description: '文件中转和临时内容', keywords: ['文件中转', '剪贴板', '临时'] },
  { id: 'image', label: '图片预览', description: '截图、裁剪、重命名和图片管理', keywords: ['截图', '裁剪', '重命名', '图片'] },
  { id: 'about', label: '关于', description: '版本、作者、框架和项目地址', keywords: ['关于', '版本', '作者', '框架', '项目地址', 'github'] },
  { id: 'sponsor', label: '赞助', description: '支持项目开发', keywords: ['收款码', '支持'] },
  { id: 'data', label: '数据', description: '导入、导出、备份与恢复', keywords: ['导入', '导出', '备份', '恢复默认', '统计'] },
];

export const SETTINGS_TAB_EVENT = 'yue:open-settings-tab';

export interface SettingsOpenRequest {
  tab: SettingsTabId;
  section?: string;
}

export function requestSettingsTab(tab: SettingsTabId) {
  window.dispatchEvent(new CustomEvent<SettingsOpenRequest>(SETTINGS_TAB_EVENT, { detail: { tab } }));
}

export function requestSettingsSection(tab: SettingsTabId, section: string) {
  window.dispatchEvent(new CustomEvent<SettingsOpenRequest>(SETTINGS_TAB_EVENT, { detail: { tab, section } }));
}
