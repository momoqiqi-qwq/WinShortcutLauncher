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
  copyDirectory: { label: '复制子目录', hint: '复制整个子目录及其中项目，可粘贴到其他父目录。' },
  pasteDirectory: { label: '粘贴子目录', hint: '把复制的子目录粘贴到当前子目录所在父目录。' },
  moveToGroup: { label: '移动到父目录', hint: '把当前子目录完整移动到其他父目录。' },
  paste: { label: '粘贴项目', hint: '把内部项目剪贴板内容粘贴到此子目录。' },
  rename: { label: '重命名子目录', hint: '修改当前子目录名称。' },
  color: { label: '子目录背景色', hint: '给左侧子目录标签设置不同的背景颜色，形成彩色框。' },
  fullNames: { label: '显示完整名称', hint: '开启后左侧子目录名称完整换行显示，不再按行数省略（等同 设置-字体 里的“完整显示子目录名称”）。' },
  merge: { label: '合并到子目录', hint: '把当前子目录合并到同类型子目录。' },
  switchToNotes: { label: '空子目录切换为便签', hint: '仅空普通子目录可用。' },
  switchToNormal: { label: '便签切换为普通子目录', hint: '把便签恢复为普通子目录。' },
  refreshStartMenu: { label: '刷新开始菜单', hint: '仅开始菜单子目录显示；重新扫描系统开始菜单文件夹。' },
  openStartMenuFolder: { label: '打开开始菜单文件夹', hint: '仅开始菜单子目录显示；在资源管理器中打开对应文件夹。' },
  refreshMappedFolder: { label: '刷新映射文件夹', hint: '仅映射文件夹子目录显示；重新扫描被映射的文件夹。' },
  openMappedFolder: { label: '打开映射文件夹', hint: '仅映射文件夹子目录显示；在资源管理器中打开被映射的文件夹。' },
  changeMappedFolder: { label: '重新选择文件夹', hint: '仅映射文件夹子目录显示；换一个被映射的文件夹，不动原文件夹内容。' },
  refreshHtmlFolder: { label: '刷新 HTML 页面', hint: '仅 HTML 子目录显示；重新扫描文件夹里的 html/htm 页面。' },
  openHtmlFolder: { label: '打开 HTML 文件夹', hint: '仅 HTML 子目录显示；在资源管理器中打开被扫描的文件夹。' },
  changeHtmlFolder: { label: '重新选择 HTML 文件夹', hint: '仅 HTML 子目录显示；换一个被扫描的文件夹。' },
  toggleHtmlPreview: { label: '首页预览开关', hint: '仅 HTML 子目录显示；关掉后卡片只显示文件名，省性能。' },
  resetHtmlCardSizes: { label: '卡片恢复默认大小', hint: '仅 HTML 子目录显示；清掉拖拽记下的单卡尺寸。' },
  clear: { label: '清空子目录项目', hint: '清空当前普通子目录中的快捷项目。' },
  delete: { label: '删除子目录', hint: '删除当前子目录。' },
  linkRefresh: { label: '立即同步链接', hint: '仅链接子目录显示；马上从源目录拉一次最新内容。' },
  linkLocate: { label: '定位到源子目录', hint: '仅链接子目录显示；直接跳到链接指向的源子目录，源在别的配置里时会先切过去。' },
  linkRetarget: { label: '更换链接源', hint: '仅链接子目录显示；把链接改成指向别的父目录 / 子目录 / 配置。' },
  linkResetName: { label: '跟随源名称', hint: '只在你给链接子目录改过名时出现；丢掉显示名，让名字重新跟着源子目录走。' },
  linkDetach: { label: '解除链接', hint: '仅链接子目录显示；断开链接，已同步过来的项目保留成普通项目。' },
};

const GROUP_LABELS: Record<GroupContextMenuItemId, { label: string; hint: string }> = {
  copyGroup: { label: '复制父目录', hint: '复制父目录及全部子目录，可跨多配置粘贴。' },
  pasteGroup: { label: '粘贴父目录', hint: '把复制的父目录粘贴到当前配置。' },
  pasteDirectory: { label: '粘贴子目录', hint: '把复制的子目录粘贴到此父目录。' },
  create: { label: '新建父目录', hint: '创建新的父目录。' },
  merge: { label: '合并到父目录', hint: '把当前父目录合并到另一个父目录。' },
  color: { label: '父目录背景色', hint: '给父目录标签设置不同的背景颜色。' },
  delete: { label: '删除父目录', hint: '删除当前父目录及其中内容。' },
  linkDirectory: { label: '链接子目录', hint: '把一个别的子目录（可跨配置）链接进当前父目录，内容实时镜像。' },
  linkGroup: { label: '链接父目录', hint: '新建一个链接父目录，整个父目录（含子目录与项目，可跨配置）实时镜像过来。' },
  linkRefresh: { label: '立即同步链接', hint: '仅链接父目录显示；马上从源父目录拉一次最新内容。' },
  linkResetName: { label: '跟随源名称', hint: '只在你给链接父目录改过名时出现；丢掉显示名，让名字重新跟着源父目录走。' },
  linkDetach: { label: '解除链接', hint: '仅链接父目录显示；断开链接，已同步过来的子目录与项目保留。' },
};

const AREA_LABELS: Record<AreaContextMenuItemId, { label: string; hint: string }> = {
  paste: { label: '粘贴项目', hint: '把内部项目剪贴板内容粘贴到当前子目录。' },
  createDirectory: { label: '新建子目录', hint: '在当前父目录中创建普通、全部、便签或开始菜单子目录。' },
  addFile: { label: '添加文件', hint: '选择一个或多个文件。' },
  addFolder: { label: '添加文件夹', hint: '选择文件夹并添加快捷项目。' },
  addImage: { label: '添加图片', hint: '选几张图片，卡片直接显示图片本身；拖卡片边框或四角可以改大小。' },
  addExe: { label: '添加EXE', hint: '用光标拾取：把光标移到目标程序窗口上点一下，直接添加它的 exe。' },
  addUrl: { label: '添加网址', hint: '打开添加网站窗口。' },
  addSystem: { label: '添加系统功能', hint: '添加 Windows 系统工具。' },
  iconSize: { label: '当前子目录图标大小', hint: '只调整当前子目录。' },
  viewMode: { label: '当前子目录查看方式', hint: '只调整当前子目录。' },
  sortMode: { label: '当前子目录排序方式', hint: '只调整当前子目录。' },
  directoryColumns: { label: '当前父目录子目录列数', hint: '设置左侧子目录列表在当前父目录下显示几列。' },
  sidebarFullNames: { label: '完整子目录名称', hint: '开启后左侧子目录名称完整换行显示，不再按行数省略。' },
  globalIconSize: { label: '统一图标大小', hint: '调整所有子目录的默认图标大小。' },
  globalViewMode: { label: '统一查看方式', hint: '调整所有子目录的默认查看方式。' },
  globalSortMode: { label: '统一排序方式', hint: '调整所有子目录的默认排序方式。' },
  refreshIcons: { label: '刷新本页图标', hint: '只补齐当前页没有图标的项目。' },
  linkDirectory: { label: '链接子目录', hint: '新建一个链接子目录，内容从别的子目录（可跨配置）实时镜像过来。' },
  linkGroup: { label: '链接父目录', hint: '新建一个链接父目录，整个父目录（可跨配置）实时镜像过来。' },
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
