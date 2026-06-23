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
];

export function installThemePreset(theme: ThemePreset) {
  const root = document.documentElement;
  Object.entries(theme.vars).forEach(([key, value]) => root.style.setProperty(key, value));
  root.dataset.theme = theme.id;
}
