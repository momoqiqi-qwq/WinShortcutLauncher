import { Eye, EyeOff, Folder, FolderTree, MousePointer2, RotateCcw } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  AREA_CONTEXT_MENU_IDS,
  DIRECTORY_CONTEXT_MENU_IDS,
  GROUP_CONTEXT_MENU_IDS,
} from '../../lib/experienceSettings';
import { useAppStore } from '../../stores/appStore';
import type {
  AreaContextMenuItemId,
  DirectoryContextMenuItemId,
  GroupContextMenuItemId,
} from '../../types';

type MenuCategory = 'group' | 'directory' | 'area';
type MenuId = DirectoryContextMenuItemId | GroupContextMenuItemId | AreaContextMenuItemId;

const CATEGORY_ORDER: MenuCategory[] = ['group', 'directory', 'area'];

const DIRECTORY_LABELS: Record<DirectoryContextMenuItemId, { label: string; hint: string }> = {
  rename: { label: '重命名子目录', hint: '修改当前子目录名称。' },
  merge: { label: '合并到子目录', hint: '把当前子目录合并到同类型子目录。' },
  switchToNotes: { label: '空子目录切换为便签', hint: '仅空普通子目录可用。' },
  switchToNormal: { label: '便签切换为普通子目录', hint: '把便签恢复为普通子目录。' },
  clear: { label: '清空子目录项目', hint: '清空当前普通子目录中的快捷项目。' },
  delete: { label: '删除子目录', hint: '删除当前子目录。' },
};

const GROUP_LABELS: Record<GroupContextMenuItemId, { label: string; hint: string }> = {
  create: { label: '新建父目录', hint: '创建新的父目录。' },
  merge: { label: '合并到父目录', hint: '把当前父目录合并到另一个父目录。' },
  color: { label: '父目录背景色', hint: '给父目录标签设置不同的背景颜色。' },
  delete: { label: '删除父目录', hint: '删除当前父目录及其中内容。' },
};

const AREA_LABELS: Record<AreaContextMenuItemId, { label: string; hint: string }> = {
  createDirectory: { label: '新建子目录', hint: '在当前父目录中创建普通、全部或便签子目录。' },
  addFile: { label: '添加文件', hint: '选择一个或多个文件。' },
  addFolder: { label: '添加文件夹', hint: '选择文件夹并添加快捷项目。' },
  addUrl: { label: '添加网址', hint: '打开添加网站窗口。' },
  addSystem: { label: '添加系统功能', hint: '添加 Windows 系统工具。' },
  iconSize: { label: '当前子目录图标大小', hint: '只调整当前子目录。' },
  viewMode: { label: '当前子目录查看方式', hint: '只调整当前子目录。' },
  sortMode: { label: '当前子目录排序方式', hint: '只调整当前子目录。' },
  globalIconSize: { label: '统一图标大小', hint: '调整所有子目录的默认图标大小。' },
  globalViewMode: { label: '统一查看方式', hint: '调整所有子目录的默认查看方式。' },
  globalSortMode: { label: '统一排序方式', hint: '调整所有子目录的默认排序方式。' },
  refreshIcons: { label: '刷新本页图标', hint: '只补齐当前页没有图标的项目。' },
};

const CATEGORY_META: Record<MenuCategory, { label: string; hint: string; icon: typeof Folder }> = {
  group: {
    label: '父目录',
    hint: '只控制顶部父目录标签上的右键菜单。',
    icon: FolderTree,
  },
  directory: {
    label: '子目录',
    hint: '只控制左侧子目录标签上的右键菜单；这里只保留空白处菜单没有的管理功能。',
    icon: Folder,
  },
  area: {
    label: '空白处',
    hint: '控制主内容区和侧栏空白处的右键菜单，不再与子目录右键共用。',
    icon: MousePointer2,
  },
};

function MenuToggle({ label, hint, visible, onToggle }: { label: string; hint: string; visible: boolean; onToggle: () => void }) {
  return (
    <button type="button" className={`context-menu-setting-row ${visible ? '' : 'is-hidden'}`} onClick={onToggle}>
      <span className="context-menu-setting-icon">{visible ? <Eye size={15} /> : <EyeOff size={15} />}</span>
      <span className="context-menu-setting-copy"><strong>{label}</strong><small>{hint}</small></span>
      <span className="context-menu-setting-state">{visible ? '显示' : '隐藏'}</span>
    </button>
  );
}

