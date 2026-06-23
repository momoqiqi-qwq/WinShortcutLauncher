import { useEffect, useState, type ReactNode } from 'react';
import type { DisplaySettings } from '../../types';
import type { GlobalSearchSettings, TransferStationSettings, ImageBrowserSettings, IconResolveMode } from '../../utils/v16Types';
import { DEFAULT_GLOBAL_SEARCH_SETTINGS, DEFAULT_TRANSFER_STATION_SETTINGS, DEFAULT_IMAGE_BROWSER_SETTINGS } from '../../utils/v16Types';

interface SearchProps {
  globalSearch?: Partial<GlobalSearchSettings>;
  display?: DisplaySettings;
  onChangeGlobalSearch: (patch: Partial<GlobalSearchSettings>) => void;
  onChangeDisplay?: (patch: Partial<DisplaySettings>) => void;
}

interface TransferProps {
  transferStation?: Partial<TransferStationSettings>;
  onChangeTransferStation: (patch: Partial<TransferStationSettings>) => void;
}

interface ImageProps {
  imageBrowser?: Partial<ImageBrowserSettings>;
  onChangeImageBrowser: (patch: Partial<ImageBrowserSettings>) => void;
}

interface LegacyProps extends SearchProps, TransferProps {}

function Row({ title, desc, children }: { title: string; desc?: string; children: ReactNode }) {
  return (
    <label className="settings-row">
      <span>
        <strong>{title}</strong>
        {desc && <small>{desc}</small>}
      </span>
      <span className="settings-control">{children}</span>
    </label>
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

function safeReadBool(key: string, fallback = false) {
  try {
    return localStorage.getItem(key) === '1' ? true : localStorage.getItem(key) === '0' ? false : fallback;
  } catch {
    return fallback;
  }
}

function safeReadSections<T extends string>(key: string, allowed: readonly T[], fallback: Set<T>) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return fallback;
    const next = new Set(parsed.filter((id): id is T => allowed.includes(id as T)));
    return next.size ? next : fallback;
  } catch {
    return fallback;
  }
}

function useCollapsedSections<T extends string>(storageKey: string, allIds: readonly T[]) {
  const defaultCollapsed = () => new Set<T>(allIds);
  const rememberKey = `${storageKey}:remember`;
  const collapsedKey = `${storageKey}:collapsed`;
  const [rememberCollapseState, setRememberCollapseStateState] = useState(() => safeReadBool(rememberKey, false));
  const [collapsedSections, setCollapsedSections] = useState<Set<T>>(() => {
    if (!safeReadBool(rememberKey, false)) return defaultCollapsed();
    return safeReadSections(collapsedKey, allIds, defaultCollapsed());
  });

  useEffect(() => {
    if (!rememberCollapseState) {
      setCollapsedSections(defaultCollapsed());
      return;
    }
    setCollapsedSections(safeReadSections(collapsedKey, allIds, defaultCollapsed()));
  }, [rememberCollapseState, storageKey]);

  function persist(next: Set<T>, remember = rememberCollapseState) {
    if (!remember) return;
    try {
      localStorage.setItem(collapsedKey, JSON.stringify(Array.from(next)));
    } catch {
      // ignore storage errors
    }
  }

  function setRememberCollapseState(enabled: boolean) {
    setRememberCollapseStateState(enabled);
    try {
      localStorage.setItem(rememberKey, enabled ? '1' : '0');
    } catch {
      // ignore storage errors
    }
    if (enabled) {
      persist(collapsedSections, true);
    } else {
      setCollapsedSections(defaultCollapsed());
    }
  }

  const applyCollapsedSections = (next: Set<T>) => {
    setCollapsedSections(next);
    persist(next);
  };

  const toggleSection = (id: T) => {
    setCollapsedSections((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      persist(next);
      return next;
    });
  };

  return { collapsedSections, rememberCollapseState, setRememberCollapseState, applyCollapsedSections, toggleSection, defaultCollapsed };
}

