import { Palette, RotateCcw, Sparkles } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useAppStore } from '../../stores/appStore';
import './ParentGroupColorSettings.css';

const GROUP_COLORS = ['#f59e0b', '#10b981', '#0ea5e9', '#8b5cf6', '#ec4899', '#f97316', '#64748b'] as const;

export function ParentGroupColorSettings() {
  const groups = useAppStore((state) => state.groups);
  const setGroupColor = useAppStore((state) => state.setGroupColor);
  const setGroupColors = useAppStore((state) => state.setGroupColors);

  function applyColorSequence(offset = 0) {
    setGroupColors(Object.fromEntries(groups.map((group, index) => [group.id, GROUP_COLORS[(index + offset) % GROUP_COLORS.length]])));
  }

  function clearAllColors() {
    setGroupColors(Object.fromEntries(groups.map((group) => [group.id, undefined])));
  }

  return (
    <section className="settings-section narrow-section experience-settings-section parent-group-color-settings">
      <div className="settings-section-title-row">
        <h3><Palette size={17} /> 父目录配色</h3>
      </div>
      <div className="experience-preset-row">
        <button className="btn-secondary btn-compact" type="button" onClick={() => applyColorSequence(0)}><Sparkles size={13} /> 一键彩色分组</button>
        <button className="btn-secondary btn-compact" type="button" onClick={() => applyColorSequence(2)}>换一组颜色</button>
        <button className="btn-secondary btn-compact" type="button" onClick={clearAllColors}><RotateCcw size={13} /> 全部跟随主题</button>
      </div>
      <p className="settings-hint">每个父目录可以单独选颜色。颜色的填充浓度、标签高度、间距、边框和形状可在“界面设置 → 父目录标签”继续调整。</p>

      <div className="parent-group-color-list">
        {groups.map((group) => (
          <div className="parent-group-color-row" key={group.id}>
            <div className="parent-group-color-name" title={group.name}>{group.name}</div>
            <input
              className="parent-group-color-picker"
              type="color"
              aria-label={`${group.name} 自定义颜色`}
              value={group.color ?? '#8b5cf6'}
              onChange={(event) => setGroupColor(group.id, event.target.value)}
            />
            <div className="parent-group-color-swatches" aria-label={`${group.name} 颜色预设`}>
              {GROUP_COLORS.slice(0, 6).map((color) => (
                <button
                  type="button"
                  key={color}
                  className={group.color?.toLowerCase() === color.toLowerCase() ? 'active' : ''}
                  style={{ '--group-swatch-color': color } as CSSProperties}
                  title={`设为 ${color}`}
                  aria-label={`${group.name} 设为 ${color}`}
                  onClick={() => setGroupColor(group.id, color)}
                />
              ))}
            </div>
            <button className="btn-secondary btn-compact parent-group-follow-theme" type="button" onClick={() => setGroupColor(group.id, undefined)}>跟主题</button>
          </div>
        ))}
      </div>
    </section>
  );
}
