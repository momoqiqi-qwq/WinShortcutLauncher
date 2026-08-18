import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { useEffect, useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import type { AppConfig } from '../../types';
import { getAutoSaveTargetPath, saveConfigToPath } from '../../hooks/useAutoSave';
import { fileNameFromPath, loadImportedConfigFromPath } from '../../lib/importFile';
import { loadImportRollbackSnapshot, type ImportRollbackSnapshot } from '../../lib/importSnapshot';
import { showLauncherNotice } from '../../lib/notify';
import { uiAlert, uiConfirm } from '../../lib/uiDialog';
import { ImportCenterDialog } from './ImportCenterDialog';


function formatSnapshotTime(timestamp: number) {
  try {
    return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(timestamp));
  } catch {
    return new Date(timestamp).toLocaleString();
  }
}

export function DataSettingsSection({ onReset }: { onReset?: () => void }) {
  const autoSave = useAppStore((state) => state.autoSave);
  const updateAutoSave = useAppStore((state) => state.updateAutoSave);
  const exportConfig = useAppStore((state) => state.exportConfig);
  const importConfig = useAppStore((state) => state.importConfig);
  const clearLaunchStats = useAppStore((state) => state.clearLaunchStats);
  const resetSettingsOnly = useAppStore((state) => state.resetSettingsOnly);
  const reduceMotion = useAppStore((state) => state.experience.reduceMotion);
  const [importDraft, setImportDraft] = useState<{ config: AppConfig; sourceName: string } | null>(null);
  const [snapshotRevision, setSnapshotRevision] = useState(0);
  const [rollbackSnapshot, setRollbackSnapshot] = useState<ImportRollbackSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadImportRollbackSnapshot().then((snapshot) => { if (!cancelled) setRollbackSnapshot(snapshot); });
    return () => { cancelled = true; };
  }, [snapshotRevision]);

  async function handleExport() {
    const target = await save({ title: '导出配置', defaultPath: 'yue-launcher-config.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (target) await invoke('save_config', { config: JSON.stringify(exportConfig(), null, 2), path: target });
  }

  async function handleImport() {
    const selected = await open({
      title: '选择要导入的数据',
      multiple: false,
      filters: [
        { name: '支持的配置', extensions: ['json', 'js', 'db'] },
        { name: 'JSON / Maye JDB 配置', extensions: ['json', 'js'] },
        { name: 'Lucy / Maye 数据库', extensions: ['db'] },
      ],
    });
    if (!selected || Array.isArray(selected)) return;
    try {
      const selectedPath = String(selected);
      const config = await loadImportedConfigFromPath(selectedPath);
      setImportDraft({ config, sourceName: fileNameFromPath(selectedPath) });
    } catch (error) {
      void uiAlert(`导入文件读取失败：${String(error)}`);
    }
  }

  function applyImportedConfig(config: AppConfig) {
    importConfig(config);
    setSnapshotRevision((value) => value + 1);
  }

  async function restoreImportSnapshot() {
    const snapshot = await loadImportRollbackSnapshot();
    if (!snapshot) return void uiAlert('还没有可回滚的导入前快照。');
    const confirmed = await uiConfirm(`确定恢复 ${formatSnapshotTime(snapshot.createdAt)} 的导入前快照吗？当前数据会被替换。`);
    if (!confirmed) return;
    importConfig(snapshot.config);
    showLauncherNotice('已恢复到上次导入前状态');
  }

  async function chooseDirectory() {
    const selected = await open({ title: '选择自动保存目录', multiple: false, directory: true });
    if (selected && !Array.isArray(selected)) updateAutoSave({ directory: selected });
  }

  async function saveNow() {
    const target = getAutoSaveTargetPath(autoSave.directory, autoSave.fileName);
    if (!target) return void uiAlert('请先选择自动保存目录');
    await saveConfigToPath(target);
    void uiAlert(`已保存到：${target}`);
  }

  async function clearStats() {
    if (!await uiConfirm('确定清除所有项目的启动次数和最近启动时间吗？项目本身不会被删除。')) return;
    clearLaunchStats();
    showLauncherNotice('已清除项目使用统计');
  }

  async function resetSettings() {
    if (!await uiConfirm('确定恢复全部设置为默认值吗？父目录、子目录、项目、便签内容和图片列表都会保留。')) return;
    resetSettingsOnly();
    onReset?.();
    showLauncherNotice('已恢复默认设置，项目和数据已保留');
  }

  return (
    <section className="settings-section narrow-section" data-settings-search-root="data">
      <h3>数据</h3>
      <div className="settings-subtitle">导入中心</div>
      <div className="button-row" data-settings-focus="导入配置">
        <button className="btn-secondary" onClick={() => void handleExport()}>导出配置</button>
        <button className="btn-primary" onClick={() => void handleImport()}>预览并导入</button>
        <button className="btn-secondary" disabled={!rollbackSnapshot} onClick={() => void restoreImportSnapshot()}>回滚上次导入</button>
      </div>
      <p className="settings-hint">导入前会先统计新增、重复和冲突；智能合并支持逐项选择“保留当前 / 使用导入 / 两个都保留”。每次真正导入前自动保存一份完整回滚快照。</p>
      <div className="settings-data-snapshot-card">
        <strong>{rollbackSnapshot ? '已有可回滚快照' : '暂无导入快照'}</strong>
        <span>{rollbackSnapshot ? `${formatSnapshotTime(rollbackSnapshot.createdAt)}${rollbackSnapshot.sourceName ? ` · 来源 ${rollbackSnapshot.sourceName}` : ''}` : '第一次执行导入后，这里会保存“导入前”的完整数据。'}</span>
      </div>
      <p className="settings-hint">Maye JDB 现在使用静态对象解析器，不会执行导入文件中的 JavaScript；函数调用、成员访问、模板字符串等可执行表达式会被拒绝。</p>

      <div className="settings-subtitle settings-subtitle-spaced">维护工具</div>
      <div className="button-row"><button className="btn-secondary" onClick={() => void clearStats()}>清除使用统计</button><button className="btn-secondary" onClick={() => void resetSettings()}>恢复默认设置（保留项目）</button></div>
      <p className="settings-hint">“最近启动 / 最常使用”排序依赖使用统计；恢复默认设置不会删除父目录、子目录、项目、便签内容、中转文件或图片列表。</p>
      <p className="settings-hint">支持本应用 JSON、Maye/Maya 的 JDB.json.js / JSON，也支持 Lucy 的 link.db；如果同目录存在 icon.db，仍由原有 DB 导入逻辑处理图标缓存。</p>

      <div className="settings-subtitle settings-subtitle-spaced">自动保存</div>
      <label className="check-row"><input type="checkbox" checked={autoSave.enabled} onChange={(event) => updateAutoSave({ enabled: event.target.checked })} />开启自动保存数据</label>
      <div className="field-row"><label>保存目录</label><div className="path-pick-row"><input className="soft-input" value={autoSave.directory} placeholder="选择一个用于自动保存 JSON 的目录" onChange={(event) => updateAutoSave({ directory: event.target.value })} /><button className="btn-secondary" onClick={() => void chooseDirectory()}>浏览</button></div></div>
      <div className="field-row"><label>保存文件名</label><input className="soft-input" value={autoSave.fileName} onChange={(event) => updateAutoSave({ fileName: event.target.value })} /></div>
      <div className="field-row"><label>保存间隔：{autoSave.intervalMinutes} 分钟</label><input type="range" min={1} max={120} step={1} value={autoSave.intervalMinutes} onChange={(event) => updateAutoSave({ intervalMinutes: Number(event.target.value) })} /></div>
      <p className="settings-hint">当前目标：{getAutoSaveTargetPath(autoSave.directory, autoSave.fileName) || '未选择目录'}</p>
      <button className="btn-secondary" onClick={() => void saveNow()}>立即保存一次</button>

      {importDraft && (
        <ImportCenterDialog
          currentConfig={exportConfig()}
          incomingConfig={importDraft.config}
          sourceName={importDraft.sourceName}
          reduceMotion={reduceMotion}
          onApply={applyImportedConfig}
          onClose={() => setImportDraft(null)}
        />
      )}
    </section>
  );
}
