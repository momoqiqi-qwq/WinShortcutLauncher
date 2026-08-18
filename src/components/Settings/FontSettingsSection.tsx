import { Check, RotateCcw, Type } from 'lucide-react';
import { useMemo } from 'react';
import { useAppStore } from '../../stores/appStore';
import type { FontApplyArea } from '../../types';

const FONT_PRESETS = [
  {
    label: '微软雅黑 UI',
    value: '"Microsoft YaHei UI", "Microsoft YaHei", sans-serif',
    hint: 'Windows 中文界面清晰稳定',
  },
  {
    label: 'Segoe UI',
    value: '"Segoe UI", "Microsoft YaHei UI", sans-serif',
    hint: '适合英文、数字和按钮界面',
  },
  {
    label: 'HarmonyOS Sans',
    value: '"HarmonyOS Sans SC", "HarmonyOS Sans", "Microsoft YaHei UI", sans-serif',
    hint: '现代、紧凑的中文无衬线字体',
  },
  {
    label: 'MiSans',
    value: 'MiSans, "Microsoft YaHei UI", sans-serif',
    hint: '小字号显示简洁，未安装时自动回退',
  },
  {
    label: '思源黑体',
    value: '"Source Han Sans SC", "Noto Sans CJK SC", "Microsoft YaHei UI", sans-serif',
    hint: '中英文覆盖完整，适合长时间阅读',
  },
  {
    label: '苹方',
    value: '"PingFang SC", "Microsoft YaHei UI", sans-serif',
    hint: '安装或系统支持时使用，其他情况自动回退',
  },
  {
    label: '霞鹜文楷',
    value: '"LXGW WenKai Screen", "LXGW WenKai", "Microsoft YaHei UI", sans-serif',
    hint: '适合便签和阅读区域',
  },
  {
    label: 'Cascadia Mono',
    value: '"Cascadia Mono", Consolas, "Microsoft YaHei UI", monospace',
    hint: '等宽字体，适合路径、命令和便签',
  },
] as const;

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
  const selectedPreset = useMemo(
    () => FONT_PRESETS.find((preset) => preset.value === fontFamily)?.label,
    [fontFamily],
  );

  function choosePreset(value: string) {
    updateDisplay({
      fontFamily: value,
      fontApplyAreas: selectedAreas.length ? selectedAreas : [...ALL_FONT_AREAS],
    });
  }

  function toggleArea(area: FontApplyArea) {
    const next = selectedAreas.includes(area)
      ? selectedAreas.filter((item) => item !== area)
      : [...selectedAreas, area];
    updateDisplay({ fontApplyAreas: next });
  }

  function resetToTheme() {
    updateDisplay({ fontFamily: '', fontApplyAreas: [] });
  }

  const previewFont = fontFamily || 'var(--font-family)';
  const customEnabled = Boolean(fontFamily && selectedAreas.length);

  return (
    <div className="settings-category-grid font-settings-grid">
      <section className="settings-section font-preset-section">
        <div className="settings-section-title-row">
          <div>
            <h3><Type size={17} /> 常用字体</h3>
            <p className="settings-hint">使用电脑中已经安装的字体；字体不存在时会按后面的字体自动回退，不会影响启动。</p>
          </div>
          <button type="button" className="btn-secondary btn-compact" onClick={resetToTheme}>
            <RotateCcw size={13} /> 跟随主题
          </button>
        </div>
        <div className="font-preset-grid">
          {FONT_PRESETS.map((preset) => (
            <button
              type="button"
              key={preset.label}
              className={`font-preset-card ${fontFamily === preset.value ? 'active' : ''}`}
              style={{ fontFamily: preset.value }}
              onClick={() => choosePreset(preset.value)}
            >
              <span className="font-preset-check" aria-hidden="true">{fontFamily === preset.value && <Check size={14} />}</span>
              <strong>{preset.label}</strong>
              <small>{preset.hint}</small>
              <em>中文 Aa 123</em>
            </button>
          ))}
        </div>
      </section>

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

      <section className="settings-section font-preview-section">
        <div className="settings-section-title-row">
          <div>
            <h3>字体预览</h3>
            <p className="settings-hint">当前选择：{selectedPreset ?? (fontFamily ? '自定义字体' : '主题字体')}</p>
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
