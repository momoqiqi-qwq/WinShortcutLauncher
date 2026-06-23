import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import type { NoteSettings } from '../../types';

interface NoteSettingsSectionProps {
  notes: NoteSettings;
  onChangeNotes: (patch: Partial<NoteSettings>) => void;
}

type SectionId = 'editor' | 'separator' | 'preview';
const SECTION_IDS: SectionId[] = ['editor', 'separator', 'preview'];
const STORAGE_PREFIX = 'settings.notes';

function SliderRow({ label, value, min, max, step = 1, onChange, unit = '' }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="field-row">
      <label>{label}：{value}{unit}</label>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </div>
  );
}

function SettingsCollapseBlock({ title, hint, collapsed, onToggle, children }: {
  title: string;
  hint?: string;
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="settings-collapse-block">
      <button type="button" className="settings-collapse-header" aria-expanded={!collapsed} onClick={onToggle}>
        <span className="settings-collapse-arrow" aria-hidden="true">{collapsed ? '▸' : '▾'}</span>
        <span className="settings-collapse-title">{title}</span>
        {hint && <span className="settings-collapse-hint">{hint}</span>}
      </button>
      {!collapsed && <div className="settings-collapse-content">{children}</div>}
    </div>
  );
}

function readRemember() {
  try {
    return localStorage.getItem(`${STORAGE_PREFIX}:remember`) === '1';
  } catch {
    return false;
  }
}

