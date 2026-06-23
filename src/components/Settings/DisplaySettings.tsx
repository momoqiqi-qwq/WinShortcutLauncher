import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { getEffectiveDisplay, useAppStore } from '../../stores/appStore';
import type { DisplaySettings } from '../../types';

type SectionId =
  | 'global'
  | 'scale'
  | 'menu'
  | 'scrollbar'
  | 'sidebar'
  | 'topbar'
  | 'controls'
  | 'background'
  | 'local'
  | 'preview';

const ALL_SECTION_IDS: SectionId[] = ['global', 'scale', 'menu', 'scrollbar', 'sidebar', 'topbar', 'controls', 'background', 'local', 'preview'];
const DEFAULT_COLLAPSED_SECTIONS = new Set<SectionId>(ALL_SECTION_IDS);

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

function ColorRow({ label, value, disabled, onChange, hint }: {
  label: string;
  value: string;
  disabled?: boolean;
  hint?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="field-row">
      <label>{label}</label>
      <div className="color-pick-row">
        <input type="color" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
        {hint && <span className="settings-hint">{hint}</span>}
      </div>
    </div>
  );
}

function CollapsibleSection({ id, title, hint, collapsed, onToggle, children }: {
  id: SectionId;
  title: string;
  hint?: string;
  collapsed: boolean;
  onToggle: (id: SectionId) => void;
  children: ReactNode;
}) {
  return (
    <div className="settings-collapse-block">
      <button
        type="button"
        className="settings-collapse-header"
        aria-expanded={!collapsed}
        onClick={() => onToggle(id)}
      >
        <span className="settings-collapse-arrow" aria-hidden="true">{collapsed ? '▸' : '▾'}</span>
        <span className="settings-collapse-title">{title}</span>
        {hint && <span className="settings-collapse-hint">{hint}</span>}
      </button>
      {!collapsed && <div className="settings-collapse-content">{children}</div>}
    </div>
  );
}

