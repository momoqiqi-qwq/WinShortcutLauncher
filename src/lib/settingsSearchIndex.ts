import type { SettingsTabId } from '../types';
import { matchSettingsText, normalizeSettingsQuery } from './settingsSearch';

export interface SettingsSearchItem {
  id: string;
  label: string;
  description: string;
  tab: SettingsTabId;
  section?: string;
  focusText?: string;
  targetId?: string;
  keywords: string[];
}

export const SETTINGS_SEARCH_ITEMS: SettingsSearchItem[] = [
  { id: 'theme-preset', label: '主题与配色', description: '切换内置主题和扩展主题', tab: 'general', focusText: '主题', keywords: ['深色', '浅色', '颜色', '外观'] },
  { id: 'ui-scale', label: '界面缩放', description: '调整主界面和设置界面的缩放', tab: 'interface', section: 'scale', focusText: '缩放', keywords: ['大小', 'ui scale', '设置缩放'] },
  { id: 'main-background', label: '主界面背景 / 动态壁纸', description: '背景图片、视频、位置、透明度和模糊', tab: 'interface', section: 'background', focusText: '主界面背景', keywords: ['壁纸', '视频', '透明度', '模糊', 'background'] },
  { id: 'settings-background', label: '设置窗口背景', description: '独立背景、面板不透明度与可调玻璃效果', tab: 'interface', section: 'settingsBackground', focusText: '设置面板外观', keywords: ['毛玻璃', '玻璃', '透明', '不透明度', '模糊', '饱和度', '高光', '壁纸'] },
  { id: 'scrollbar', label: '滚动条样式', description: '滚动条宽度、圆角和主题颜色', tab: 'interface', section: 'scrollbar', focusText: '滚动条', keywords: ['滚动', 'scrollbar', '圆角'] },
  { id: 'sidebar', label: '侧栏尺寸', description: '子目录侧栏宽度、间距和字体', tab: 'interface', section: 'sidebar', focusText: '侧栏', keywords: ['子目录', '宽度', '间距'] },
  { id: 'topbar', label: '顶部父目录标签', description: '标签宽度、高度、间距、字体、边框、颜色强度和形状', tab: 'interface', section: 'topbar', focusText: '父目录', keywords: ['顶栏', '标签', '宽度', '高度', '间距', '字体', '边框', '颜色', '彩色', '形状'] },
  { id: 'window-controls', label: '右上角功能按钮', description: '按钮大小、样式、显示和排序', tab: 'interface', section: 'controls', focusText: '功能按钮', keywords: ['右上角', '隐藏按钮', '设置快捷入口'] },
  { id: 'font-family', label: '自定义字体', description: '设置字体和生效区域', tab: 'font', focusText: '字体', keywords: ['微软雅黑', 'Segoe UI', 'MiSans', '思源'] },
  { id: 'icon-provider', label: '网站图标来源', description: 'Favicon 来源、测速和缓存', tab: 'icons', focusText: '图标', keywords: ['favicon', '网站图标', '缓存', '测速'] },
  { id: 'rainbow-effects', label: '彩虹特效', description: '鼠标、拖尾、边框和文字彩虹', tab: 'rainbow', section: 'main', focusText: '开启彩虹效果', targetId: 'rainbow-effects', keywords: ['鼠标', '拖尾', '边框', '文字'] },
  { id: 'launch-mode', label: '单击 / 双击启动', description: '调整项目启动方式', tab: 'behavior', section: 'launchClose', focusText: '启动方式', targetId: 'launch-mode', keywords: ['单击', '双击', 'launch'] },
  { id: 'url-browser-mode', label: '浏览器路由中心', description: '默认 / 前台 / 指定浏览器，Profile、多账号与自定义浏览器', tab: 'behavior', section: 'launchClose', focusText: '浏览器路由中心', targetId: 'url-browser-mode', keywords: ['浏览器', '默认浏览器', '前台浏览器', '指定浏览器', '网址', 'browser', 'profile', 'floorp', 'chrome', 'edge', 'firefox', '账号'] },
  { id: 'edge-dock', label: '窗口贴边隐藏', description: '贴边触发、隐藏延迟和边缘宽度', tab: 'behavior', section: 'edgeAutoHide', focusText: '自动贴边隐藏', targetId: 'edge-dock', keywords: ['边缘', '隐藏', '自动贴边'] },
  { id: 'autostart', label: '开机自动启动', description: '跟随 Windows 启动', tab: 'behavior', section: 'launchClose', focusText: '开机自启动', targetId: 'autostart', keywords: ['自启动', '开机启动'] },
  { id: 'always-on-top', label: '窗口置顶', description: '保持主窗口在其他窗口上方', tab: 'window', focusText: '窗口置顶', keywords: ['always on top', '最前', '图钉'] },
  { id: 'snapback', label: '窗口回弹动画', description: '拖出屏幕后回弹与速度', tab: 'window', focusText: '回弹', keywords: ['弹回', '屏幕外', '动画'] },
  { id: 'settings-panel-adaptive', label: '设置面板自动适配', description: '控制设置窗口是否自动适配主窗口大小', tab: 'window', focusText: '设置面板自动适配', keywords: ['设置窗口', '自适应', 'adaptive', '大小'] },
  { id: 'settings-panel-remember-bounds', label: '记住设置面板大小和位置', description: '固定尺寸模式下记住设置窗口的尺寸与位置', tab: 'window', focusText: '记住设置面板', keywords: ['设置窗口', '尺寸', '位置', '记住'] },
  { id: 'drag-long-press', label: '长按拖动时间', description: '单击启动模式下的拖动触发时间', tab: 'drag', focusText: '长按', keywords: ['拖动', '排序', '抖动'] },
  { id: 'drag-website-rename', label: '拖入网站后重命名', description: '浏览器或 .url 拖入后默认弹出重命名界面', tab: 'drag', focusText: '拖入网站', keywords: ['网站', '网址', '浏览器', '拖入', '重命名', '弹窗'] },
  { id: 'remember-page', label: '记住上次页面', description: '重新打开时恢复上次父目录和子目录', tab: 'experience', focusText: '记住', keywords: ['恢复', '父目录', '子目录'] },
  { id: 'reduce-motion', label: '减少界面动画', description: '降低动画强度，偏向稳定与性能', tab: 'experience', focusText: '动画', keywords: ['性能', '低性能', 'reduce motion'] },
  { id: 'compact-settings', label: '设置简洁模式', description: '紧凑分类并隐藏辅助描述', tab: 'experience', focusText: '设置', keywords: ['简洁', '描述', '紧凑'] },
  { id: 'directory-create', label: '新建子目录行为', description: '命名、重名编号和创建后切换', tab: 'navigation', focusText: '新建', keywords: ['子目录', '重名', '编号'] },
  { id: 'directory-count', label: '子目录项目数量', description: '在侧栏显示项目或便签行数', tab: 'navigation', focusText: '数量', keywords: ['侧栏', '项目数', '行数'] },
  { id: 'parent-group-colors', label: '父目录配色', description: '给每个父目录单独设置背景颜色或一键彩色分组', tab: 'navigation', focusText: '父目录配色', keywords: ['父目录', '颜色', '背景色', '彩色', '分组框', '色板'] },
  { id: 'parent-group-browser-route', label: '父目录默认浏览器', description: '给父目录设置默认浏览器和 Profile，让其中网址自动继承', tab: 'navigation', focusText: '父目录默认浏览器', keywords: ['父目录', '浏览器', 'profile', '账号', '继承', 'floorp'] },
  { id: 'context-menu-visibility', label: '右键菜单项目显示', description: '隐藏或恢复右键菜单功能', tab: 'contextMenus', focusText: '右键菜单', keywords: ['隐藏', '菜单', '图标', '紧凑'] },
  { id: 'keyboard-shortcuts', label: '自定义快捷键', description: '录制组合键并检查冲突', tab: 'shortcuts', focusText: '自定义快捷键', keywords: ['ctrl', 'alt', 'shift', 'win', '冲突'] },
  { id: 'note-lines', label: '便签行号', description: '便签行号、分隔线与显示范围', tab: 'notes', section: 'editor', focusText: '显示每行行号', targetId: 'note-lines', keywords: ['便签', '分界线', 'separator'] },
  { id: 'note-autosave', label: '便签自动保存', description: '调整便签保存延迟', tab: 'notes', section: 'editor', focusText: '输入后保存延迟', targetId: 'note-autosave', keywords: ['便签', '延迟'] },
  { id: 'global-search', label: '全局搜索 / 命令面板', description: '搜索项目、命令和设置', tab: 'search', section: 'search', focusText: '启用全局搜索', targetId: 'global-search', keywords: ['Ctrl+K', '命令面板', '索引', '模糊'] },
  { id: 'search-debounce', label: '搜索输入防抖', description: '调整输入后开始搜索的等待时间', tab: 'search', section: 'search', focusText: '搜索输入防抖', targetId: 'search-debounce', keywords: ['debounce', '延迟', '响应速度'] },
  { id: 'transfer-station', label: '文件中转站', description: '管理临时文件与中转内容', tab: 'transfer', section: 'station', focusText: '启用文件中转站', targetId: 'transfer-station', keywords: ['文件', '临时', '剪贴板'] },
  { id: 'transfer-show-icon', label: '中转站显示文件图标', description: '控制中转列表是否解析并显示文件图标', tab: 'transfer', section: 'station', focusText: '显示文件图标', targetId: 'transfer-show-icon', keywords: ['图标', 'icon', '中转站'] },
  { id: 'transfer-confirm-clear', label: '清空中转站前确认', description: '控制清空全部中转文件前是否二次确认', tab: 'transfer', section: 'station', focusText: '清空中转站前确认', targetId: 'transfer-confirm-clear', keywords: ['清空', '确认', '防误操作'] },
  { id: 'image-browser', label: '图片浏览设置', description: '截图、裁剪、重命名和图片管理', tab: 'image', section: 'preview', focusText: '启用右上角图片浏览器', targetId: 'image-browser', keywords: ['截图', '裁剪', '重命名'] },
  { id: 'import-center', label: '导入中心', description: '预览新增、重复、冲突并安全导入', tab: 'data', focusText: '导入中心', keywords: ['Lucy', 'Maye', 'Maya', 'JDB', 'DB', '覆盖', '合并', '冲突'] },
  { id: 'rollback-import', label: '回滚上次导入', description: '恢复到上次执行导入之前', tab: 'data', focusText: '回滚上次导入', keywords: ['恢复', '快照', '备份'] },
  { id: 'auto-save', label: '自动保存数据', description: '设置保存目录、文件名和间隔', tab: 'data', focusText: '自动保存', keywords: ['备份', '目录', '间隔'] },
  { id: 'diagnostics', label: '配置自检', description: '扫描重复、无效配置和潜在问题', tab: 'diagnostics', focusText: '自检', keywords: ['诊断', '检查', '健康'] },
];

export function searchSettingsItems(query: string, limit = 10): SettingsSearchItem[] {
  const normalized = normalizeSettingsQuery(query);
  if (!normalized) return [];
  return SETTINGS_SEARCH_ITEMS
    .map((item) => {
      const labelMatch = matchSettingsText(item.label, query);
      const descriptionMatch = matchSettingsText(item.description, query);
      const keywordMatch = item.keywords.some((keyword) => matchSettingsText(keyword, query));
      let score = 0;
      if (labelMatch === 'exact') score += 100;
      else if (labelMatch === 'prefix') score += 70;
      else if (labelMatch === 'contains') score += 50;
      if (descriptionMatch) score += 20;
      if (keywordMatch) score += 30;
      return { item, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.item.label.localeCompare(b.item.label, 'zh-CN'))
    .slice(0, limit)
    .map((entry) => entry.item);
}
