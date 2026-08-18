import { useState, type CSSProperties, type ReactNode } from 'react';
import type { RainbowBorderMode, RainbowCursorStyle, RainbowSettings } from '../../types';

type RainbowBlockId = 'main' | 'cursor' | 'border' | 'text' | 'colors';
const BLOCKS: RainbowBlockId[] = ['main', 'cursor', 'border', 'text', 'colors'];
const DEFAULT_COLLAPSED = new Set<RainbowBlockId>(BLOCKS);

function SliderRow({ label, value, min, max, step = 1, unit = '', disabled, onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className="field-row">
      <label>{label}：{value}{unit}</label>
      <input type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} />
    </div>
  );
}

function ColorListEditor({ label, colors, onChange }: { label: string; colors: string[]; onChange: (colors: string[]) => void }) {
  const safeColors = colors.length ? colors : ['#ff3b30', '#ffcc00', '#34c759', '#007aff', '#af52de'];
  function setColor(index: number, color: string) {
    const next = safeColors.slice();
    next[index] = color;
    onChange(next);
  }
  function addColor() {
    onChange([...safeColors, safeColors[safeColors.length - 1] || '#ffffff'].slice(0, 12));
  }
  function removeColor(index: number) {
    if (safeColors.length <= 2) return;
    onChange(safeColors.filter((_, i) => i !== index));
  }
  const gradient = `linear-gradient(90deg, ${safeColors.join(', ')})`;
  return (
    <div className="rainbow-color-editor">
      <div className="settings-subtitle settings-subtitle-spaced">{label}</div>
      <div className="rainbow-color-bar" style={{ '--rainbow-preview-gradient': gradient } as CSSProperties}>
        <span className="rainbow-range-line rainbow-range-line-left" />
        <span className="rainbow-range-line rainbow-range-line-right" />
      </div>
      <div className="rainbow-color-inputs">
        {safeColors.map((color, index) => (
          <span key={`${color}-${index}`} className="rainbow-color-chip">
            <input type="color" value={color} onChange={(event) => setColor(index, event.target.value)} />
            <button type="button" className="btn-secondary btn-mini" disabled={safeColors.length <= 2} onClick={() => removeColor(index)}>删</button>
          </span>
        ))}
        <button type="button" className="btn-secondary btn-mini" disabled={safeColors.length >= 12} onClick={addColor}>加颜色</button>
      </div>
      <p className="settings-hint">v68 先恢复稳定版颜色条：颜色只在这一组颜色内循环。后续可以再做可拖动双竖线精细截取。</p>
    </div>
  );
}

function CollapseBlock({ id, title, collapsed, onToggle, children }: {
  id: RainbowBlockId;
  title: string;
  collapsed: boolean;
  onToggle: (id: RainbowBlockId) => void;
  children: ReactNode;
}) {
  return (
    <div className="settings-collapse-block" data-settings-section={id}>
      <button type="button" className="settings-collapse-header" aria-expanded={!collapsed} onClick={() => onToggle(id)}>
        <span className="settings-collapse-arrow" aria-hidden="true">{collapsed ? '▸' : '▾'}</span>
        <span className="settings-collapse-title">{title}</span>
      </button>
      {!collapsed && <div className="settings-collapse-content">{children}</div>}
    </div>
  );
}