export function DisplaySettings() {
  const globalDisplay = useAppStore((state) => state.display);
  const activeDirectory = useAppStore((state) => state.getActiveDirectory());
  const updateDisplay = useAppStore((state) => state.updateDisplay);
  const updateDirectoryDisplay = useAppStore((state) => state.updateDirectoryDisplay);
  const clearDirectoryDisplay = useAppStore((state) => state.clearDirectoryDisplay);
  const localDisplay = getEffectiveDisplay(globalDisplay, activeDirectory);
  const localOverrideCount = activeDirectory?.display ? Object.keys(activeDirectory.display).length : 0;
  const rememberCollapseState = globalDisplay.rememberInterfaceCollapseState === true;
  const [collapsedSections, setCollapsedSections] = useState<Set<SectionId>>(() => {
    if (!globalDisplay.rememberInterfaceCollapseState) return new Set(DEFAULT_COLLAPSED_SECTIONS);
    const saved = new Set((globalDisplay.interfaceCollapsedSections ?? []).filter((id): id is SectionId => ALL_SECTION_IDS.includes(id as SectionId)));
    return saved.size ? saved : new Set(DEFAULT_COLLAPSED_SECTIONS);
  });

  useEffect(() => {
    if (!rememberCollapseState) {
      setCollapsedSections(new Set(DEFAULT_COLLAPSED_SECTIONS));
      return;
    }
    const saved = new Set((globalDisplay.interfaceCollapsedSections ?? []).filter((id): id is SectionId => ALL_SECTION_IDS.includes(id as SectionId)));
    setCollapsedSections(saved.size ? saved : new Set(DEFAULT_COLLAPSED_SECTIONS));
  }, [rememberCollapseState]);

  function setGlobal(patch: Partial<DisplaySettings>) {
    updateDisplay(patch);
  }

  function setLocal(patch: Partial<DisplaySettings>) {
    if (!activeDirectory) return;
    updateDirectoryDisplay(activeDirectory.id, patch);
  }

  function applyCollapsedSections(next: Set<SectionId>) {
    setCollapsedSections(next);
    if (rememberCollapseState) {
      updateDisplay({ interfaceCollapsedSections: Array.from(next) } as Partial<DisplaySettings>);
    }
  }

  function toggleSection(id: SectionId) {
    setCollapsedSections((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      if (rememberCollapseState) {
        updateDisplay({ interfaceCollapsedSections: Array.from(next) } as Partial<DisplaySettings>);
      }
      return next;
    });
  }

  function setRememberCollapseState(enabled: boolean) {
    if (enabled) {
      updateDisplay({ rememberInterfaceCollapseState: true, interfaceCollapsedSections: Array.from(collapsedSections) } as Partial<DisplaySettings>);
      return;
    }
    updateDisplay({ rememberInterfaceCollapseState: false, interfaceCollapsedSections: [] } as Partial<DisplaySettings>);
    setCollapsedSections(new Set(DEFAULT_COLLAPSED_SECTIONS));
  }

  async function chooseBackgroundImage() {
    const selected = await open({
      title: '选择背景图片',
      multiple: false,
      filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'svg'] }]
    });
    if (!selected || Array.isArray(selected)) return;
    updateDisplay({ backgroundImage: selected, backgroundEnabled: true });
  }

  const scrollbarThumbColor = globalDisplay.scrollbarUseThemeColor === false ? (globalDisplay.scrollbarThumbColor || '#8A8F98') : '#5B8DEF';
  const scrollbarThumbHoverColor = globalDisplay.scrollbarUseThemeColor === false ? (globalDisplay.scrollbarThumbHoverColor || '#5B8DEF') : '#3F7BEE';

  return (
    <section className="settings-section settings-section-stack">
      <div className="settings-section-title-row">
        <h3>界面设置</h3>
        <label className="settings-inline-switch" title="开启后会记住每个折叠分组的展开/收起状态；关闭后每次进入界面设置都恢复默认全部收起。">
          <input
            type="checkbox"
            checked={rememberCollapseState}
            onChange={(event) => setRememberCollapseState(event.target.checked)}
          />
          记住展开/收起状态
        </label>
      </div>
      <div className="settings-collapse-tools">
        <button className="btn-secondary btn-compact" onClick={() => applyCollapsedSections(new Set(DEFAULT_COLLAPSED_SECTIONS))}>全部收起</button>
        <button className="btn-secondary btn-compact" onClick={() => applyCollapsedSections(new Set())}>全部展开</button>
        <span className="settings-hint">默认进入此页时全部收起；打开上方开关后保留你上次的展开状态。</span>
      </div>

      <CollapsibleSection
        id="global"
        title="文字与项目布局"
        hint="统一默认设置"
        collapsed={collapsedSections.has('global')}
        onToggle={toggleSection}
      >
        <div className="settings-subtitle">统一默认设置</div>
        <div className="field-row">
          <label>全局显示行数</label>
          <div className="segmented">
            {[1, 2, 3, 4, 5].map((line) => (
              <button key={line} className={globalDisplay.labelLines === line ? 'active' : ''} onClick={() => setGlobal({ labelLines: line })}>{line}</button>
            ))}
          </div>
        </div>
        <SliderRow label="换行字数" min={4} max={20} value={globalDisplay.charsPerLine} onChange={(value) => setGlobal({ charsPerLine: value })} />
        <SliderRow label="字体大小" min={10} max={16} value={globalDisplay.fontSize} unit="px" onChange={(value) => setGlobal({ fontSize: value })} />
        <SliderRow label="图标大小" min={32} max={128} step={4} value={globalDisplay.iconSize} unit="px" onChange={(value) => setGlobal({ iconSize: value })} />
        <SliderRow label="项目占位宽度" min={72} max={260} step={4} value={globalDisplay.itemWidth} unit="px" onChange={(value) => setGlobal({ itemWidth: value })} />
        <SliderRow label="项目占位高度" min={82} max={320} step={4} value={globalDisplay.itemHeight} unit="px" onChange={(value) => setGlobal({ itemHeight: value })} />
        <SliderRow label="项目间距" min={4} max={40} step={2} value={globalDisplay.gridGap} unit="px" onChange={(value) => setGlobal({ gridGap: value })} />
      </CollapsibleSection>

      <CollapsibleSection
        id="scale"
        title="界面缩放"
        hint="主界面 / 设置界面分开缩放"
        collapsed={collapsedSections.has('scale')}
        onToggle={toggleSection}
      >
        <SliderRow label="主界面缩放" min={0.65} max={1.8} step={0.05} value={globalDisplay.mainUiScale ?? globalDisplay.uiScale ?? 1} unit="x" onChange={(value) => setGlobal({ mainUiScale: Math.round(value * 100) / 100, uiScale: Math.round(value * 100) / 100 })} />
        <SliderRow label="设置界面缩放" min={0.65} max={1.8} step={0.05} value={globalDisplay.settingsUiScale ?? globalDisplay.uiScale ?? 1} unit="x" onChange={(value) => setGlobal({ settingsUiScale: Math.round(value * 100) / 100 })} />
        <div className="button-row compact-button-row">
          <button className="btn-secondary" onClick={() => setGlobal({ mainUiScale: 1, uiScale: 1 })}>重置主界面缩放</button>
          <button className="btn-secondary" onClick={() => setGlobal({ settingsUiScale: 1 })}>重置设置缩放</button>
        </div>
        <p className="settings-hint">Ctrl + 滚轮会按鼠标所在区域分别缩放主界面或设置界面；Ctrl + 0 重置当前区域缩放。</p>
      </CollapsibleSection>

      <CollapsibleSection
        id="menu"
        title="右键菜单大小"
        collapsed={collapsedSections.has('menu')}
        onToggle={toggleSection}
      >
        <SliderRow label="菜单字体大小" min={12} max={20} step={1} value={globalDisplay.menuFontSize} unit="px" onChange={(value) => setGlobal({ menuFontSize: value })} />
        <SliderRow label="菜单行高" min={28} max={52} step={2} value={globalDisplay.menuItemHeight} unit="px" onChange={(value) => setGlobal({ menuItemHeight: value })} />
        <SliderRow label="菜单最小宽度" min={160} max={360} step={10} value={globalDisplay.menuMinWidth} unit="px" onChange={(value) => setGlobal({ menuMinWidth: value })} />
        <div className="field-row">
          <label>默认查看方式</label>
          <div className="segmented">
            <button className={globalDisplay.viewMode === 'grid' ? 'active' : ''} onClick={() => setGlobal({ viewMode: 'grid' })}>图标</button>
            <button className={globalDisplay.viewMode === 'compact' ? 'active' : ''} onClick={() => setGlobal({ viewMode: 'compact' })}>紧凑</button>
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        id="scrollbar"
        title="滚动条 / 滑动条"
        hint="左侧目录、设置页等滚动区域"
        collapsed={collapsedSections.has('scrollbar')}
        onToggle={toggleSection}
      >
        <SliderRow label="滚动条宽度" min={4} max={26} step={1} value={globalDisplay.scrollbarSize ?? 12} unit="px" onChange={(value) => setGlobal({ scrollbarSize: value })} />
        <SliderRow label="滚动条圆角" min={0} max={999} step={1} value={globalDisplay.scrollbarRadius ?? 999} unit="px" onChange={(value) => setGlobal({ scrollbarRadius: value })} />
        <label className="check-row">
          <input
            type="checkbox"
            checked={globalDisplay.scrollbarUseThemeColor !== false}
            onChange={(event) => setGlobal({ scrollbarUseThemeColor: event.target.checked })}
          />
          滑块颜色跟随当前主题 accent
        </label>
        <ColorRow
          label="滑块颜色"
          value={globalDisplay.scrollbarThumbColor || '#8A8F98'}
          disabled={globalDisplay.scrollbarUseThemeColor !== false}
          hint="关闭“跟随主题”后生效"
          onChange={(value) => setGlobal({ scrollbarThumbColor: value, scrollbarUseThemeColor: false })}
        />
        <ColorRow
          label="滑块悬停颜色"
          value={globalDisplay.scrollbarThumbHoverColor || '#5B8DEF'}
          disabled={globalDisplay.scrollbarUseThemeColor !== false}
          hint="鼠标悬停滚动条时使用"
          onChange={(value) => setGlobal({ scrollbarThumbHoverColor: value, scrollbarUseThemeColor: false })}
        />
        <ColorRow
          label="轨道颜色"
          value={globalDisplay.scrollbarTrackColor?.startsWith('#') ? globalDisplay.scrollbarTrackColor : '#2B2B2B'}
          onChange={(value) => setGlobal({ scrollbarTrackColor: value })}
        />
        <div
          className="scrollbar-preview"
          style={{
            '--scrollbar-size': `${globalDisplay.scrollbarSize ?? 12}px`,
            '--scrollbar-radius': `${globalDisplay.scrollbarRadius ?? 999}px`,
            '--scrollbar-thumb-color': scrollbarThumbColor,
            '--scrollbar-thumb-hover-color': scrollbarThumbHoverColor,
            '--scrollbar-track-color': globalDisplay.scrollbarTrackColor || 'rgba(0, 0, 0, 0.08)'
          } as CSSProperties}
        >
          <div className="scrollbar-preview-content">滚动条实时预览<br />拖动或滚动此区域查看效果<br />颜色与大小会同步到主界面、左侧目录和设置面板。</div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        id="sidebar"
        title="左侧子目录列表"
        collapsed={collapsedSections.has('sidebar')}
        onToggle={toggleSection}
      >
        <SliderRow label="左侧栏宽度" min={120} max={360} step={4} value={globalDisplay.sidebarWidth} unit="px" onChange={(value) => setGlobal({ sidebarWidth: value })} />
        <SliderRow label="子目录文字大小" min={11} max={22} step={1} value={globalDisplay.sidebarFontSize} unit="px" onChange={(value) => setGlobal({ sidebarFontSize: value })} />
        <SliderRow label="子目录项高度" min={28} max={72} step={2} value={globalDisplay.sidebarItemHeight} unit="px" onChange={(value) => setGlobal({ sidebarItemHeight: value })} />
        <SliderRow label="子目录项间距" min={0} max={24} step={1} value={globalDisplay.sidebarItemGap} unit="px" onChange={(value) => setGlobal({ sidebarItemGap: value })} />
        <SliderRow label="子目录圆角" min={0} max={28} step={1} value={globalDisplay.sidebarItemRadius} unit="px" onChange={(value) => setGlobal({ sidebarItemRadius: value })} />
      </CollapsibleSection>

      <CollapsibleSection
        id="topbar"
        title="父目录标签"
        collapsed={collapsedSections.has('topbar')}
        onToggle={toggleSection}
      >
        <label className="check-row">
          <input
            type="checkbox"
            checked={globalDisplay.topTabEqualWidth}
            onChange={(event) => setGlobal({ topTabEqualWidth: event.target.checked })}
          />
          父目录标签等宽显示
        </label>
        <SliderRow label="父目录等宽宽度" min={72} max={220} step={4} value={globalDisplay.topTabWidth} unit="px" onChange={(value) => setGlobal({ topTabWidth: value })} />
        <div className="field-row">
          <label>分组框形状</label>
          <div className="segmented segmented-wide">
            <button className={globalDisplay.topTabShape === 'round' ? 'active' : ''} onClick={() => setGlobal({ topTabShape: 'round' })}>圆角</button>
            <button className={globalDisplay.topTabShape === 'square' ? 'active' : ''} onClick={() => setGlobal({ topTabShape: 'square' })}>方形</button>
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        id="controls"
        title="右上角窗口按钮"
        hint="加号 / 设置 / 置顶 / 最小化 / 关闭"
        collapsed={collapsedSections.has('controls')}
        onToggle={toggleSection}
      >
        <div className="field-row">
          <label>按钮显示方式</label>
          <div className="segmented segmented-wide">
            <button className={globalDisplay.windowControlStyle === 'round' ? 'active' : ''} onClick={() => setGlobal({ windowControlStyle: 'round' })}>圆形</button>
            <button className={globalDisplay.windowControlStyle === 'square' ? 'active' : ''} onClick={() => setGlobal({ windowControlStyle: 'square' })}>方形</button>
            <button className={globalDisplay.windowControlStyle === 'bar' ? 'active' : ''} onClick={() => setGlobal({ windowControlStyle: 'bar' })}>横条</button>
            <button className={globalDisplay.windowControlStyle === 'pad' ? 'active' : ''} onClick={() => setGlobal({ windowControlStyle: 'pad' })}>四宫格</button>
          </div>
        </div>
        <SliderRow label="按钮大小" min={24} max={48} step={1} value={globalDisplay.windowControlSize ?? 34} unit="px" onChange={(value) => setGlobal({ windowControlSize: value })} />
        <SliderRow label="按钮间距" min={0} max={18} step={1} value={globalDisplay.windowControlGap ?? 8} unit="px" onChange={(value) => setGlobal({ windowControlGap: value })} />
        <div className={`window-control-preview window-control-preview-${globalDisplay.windowControlStyle ?? 'round'}`} style={{ '--window-control-size': `${globalDisplay.windowControlSize ?? 34}px`, '--window-control-gap': `${globalDisplay.windowControlGap ?? 8}px` } as CSSProperties}>
          <span>＋</span><span>⚙</span><span>📌</span><span>－</span><span>×</span>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        id="background"
        title="背景图片"
        hint="自定义窗口背景与透明度"
        collapsed={collapsedSections.has('background')}
        onToggle={toggleSection}
      >
        <label className="check-row">
          <input
            type="checkbox"
            checked={globalDisplay.backgroundEnabled === true}
            onChange={(event) => setGlobal({ backgroundEnabled: event.target.checked })}
          />
          启用背景图片
        </label>
        <div className="field-row">
          <label>背景图片路径</label>
          <div className="path-pick-row">
            <input
              className="soft-input"
              value={globalDisplay.backgroundImage || ''}
              placeholder="选择本地 png/jpg/webp/svg，或输入图片路径 / data:image"
              onChange={(event) => { const value = event.target.value; setGlobal({ backgroundImage: value, backgroundEnabled: Boolean(value.trim()) }); }}
            />
            <button className="btn-secondary" onClick={chooseBackgroundImage}>浏览</button>
          </div>
        </div>
        <div className="button-row compact-button-row">
          <button className="btn-secondary" onClick={chooseBackgroundImage}>选择背景图片</button>
          <button className="btn-secondary" onClick={() => setGlobal({ backgroundImage: '', backgroundEnabled: false })}>清除背景</button>
        </div>
        <SliderRow label="背景透明度" min={0} max={1} step={0.05} value={globalDisplay.backgroundOpacity ?? 0.42} onChange={(value) => setGlobal({ backgroundOpacity: Math.round(value * 100) / 100 })} />
        <SliderRow label="背景压暗/泛白" min={0} max={0.85} step={0.05} value={globalDisplay.backgroundDim ?? 0.18} onChange={(value) => setGlobal({ backgroundDim: Math.round(value * 100) / 100 })} />
        <SliderRow label="背景模糊" min={0} max={20} step={1} value={globalDisplay.backgroundBlur ?? 0} unit="px" onChange={(value) => setGlobal({ backgroundBlur: value })} />
        <SliderRow label="面板不透明度" min={0.2} max={1} step={0.05} value={globalDisplay.backgroundPanelOpacity ?? 0.86} onChange={(value) => setGlobal({ backgroundPanelOpacity: Math.round(value * 100) / 100 })} />
        <div className="field-row">
          <label>背景填充方式</label>
          <select
            className="soft-input"
            value={globalDisplay.backgroundFit ?? 'cover'}
            onChange={(event) => setGlobal({ backgroundFit: event.target.value as DisplaySettings['backgroundFit'] })}
          >
            <option value="cover">覆盖窗口</option>
            <option value="contain">完整显示</option>
            <option value="stretch">拉伸铺满</option>
            <option value="tile">平铺</option>
          </select>
        </div>
        <div className="field-row">
          <label>背景位置</label>
          <select
            className="soft-input"
            value={globalDisplay.backgroundPosition ?? 'center'}
            onChange={(event) => setGlobal({ backgroundPosition: event.target.value as DisplaySettings['backgroundPosition'] })}
          >
            <option value="center">居中</option>
            <option value="top">顶部</option>
            <option value="bottom">底部</option>
            <option value="left">左侧</option>
            <option value="right">右侧</option>
          </select>
        </div>
        <p className="settings-hint">背景图片会随配置保存。使用本地路径时，换电脑后需要确保图片路径仍然存在。</p>
        <div className="background-settings-preview">
          <div className="background-preview-image">背景预览</div>
          <div className="background-preview-panel">面板透明度预览</div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        id="local"
        title={`当前子目录独立设置${activeDirectory ? `：${activeDirectory.name}` : ''}`}
        hint={`已覆盖 ${localOverrideCount} 项`}
        collapsed={collapsedSections.has('local')}
        onToggle={toggleSection}
      >
        <p className="settings-hint">这里的修改只影响当前子目录；不设置时继承上面的统一默认设置。</p>
        <div className="field-row">
          <label>当前目录显示行数</label>
          <div className="segmented">
            {[1, 2, 3, 4, 5].map((line) => (
              <button key={line} className={localDisplay.labelLines === line ? 'active' : ''} disabled={!activeDirectory} onClick={() => setLocal({ labelLines: line })}>{line}</button>
            ))}
          </div>
        </div>
        <SliderRow label="当前目录图标大小" min={32} max={128} step={4} value={localDisplay.iconSize} unit="px" onChange={(value) => setLocal({ iconSize: value })} />
        <SliderRow label="当前目录占位宽度" min={72} max={260} step={4} value={localDisplay.itemWidth} unit="px" onChange={(value) => setLocal({ itemWidth: value })} />
        <SliderRow label="当前目录占位高度" min={82} max={320} step={4} value={localDisplay.itemHeight} unit="px" onChange={(value) => setLocal({ itemHeight: value })} />
        <SliderRow label="当前目录间距" min={4} max={40} step={2} value={localDisplay.gridGap} unit="px" onChange={(value) => setLocal({ gridGap: value })} />
        <div className="field-row">
          <label>当前目录查看方式</label>
          <div className="segmented">
            <button className={localDisplay.viewMode === 'grid' ? 'active' : ''} disabled={!activeDirectory} onClick={() => setLocal({ viewMode: 'grid' })}>图标</button>
            <button className={localDisplay.viewMode === 'compact' ? 'active' : ''} disabled={!activeDirectory} onClick={() => setLocal({ viewMode: 'compact' })}>紧凑</button>
          </div>
        </div>
        <div className="button-row">
          <button className="btn-secondary" disabled={!activeDirectory} onClick={() => activeDirectory && updateDirectoryDisplay(activeDirectory.id, { ...globalDisplay })}>复制统一默认到当前目录</button>
          <button className="btn-secondary" disabled={!activeDirectory || !localOverrideCount} onClick={() => activeDirectory && clearDirectoryDisplay(activeDirectory.id)}>恢复继承统一默认</button>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        id="preview"
        title="实时预览"
        collapsed={collapsedSections.has('preview')}
        onToggle={toggleSection}
      >
        <div className="preview-card" style={{ width: localDisplay.itemWidth, minHeight: localDisplay.itemHeight }}>
          <div className="preview-icon" style={{ width: localDisplay.iconSize, height: localDisplay.iconSize }}>⌘</div>
          <div
            className="item-label"
            style={{
              '--label-lines': localDisplay.labelLines,
              '--label-chars': localDisplay.charsPerLine,
              '--label-font-size': localDisplay.fontSize
            } as CSSProperties}
            title="这是一段用于预览的很长的快捷方式名称"
          >
            这是一段用于预览的很长的快捷方式名称
          </div>
        </div>
      </CollapsibleSection>
    </section>
  );
}
