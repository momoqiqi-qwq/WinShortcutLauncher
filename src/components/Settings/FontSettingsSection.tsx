import { useAppStore } from '../../stores/appStore';
import type { FontApplyArea } from '../../types';
import { SettingsSliderRow } from './SettingsSliderRow';

const FONT_AREAS: Array<{ id: FontApplyArea; label: string; hint: string }> = [
  { id: 'main', label: '主界面', hint: '父目录、子目录、项目名称和浮层' },
  { id: 'settings', label: '设置界面', hint: '设置分类、说明和输入控件' },
  { id: 'menus', label: '右键菜单', hint: '项目、目录和便签右键菜单' },
  { id: 'notes', label: '便签正文', hint: '便签编辑器、行号和标题' },
];

const ALL_FONT_AREAS = FONT_AREAS.map((item) => item.id);

export function FontSettingsSection() {
  const display = useAppStore((state) => state.display);
  const updateDisplay = useAppStore((state) => state.updateDisplay);
  const selectedAreas = display.fontApplyAreas ?? [];
  const fontFamily = display.fontFamily ?? '';

  function toggleArea(area: FontApplyArea) {
    const next = selectedAreas.includes(area)
      ? selectedAreas.filter((item) => item !== area)
      : [...selectedAreas, area];
    updateDisplay({ fontApplyAreas: next });
  }

  const previewFont = fontFamily || 'var(--font-family)';
  const customEnabled = Boolean(fontFamily && selectedAreas.length);

  return (
    <div className="settings-category-grid font-settings-grid">
      <section className="settings-section narrow-section">
        <h3>自定义字体</h3>
        <label className="field-row font-family-input-row">
          <span>字体名称或 CSS 字体栈</span>
          <input
            type="text"
            value={fontFamily}
            onChange={(event) => updateDisplay({ fontFamily: event.target.value })}
            placeholder='例如："Microsoft YaHei UI", sans-serif'
          />
          <small>可以填写一个字体名称，也可以用英文逗号填写多个回退字体。选择常用字体后也可继续修改。</small>
        </label>
      </section>

      <section className="settings-section narrow-section">
        <div className="settings-section-title-row">
          <div>
            <h3>生效区域</h3>
            <p className="settings-hint">同一种字体可以只用于需要的区域，未勾选区域继续使用主题字体。</p>
          </div>
          <span className={`diagnostic-result-badge ${customEnabled ? 'healthy' : 'warning'}`}>
            {fontFamily ? `${selectedAreas.length}/4 生效` : '跟随主题'}
          </span>
        </div>
        <div className="font-scope-actions settings-inline-actions">
          <button type="button" className="btn-secondary btn-compact" onClick={() => updateDisplay({ fontApplyAreas: [...ALL_FONT_AREAS] })}>全部区域</button>
          <button type="button" className="btn-secondary btn-compact" onClick={() => updateDisplay({ fontApplyAreas: ['main'] })}>仅主界面</button>
          <button type="button" className="btn-secondary btn-compact" onClick={() => updateDisplay({ fontApplyAreas: [] })}>暂不启用</button>
        </div>
        <div className="font-scope-grid">
          {FONT_AREAS.map((area) => (
            <label key={area.id} className={`font-scope-card ${selectedAreas.includes(area.id) ? 'active' : ''}`}>
              <span className="font-scope-copy"><strong>{area.label}</strong><small>{area.hint}</small></span>
              <input type="checkbox" checked={selectedAreas.includes(area.id)} onChange={() => toggleArea(area.id)} />
            </label>
          ))}
        </div>
      </section>

      <section className="settings-section narrow-section" id="settings-font-item-name-display">
        <div className="settings-section-title-row">
          <div>
            <h3>项目名称显示</h3>
            <p className="settings-hint">控制项目名称是否完整展示，以及每行大约显示多少个中文字符后换行。</p>
          </div>
        </div>
        <label className="experience-toggle-card" id="font-show-full-item-name" data-settings-target="font-show-full-item-name">
          <span className="experience-toggle-copy">
            <strong>完整显示项目名称</strong>
            <small>开启后不再受“全局显示行数”截断，长名称会继续向下换行显示完整。</small>
          </span>
          <input
            type="checkbox"
            checked={display.showFullItemName === true}
            onChange={(event) => updateDisplay({ showFullItemName: event.target.checked })}
          />
        </label>
        <div id="font-chars-per-line" data-settings-target="font-chars-per-line">
          <SettingsSliderRow
            label="每行字数（换行）"
            min={4}
            max={20}
            value={display.charsPerLine}
            onChange={(value) => updateDisplay({ charsPerLine: value })}
          />
        </div>
        <p className="settings-hint">关闭完整显示时，项目名称仍会按照“界面 → 文字与项目布局 → 全局显示行数”限制最大行数。</p>
      </section>

      <section className="settings-section narrow-section" id="settings-font-sidebar-name-display">
        <div className="settings-section-title-row">
          <div>
            <h3>子目录名称显示</h3>
            <p className="settings-hint">控制左侧子目录名称是否完整展示，不受“子目录名称行数”截断。</p>
          </div>
        </div>
        <label className="experience-toggle-card" id="font-show-full-sidebar-names" data-settings-target="font-show-full-sidebar-names">
          <span className="experience-toggle-copy">
            <strong>完整显示子目录名称</strong>
            <small>开启后子目录名称完整换行显示，不再省略；也可以在侧栏空白处右键菜单中切换。</small>
          </span>
          <input
            type="checkbox"
            checked={display.sidebarShowFullNames === true}
            onChange={(event) => updateDisplay({ sidebarShowFullNames: event.target.checked })}
          />
        </label>
        <p className="settings-hint">关闭时子目录名称按照“界面 → 侧栏布局 → 子目录名称行数”限制最大行数。</p>
      </section>

      <section className="settings-section font-preview-section">
        <div className="settings-section-title-row">
          <div>
            <h3>字体预览</h3>
            <p className="settings-hint">当前选择：{fontFamily ? '自定义字体' : '主题字体'}</p>
          </div>
        </div>
        <div className="font-preview-card" style={{ fontFamily: previewFont }}>
          <strong>月启动器 · Yue Launcher</strong>
          <span>快速打开文件、网址、系统功能与便签</span>
          <code>C:\Work\Project · 0123456789</code>
        </div>
      </section>
    </div>
  );
}
