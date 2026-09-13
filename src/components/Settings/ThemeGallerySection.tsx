import { MORE_THEMES, installThemePreset } from '../../themes/moreThemes';
import { useAppStore } from '../../stores/appStore';
import type { ThemePreset } from '../../utils/v16Types';
import './ThemeGallerySection.css';

interface Props {
  currentTheme?: string;
  onSelectTheme: (theme: ThemePreset) => void;
}

export function ThemeGallerySection({ currentTheme, onSelectTheme }: Props) {
  const opacity = useAppStore((state) => state.windowState.opacity);
  const updateWindowState = useAppStore((state) => state.updateWindowState);

  return (
    <section className="settings-card">
      <h3>主题</h3>
      <div className="field-row theme-opacity-row">
        <label>窗口透明度：{Math.round(opacity * 100)}%</label>
        <input
          type="range"
          min={0.68}
          max={1}
          step={0.01}
          value={opacity}
          onChange={(event) => updateWindowState({ opacity: Number(event.target.value) })}
        />
      </div>
      <div className="theme-gallery">
        {MORE_THEMES.map((theme) => (
          <button
            key={theme.id}
            className={`theme-card ${currentTheme === theme.id ? 'active' : ''}`}
            onClick={() => {
              installThemePreset(theme);
              onSelectTheme(theme);
            }}
          >
            <span className="theme-preview" style={{ background: theme.preview?.bg }}>
              <i style={{ background: theme.preview?.panel }} />
              <i style={{ background: theme.preview?.accent }} />
              <i style={{ background: theme.preview?.text }} />
            </span>
            <strong>{theme.name}</strong>
            <small>{theme.description}</small>
          </button>
        ))}
      </div>
    </section>
  );
}
