import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { Component, useMemo, type ErrorInfo, type ReactNode } from 'react';
import { useAppStore } from '../../stores/appStore';
import type { SettingsTabId, ShortcutItem } from '../../types';
import { GlobalSearchModal } from './GlobalSearchModal';
import { uiAlert, uiConfirm } from '../../lib/uiDialog';
import { launchShortcutItem } from '../../lib/launchShortcut';
import { buildPaletteEntries, type PaletteEntry } from '../../lib/commandPalette';
import { requestSettingsTab } from '../../lib/settingsCatalog';
import { showLauncherNotice } from '../../lib/notify';

interface GlobalSearchProps {
  open: boolean;
  onClose: () => void;
}

function GlobalSearchContent({ open, onClose }: GlobalSearchProps) {
  const groups = useAppStore((state) => state.groups);
  const settings = useAppStore((state) => state.globalSearch);
  const commandUsage = useAppStore((state) => state.commandUsage);
  const display = useAppStore((state) => state.display);
  const behavior = useAppStore((state) => state.behavior);
  const setActiveGroup = useAppStore((state) => state.setActiveGroup);
  const setActiveDirectory = useAppStore((state) => state.setActiveDirectory);
  const selectItem = useAppStore((state) => state.selectItem);
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen);
  const setTheme = useAppStore((state) => state.setTheme);
  const updateDisplay = useAppStore((state) => state.updateDisplay);
  const updateBehavior = useAppStore((state) => state.updateBehavior);
  const recordCommandUsage = useAppStore((state) => state.recordCommandUsage);
  const clearLaunchStats = useAppStore((state) => state.clearLaunchStats);
  const resetSettingsOnly = useAppStore((state) => state.resetSettingsOnly);
  const exportConfig = useAppStore((state) => state.exportConfig);

  const entries = useMemo(
    () => buildPaletteEntries(groups, settings),
    [groups, settings.includeDirectories, settings.includeNotes, settings.includeSystemTools, settings.includeSettings, settings.includeCommands],
  );

  function locate(groupId?: string, directoryId?: string, itemId?: string) {
    if (groupId) setActiveGroup(groupId);
    if (directoryId) setActiveDirectory(directoryId);
    if (itemId) selectItem(itemId, false);
  }

  function openSettings(tab: SettingsTabId = 'general') {
    setSettingsOpen(true);
    window.setTimeout(() => requestSettingsTab(tab), 0);
  }

  async function exportConfiguration() {
    const target = await save({ title: '导出配置备份', defaultPath: 'yue-launcher-config.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (!target) return false;
    await invoke('save_config', { config: JSON.stringify(exportConfig(), null, 2), path: target });
    showLauncherNotice(`配置已导出：${target}`);
    return true;
  }

  async function launchItem(item: ShortcutItem) {
    await launchShortcutItem(item, false);
  }

  async function executeEntry(entry: PaletteEntry, alternate = false) {
    try {
      if (entry.kind === 'item' && entry.item) {
        const action = alternate ? settings.ctrlEnterAction : settings.enterAction;
        if (action === 'locate') locate(entry.groupId, entry.directoryId, entry.item.id);
        else await launchItem(entry.item);
      } else if (entry.kind === 'group') {
        locate(entry.groupId);
      } else if (entry.kind === 'directory' || entry.kind === 'note') {
        locate(entry.groupId, entry.directoryId);
      } else if (entry.kind === 'setting') {
        openSettings(entry.settingTab ?? 'general');
      } else if (entry.kind === 'theme' && entry.value) {
        setTheme(entry.value);
        showLauncherNotice(`已${entry.title}`);
      } else if (entry.kind === 'font') {
        updateDisplay({
          fontFamily: entry.value ?? '',
          fontApplyAreas: entry.value && !(display.fontApplyAreas?.length) ? ['main', 'settings', 'menus', 'notes'] : display.fontApplyAreas,
        });
        showLauncherNotice(`已${entry.title}`);
      } else if (entry.id === 'command:open-settings') {
        openSettings('general');
      } else if (entry.id === 'command:export-config') {
        if (!await exportConfiguration()) return;
      } else if (entry.id === 'command:toggle-pin') {
        updateBehavior({ alwaysOnTop: !behavior.alwaysOnTop });
        showLauncherNotice(behavior.alwaysOnTop ? '已取消窗口置顶' : '已开启窗口置顶');
      } else if (entry.id === 'command:clear-stats') {
        if (!await uiConfirm('确定清除所有项目的启动次数和最近启动时间吗？项目本身不会被删除。', '清除统计确认（1/2）')) return;
        if (!await uiConfirm('请再次确认：清除后的启动统计无法自动恢复。仍要继续吗？', '清除统计最终确认（2/2）')) return;
        clearLaunchStats();
        showLauncherNotice('已清除项目使用统计');
      } else if (entry.id === 'command:reset-settings') {
        if (!await uiConfirm('确定恢复全部设置为默认值吗？父目录、子目录、项目和便签会保留。', '恢复设置确认（1/2）')) return;
        if (!await uiConfirm('请再次确认：当前界面、行为和体验设置将被覆盖。仍要继续吗？', '恢复设置最终确认（2/2）')) return;
        resetSettingsOnly();
        showLauncherNotice('已恢复默认设置');
      }
      recordCommandUsage(entry.usageKey);
      onClose();
    } catch (error) {
      await uiAlert(`执行失败：${String(error)}`);
    }
  }

  return (
    <GlobalSearchModal
      open={open}
      entries={entries}
      usage={commandUsage}
      settings={settings}
      onClose={onClose}
      onExecute={executeEntry}
    />
  );
}


interface GlobalSearchErrorBoundaryProps extends GlobalSearchProps {
  children: ReactNode;
}

interface GlobalSearchErrorBoundaryState {
  error?: Error;
}

class GlobalSearchErrorBoundary extends Component<GlobalSearchErrorBoundaryProps, GlobalSearchErrorBoundaryState> {
  state: GlobalSearchErrorBoundaryState = {};

  static getDerivedStateFromError(error: Error): GlobalSearchErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('global search panel failed', error, info);
  }

  componentDidUpdate(previous: GlobalSearchErrorBoundaryProps) {
    if (previous.open && !this.props.open && this.state.error) {
      this.setState({ error: undefined });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    if (!this.props.open) return null;
    return (
      <div className="global-search-backdrop">
        <div className="global-search-modal global-search-error-panel" role="alertdialog" aria-modal="true" aria-label="全局命令面板错误">
          <div className="global-search-error-content">
            <h3>全局命令面板暂时无法打开</h3>
            <p>已隔离本次错误，主界面仍可继续使用。关闭后可再次尝试；若持续出现，请在自检中检查旧配置。</p>
            <code>{this.state.error.message || String(this.state.error)}</code>
            <button type="button" className="btn-primary" onClick={this.props.onClose}>关闭面板</button>
          </div>
        </div>
      </div>
    );
  }
}

export function GlobalSearch(props: GlobalSearchProps) {
  if (!props.open) return null;
  return (
    <GlobalSearchErrorBoundary {...props}>
      <GlobalSearchContent {...props} />
    </GlobalSearchErrorBoundary>
  );
}