export function RainbowSettingsSection({ rainbow, onChangeRainbow }: {
  rainbow: RainbowSettings;
  onChangeRainbow: (patch: Partial<RainbowSettings>) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<RainbowBlockId>>(DEFAULT_COLLAPSED);
  function toggle(id: RainbowBlockId) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  const disabled = !rainbow.enabled;
  return (
    <section className="settings-section settings-section-stack narrow-section rainbow-settings-section">
      <div className="settings-section-title-row">
        <h3>彩虹</h3>
        <span className="settings-hint">鼠标、边框、文字</span>
      </div>
      <div className="settings-collapse-tools settings-collapse-tools-spread">
        <span className="settings-hint">默认全部折叠，减少设置页拥挤。</span>
        <span className="settings-collapse-actions">
          <button className="btn-secondary btn-compact" onClick={() => setCollapsed(new Set(BLOCKS))}>全部收起</button>
          <button className="btn-secondary btn-compact" onClick={() => setCollapsed(new Set())}>全部展开</button>
        </span>
      </div>

      <CollapseBlock id="main" title="彩虹总开关" collapsed={collapsed.has('main')} onToggle={toggle}>
        <label className="check-row" data-settings-target="rainbow-effects" data-settings-focus="开启彩虹效果">
          <input type="checkbox" checked={rainbow.enabled} onChange={(event) => onChangeRainbow({ enabled: event.target.checked })} />
          开启彩虹效果
        </label>
        <p className="settings-hint">第一次打开软件默认关闭；已有配置继续保持原来的开关状态。</p>
      </CollapseBlock>

      <CollapseBlock id="cursor" title="彩虹鼠标与拖尾" collapsed={collapsed.has('cursor')} onToggle={toggle}>
        <label className="check-row"><input type="checkbox" checked={rainbow.cursorEnabled} disabled={disabled} onChange={(event) => onChangeRainbow({ cursorEnabled: event.target.checked })} />启用自定义彩虹鼠标</label>
        <label className="check-row"><input type="checkbox" checked={rainbow.trailEnabled} disabled={disabled} onChange={(event) => onChangeRainbow({ trailEnabled: event.target.checked })} />启用彩虹拖尾</label>
        <div className="field-row">
          <label>鼠标样式</label>
          <select className="soft-input" value={rainbow.cursorStyle} disabled={disabled || !rainbow.cursorEnabled} onChange={(event) => onChangeRainbow({ cursorStyle: event.target.value as RainbowCursorStyle })}>
            <option value="dot-ring">彩点 + 光环</option>
            <option value="windows-outline">Windows 箭头边框炫彩</option>
            <option value="windows-full">Windows 箭头全炫彩</option>
            <option value="windows-inside">Windows 箭头内部炫彩</option>
            <option value="mac-ring">macOS 旋转圆</option>
          </select>
        </div>
        <SliderRow label="鼠标样式大小" min={8} max={72} value={rainbow.cursorSize} unit=" px" disabled={disabled} onChange={(value) => onChangeRainbow({ cursorSize: value })} />
        <SliderRow label="拖尾数量" min={0} max={80} value={rainbow.trailCount} disabled={disabled} onChange={(value) => onChangeRainbow({ trailCount: value })} />
        <SliderRow label="拖尾停留时间" min={120} max={2500} step={20} value={rainbow.trailDurationMs} unit=" ms" disabled={disabled} onChange={(value) => onChangeRainbow({ trailDurationMs: value })} />
        <SliderRow label="拖尾大小" min={2} max={40} value={rainbow.trailSize} unit=" px" disabled={disabled} onChange={(value) => onChangeRainbow({ trailSize: value })} />
        <SliderRow label="拖尾亮度" min={0} max={1.4} step={0.05} value={Number(rainbow.trailBrightness.toFixed(2))} disabled={disabled} onChange={(value) => onChangeRainbow({ trailBrightness: value })} />
      </CollapseBlock>

      <CollapseBlock id="border" title="炫彩边框" collapsed={collapsed.has('border')} onToggle={toggle}>
        <label className="check-row"><input type="checkbox" checked={rainbow.borderEnabled} disabled={disabled} onChange={(event) => onChangeRainbow({ borderEnabled: event.target.checked })} />启用边框炫彩</label>
        <div className="field-row">
          <label>边框模式</label>
          <select className="soft-input" value={rainbow.borderMode} disabled={disabled || !rainbow.borderEnabled} onChange={(event) => onChangeRainbow({ borderMode: event.target.value as RainbowBorderMode })}>
            <option value="rotate">旋转流动</option>
            <option value="static">固定不旋转</option>
            <option value="fixed-flow">边框固定流动</option>
          </select>
        </div>
        <SliderRow label="边框动画速度" min={3} max={120} value={rainbow.borderSpeedSeconds} unit=" 秒" disabled={disabled} onChange={(value) => onChangeRainbow({ borderSpeedSeconds: value })} />
        <SliderRow label="边框宽度" min={0} max={8} value={rainbow.borderWidth} unit=" px" disabled={disabled} onChange={(value) => onChangeRainbow({ borderWidth: value })} />
        <SliderRow label="边框亮度" min={0} max={1.5} step={0.05} value={Number(rainbow.borderBrightness.toFixed(2))} disabled={disabled} onChange={(value) => onChangeRainbow({ borderBrightness: value })} />
      </CollapseBlock>

      <CollapseBlock id="text" title="彩虹文字" collapsed={collapsed.has('text')} onToggle={toggle}>
        <label className="check-row"><input type="checkbox" checked={rainbow.textEnabled} disabled={disabled} onChange={(event) => onChangeRainbow({ textEnabled: event.target.checked })} />启用彩虹文字渐变</label>
        <label className="check-row"><input type="checkbox" checked={rainbow.textOnGroups} disabled={disabled || !rainbow.textEnabled} onChange={(event) => onChangeRainbow({ textOnGroups: event.target.checked })} />在父目录生效</label>
        <label className="check-row"><input type="checkbox" checked={rainbow.textOnDirectories} disabled={disabled || !rainbow.textEnabled} onChange={(event) => onChangeRainbow({ textOnDirectories: event.target.checked })} />在子目录生效</label>
        <label className="check-row"><input type="checkbox" checked={rainbow.textOnSettings} disabled={disabled || !rainbow.textEnabled} onChange={(event) => onChangeRainbow({ textOnSettings: event.target.checked })} />在设置界面生效</label>
        <SliderRow label="文字渐变速度" min={8} max={180} value={rainbow.textSpeedSeconds} unit=" 秒" disabled={disabled} onChange={(value) => onChangeRainbow({ textSpeedSeconds: value })} />
      </CollapseBlock>

      <CollapseBlock id="colors" title="颜色条" collapsed={collapsed.has('colors')} onToggle={toggle}>
        <ColorListEditor label="鼠标颜色条" colors={rainbow.cursorColors} onChange={(colors) => onChangeRainbow({ cursorColors: colors })} />
        <ColorListEditor label="边框颜色条" colors={rainbow.borderColors} onChange={(colors) => onChangeRainbow({ borderColors: colors })} />
        <ColorListEditor label="文字颜色条" colors={rainbow.textColors} onChange={(colors) => onChangeRainbow({ textColors: colors })} />
      </CollapseBlock>
    </section>
  );
}
