import { FolderPlus, LayoutList, Menu, RotateCcw } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import { ParentGroupColorSettings } from './ParentGroupColorSettings';
import { ParentGroupBrowserRoutingSettings } from './ParentGroupBrowserRoutingSettings';
import { ToggleCard } from './SettingsPrimitives';

export function NavigationSettingsSection() {
  const experience = useAppStore((state) => state.experience);
  const updateExperience = useAppStore((state) => state.updateExperience);

  function applyRecommended() {
    updateExperience({
      promptDirectoryNameOnCreate: true,
      activateNewDirectoryAfterCreate: true,
      autoNumberDuplicateDirectories: true,
      showDirectoryItemCount: true,
      doubleClickSidebarToCreate: false,
    });
  }

  function applyCompact() {
    updateExperience({
      promptDirectoryNameOnCreate: false,
      activateNewDirectoryAfterCreate: true,
      autoNumberDuplicateDirectories: true,
      showDirectoryItemCount: false,
      doubleClickSidebarToCreate: true,
    });
  }

  return (
    <div className="settings-category-grid experience-settings-grid">
      <section className="settings-section narrow-section experience-settings-section">
        <div className="settings-section-title-row">
          <h3><LayoutList size={17} /> 导航预设</h3>
          <button className="btn-secondary btn-compact" onClick={() => updateExperience({
            promptDirectoryNameOnCreate: false,
            activateNewDirectoryAfterCreate: true,
            autoNumberDuplicateDirectories: true,
            showDirectoryItemCount: false,
            doubleClickSidebarToCreate: false,
          })}><RotateCcw size={13} /> 恢复默认</button>
        </div>
        <div className="experience-preset-row">
          <button className="btn-secondary btn-compact" onClick={applyRecommended}>推荐效率</button>
          <button className="btn-secondary btn-compact" onClick={applyCompact}>紧凑快捷</button>
        </div>
        <p className="settings-hint">子目录右键默认打开哪套菜单，以及每个菜单项目的显示/隐藏，统一到“设置 - 右键菜单”中管理。</p>
      </section>

      <section className="settings-section narrow-section experience-settings-section">
        <div className="settings-section-title-row"><h3><FolderPlus size={17} /> 新建子目录</h3></div>
        <ToggleCard label="新建前询问名称" hint="开启后点击新增按钮或右键“新建子目录”会先显示软件内命名窗口。" checked={experience.promptDirectoryNameOnCreate} onChange={(promptDirectoryNameOnCreate) => updateExperience({ promptDirectoryNameOnCreate })} />
        <ToggleCard label="新建后自动进入" hint="创建完成后直接切换到新子目录，方便马上添加项目。" checked={experience.activateNewDirectoryAfterCreate} onChange={(activateNewDirectoryAfterCreate) => updateExperience({ activateNewDirectoryAfterCreate })} />
        <ToggleCard label="重名时自动编号" hint="例如已有“工作”，再次新建会命名为“工作 2”，避免难以区分。" checked={experience.autoNumberDuplicateDirectories} onChange={(autoNumberDuplicateDirectories) => updateExperience({ autoNumberDuplicateDirectories })} />
        <ToggleCard label="双击侧栏空白处新建" hint="双击子目录列表的空白区域即可创建普通子目录；双击已有子目录仍是重命名。" checked={experience.doubleClickSidebarToCreate} onChange={(doubleClickSidebarToCreate) => updateExperience({ doubleClickSidebarToCreate })} />
      </section>

      <section className="settings-section narrow-section experience-settings-section">
        <div className="settings-section-title-row"><h3><Menu size={17} /> 子目录侧栏显示</h3></div>
        <ToggleCard label="显示项目数量" hint="普通目录显示项目数，便签显示文本行数，“全部”显示普通目录项目总数。" checked={experience.showDirectoryItemCount} onChange={(showDirectoryItemCount) => updateExperience({ showDirectoryItemCount })} />
        <p className="settings-hint">当前激活的子目录会自动滚动到可见位置；新增后自动进入开启时也会自动定位。</p>
      </section>

      <ParentGroupColorSettings />
      <ParentGroupBrowserRoutingSettings />
    </div>
  );
}
