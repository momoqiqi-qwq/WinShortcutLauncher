import type { CSSProperties } from 'react';
import { useAppStore } from '../../stores/appStore';
import { SliderRow } from './SettingsPrimitives';

export function DragSettingsSection() {
  const behavior = useAppStore((state) => state.behavior);
  const updateBehavior = useAppStore((state) => state.updateBehavior);
  return (
    <section className="settings-section narrow-section">
      <h3>拖动</h3>
      <p className="settings-hint">调整项目拖动排序，以及从浏览器拖入网站后的行为。启用单击启动时，需长按后再拖动。</p>
      <label className="check-row">
        <input type="checkbox" checked={behavior.promptRenameDroppedWebsite !== false} onChange={(event) => updateBehavior({ promptRenameDroppedWebsite: event.target.checked })} />
        拖入网站后显示重命名界面
      </label>
      <p className="settings-hint">默认开启。关闭后，拖入网页会直接使用浏览器提供的名称或域名，不再弹出重命名界面。</p>
      <SliderRow label="项目长按进入拖动" min={80} max={1200} step={10} value={behavior.itemDragLongPressMs ?? 220} unit=" ms" onChange={(value) => updateBehavior({ itemDragLongPressMs: value })} />
      <SliderRow label="拖动前允许抖动" min={2} max={28} step={1} value={behavior.itemDragTolerance ?? 10} unit=" px" onChange={(value) => updateBehavior({ itemDragTolerance: value })} />
      <div className="settings-subtitle settings-subtitle-spaced">拖动外观</div>
      <div className="field-row"><label>拖动时项目背景颜色</label><div className="color-pick-row"><input type="color" value={behavior.itemDragBackgroundColor || '#5b8def'} onChange={(event) => updateBehavior({ itemDragBackgroundColor: event.target.value })} /><span className="settings-hint">拖动中的项目底色</span></div></div>
      <div className="field-row"><label>拖动时发光颜色</label><div className="color-pick-row"><input type="color" value={behavior.itemDragGlowColor || '#5b8def'} onChange={(event) => updateBehavior({ itemDragGlowColor: event.target.value })} /><span className="settings-hint">拖动边缘和光晕颜色</span></div></div>
      <SliderRow label="拖动发光亮度" min={0} max={1} step={0.05} value={Number((behavior.itemDragGlowBrightness ?? 0.72).toFixed(2))} onChange={(value) => updateBehavior({ itemDragGlowBrightness: Math.round(value * 100) / 100 })} />
      <div className="drag-preview-wrap"><div className="drag-preview-card" style={{ '--item-drag-bg': behavior.itemDragBackgroundColor || '#5b8def', '--item-drag-glow': behavior.itemDragGlowColor || '#5b8def', '--item-drag-glow-brightness': String(behavior.itemDragGlowBrightness ?? 0.72) } as CSSProperties}><span className="drag-preview-icon">Aa</span><span>拖动效果预览</span></div></div>
    </section>
  );
}
