import type { CSSProperties } from 'react';
import { MORE_THEMES, installThemePreset } from '../../themes/moreThemes';
import { useAppStore } from '../../stores/appStore';
import type { ThemePreset } from '../../utils/v16Types';
import './ThemeGallerySection.css';

interface Props {
  currentTheme?: string;
  onSelectTheme: (theme: ThemePreset) => void;
}

/* v137: 迷你界面模拟图，配色直接取自主题 vars，替代旧的抽象色条预览。 */
function ThemeMockup({ vars }: { vars: Record<string, string> }) {
  const style = {
    '--tm-bg': vars['--bg'],
    '--tm-panel': vars['--panel'],
    '--tm-panel2': vars['--panel-2'],
    '--tm-text': vars['--text'],
    '--tm-border': vars['--border'],
    '--tm-accent': vars['--accent'],
  } as CSSProperties;

  return (
    <span className="theme-mockup" style={style} aria-hidden>
      <span className="tm-top">
        <i className="tm-dot" />
        <i className="tm-search" />
      </span>
      <span className="tm-body">
        <i className="tm-side" />
        <span className="tm-tiles">
          <i />
          <i />
          <i />
          <i className="tm-accent" />
        </span>
      </span>
    </span>
  );
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
            title={theme.description}
            onClick={() => {
              installThemePreset(theme);
              onSelectTheme(theme);
            }}
          >
            <ThemeMockup vars={theme.vars} />
            <strong>{theme.name}</strong>
            <small>{theme.description}</small>
          </button>
        ))}
      </div>
    </section>
  );
}
