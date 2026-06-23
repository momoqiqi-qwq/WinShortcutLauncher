import { useEffect } from 'react';
import { useAppStore } from './appStore';
import { getTheme } from '../themes';

export function useThemeInstaller() {
  const themeId = useAppStore((state) => state.theme);
  const opacity = useAppStore((state) => state.windowState.opacity);

  useEffect(() => {
    const theme = getTheme(themeId);
    document.documentElement.dataset.theme = theme.id;
    for (const [name, value] of Object.entries(theme.variables)) {
      document.documentElement.style.setProperty(name, value);
    }
    document.documentElement.style.setProperty('--window-opacity', String(opacity));
    document.documentElement.style.setProperty('--window-opacity-percent', `${Math.round(opacity * 100)}%`);
  }, [themeId, opacity]);
}
