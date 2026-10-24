import { useEffect } from 'react';
import { useAppStore } from './appStore';
import { getTheme } from '../themes';
import { toOpaqueThemeSurface, pickNativeColorScheme } from '../lib/themeColors';

export function useThemeInstaller() {
  const themeId = useAppStore((state) => state.theme);
  const opacity = useAppStore((state) => state.windowState.opacity);

  useEffect(() => {
    const theme = getTheme(themeId);
    document.documentElement.dataset.theme = theme.id;
    for (const [name, value] of Object.entries(theme.variables)) {
      document.documentElement.style.setProperty(name, value);
    }
    const themeBackground = theme.variables['--bg'] || '#ffffff';
    document.documentElement.style.setProperty('--panel-solid', toOpaqueThemeSurface(theme.variables['--panel'] || themeBackground, themeBackground));
    document.documentElement.style.setProperty('--panel-2-solid', toOpaqueThemeSurface(theme.variables['--panel-2'] || theme.variables['--panel'] || themeBackground, themeBackground));
    // v171: 原生控件（select 弹层、滚动条）的配色跟随主题明暗，
    // 否则深色主题里会弹出纯白底、却沿用主题浅色文字的列表 —— 几乎读不出来。
    document.documentElement.style.colorScheme = pickNativeColorScheme(themeBackground);
  }, [themeId]);

  useEffect(() => {
    document.documentElement.style.setProperty('--window-opacity', String(opacity));
  }, [opacity]);
}
