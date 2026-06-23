import { MORE_THEMES } from './moreThemes';

export interface ThemeDefinition {
  id: string;
  name: string;
  preview: string;
  variables: Record<string, string>;
}

export const themes: ThemeDefinition[] = [
  {
    id: 'light-cloud',
    name: '浅白云',
    preview: '纯白 + 柔和蓝灰',
    variables: {
      '--bg': '#FFFFFF',
      '--panel': '#F7FAFC',
      '--panel-2': '#EDF2F7',
      '--text': '#1A202C',
      '--muted': '#718096',
      '--border': '#DDE7F0',
      '--accent': '#5B8DEF',
      '--accent-2': '#DCEBFF',
      '--danger': '#D64545',
      '--shadow': '0 16px 40px rgba(44, 62, 80, 0.14)',
      '--font-family': 'Inter, Microsoft YaHei UI, Segoe UI, sans-serif'
    }
  },
  {
    id: 'claude',
    name: 'Claude',
    preview: '奶油色 + 橙棕',
    variables: {
      '--bg': '#F7F3EA',
      '--panel': '#FFFDF7',
      '--panel-2': '#EFE6D6',
      '--text': '#332A22',
      '--muted': '#836F5E',
      '--border': '#E0D2BF',
      '--accent': '#C36A2D',
      '--accent-2': '#F4DDC8',
      '--danger': '#B84A3A',
      '--shadow': '0 16px 40px rgba(84, 62, 38, 0.16)',
      '--font-family': 'Inter, Microsoft YaHei UI, Segoe UI, sans-serif'
    }
  },
  {
    id: 'light-gray',
    name: '浅灰',
    preview: '#F5F5F5 背景',
    variables: {
      '--bg': '#F5F5F5',
      '--panel': '#FFFFFF',
      '--panel-2': '#E9E9E9',
      '--text': '#222222',
      '--muted': '#686868',
      '--border': '#D6D6D6',
      '--accent': '#4F75FF',
      '--accent-2': '#E5EAFF',
      '--danger': '#D04444',
      '--shadow': '0 16px 40px rgba(0, 0, 0, 0.12)',
      '--font-family': 'Inter, Microsoft YaHei UI, Segoe UI, sans-serif'
    }
  },
  {
    id: 'dark-soft',
    name: '浅黑',
    preview: '#1E1E1E 背景',
    variables: {
      '--bg': '#1E1E1E',
      '--panel': '#252525',
      '--panel-2': '#313131',
      '--text': '#EEEEEE',
      '--muted': '#A6A6A6',
      '--border': '#3C3C3C',
      '--accent': '#86A8FF',
      '--accent-2': '#2C3B62',
      '--danger': '#FF6B6B',
      '--shadow': '0 18px 42px rgba(0, 0, 0, 0.28)',
      '--font-family': 'Inter, Microsoft YaHei UI, Segoe UI, sans-serif'
    }
  },
  {
    id: 'hacker',
    name: '黑客',
    preview: '黑底 + #00FF41',
    variables: {
      '--bg': '#000000',
      '--panel': '#061006',
      '--panel-2': '#0B1D0B',
      '--text': '#D9FFE3',
      '--muted': '#6DCA84',
      '--border': '#0C5F21',
      '--accent': '#00FF41',
      '--accent-2': '#003D12',
      '--danger': '#FF3B3B',
      '--shadow': '0 0 28px rgba(0, 255, 65, 0.15)',
      '--font-family': 'Cascadia Mono, Consolas, Microsoft YaHei UI, monospace'
    }
  },
  {
    id: 'nord',
    name: 'Nord',
    preview: '#2E3440 + 蓝色系',
    variables: {
      '--bg': '#2E3440',
      '--panel': '#3B4252',
      '--panel-2': '#434C5E',
      '--text': '#ECEFF4',
      '--muted': '#D8DEE9',
      '--border': '#4C566A',
      '--accent': '#88C0D0',
      '--accent-2': '#5E81AC',
      '--danger': '#BF616A',
      '--shadow': '0 18px 42px rgba(0, 0, 0, 0.28)',
      '--font-family': 'Inter, Microsoft YaHei UI, Segoe UI, sans-serif'
    }
  },
  {
    id: 'dracula',
    name: 'Dracula',
    preview: '深紫 + 粉色',
    variables: {
      '--bg': '#282A36',
      '--panel': '#343746',
      '--panel-2': '#44475A',
      '--text': '#F8F8F2',
      '--muted': '#BD93F9',
      '--border': '#55586C',
      '--accent': '#FF79C6',
      '--accent-2': '#51304A',
      '--danger': '#FF5555',
      '--shadow': '0 18px 42px rgba(0, 0, 0, 0.3)',
      '--font-family': 'Inter, Microsoft YaHei UI, Segoe UI, sans-serif'
    }
  },
  {
    id: 'solarized-light',
    name: 'Solarized Light',
    preview: '暖黄白 + 蓝绿',
    variables: {
      '--bg': '#FDF6E3',
      '--panel': '#FFF9EA',
      '--panel-2': '#EEE8D5',
      '--text': '#586E75',
      '--muted': '#839496',
      '--border': '#D8CFB1',
      '--accent': '#2AA198',
      '--accent-2': '#D9F0EA',
      '--danger': '#DC322F',
      '--shadow': '0 16px 40px rgba(88, 110, 117, 0.15)',
      '--font-family': 'Inter, Microsoft YaHei UI, Segoe UI, sans-serif'
    }
  },
  {
    id: 'material-dark',
    name: 'Material Dark',
    preview: 'Material Design 深色',
    variables: {
      '--bg': '#121212',
      '--panel': '#1E1E1E',
      '--panel-2': '#2B2B2B',
      '--text': '#F4F4F4',
      '--muted': '#B0B0B0',
      '--border': '#383838',
      '--accent': '#BB86FC',
      '--accent-2': '#382B4F',
      '--danger': '#CF6679',
      '--shadow': '0 18px 42px rgba(0, 0, 0, 0.35)',
      '--font-family': 'Inter, Microsoft YaHei UI, Segoe UI, sans-serif'
    }
  },
  {
    id: 'cyberpunk',
    name: '赛博朋克',
    preview: '深黑 + 霓虹粉黄',
    variables: {
      '--bg': '#07040E',
      '--panel': '#120A1F',
      '--panel-2': '#201130',
      '--text': '#F9F7FF',
      '--muted': '#F9E900',
      '--border': '#3B195B',
      '--accent': '#FF2BD6',
      '--accent-2': '#34102F',
      '--danger': '#FF4C4C',
      '--shadow': '0 0 34px rgba(255, 43, 214, 0.18)',
      '--font-family': 'Rajdhani, Microsoft YaHei UI, Segoe UI, sans-serif'
    }
  },
  ...MORE_THEMES.map((theme) => ({
    id: theme.id,
    name: theme.name,
    preview: theme.description,
    variables: {
      '--danger': '#EF4444',
      '--shadow': '0 18px 42px rgba(0, 0, 0, 0.24)',
      '--accent-2': 'color-mix(in srgb, var(--accent) 22%, transparent)',
      ...theme.vars
    }
  }))
];

export function getTheme(id: string): ThemeDefinition {
  return themes.find((theme) => theme.id === id) ?? themes[0];
}