function readCollapsed(fallback: Set<SectionId>) {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}:collapsed`);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return fallback;
    const next = new Set(parsed.filter((id): id is SectionId => SECTION_IDS.includes(id as SectionId)));
    return next.size ? next : fallback;
  } catch {
    return fallback;
  }
}

function makeSeparator(char: string, length: number) {
  const clean = Array.from((char || '—').trim())[0] ?? '—';
  return clean.repeat(Math.max(4, Math.min(80, length)));
}

export function NoteSettingsSection({ notes, onChangeNotes }: NoteSettingsSectionProps) {
  const defaultCollapsed = () => new Set<SectionId>(SECTION_IDS);
  const [rememberCollapseState, setRememberCollapseStateValue] = useState(readRemember);
  const [collapsedSections, setCollapsedSections] = useState<Set<SectionId>>(() => readRemember() ? readCollapsed(defaultCollapsed()) : defaultCollapsed());
  const dashPreview = makeSeparator(notes.dashSeparatorChar, notes.separatorLength);
  const starPreview = makeSeparator(notes.starSeparatorChar, notes.separatorLength);

  useEffect(() => {
    if (!rememberCollapseState) {
      setCollapsedSections(defaultCollapsed());
      return;
    }
    setCollapsedSections(readCollapsed(defaultCollapsed()));
  }, [rememberCollapseState]);

  function persist(next: Set<SectionId>, remember = rememberCollapseState) {
    if (!remember) return;
    try {
      localStorage.setItem(`${STORAGE_PREFIX}:collapsed`, JSON.stringify(Array.from(next)));
    } catch {
      // ignore storage errors
    }
  }

  function setRememberCollapseState(enabled: boolean) {
    setRememberCollapseStateValue(enabled);
    try {
      localStorage.setItem(`${STORAGE_PREFIX}:remember`, enabled ? '1' : '0');
    } catch {
      // ignore storage errors
    }
    if (enabled) {
      persist(collapsedSections, true);
    } else {
      setCollapsedSections(defaultCollapsed());
    }
  }

  function applyCollapsedSections(next: Set<SectionId>) {
    setCollapsedSections(next);
    persist(next);
  }

  function toggleSection(id: SectionId) {
    setCollapsedSections((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      persist(next);
      return next;
    });
  }

  function setSeparatorChar(key: 'dashSeparatorChar' | 'starSeparatorChar', raw: string) {
    const value = Array.from(raw.trim())[0] ?? '';
    onChangeNotes({ [key]: value || (key === 'dashSeparatorChar' ? '—' : '*') } as Partial<NoteSettings>);
  }

  return (
    <section className="settings-section settings-section-stack narrow-section">
      <div className="settings-section-title-row">
        <h3>便签设置</h3>
        <span className="settings-hint">编辑器样式、保存延迟与分割线</span>
      </div>
      <div className="settings-collapse-tools settings-collapse-tools-spread">
        <label className="settings-inline-switch" title="开启后会记住此设置页每个分组的展开/收起状态；关闭后每次进入都默认全部收起。">
          <input type="checkbox" checked={rememberCollapseState} onChange={(event) => setRememberCollapseState(event.target.checked)} />
          记住展开/收起状态
        </label>
        <span className="settings-collapse-actions">
          <button className="btn-secondary btn-compact" onClick={() => applyCollapsedSections(defaultCollapsed())}>全部收起</button>
          <button className="btn-secondary btn-compact" onClick={() => applyCollapsedSections(new Set())}>全部展开</button>
        </span>
      </div>

      <SettingsCollapseBlock
        title="编辑器显示"
        hint="字体、行距、内边距"
        collapsed={collapsedSections.has('editor')}
        onToggle={() => toggleSection('editor')}
      >
        <label className="check-row">
          <input type="checkbox" checked={notes.showTitle !== false} onChange={(event) => onChangeNotes({ showTitle: event.target.checked })} />
          显示便签标题栏
        </label>
        <label className="check-row">
          <input type="checkbox" checked={notes.wrap !== false} onChange={(event) => onChangeNotes({ wrap: event.target.checked })} />
          自动换行
        </label>
        <SliderRow label="字体大小" min={10} max={32} value={notes.fontSize} unit="px" onChange={(value) => onChangeNotes({ fontSize: value })} />
        <SliderRow label="行距" min={1} max={3} step={0.05} value={notes.lineHeight} onChange={(value) => onChangeNotes({ lineHeight: Math.round(value * 100) / 100 })} />
        <SliderRow label="内边距" min={6} max={48} value={notes.padding} unit="px" onChange={(value) => onChangeNotes({ padding: value })} />
        <SliderRow label="圆角" min={0} max={40} value={notes.radius} unit="px" onChange={(value) => onChangeNotes({ radius: value })} />
        <SliderRow label="输入后保存延迟" min={120} max={3000} step={30} value={notes.autosaveDelayMs} unit="ms" onChange={(value) => onChangeNotes({ autosaveDelayMs: value })} />
      </SettingsCollapseBlock>

      <SettingsCollapseBlock
        title="右键分割线"
        hint="右键便签插入当前行"
        collapsed={collapsedSections.has('separator')}
        onToggle={() => toggleSection('separator')}
      >
        <SliderRow label="分割线长度" min={4} max={80} value={notes.separatorLength} onChange={(value) => onChangeNotes({ separatorLength: value })} />
        <div className="settings-grid two">
          <label className="field-row">
            <span>横线符号</span>
            <input value={notes.dashSeparatorChar} maxLength={2} onChange={(event) => setSeparatorChar('dashSeparatorChar', event.target.value)} />
          </label>
          <label className="field-row">
            <span>星号/其他符号</span>
            <input value={notes.starSeparatorChar} maxLength={2} onChange={(event) => setSeparatorChar('starSeparatorChar', event.target.value)} />
          </label>
        </div>
        <p className="settings-hint">右键菜单会按这里的符号和长度生成分割线；第二个符号可以改成 *、-、=、· 等。</p>
      </SettingsCollapseBlock>

      <SettingsCollapseBlock
        title="实时预览"
        collapsed={collapsedSections.has('preview')}
        onToggle={() => toggleSection('preview')}
      >
        <div
          className="note-settings-preview"
          style={{
            '--note-font-size': `${notes.fontSize}px`,
            '--note-line-height': String(notes.lineHeight),
            '--note-padding': `${notes.padding}px`,
            '--note-radius': `${notes.radius}px`,
          } as CSSProperties}
        >
          <div>便签预览：会议记录 / 待办事项</div>
          <div>{dashPreview}</div>
          <div>{starPreview}</div>
        </div>
      </SettingsCollapseBlock>
    </section>
  );
}
