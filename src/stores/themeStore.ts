import { useEffect } from 'react';
import { useAppStore } from './appStore';
import { getTheme } from '../themes';
import { toOpaqueThemeSurface } from '../lib/themeColors';

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
    document.documentElement.style.setProperty('--window-opacity', String(opacity));
    document.documentElement.style.setProperty('--window-opacity-percent', `${Math.round(opacity * 100)}%`);
  }, [themeId, opacity]);
}
