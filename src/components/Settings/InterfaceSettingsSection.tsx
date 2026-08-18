import { RotateCcw } from 'lucide-react';
import { showLauncherNotice } from '../../lib/notify';
import { useAppStore } from '../../stores/appStore';
import { DisplaySettings, type InterfaceSectionId } from './DisplaySettings';
import { RESET_SETTINGS_PANEL_LAYOUT_EVENT } from './useSettingsPanelLayout';

export function InterfaceSettingsSection({ requestedSection, onRequestedSectionHandled }: { requestedSection?: string | null; onRequestedSectionHandled?: () => void }) {
  const display = useAppStore((state) => state.display);
  const updateDisplay = useAppStore((state) => state.updateDisplay);

  function resetSettingsPanelLayout() {
    window.dispatchEvent(new Event(RESET_SETTINGS_PANEL_LAYOUT_EVENT));
    showLauncherNotice('已重置设置分类滚动位置');
  }

  return (
    <div className="settings-category-grid">
      <DisplaySettings requestedSection={requestedSection as InterfaceSectionId | null | undefined} onRequestedSectionHandled={onRequestedSectionHandled} />
      <section className="settings-section narrow-section">
        <div className="settings-section-title-row">
          <h3>设置窗口布局</h3>
          <button type="button" className="btn-secondary btn-compact" onClick={resetSettingsPanelLayout}>
            <RotateCcw size={13} /> 重置滚动位置
          </button>
        </div>
        <div className="settings-layout-help-card">
          <strong>固定居中</strong>
          <span>设置窗口始终固定在 exe 主界面正中央，不支持拖动或自由缩放，避免误操作后找不到窗口。</span>
        </div>
        <div className="settings-layout-help-card">
          <strong>独立滚动</strong>
          <span>左侧设置分类和右侧设置内容分别提供滚动条；分类较多时可直接滚动查看，不会再被窗口高度截断。</span>
        </div>
        <div className="settings-layout-help-card">
          <strong>主窗口最小尺寸</strong>
          <span>exe 主界面最低保持 900 × 640；界面缩放范围为 x0.1–x1.8。</span>
        </div>
      </section>
      <section className="settings-section narrow-section">
        <h3>提示气泡</h3>
        <div className="field-row">
          <label>提示显示时间：{display.toastDurationMs ?? 2400} ms</label>
          <input type="range" min={500} max={10000} step={100} value={display.toastDurationMs ?? 2400} onChange={(event) => updateDisplay({ toastDurationMs: Number(event.target.value) })} />
          <small>控制底部红色/普通提示自动消失的时间。</small>
        </div>
      </section>
    </div>
  );
}
