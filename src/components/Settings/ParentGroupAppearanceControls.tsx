import type { DisplaySettings } from '../../types';
import { SettingsSliderRow } from './SettingsSliderRow';
import './ParentGroupAppearanceControls.css';

interface ParentGroupAppearanceControlsProps {
  display: DisplaySettings;
  onChange: (patch: Partial<DisplaySettings>) => void;
}

const APPEARANCE_PRESETS: Array<{
  id: string;
  label: string;
  patch: Partial<DisplaySettings>;
}> = [
  {
    id: 'compact',
    label: '紧凑',
    patch: { topTabHeight: 28, topTabGap: 5, topTabFontSize: 12, topTabBorderWidth: 1, topTabColorStrength: 0.12, topTabShape: 'round' },
  },
  {
    id: 'balanced',
    label: '标准',
    patch: { topTabHeight: 32, topTabGap: 8, topTabFontSize: 14, topTabBorderWidth: 1, topTabColorStrength: 0.17, topTabShape: 'round' },
  },
  {
    id: 'cards',
    label: '彩色卡片',
    patch: { topTabHeight: 38, topTabGap: 10, topTabFontSize: 14, topTabBorderWidth: 1, topTabColorStrength: 0.28, topTabShape: 'square' },
  },
  {
    id: 'bold',
    label: '醒目',
    patch: { topTabHeight: 42, topTabGap: 10, topTabFontSize: 15, topTabBorderWidth: 2, topTabColorStrength: 0.38, topTabShape: 'round' },
  },
];

function presetMatches(display: DisplaySettings, patch: Partial<DisplaySettings>) {
  return Object.entries(patch).every(([key, value]) => display[key as keyof DisplaySettings] === value);
}

export function ParentGroupAppearanceControls({ display, onChange }: ParentGroupAppearanceControlsProps) {
  return (
    <div className="parent-group-appearance-controls">
      <div className="field-row">
        <label>外观预设</label>
        <div className="segmented segmented-wide parent-group-preset-row">
          {APPEARANCE_PRESETS.map((preset) => (
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
        <small>预设只修改父目录标签外观，不会改父目录名称、顺序或你已经选择的分组颜色。</small>
      </div>

      <label className="check-row">
        <input
          type="checkbox"
          checked={display.topTabEqualWidth}
          onChange={(event) => onChange({ topTabEqualWidth: event.target.checked })}
        />
        父目录标签等宽显示
      </label>
      <SettingsSliderRow label="父目录等宽宽度" min={64} max={280} step={4} value={display.topTabWidth} unit="px" onChange={(topTabWidth) => onChange({ topTabWidth })} />
      <SettingsSliderRow label="标签高度" min={26} max={58} step={1} value={display.topTabHeight ?? 32} unit="px" onChange={(topTabHeight) => onChange({ topTabHeight })} />
      <SettingsSliderRow label="标签间距" min={0} max={24} step={1} value={display.topTabGap ?? 8} unit="px" onChange={(topTabGap) => onChange({ topTabGap })} />
      <SettingsSliderRow label="标签文字大小" min={10} max={22} step={1} value={display.topTabFontSize ?? 14} unit="px" onChange={(topTabFontSize) => onChange({ topTabFontSize })} />
      <SettingsSliderRow label="边框粗细" min={0} max={4} step={1} value={display.topTabBorderWidth ?? 1} unit="px" onChange={(topTabBorderWidth) => onChange({ topTabBorderWidth })} />
      <SettingsSliderRow
        label="自定义颜色填充强度"
        min={4}
        max={55}
        step={1}
        value={Math.round((display.topTabColorStrength ?? 0.17) * 100)}
        unit="%"
        onChange={(value) => onChange({ topTabColorStrength: value / 100 })}
      />

      <div className="field-row">
        <label>分组框形状</label>
        <div className="segmented segmented-wide">
          <button type="button" className={display.topTabShape === 'round' ? 'active' : ''} onClick={() => onChange({ topTabShape: 'round' })}>圆角</button>
          <button type="button" className={display.topTabShape === 'square' ? 'active' : ''} onClick={() => onChange({ topTabShape: 'square' })}>方形</button>
        </div>
      </div>
    </div>
  );
}
