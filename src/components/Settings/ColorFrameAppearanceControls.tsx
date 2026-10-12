import type { DisplaySettings } from '../../types';
import { SettingsSliderRow } from './SettingsSliderRow';
import './ColorFrameAppearanceControls.css';

interface ColorFrameAppearanceControlsProps {
  display: DisplaySettings;
  onChange: (patch: Partial<DisplaySettings>) => void;
}

// v147: 子目录标签与项目卡片的彩色框外观预设（对应「子目录与项目配色」里选中的颜色）。
const FRAME_PRESETS: Array<{
  id: string;
  label: string;
  patch: Partial<DisplaySettings>;
}> = [
  {
    id: 'subtle',
    label: '淡描边',
    patch: { colorFrameBorderWidth: 1, colorFrameColorStrength: 0.12, colorFrameShape: 'round' },
  },
  {
    id: 'balanced',
    label: '标准',
    patch: { colorFrameBorderWidth: 1, colorFrameColorStrength: 0.17, colorFrameShape: 'round' },
  },
  {
    id: 'cards',
    label: '彩色卡片',
    patch: { colorFrameBorderWidth: 1, colorFrameColorStrength: 0.28, colorFrameShape: 'square' },
  },
  {
    id: 'bold',
    label: '醒目',
    patch: { colorFrameBorderWidth: 2, colorFrameColorStrength: 0.38, colorFrameShape: 'square' },
  },
];

function presetMatches(display: DisplaySettings, patch: Partial<DisplaySettings>) {
  return Object.entries(patch).every(([key, value]) => display[key as keyof DisplaySettings] === value);
}

export function ColorFrameAppearanceControls({ display, onChange }: ColorFrameAppearanceControlsProps) {
  return (
    <div className="color-frame-appearance-controls">
      <div className="field-row">
        <label>外观预设</label>
        <div className="segmented segmented-wide color-frame-preset-row">
          {FRAME_PRESETS.map((preset) => (
            <button
              type="button"
              key={preset.id}
              className={presetMatches(display, preset.patch) ? 'active' : ''}
              onClick={() => onChange(preset.patch)}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <small>预设只修改彩色框的粗细、浓度和形状，不会改子目录或项目上已经选好的颜色。</small>
      </div>

      <SettingsSliderRow label="边框粗细" min={0} max={4} step={1} value={display.colorFrameBorderWidth ?? 1} unit="px" onChange={(colorFrameBorderWidth) => onChange({ colorFrameBorderWidth })} />
      <SettingsSliderRow
        label="自定义颜色填充强度"
        min={4}
        max={55}
        step={1}
        value={Math.round((display.colorFrameColorStrength ?? 0.17) * 100)}
        unit="%"
        onChange={(value) => onChange({ colorFrameColorStrength: value / 100 })}
      />

      <div className="field-row">
        <label>彩色框形状</label>
        <div className="segmented segmented-wide">
          <button type="button" className={display.colorFrameShape !== 'square' ? 'active' : ''} onClick={() => onChange({ colorFrameShape: 'round' })}>圆角</button>
          <button type="button" className={display.colorFrameShape === 'square' ? 'active' : ''} onClick={() => onChange({ colorFrameShape: 'square' })}>方形</button>
        </div>
        <small>只影响已经上色的子目录和项目；没上色的仍按「子目录圆角」和默认卡片圆角显示。</small>
      </div>
    </div>
  );
}