export function ContextMenuSettingsSection() {
  const experience = useAppStore((state) => state.experience);
  const updateExperience = useAppStore((state) => state.updateExperience);
  const [category, setCategory] = useState<MenuCategory>('group');

  const config = useMemo(() => {
    if (category === 'area') return {
      ids: AREA_CONTEXT_MENU_IDS as MenuId[],
      hidden: experience.areaContextMenuHiddenItems as MenuId[],
      labels: AREA_LABELS as Record<MenuId, { label: string; hint: string }>,
      patchKey: 'areaContextMenuHiddenItems' as const,
    };
    if (category === 'directory') return {
      ids: DIRECTORY_CONTEXT_MENU_IDS as MenuId[],
      hidden: experience.directoryContextMenuHiddenItems as MenuId[],
      labels: DIRECTORY_LABELS as Record<MenuId, { label: string; hint: string }>,
      patchKey: 'directoryContextMenuHiddenItems' as const,
    };
    return {
      ids: GROUP_CONTEXT_MENU_IDS as MenuId[],
      hidden: experience.groupContextMenuHiddenItems as MenuId[],
      labels: GROUP_LABELS as Record<MenuId, { label: string; hint: string }>,
      patchKey: 'groupContextMenuHiddenItems' as const,
    };
  }, [category, experience.areaContextMenuHiddenItems, experience.directoryContextMenuHiddenItems, experience.groupContextMenuHiddenItems]);

  function setHidden(hidden: MenuId[]) {
    if (category === 'area') {
      updateExperience({ areaContextMenuHiddenItems: hidden as AreaContextMenuItemId[] });
      return;
    }
    if (category === 'directory') {
      updateExperience({ directoryContextMenuHiddenItems: hidden as DirectoryContextMenuItemId[] });
      return;
    }
    updateExperience({ groupContextMenuHiddenItems: hidden as GroupContextMenuItemId[] });
  }

  function toggle(id: MenuId) {
    setHidden(config.hidden.includes(id) ? config.hidden.filter((item) => item !== id) : [...config.hidden, id]);
  }

  function applyCompact() {
    if (category === 'area') setHidden(['globalIconSize', 'globalViewMode', 'globalSortMode'] as MenuId[]);
    else if (category === 'directory') setHidden(['switchToNotes', 'switchToNormal'] as MenuId[]);
    else setHidden([]);
  }

  const visibleCount = config.ids.length - config.hidden.length;

  return (
    <div className="settings-category-grid context-menu-settings-grid">
      <section className="settings-section context-menu-category-section">
        <div className="settings-section-title-row">
          <div>
            <h3><MousePointer2 size={17} /> 右键菜单</h3>
            <p className="settings-hint">父目录、子目录、空白处分别使用三套独立菜单，修改后会在对应位置立即生效。</p>
          </div>
          <span className="diagnostic-result-badge healthy">{visibleCount}/{config.ids.length} 显示</span>
        </div>

        <div className="context-menu-category-tabs" role="tablist" aria-label="右键菜单位置">
          {CATEGORY_ORDER.map((id) => {
            const Icon = CATEGORY_META[id].icon;
            return (
              <button
                type="button"
                role="tab"
                aria-selected={category === id}
                key={id}
                className={category === id ? 'active' : ''}
                onClick={() => setCategory(id)}
              >
                <Icon size={14} /><span>{CATEGORY_META[id].label}</span>
              </button>
            );
          })}
        </div>
        <p className="settings-hint context-menu-category-hint">{CATEGORY_META[category].hint}</p>
        <div className="settings-inline-actions context-menu-layout-actions">
          <button className="btn-secondary btn-compact" onClick={() => setHidden([])}>全部显示</button>
          <button className="btn-secondary btn-compact" onClick={applyCompact}>常用精简</button>
          <button className="btn-secondary btn-compact" onClick={() => setHidden([])}><RotateCcw size={13} /> 恢复默认</button>
        </div>
      </section>

      <section className="settings-section context-menu-items-section">
        <div className="context-menu-settings-list">
          {config.ids.map((id) => {
            const meta = config.labels[id];
            return <MenuToggle key={id} label={meta.label} hint={meta.hint} visible={!config.hidden.includes(id)} onToggle={() => toggle(id)} />;
          })}
        </div>
      </section>

      <section className="settings-section narrow-section">
        <h3>通用菜单外观</h3>
        <label className="check-row"><input type="checkbox" checked={experience.compactContextMenus} onChange={(event) => updateExperience({ compactContextMenus: event.target.checked })} />紧凑右键菜单</label>
        <label className="check-row"><input type="checkbox" checked={experience.showContextMenuIcons} onChange={(event) => updateExperience({ showContextMenuIcons: event.target.checked })} />显示功能图标</label>
        <label className="check-row"><input type="checkbox" checked={experience.showContextMenuDirectoryHeader} onChange={(event) => updateExperience({ showContextMenuDirectoryHeader: event.target.checked })} />空白处菜单顶部显示当前子目录</label>
      </section>
    </div>
  );
}
