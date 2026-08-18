import type { ThemePreset } from '../utils/v16Types';

export const MORE_THEMES: ThemePreset[] = [
  {
    id: 'midnight-blue',
    name: '午夜蓝',
    description: '深蓝背景 + 冷色高亮，适合夜间使用',
    vars: {
      '--bg': '#08111f', '--panel': '#101b2d', '--panel-2': '#16263d', '--text': '#e7f0ff', '--muted': '#8aa2c8', '--border': 'rgba(141,171,218,.22)', '--accent': '#6ea8ff', '--accent-contrast': '#06101f'
    },
    preview: { bg: '#08111f', panel: '#101b2d', accent: '#6ea8ff', text: '#e7f0ff' },
  },
  {
    id: 'graphite',
    name: '石墨黑',
    description: '低对比深灰，减少视觉疲劳',
    vars: {
      '--bg': '#151515', '--panel': '#202020', '--panel-2': '#2a2a2a', '--text': '#f0f0f0', '--muted': '#a1a1a1', '--border': 'rgba(255,255,255,.12)', '--accent': '#8aa0ff', '--accent-contrast': '#101010'
    },
    preview: { bg: '#151515', panel: '#202020', accent: '#8aa0ff', text: '#f0f0f0' },
  },
  {
    id: 'glass-blue',
    name: '玻璃蓝',
    description: '半透明蓝灰 + 轻毛玻璃',
    vars: {
      '--bg': '#eaf3ff', '--panel': 'rgba(255,255,255,.62)', '--panel-2': 'rgba(221,235,255,.72)', '--text': '#13213a', '--muted': '#61708a', '--border': 'rgba(52,95,150,.18)', '--accent': '#3d7cff', '--accent-contrast': '#ffffff', '--panel-blur': '18px'
    },
    preview: { bg: '#eaf3ff', panel: '#ffffff', accent: '#3d7cff', text: '#13213a' },
  },
  {
    id: 'paper-cream',
    name: '纸张奶油',
    description: '温暖浅色，适合写作和便签',
    vars: {
      '--bg': '#fbf4e8', '--panel': '#fffaf2', '--panel-2': '#f1e3cf', '--text': '#3d2d20', '--muted': '#7b6552', '--border': 'rgba(128,89,47,.18)', '--accent': '#c36d2c', '--accent-contrast': '#fff8ef'
    },
    preview: { bg: '#fbf4e8', panel: '#fffaf2', accent: '#c36d2c', text: '#3d2d20' },
  },
  {
    id: 'rose-pine',
    name: '玫瑰松木',
    description: '紫灰底 + 玫瑰强调色',
    vars: {
      '--bg': '#191724', '--panel': '#1f1d2e', '--panel-2': '#26233a', '--text': '#e0def4', '--muted': '#908caa', '--border': 'rgba(224,222,244,.12)', '--accent': '#eb6f92', '--accent-contrast': '#191724'
    },
    preview: { bg: '#191724', panel: '#1f1d2e', accent: '#eb6f92', text: '#e0def4' },
  },
  {
    id: 'catppuccin-mocha',
    name: '猫布奇诺 Mocha',
    description: '柔和深色 + 粉蓝强调',
    vars: {
      '--bg': '#1e1e2e', '--panel': '#252536', '--panel-2': '#313244', '--text': '#cdd6f4', '--muted': '#a6adc8', '--border': 'rgba(205,214,244,.14)', '--accent': '#89b4fa', '--accent-contrast': '#11111b'
    },
    preview: { bg: '#1e1e2e', panel: '#252536', accent: '#89b4fa', text: '#cdd6f4' },
  },
  {
    id: 'matrix-soft',
    name: '柔和矩阵',
    description: '黑绿科技感，但降低刺眼程度',
    vars: {
      '--bg': '#020604', '--panel': '#07110b', '--panel-2': '#0b1c11', '--text': '#d4ffe1', '--muted': '#74b987', '--border': 'rgba(0,255,65,.18)', '--accent': '#00ff41', '--accent-contrast': '#001b08', '--font-family': 'Cascadia Mono, Consolas, monospace'
    },
    preview: { bg: '#020604', panel: '#07110b', accent: '#00ff41', text: '#d4ffe1' },
  },
  {
    id: 'ocean-light',
    name: '海洋浅色',
    description: '白蓝清爽办公主题',
    vars: {
      '--bg': '#f6fbff', '--panel': '#ffffff', '--panel-2': '#e8f4ff', '--text': '#102033', '--muted': '#5b728f', '--border': 'rgba(43,101,153,.16)', '--accent': '#118bd2', '--accent-contrast': '#ffffff'
    },
    preview: { bg: '#f6fbff', panel: '#ffffff', accent: '#118bd2', text: '#102033' },
  },
  {
    id: 'amethyst',
    name: '紫晶',
    description: '深紫 + 蓝紫高亮',
    vars: {
      '--bg': '#130d21', '--panel': '#201633', '--panel-2': '#2b1d45', '--text': '#f3ebff', '--muted': '#ad9bc9', '--border': 'rgba(197,166,255,.16)', '--accent': '#a78bfa', '--accent-contrast': '#10091d'
    },
    preview: { bg: '#130d21', panel: '#201633', accent: '#a78bfa', text: '#f3ebff' },
  },
  {
    id: 'win11-mica',
    name: 'Win11 Mica',
    description: 'Windows 11 风格浅灰半透明',
    vars: {
      '--bg': '#f2f2f2', '--panel': 'rgba(255,255,255,.72)', '--panel-2': 'rgba(240,244,250,.82)', '--text': '#1b1b1b', '--muted': '#6b6b6b', '--border': 'rgba(0,0,0,.10)', '--accent': '#0067c0', '--accent-contrast': '#ffffff', '--panel-blur': '20px'
    },
    preview: { bg: '#f2f2f2', panel: '#ffffff', accent: '#0067c0', text: '#1b1b1b' },
  },
  {
    id: 'sunset',
    name: '日落橙紫',
    description: '暖色渐变感，适合背景图片叠加',
    vars: {
      '--bg': '#24121f', '--panel': '#2f1b2c', '--panel-2': '#44223b', '--text': '#fff2f7', '--muted': '#d0a6b6', '--border': 'rgba(255,169,104,.16)', '--accent': '#ff9f5a', '--accent-contrast': '#221018'
    },
    preview: { bg: '#24121f', panel: '#2f1b2c', accent: '#ff9f5a', text: '#fff2f7' },
  },
  {
    id: 'mint-light',
    name: '薄荷浅色',
    description: '清新绿色浅色主题',
    vars: {
      '--bg': '#f2fff8', '--panel': '#ffffff', '--panel-2': '#dcf8ea', '--text': '#133126', '--muted': '#5e7b70', '--border': 'rgba(36,120,80,.15)', '--accent': '#20b26b', '--accent-contrast': '#ffffff'
    },
    preview: { bg: '#f2fff8', panel: '#ffffff', accent: '#20b26b', text: '#133126' },
  },

  {
    id: 'aurora-night',
    name: '极光夜幕',
    description: '深夜蓝绿 + 极光青紫高亮',
    vars: {
      '--bg': '#071018', '--panel': '#0d1a25', '--panel-2': '#13283a', '--text': '#e9fff8', '--muted': '#89b8b0', '--border': 'rgba(99,255,214,.16)', '--accent': '#41f4c8', '--accent-contrast': '#04110f'
    },
    preview: { bg: '#071018', panel: '#0d1a25', accent: '#41f4c8', text: '#e9fff8' },
  },
  {
    id: 'tokyo-night',
    name: '东京夜色',
    description: '蓝黑底 + 粉紫霓虹',
    vars: {
      '--bg': '#101421', '--panel': '#171c2d', '--panel-2': '#22283b', '--text': '#dbe6ff', '--muted': '#8d9cc9', '--border': 'rgba(156,175,255,.15)', '--accent': '#bb9af7', '--accent-contrast': '#111421'
    },
    preview: { bg: '#101421', panel: '#171c2d', accent: '#bb9af7', text: '#dbe6ff' },
  },
  {
    id: 'neon-lime',
    name: '霓虹青柠',
    description: '黑灰底 + 青柠绿高亮',
    vars: {
      '--bg': '#070807', '--panel': '#101310', '--panel-2': '#192019', '--text': '#f3fff3', '--muted': '#9ed49e', '--border': 'rgba(180,255,80,.16)', '--accent': '#b8ff3d', '--accent-contrast': '#101500'
    },
    preview: { bg: '#070807', panel: '#101310', accent: '#b8ff3d', text: '#f3fff3' },
  },
  {
    id: 'obsidian-purple',
    name: '黑曜紫',
    description: '黑曜石质感 + 紫粉光',
    vars: {
      '--bg': '#0b0712', '--panel': '#14101c', '--panel-2': '#20182d', '--text': '#f6efff', '--muted': '#bca8d6', '--border': 'rgba(205,163,255,.15)', '--accent': '#d66bff', '--accent-contrast': '#13071b'
    },
    preview: { bg: '#0b0712', panel: '#14101c', accent: '#d66bff', text: '#f6efff' },
  },
  {
    id: 'carbon-orange',
    name: '碳纤橙',
    description: '深碳灰 + 工业橙',
    vars: {
      '--bg': '#111111', '--panel': '#1b1b1b', '--panel-2': '#27221d', '--text': '#f3f0ec', '--muted': '#b2aaa2', '--border': 'rgba(255,150,70,.16)', '--accent': '#ff8a2a', '--accent-contrast': '#1b0d03'
    },
    preview: { bg: '#111111', panel: '#1b1b1b', accent: '#ff8a2a', text: '#f3f0ec' },
  },
  {
    id: 'coffee-brown',
    name: '咖啡棕',
    description: '温暖咖啡色，适合长期使用',
    vars: {
      '--bg': '#211811', '--panel': '#2b2017', '--panel-2': '#38291e', '--text': '#fff0df', '--muted': '#c2a98f', '--border': 'rgba(222,166,100,.18)', '--accent': '#d99a55', '--accent-contrast': '#1f1208'
    },
    preview: { bg: '#211811', panel: '#2b2017', accent: '#d99a55', text: '#fff0df' },
  },
  {
    id: 'ice-blue',
    name: '冰川蓝',
    description: '冷白浅蓝 + 清透高亮',
    vars: {
      '--bg': '#f1f8ff', '--panel': '#ffffff', '--panel-2': '#e1efff', '--text': '#10253d', '--muted': '#607a99', '--border': 'rgba(55,123,190,.16)', '--accent': '#3aa0ff', '--accent-contrast': '#ffffff'
    },
    preview: { bg: '#f1f8ff', panel: '#ffffff', accent: '#3aa0ff', text: '#10253d' },
  },
  {
    id: 'peach-light',
    name: '蜜桃浅色',
    description: '柔和粉橙，界面更轻快',
    vars: {
      '--bg': '#fff5f0', '--panel': '#ffffff', '--panel-2': '#ffe4d8', '--text': '#3b211a', '--muted': '#8b6b60', '--border': 'rgba(204,93,58,.16)', '--accent': '#ff7a59', '--accent-contrast': '#ffffff'
    },
    preview: { bg: '#fff5f0', panel: '#ffffff', accent: '#ff7a59', text: '#3b211a' },
  },
  {
    id: 'lavender-light',
    name: '薰衣草浅色',
    description: '浅紫灰 + 柔和紫色高亮',
    vars: {
      '--bg': '#f8f5ff', '--panel': '#ffffff', '--panel-2': '#ebe3ff', '--text': '#251d36', '--muted': '#756b8c', '--border': 'rgba(124,87,190,.15)', '--accent': '#8b5cf6', '--accent-contrast': '#ffffff'
    },
    preview: { bg: '#f8f5ff', panel: '#ffffff', accent: '#8b5cf6', text: '#251d36' },
  },
  {
    id: 'forest-dark',
    name: '森林深绿',
    description: '深绿背景 + 苔藓色高亮',
    vars: {
      '--bg': '#07110c', '--panel': '#0e1c13', '--panel-2': '#162719', '--text': '#efffed', '--muted': '#95bc97', '--border': 'rgba(120,210,130,.15)', '--accent': '#7ddc75', '--accent-contrast': '#061008'
    },
    preview: { bg: '#07110c', panel: '#0e1c13', accent: '#7ddc75', text: '#efffed' },
  },
  {
    id: 'steel-gray',
    name: '钢铁灰',
    description: '中性灰黑 + 蓝灰高亮',
    vars: {
      '--bg': '#181b20', '--panel': '#22262d', '--panel-2': '#2d333c', '--text': '#eef2f7', '--muted': '#a7b0bd', '--border': 'rgba(200,215,235,.14)', '--accent': '#8fb3df', '--accent-contrast': '#11161d'
    },
    preview: { bg: '#181b20', panel: '#22262d', accent: '#8fb3df', text: '#eef2f7' },
  },
  {
    id: 'berry-pop',
    name: '莓果气泡',
    description: '紫红深色 + 亮粉高亮',
    vars: {
      '--bg': '#1a0c18', '--panel': '#251223', '--panel-2': '#351a32', '--text': '#fff0fb', '--muted': '#d59bc7', '--border': 'rgba(255,111,200,.15)', '--accent': '#ff65c8', '--accent-contrast': '#1a0714'
    },
    preview: { bg: '#1a0c18', panel: '#251223', accent: '#ff65c8', text: '#fff0fb' },
  },
  {
    id: 'terminal-amber',
    name: '终端琥珀',
    description: '复古黑底 + 琥珀文字光',
    vars: {
      '--bg': '#090704', '--panel': '#14100a', '--panel-2': '#20180d', '--text': '#fff3d1', '--muted': '#cc9b50', '--border': 'rgba(255,176,58,.18)', '--accent': '#ffb23a', '--accent-contrast': '#180d00', '--font-family': 'Cascadia Mono, Consolas, Microsoft YaHei UI, monospace'
    },
    preview: { bg: '#090704', panel: '#14100a', accent: '#ffb23a', text: '#fff3d1' },
  },
  {
    id: 'deep-sea',
    name: '深海蓝绿',
    description: '墨蓝深海 + 青绿光',
    vars: {
      '--bg': '#03141a', '--panel': '#08212a', '--panel-2': '#0d2d38', '--text': '#e4fbff', '--muted': '#8bb8c0', '--border': 'rgba(84,214,230,.15)', '--accent': '#36d6e7', '--accent-contrast': '#031117'
    },
    preview: { bg: '#03141a', panel: '#08212a', accent: '#36d6e7', text: '#e4fbff' },
  },
  {
    id: 'sakura-light',
    name: '樱花浅粉',
    description: '浅粉白 + 樱花色按钮',
    vars: {
      '--bg': '#fff7fb', '--panel': '#ffffff', '--panel-2': '#ffe5f0', '--text': '#3c1d2b', '--muted': '#896276', '--border': 'rgba(211,92,135,.16)', '--accent': '#f36f9d', '--accent-contrast': '#ffffff'
    },
    preview: { bg: '#fff7fb', panel: '#ffffff', accent: '#f36f9d', text: '#3c1d2b' },
  },
  {
    id: 'sandstone',
    name: '砂岩米色',
    description: '米色背景 + 土黄强调',
    vars: {
      '--bg': '#f5efe4', '--panel': '#fffaf1', '--panel-2': '#eadcc6', '--text': '#352719', '--muted': '#806f5a', '--border': 'rgba(137,99,49,.16)', '--accent': '#b88332', '--accent-contrast': '#fff8ef'
    },
    preview: { bg: '#f5efe4', panel: '#fffaf1', accent: '#b88332', text: '#352719' },
  },
  {
    id: 'slate-violet',
    name: '板岩紫蓝',
    description: '板岩灰 + 蓝紫高亮',
    vars: {
      '--bg': '#111827', '--panel': '#1f2937', '--panel-2': '#273449', '--text': '#f4f7fb', '--muted': '#b1bbca', '--border': 'rgba(167,139,250,.15)', '--accent': '#818cf8', '--accent-contrast': '#101522'
    },
    preview: { bg: '#111827', panel: '#1f2937', accent: '#818cf8', text: '#f4f7fb' },
  },
  {
    id: 'ruby-dark',
    name: '红宝石夜',
    description: '深红黑 + 宝石红高亮',
    vars: {
      '--bg': '#12070a', '--panel': '#1d0d12', '--panel-2': '#2b141b', '--text': '#fff1f3', '--muted': '#d19aa4', '--border': 'rgba(255,98,124,.15)', '--accent': '#ff4d6d', '--accent-contrast': '#19060a'
    },
    preview: { bg: '#12070a', panel: '#1d0d12', accent: '#ff4d6d', text: '#fff1f3' },
  },
  {
    id: 'cloud-gray',
    name: '云雾灰白',
    description: '轻灰白办公主题，更干净',
    vars: {
      '--bg': '#f7f8fa', '--panel': '#ffffff', '--panel-2': '#eef1f5', '--text': '#202733', '--muted': '#697386', '--border': 'rgba(29,43,67,.12)', '--accent': '#6476ff', '--accent-contrast': '#ffffff'
    },
    preview: { bg: '#f7f8fa', panel: '#ffffff', accent: '#6476ff', text: '#202733' },
  },
];

export function installThemePreset(theme: ThemePreset) {
  const root = document.documentElement;
  Object.entries(theme.vars).forEach(([key, value]) => root.style.setProperty(key, value));
  root.dataset.theme = theme.id;
}
