import type { DisplaySettings } from '../../types';
import { SettingsSliderRow } from './SettingsSliderRow';
import './SettingsSurfaceAppearanceControls.css';

const OPACITY_PRESETS = [100, 90, 75, 60] as const;
const GLASS_PRESETS = [
  { id: 'soft', label: '轻柔', blur: 12, saturation: 1.12, highlight: 0.34 },
  { id: 'balanced', label: '标准', blur: 22, saturation: 1.32, highlight: 0.72 },
  { id: 'strong', label: '强烈', blur: 32, saturation: 1.55, highlight: 0.9 },
] as const;

export function SettingsSurfaceAppearanceControls({ display, onChange }: {
  display: DisplaySettings;
  onChange: (patch: Partial<DisplaySettings>) => void;
}) {
  const opacityPercent = Math.round((display.settingsBackgroundPanelOpacity ?? 0.9) * 100);
  const glassEnabled = display.settingsBackgroundGlassEffect === true;
  const glassBlur = display.settingsBackgroundGlassBlur ?? 22;
  const glassSaturationPercent = Math.round((display.settingsBackgroundGlassSaturation ?? 1.32) * 100);
  const glassHighlightPercent = Math.round((display.settingsBackgroundGlassHighlight ?? 0.72) * 100);
  const activeGlassPreset = GLASS_PRESETS.find((preset) =>
    preset.blur === glassBlur
    && Math.round(preset.saturation * 100) === glassSaturationPercent
    && Math.round(preset.highlight * 100) === glassHighlightPercent,
  )?.id;

  return (
    <div className="settings-surface-appearance-card">
      <div className="settings-surface-heading">
        <span>
          <strong>设置面板外观</strong>
          <small>透明度由滑块单独决定；100% 始终为真正完全不透明，玻璃感不再暗中降低 alpha。</small>
        </span>
        <output>{opacityPercent}%</output>
      </div>

      <SettingsSliderRow
        label="设置面板不透明度"
        min={20}
        max={100}
        step={5}
        value={opacityPercent}
        unit="%"
        onChange={(value) => onChange({ settingsBackgroundPanelOpacity: value / 100 })}
      />
      <div className="settings-opacity-presets" aria-label="设置面板不透明度快捷选择">
        {OPACITY_PRESETS.map((value) => (
          <button
            type="button"
            key={value}
            className={opacityPercent === value ? 'active' : ''}
            aria-pressed={opacityPercent === value}
            onClick={() => onChange({ settingsBackgroundPanelOpacity: value / 100 })}
          >
            {value === 100 ? '实色 100%' : `${value}%`}
          </button>
        ))}
      </div>

      <label className="check-row glass-effect-toggle settings-glass-main-toggle">
        <input
          type="checkbox"
          checked={glassEnabled}
          onChange={(event) => onChange({ settingsBackgroundGlassEffect: event.target.checked })}
        />
        <span>
          <strong>玻璃感</strong>
          <small>只控制模糊、饱和度、高光和玻璃边缘，不修改上面的透明度。</small>
        </span>
      </label>

      {glassEnabled && (
        <div className="settings-glass-tuning">
          <div className="settings-glass-presets" aria-label="玻璃效果快捷预设">
            <span>快捷预设</span>
            {GLASS_PRESETS.map((preset) => (
              <button
                type="button"
                key={preset.id}
                className={activeGlassPreset === preset.id ? 'active' : ''}
                aria-pressed={activeGlassPreset === preset.id}
                onClick={() => onChange({
                  settingsBackgroundGlassBlur: preset.blur,
                  settingsBackgroundGlassSaturation: preset.saturation,
                  settingsBackgroundGlassHighlight: preset.highlight,
                })}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className="settings-glass-slider-grid">
            <SettingsSliderRow
              label="玻璃模糊"
              min={0}
              max={40}
              step={1}
              value={glassBlur}
              unit="px"
              onChange={(value) => onChange({ settingsBackgroundGlassBlur: value })}
            />
            <SettingsSliderRow
              label="玻璃饱和度"
              min={100}
              max={180}
              step={2}
              value={glassSaturationPercent}
              unit="%"
              onChange={(value) => onChange({ settingsBackgroundGlassSaturation: value / 100 })}
            />
            <SettingsSliderRow
              label="高光强度"
              min={0}
              max={100}
              step={5}
              value={glassHighlightPercent}
              unit="%"
              onChange={(value) => onChange({ settingsBackgroundGlassHighlight: value / 100 })}
            />
          </div>
        </div>
      )}
    </div>
  );
}
