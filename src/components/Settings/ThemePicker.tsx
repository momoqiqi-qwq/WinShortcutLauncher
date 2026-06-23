import { themes } from '../../themes';
import { MORE_THEMES } from '../../themes/moreThemes';
import { useAppStore } from '../../stores/appStore';

const moreThemeIds = new Set(MORE_THEMES.map((theme) => theme.id));
const BUILT_IN_THEMES = themes.filter((entry) => !moreThemeIds.has(entry.id));

export function ThemePicker() {
  const theme = useAppStore((state) => state.theme);
  const setTheme = useAppStore((state) => state.setTheme);
  const opacity = useAppStore((state) => state.windowState.opacity);
  const updateWindowState = useAppStore((state) => state.updateWindowState);

  return (
    <section className="settings-section">
      <h3>外观</h3>
      <div className="theme-grid">
        {BUILT_IN_THEMES.map((entry) => (
          <button
            key={entry.id}
            className={`theme-tile ${theme === entry.id ? 'active' : ''}`}
            onClick={() => setTheme(entry.id)}
          >
            <span
              className="theme-swatch"
              style={{
                background: entry.variables['--bg'],
                borderColor: entry.variables['--accent'],
                color: entry.variables['--accent']
              }}
            >
              Aa
            </span>
            <strong>{entry.name}</strong>
            <small>{entry.preview}</small>
          </button>
        ))}
      </div>
      <div className="field-row">
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
    </section>
  );
}
