import { Info, Keyboard, LayoutPanelLeft, MousePointer2, Play, RotateCcw, Search, ShieldCheck, Sparkles } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import { defaultExperience } from '../../lib/experienceSettings';
import type { AfterLaunchAction, ItemTooltipMode } from '../../types';
import { formatShortcut } from '../../lib/keyboardShortcuts';
import { ToggleCard as ToggleRow } from './SettingsPrimitives';

function ChoiceRow<T extends string>({ label, hint, value, options, onChange }: {
  label: string;
  hint: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="experience-choice-card">
      <span className="experience-toggle-copy">
        <strong>{label}</strong>
        <small>{hint}</small>
      </span>
      <div className="segmented experience-segmented">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={value === option.value ? 'active' : ''}
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ExperienceSettingsSection() {
  const experience = useAppStore((state) => state.experience);
  const updateExperience = useAppStore((state) => state.updateExperience);
  const shortcuts = useAppStore((state) => state.shortcuts);

  return (
    <div className="settings-category-grid experience-settings-grid">
      <section className="settings-section narrow-section experience-settings-section">
        <div className="settings-section-title-row">
          <h3><LayoutPanelLeft size={17} /> 页面与设置记忆</h3>
          <button className="btn-secondary btn-compact" onClick={() => updateExperience(defaultExperience)}>
            <RotateCcw size={13} /> 恢复默认
          </button>
        </div>
        <div className="experience-preset-row">
          <button className="btn-secondary btn-compact" onClick={() => updateExperience({ reduceMotion: false, itemHoverAnimation: true, showLaunchNotice: true, keyboardNavigation: true, typeToSearch: true })}>流畅效率</button>
          <button className="btn-secondary btn-compact" onClick={() => updateExperience({ reduceMotion: true, itemHoverAnimation: false, showLaunchNotice: false, showLaunchCountBadge: false })}>性能优先</button>
          <button className="btn-secondary btn-compact" onClick={() => updateExperience({ confirmDeleteItems: true, confirmDeleteNavigation: true, confirmClearDirectory: true, clearSelectionAfterLaunch: true })}>防误操作</button>
          <button className="btn-secondary btn-compact" onClick={() => updateExperience({ afterLaunchAction: 'minimize', clearSelectionAfterLaunch: true, showLaunchNotice: false })}>启动后收起</button>
        </div>
        <ToggleRow
          label="记住上次页面"
          hint="下次启动回到上次目录；关闭则从第一个目录开始。"
          checked={experience.rememberLastPage}
          onChange={(rememberLastPage) => updateExperience({ rememberLastPage })}
        />
        <ToggleRow
          label="记住上次设置分类"
          hint="下次打开设置回到当前分类。"
          checked={experience.rememberSettingsTab}
          onChange={(rememberSettingsTab) => updateExperience({ rememberSettingsTab })}
        />
        <ToggleRow
          label="记住每个设置分类的滚动位置"
          hint="切换分类后保留各自的滚动位置。"
          checked={experience.rememberSettingsScrollPosition}
          onChange={(rememberSettingsScrollPosition) => updateExperience({ rememberSettingsScrollPosition })}
        />
        <ToggleRow
          label="紧凑设置分类栏"
          hint="缩小左侧分类高度，一屏显示更多项目。"
          checked={experience.compactSettingsNav}
          onChange={(compactSettingsNav) => updateExperience({ compactSettingsNav })}
        />
        <ToggleRow
          label="显示设置描述"
          hint="关闭后隐藏辅助说明，只保留设置名称和控件。"
          checked={experience.showSettingsDescriptions !== false}
          onChange={(showSettingsDescriptions) => updateExperience({ showSettingsDescriptions })}
        />
      </section>

      <section className="settings-section narrow-section experience-settings-section">
        <div className="settings-section-title-row"><h3><Play size={17} /> 启动后的行为</h3></div>
        <ChoiceRow<AfterLaunchAction>
          label="启动项目后主窗口"
          hint="隐藏到托盘后，可从托盘重新打开。"
          value={experience.afterLaunchAction}
          options={[
            { value: 'keep', label: '保持显示' },
            { value: 'minimize', label: '最小化' },
            { value: 'hide', label: '隐藏到托盘' },
          ]}
          onChange={(afterLaunchAction) => updateExperience({ afterLaunchAction })}
        />
        <ToggleRow
          label="启动后清除项目选中"
          hint="启动后取消选中，减少误删。"
          checked={experience.clearSelectionAfterLaunch}
          onChange={(clearSelectionAfterLaunch) => updateExperience({ clearSelectionAfterLaunch })}
        />
        <ToggleRow
          label="启动成功后显示提示"
          hint="启动成功后显示简短提示。"
          checked={experience.showLaunchNotice}
          onChange={(showLaunchNotice) => updateExperience({ showLaunchNotice })}
        />
      </section>

      <section className="settings-section narrow-section experience-settings-section">
        <div className="settings-section-title-row"><h3><Keyboard size={17} /> 键盘与搜索</h3></div>
        <ToggleRow
          label="方向键选择项目"
          hint="方向键移动选择，Enter 启动。"
          checked={experience.keyboardNavigation}
          onChange={(keyboardNavigation) => updateExperience({ keyboardNavigation })}
        />
        <ToggleRow
          label="直接输入开始搜索"
          hint="直接输入文字即可搜索当前页。"
          checked={experience.typeToSearch}
          onChange={(typeToSearch) => updateExperience({ typeToSearch })}
        />
        <ToggleRow
          label="搜索项目路径和网址"
          hint="关闭后只搜索名称和类型。"
          checked={experience.searchIncludesPath}
          onChange={(searchIncludesPath) => updateExperience({ searchIncludesPath })}
        />
      </section>

      <section className="settings-section narrow-section experience-settings-section">
        <div className="settings-section-title-row"><h3><Info size={17} /> 项目信息显示</h3></div>
        <ChoiceRow<ItemTooltipMode>
          label="鼠标悬停提示"
          hint="详细模式包含路径和使用记录。"
          value={experience.itemTooltipMode}
          options={[
            { value: 'off', label: '关闭' },
            { value: 'name', label: '仅名称' },
            { value: 'details', label: '详细' },
          ]}
          onChange={(itemTooltipMode) => updateExperience({ itemTooltipMode })}
        />
        <ToggleRow
          label="显示启动次数标记"
          hint="在项目右下角显示累计启动次数。"
          checked={experience.showLaunchCountBadge}
          onChange={(showLaunchCountBadge) => updateExperience({ showLaunchCountBadge })}
        />
        <ToggleRow
          label="固定项目优先显示"
          hint="固定项目始终排在前面。"
          checked={experience.pinnedItemsFirst}
          onChange={(pinnedItemsFirst) => updateExperience({ pinnedItemsFirst })}
        />
      </section>

      <section className="settings-section narrow-section experience-settings-section">
        <div className="settings-section-title-row"><h3><MousePointer2 size={17} /> 项目交互与动画</h3></div>
        <ToggleRow
          label="显示空目录使用提示"
          hint="空目录中显示添加指引。"
          checked={experience.showEmptyGuide}
          onChange={(showEmptyGuide) => updateExperience({ showEmptyGuide })}
        />
        <ToggleRow
          label="项目悬停动画"
          hint="悬停时轻微上浮和缩放。"
          checked={experience.itemHoverAnimation}
          onChange={(itemHoverAnimation) => updateExperience({ itemHoverAnimation })}
        />
        <ToggleRow
          label="减少动画"
          hint="减少过渡和缩放动画。"
          checked={experience.reduceMotion}
          onChange={(reduceMotion) => updateExperience({ reduceMotion })}
        />
      </section>

      <section className="settings-section narrow-section experience-settings-section">
        <div className="settings-section-title-row"><h3><ShieldCheck size={17} /> 操作确认</h3></div>
        <ToggleRow
          label="删除项目时确认"
          hint="删除项目前询问。"
          checked={experience.confirmDeleteItems}
          onChange={(confirmDeleteItems) => updateExperience({ confirmDeleteItems })}
        />
        <ToggleRow
          label="删除父目录/子目录时确认"
          hint="删除目录前询问。"
          checked={experience.confirmDeleteNavigation}
          onChange={(confirmDeleteNavigation) => updateExperience({ confirmDeleteNavigation })}
        />
        <ToggleRow
          label="清空本页项目时确认"
          hint="清空当前页前询问。"
          checked={experience.confirmClearDirectory}
          onChange={(confirmClearDirectory) => updateExperience({ confirmClearDirectory })}
        />
      </section>

      <section className="settings-section narrow-section experience-settings-section">
        <div className="settings-section-title-row"><h3><Search size={17} /> 快捷操作</h3></div>
        <div className="shortcut-cheat-grid">
          <span><kbd>{formatShortcut(shortcuts.openGlobalSearch) || '未设置'}</kbd><small>全局搜索</small></span>
          <span><kbd>{formatShortcut(shortcuts.openSettings) || '未设置'}</kbd><small>打开设置</small></span>
          <span><kbd>{formatShortcut(shortcuts.focusPageSearch) || '未设置'}</kbd><small>搜索当前页/设置</small></span>
          <span><kbd>方向键</kbd><small>移动项目选择</small></span>
          <span><kbd>{formatShortcut(shortcuts.launchSelectedItem) || '未设置'}</kbd><small>启动选中项目</small></span>
          <span><kbd>{formatShortcut(shortcuts.selectAllItems) || '未设置'}</kbd><small>全选本页项目</small></span>
          <span><kbd>{formatShortcut(shortcuts.deleteSelection) || '未设置'}</kbd><small>删除选中项目/目录</small></span>
          <span><kbd>{formatShortcut(shortcuts.closeOverlay) || '未设置'}</kbd><small>关闭浮层或清空搜索</small></span>
        </div>
        <p className="settings-hint"><Sparkles size={13} /> 快捷键可在“快捷键”分类中修改和检测冲突。</p>
      </section>
    </div>
  );
}
