import { useAppStore } from '../../stores/appStore';

export function WindowBehaviorSettingsSection() {
  const behavior = useAppStore((state) => state.behavior);
  const updateBehavior = useAppStore((state) => state.updateBehavior);
  return (
    <section className="settings-section narrow-section">
      <h3>窗口行为</h3>
      <div className="window-state-location-hint">主窗口大小的“手动保存、启动恢复、关机保存”已集中到 <strong>设置 - 操作 - 窗口大小保存与恢复</strong>。</div>
      <div className="window-state-location-hint" data-settings-focus="设置面板布局"><strong>设置面板布局</strong>：下面两个开关现在直接控制设置窗口的自适应、拖动与尺寸位置记忆。</div>
      <label className="check-row"><input type="checkbox" checked={behavior.settingsPanelAdaptiveSize !== false} onChange={(event) => updateBehavior({ settingsPanelAdaptiveSize: event.target.checked })} />设置面板自动适配主窗口大小</label>
      <p className="settings-hint">开启时设置面板会随主窗口可用区域自动调整；关闭后可使用固定尺寸并拖动位置。</p>
      <label className="check-row"><input type="checkbox" checked={behavior.rememberSettingsPanelBounds !== false} disabled={behavior.settingsPanelAdaptiveSize !== false} onChange={(event) => updateBehavior({ rememberSettingsPanelBounds: event.target.checked })} />记住设置面板大小和位置</label>
      <p className="settings-hint">仅在关闭“自动适配”后使用；开启后会记住手动调整的设置面板尺寸和位置。</p>
      <label className="check-row"><input type="checkbox" checked={behavior.alwaysOnTop === true} onChange={(event) => updateBehavior({ alwaysOnTop: event.target.checked })} />窗口置顶</label>
      <p className="settings-hint">与右上角图钉和“切换窗口置顶”快捷键使用同一设置，修改后立即生效。</p>
      <label className="check-row"><input type="checkbox" checked={(behavior.autoEdgeHide ?? true) && (behavior.autoEdgeBounce ?? true)} onChange={(event) => updateBehavior({ autoEdgeHide: event.target.checked, autoEdgeBounce: event.target.checked })} />自动回弹</label>
      <p className="settings-hint">开启后，把主窗口拖出屏幕超过 20px 会自动隐藏到对应边缘，只保留一条可触发区域；鼠标移入保留区域后 200ms 平滑回弹。</p>
      <label className="check-row"><input type="checkbox" checked={behavior.autoEdgeSnapBack === true} onChange={(event) => updateBehavior({ autoEdgeSnapBack: event.target.checked })} />窗口拖出屏幕时弹回屏幕内</label>
      <p className="settings-hint">开启后，把 exe 界面一部分拖到屏幕外会直接弹回屏幕内。左侧超出时左边缘对齐屏幕左边缘；鼠标还在 exe 界面内时不会触发隐藏。</p>
      <label className="check-row"><input type="checkbox" checked={behavior.autoEdgeSnapBackAnimation !== false} disabled={behavior.autoEdgeSnapBack !== true} onChange={(event) => updateBehavior({ autoEdgeSnapBackAnimation: event.target.checked })} />拖出屏幕弹回时使用流畅动画</label>
      <p className="settings-hint">开启后，窗口弹回屏幕内会平滑滑回；关闭后立即回到屏幕内。</p>
      <div className="field-row"><label>弹回动画时长：{behavior.autoEdgeSnapBackAnimationMs ?? 220} ms</label><input type="range" min={80} max={600} step={10} value={behavior.autoEdgeSnapBackAnimationMs ?? 220} disabled={behavior.autoEdgeSnapBack !== true || behavior.autoEdgeSnapBackAnimation === false} onChange={(event) => updateBehavior({ autoEdgeSnapBackAnimationMs: Number(event.target.value) })} /><small>数值越小越快，数值越大越柔和；默认 220ms。</small></div>
      <div className="field-row"><label>隐藏延迟：{behavior.autoEdgeHideDelay ?? 1000} ms</label><input type="range" min={0} max={5000} step={100} value={behavior.autoEdgeHideDelay ?? 1000} disabled={!((behavior.autoEdgeHide ?? true) && (behavior.autoEdgeBounce ?? true))} onChange={(event) => updateBehavior({ autoEdgeHideDelay: Number(event.target.value) })} /><small>0ms 表示拖出阈值后立即隐藏；默认 1000ms。</small></div>
      <div className="field-row"><label>保留边缘：{behavior.edgeVisiblePixels ?? 5} px</label><input type="range" min={2} max={24} step={1} value={behavior.edgeVisiblePixels ?? 5} disabled={!((behavior.autoEdgeHide ?? true) && (behavior.autoEdgeBounce ?? true))} onChange={(event) => updateBehavior({ edgeVisiblePixels: Number(event.target.value) })} /><small>拖出屏幕后仍保留在屏幕内的可见宽度，默认 5px。</small></div>
    </section>
  );
}