function CollapseTools<T extends string>({ remember, onRememberChange, onCollapseAll, onExpandAll }: {
  remember: boolean;
  onRememberChange: (enabled: boolean) => void;
  onCollapseAll: () => void;
  onExpandAll: () => void;
}) {
  return (
    <div className="settings-collapse-tools settings-collapse-tools-spread">
      <label className="settings-inline-switch" title="开启后会记住这个设置页每个分组的展开/收起状态；关闭后每次进入都默认全部收起。">
        <input type="checkbox" checked={remember} onChange={(event) => onRememberChange(event.target.checked)} />
        记住展开/收起状态
      </label>
      <span className="settings-collapse-actions">
        <button className="btn-secondary btn-compact" onClick={onCollapseAll}>全部收起</button>
        <button className="btn-secondary btn-compact" onClick={onExpandAll}>全部展开</button>
      </span>
    </div>
  );
}

const iconModeOptions: Array<{ value: IconResolveMode; label: string }> = [
  { value: 'auto', label: '自动判断（推荐）' },
  { value: 'read_icon_as_data_url', label: '直接读取图片文件（快）' },
  { value: 'get_file_icon', label: 'Windows 提取系统图标（慢）' },
];

export function SearchSettingsSection({ globalSearch, display, onChangeGlobalSearch, onChangeDisplay }: SearchProps) {
  const search = { ...DEFAULT_GLOBAL_SEARCH_SETTINGS, ...globalSearch };
  const itemIconMode = display?.itemIconResolveMode ?? 'auto';
  const itemIconParallelTasks = display?.iconParallelTasks ?? 6;
  const sectionIds = ['search', 'icons'] as const;
  const { collapsedSections, rememberCollapseState, setRememberCollapseState, applyCollapsedSections, toggleSection } = useCollapsedSections('settings.search', sectionIds);

  return (
    <section className="settings-section settings-section-stack narrow-section">
      <div className="settings-section-title-row">
        <h3>搜索设置</h3>
        <span className="settings-hint">全局搜索与项目图标加载</span>
      </div>
      <CollapseTools
        remember={rememberCollapseState}
        onRememberChange={setRememberCollapseState}
        onCollapseAll={() => applyCollapsedSections(new Set(sectionIds))}
        onExpandAll={() => applyCollapsedSections(new Set())}
      />

      <SettingsCollapseBlock
        title="全局搜索"
        hint="右上角搜索图标和 Ctrl+K"
        collapsed={collapsedSections.has('search')}
        onToggle={() => toggleSection('search')}
      >
        <Row title="启用全局搜索" desc="右上角搜索图标和 Ctrl+K 都会使用这里的设置">
          <input type="checkbox" checked={search.enabled} onChange={(e) => onChangeGlobalSearch({ enabled: e.target.checked })} />
        </Row>
        <Row title="搜索框提示文字">
          <input value={search.placeholder} onChange={(e) => onChangeGlobalSearch({ placeholder: e.target.value })} />
        </Row>
        <Row title="最大结果数" desc={`${search.maxResults} 条`}>
          <input type="range" min={20} max={300} step={10} value={search.maxResults} onChange={(e) => onChangeGlobalSearch({ maxResults: Number(e.target.value) })} />
        </Row>
        <Row title="结果图标" desc="在每一行左边显示项目图标">
          <input type="checkbox" checked={search.showItemIcon} onChange={(e) => onChangeGlobalSearch({ showItemIcon: e.target.checked })} />
        </Row>
        <Row title="结果图标大小" desc={`${search.iconSize}px`}>
          <input type="range" min={16} max={48} value={search.iconSize} onChange={(e) => onChangeGlobalSearch({ iconSize: Number(e.target.value) })} disabled={!search.showItemIcon} />
        </Row>
        <Row title="全局搜索图标解析方式" desc="影响搜索结果左侧图标的加载方式">
          <select value={search.iconResolveMode ?? 'auto'} onChange={(e) => onChangeGlobalSearch({ iconResolveMode: e.target.value as IconResolveMode })} disabled={!search.showItemIcon}>
            {iconModeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </Row>
        <Row title="全局搜索图标并发" desc={`${search.iconParallelTasks ?? 6} 个`}>
          <input type="range" min={1} max={8} step={1} value={search.iconParallelTasks ?? 6} onChange={(e) => onChangeGlobalSearch({ iconParallelTasks: Number(e.target.value) })} disabled={!search.showItemIcon} />
        </Row>
        <Row title="显示目录路径">
          <input type="checkbox" checked={search.showGroupPath} onChange={(e) => onChangeGlobalSearch({ showGroupPath: e.target.checked })} />
        </Row>
        <Row title="显示完整路径 / 网址">
          <input type="checkbox" checked={search.showFullPath} onChange={(e) => onChangeGlobalSearch({ showFullPath: e.target.checked })} />
        </Row>
        <Row title="高亮匹配文字">
          <input type="checkbox" checked={search.highlightMatches} onChange={(e) => onChangeGlobalSearch({ highlightMatches: e.target.checked })} />
        </Row>
        <div className="settings-grid two">
          <label><input type="checkbox" checked={search.searchInName} onChange={(e) => onChangeGlobalSearch({ searchInName: e.target.checked })} /> 搜索名称</label>
          <label><input type="checkbox" checked={search.searchInPath} onChange={(e) => onChangeGlobalSearch({ searchInPath: e.target.checked })} /> 搜索路径</label>
          <label><input type="checkbox" checked={search.searchInUrl} onChange={(e) => onChangeGlobalSearch({ searchInUrl: e.target.checked })} /> 搜索网址</label>
          <label><input type="checkbox" checked={search.searchInGroup} onChange={(e) => onChangeGlobalSearch({ searchInGroup: e.target.checked })} /> 搜索父目录</label>
          <label><input type="checkbox" checked={search.searchInSubGroup} onChange={(e) => onChangeGlobalSearch({ searchInSubGroup: e.target.checked })} /> 搜索子目录</label>
          <label><input type="checkbox" checked={search.includeNotes} onChange={(e) => onChangeGlobalSearch({ includeNotes: e.target.checked })} /> 包含便签</label>
        </div>
        <Row title="回车动作">
          <select value={search.enterAction} onChange={(e) => onChangeGlobalSearch({ enterAction: e.target.value as any })}>
            <option value="open">打开项目</option>
            <option value="locate">定位到项目</option>
          </select>
        </Row>
        <Row title="Ctrl + 回车动作">
          <select value={search.ctrlEnterAction} onChange={(e) => onChangeGlobalSearch({ ctrlEnterAction: e.target.value as any })}>
            <option value="locate">定位到项目</option>
            <option value="open">打开项目</option>
          </select>
        </Row>
      </SettingsCollapseBlock>

      <SettingsCollapseBlock
        title="快捷项目图标"
        hint="主界面图标解析与并发"
        collapsed={collapsedSections.has('icons')}
        onToggle={() => toggleSection('icons')}
      >
        <Row title="快捷项目图标解析方式" desc="影响主界面 ItemCard 图标加载">
          <select value={itemIconMode} onChange={(e) => onChangeDisplay?.({ itemIconResolveMode: e.target.value as IconResolveMode })}>
            {iconModeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </Row>
        <Row title="快捷项目图标并发" desc={`${itemIconParallelTasks} 个`}>
          <input type="range" min={1} max={8} step={1} value={itemIconParallelTasks} onChange={(e) => onChangeDisplay?.({ iconParallelTasks: Number(e.target.value) })} />
        </Row>
        <p className="settings-hint">并发数越高，首次加载大量图标越快；过高可能让 WebView 短暂卡顿，推荐 5～8。</p>
      </SettingsCollapseBlock>
    </section>
  );
}

export function TransferStationSettingsSection({ transferStation, onChangeTransferStation }: TransferProps) {
  const station = { ...DEFAULT_TRANSFER_STATION_SETTINGS, ...transferStation };
  const sectionIds = ['station'] as const;
  const { collapsedSections, rememberCollapseState, setRememberCollapseState, applyCollapsedSections, toggleSection } = useCollapsedSections('settings.transfer', sectionIds);

  return (
    <section className="settings-section settings-section-stack narrow-section">
      <div className="settings-section-title-row">
        <h3>文件中转站</h3>
        <span className="settings-hint">拖入、转存和拖到快捷文件夹</span>
      </div>
      <CollapseTools
        remember={rememberCollapseState}
        onRememberChange={setRememberCollapseState}
        onCollapseAll={() => applyCollapsedSections(new Set(sectionIds))}
        onExpandAll={() => applyCollapsedSections(new Set())}
      />

      <SettingsCollapseBlock
        title="中转站选项"
        hint="文件拖入与面板显示"
        collapsed={collapsedSections.has('station')}
        onToggle={() => toggleSection('station')}
      >
        <Row title="启用文件中转站">
          <input type="checkbox" checked={station.enabled} onChange={(e) => onChangeTransferStation({ enabled: e.target.checked })} />
        </Row>
        <Row title="面板宽度" desc={`${station.panelWidth}px`}>
          <input type="range" min={300} max={720} step={10} value={station.panelWidth} onChange={(e) => onChangeTransferStation({ panelWidth: Number(e.target.value) })} />
        </Row>
        <Row title="允许拖入文件">
          <input type="checkbox" checked={station.acceptExternalDrops} onChange={(e) => onChangeTransferStation({ acceptExternalDrops: e.target.checked })} />
        </Row>
        <Row title="允许拖到文件夹快捷项目" desc="把中转站文件拖到本应用的文件夹项目上时复制或移动过去">
          <input type="checkbox" checked={station.dragToShortcutFolders} onChange={(e) => onChangeTransferStation({ dragToShortcutFolders: e.target.checked })} />
        </Row>
        <Row title="拖到文件夹时">
          <select value={station.dropAction} onChange={(e) => onChangeTransferStation({ dropAction: e.target.value as any })}>
            <option value="copy">复制</option>
            <option value="move">移动</option>
          </select>
        </Row>
        <Row title="中转站图标大小" desc={`${station.iconSize}px`}>
          <input type="range" min={16} max={48} value={station.iconSize} onChange={(e) => onChangeTransferStation({ iconSize: Number(e.target.value) })} />
        </Row>
      </SettingsCollapseBlock>
    </section>
  );
}

export function ImageBrowserSettingsSection({ imageBrowser, onChangeImageBrowser }: ImageProps) {
  const image = { ...DEFAULT_IMAGE_BROWSER_SETTINGS, ...imageBrowser };
  const sectionIds = ['preview', 'actions'] as const;
  const { collapsedSections, rememberCollapseState, setRememberCollapseState, applyCollapsedSections, toggleSection } = useCollapsedSections('settings.image', sectionIds);

  return (
    <section className="settings-section settings-section-stack narrow-section">
      <div className="settings-section-title-row">
        <h3>图片预览</h3>
        <span className="settings-hint">图片浏览器面板与拖拽动作</span>
      </div>
      <CollapseTools
        remember={rememberCollapseState}
        onRememberChange={setRememberCollapseState}
        onCollapseAll={() => applyCollapsedSections(new Set(sectionIds))}
        onExpandAll={() => applyCollapsedSections(new Set())}
      />

      <SettingsCollapseBlock
        title="面板与预览"
        hint="宽度、缩略图、显示方式"
        collapsed={collapsedSections.has('preview')}
        onToggle={() => toggleSection('preview')}
      >
        <label className="check-row">
          <input
            type="checkbox"
            checked={image.enabled}
            onChange={(event) => onChangeImageBrowser({ enabled: event.target.checked })}
          />
          启用右上角图片浏览器
        </label>
        <div className="field-row">
          <label>面板宽度：{image.panelWidth}px</label>
          <input type="range" min={180} max={2600} step={20} value={Math.min(image.panelWidth, 2600)} onChange={(event) => onChangeImageBrowser({ panelWidth: Number(event.target.value) })} />
        </div>
        <div className="field-row">
          <label>缩略图区宽度：{image.thumbnailPaneWidth}px</label>
          <input type="range" min={48} max={1600} step={4} value={Math.min(image.thumbnailPaneWidth, 1600)} onChange={(event) => onChangeImageBrowser({ thumbnailPaneWidth: Number(event.target.value) })} />
        </div>
        <div className="field-row">
          <label>缩略图宽度：{image.thumbnailWidth}px</label>
          <input type="range" min={32} max={800} step={4} value={Math.min(image.thumbnailWidth, 800)} onChange={(event) => onChangeImageBrowser({ thumbnailWidth: Number(event.target.value) })} />
        </div>
        <div className="field-row">
          <label>预览适配方式</label>
          <select className="soft-input" value={image.previewFit} onChange={(event) => onChangeImageBrowser({ previewFit: event.target.value as 'contain' | 'cover' | 'actual' })}>
            <option value="contain">完整显示</option>
            <option value="cover">填满区域</option>
            <option value="actual">原始大小</option>
          </select>
        </div>
        <div className="field-row">
          <label>图片名称位置</label>
          <select className="soft-input" value={image.imageNamePosition} onChange={(event) => onChangeImageBrowser({ imageNamePosition: event.target.value as 'inside' | 'top' | 'bottom' | 'hidden' })}>
            <option value="bottom">图片下方</option>
            <option value="top">图片上方</option>
            <option value="inside">图片内部</option>
            <option value="hidden">不显示</option>
          </select>
        </div>
      </SettingsCollapseBlock>

      <SettingsCollapseBlock
        title="按钮与拖拽"
        hint="添加、清空、复制与拖出"
        collapsed={collapsedSections.has('actions')}
        onToggle={() => toggleSection('actions')}
      >
        <label className="check-row">
          <input type="checkbox" checked={image.acceptExternalDrops} onChange={(event) => onChangeImageBrowser({ acceptExternalDrops: event.target.checked })} />
          允许拖入图片
        </label>
        <label className="check-row">
          <input type="checkbox" checked={image.confirmClear} onChange={(event) => onChangeImageBrowser({ confirmClear: event.target.checked })} />
          清空图片前确认
        </label>
        <label className="check-row">
          <input type="checkbox" checked={image.showAddButton} onChange={(event) => onChangeImageBrowser({ showAddButton: event.target.checked })} />
          显示“添加图片”按钮
        </label>
        <label className="check-row">
          <input type="checkbox" checked={image.showCopyAllButton} onChange={(event) => onChangeImageBrowser({ showCopyAllButton: event.target.checked })} />
          显示“复制本组到文件夹”按钮
        </label>
        <label className="check-row">
          <input type="checkbox" checked={image.showClearButton} onChange={(event) => onChangeImageBrowser({ showClearButton: event.target.checked })} />
          显示“清空本组”按钮
        </label>
        <label className="check-row">
          <input type="checkbox" checked={image.showActiveActions} onChange={(event) => onChangeImageBrowser({ showActiveActions: event.target.checked })} />
          显示单张图片操作按钮
        </label>
        <div className="field-row">
          <label>拖出/复制动作</label>
          <select className="soft-input" value={image.dragExportAction} onChange={(event) => onChangeImageBrowser({ dragExportAction: event.target.value as 'copy' | 'move' })}>
            <option value="copy">复制</option>
            <option value="move">移动</option>
          </select>
        </div>
        <p className="settings-hint">图片浏览器可拖入图片，也可以拖动缩略图或预览图到外部文件夹。不同 Windows/资源管理器版本对 WebView 拖出的支持不同，面板内也提供“复制到文件夹”作为稳定方案。</p>
      </SettingsCollapseBlock>
    </section>
  );
}

export function GlobalSearchSettingsSection({ globalSearch, transferStation, display, onChangeGlobalSearch, onChangeTransferStation, onChangeDisplay }: LegacyProps) {
  return (
    <div className="settings-category-grid">
      <SearchSettingsSection
        globalSearch={globalSearch}
        display={display}
        onChangeGlobalSearch={onChangeGlobalSearch}
        onChangeDisplay={onChangeDisplay}
      />
      <TransferStationSettingsSection
        transferStation={transferStation}
        onChangeTransferStation={onChangeTransferStation}
      />
    </div>
  );
}
