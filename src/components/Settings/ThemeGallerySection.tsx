import { MORE_THEMES, installThemePreset } from '../../themes/moreThemes';
import type { ThemePreset } from '../../utils/v16Types';
import './ThemeGallerySection.css';

interface Props {
  currentTheme?: string;
  onSelectTheme: (theme: ThemePreset) => void;
}

export function ThemeGallerySection({ currentTheme, onSelectTheme }: Props) {
  return (
    <section className="settings-card">
      <h3>更多主题</h3>
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
