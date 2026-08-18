import { AlertTriangle, CheckCircle2, CopyPlus, Database, FilePlus2, RotateCcw, ShieldCheck, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { AppConfig } from '../../types';
import {
  buildImportPreview,
  mergeImportedConfig,
  type ImportConflictResolution,
  type ImportMode,
} from '../../lib/importCenter';
import { saveImportRollbackSnapshot } from '../../lib/importSnapshot';
import { showLauncherNotice } from '../../lib/notify';
import { uiAlert, uiConfirm } from '../../lib/uiDialog';
import './ImportCenterDialog.css';

const RESOLUTION_LABELS: Record<ImportConflictResolution, string> = {
  keep: '保留当前',
  replace: '使用导入',
  both: '两个都保留',
};

export function ImportCenterDialog({
  currentConfig,
  incomingConfig,
  sourceName,
  reduceMotion,
  onApply,
  onClose,
}: {
  currentConfig: AppConfig;
  incomingConfig: AppConfig;
  sourceName: string;
  reduceMotion: boolean;
  onApply: (config: AppConfig) => void;
  onClose: () => void;
}) {
  const preview = useMemo(() => buildImportPreview(currentConfig, incomingConfig), [currentConfig, incomingConfig]);
  const [mode, setMode] = useState<ImportMode>('merge');
  const [defaultResolution, setDefaultResolution] = useState<ImportConflictResolution>('keep');
  const [resolutions, setResolutions] = useState<Record<string, ImportConflictResolution>>({});

  function resolutionFor(id: string) {
    return resolutions[id] ?? defaultResolution;
  }

  function applyAllResolution(value: ImportConflictResolution) {
    setDefaultResolution(value);
    setResolutions(Object.fromEntries(preview.conflicts.map((conflict) => [conflict.id, value])));
  }

  async function applyImport() {
    if (mode === 'replace') {
      const confirmed = await uiConfirm('完全覆盖会用导入文件替换当前配置与项目。导入前会自动创建一份可回滚快照，是否继续？');
      if (!confirmed) return;
    }
    try {
      await saveImportRollbackSnapshot(currentConfig, sourceName);
    } catch (error) {
      void uiAlert(`导入前快照保存失败，已取消本次导入。可能是配置过大或本地存储空间不足：${String(error)}`);
      return;
    }
    if (mode === 'replace') {
      onApply(incomingConfig);
      showLauncherNotice('导入完成；已保存导入前快照，可在“数据”中一键回滚');
      onClose();
      return;
    }
    const result = mergeImportedConfig(currentConfig, incomingConfig, resolutions, defaultResolution);
    onApply(result.config);
    showLauncherNotice(`导入完成：新增 ${result.summary.addedItems} 个项目，跳过 ${result.summary.duplicates} 个重复项，处理 ${result.summary.resolvedConflicts} 个冲突`);
    onClose();
  }

  return (
    <div className="import-center-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={`import-center-dialog ${reduceMotion ? 'reduce-motion' : ''}`} role="dialog" aria-modal="true" aria-labelledby="import-center-title">
        <header className="import-center-header">
          <div>
            <div className="import-center-eyebrow"><ShieldCheck size={14} /> 安全导入中心</div>
            <h3 id="import-center-title">导入预览</h3>
            <p title={sourceName}>{sourceName}</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} title="关闭导入中心"><X size={17} /></button>
        </header>

        <div className="import-center-mode-grid" role="radiogroup" aria-label="导入方式">
          <button type="button" className={mode === 'merge' ? 'active' : ''} onClick={() => setMode('merge')}>
            <FilePlus2 size={18} /><span><strong>智能合并</strong><small>保留当前设置，只添加新内容并处理冲突</small></span>
          </button>
          <button type="button" className={mode === 'replace' ? 'active danger' : ''} onClick={() => setMode('replace')}>
            <Database size={18} /><span><strong>完全覆盖</strong><small>用导入内容替换当前配置，适合完整迁移</small></span>
          </button>
        </div>

        <div className="import-center-stats">
          <div><strong>{preview.addedGroups}</strong><span>新增父目录</span></div>
          <div><strong>{preview.addedDirectories}</strong><span>新增子目录</span></div>
          <div><strong>{preview.addedItems}</strong><span>新增项目</span></div>
          <div><strong>{preview.duplicates}</strong><span>完全重复</span></div>
          <div className={preview.conflicts.length ? 'warning' : ''}><strong>{preview.conflicts.length}</strong><span>需要决定</span></div>
        </div>

        {mode === 'replace' ? (
          <div className="import-center-replace-warning">
            <AlertTriangle size={18} />
            <div><strong>覆盖模式不会逐项合并</strong><span>将导入 {preview.importedGroups} 个父目录、{preview.importedDirectories} 个子目录、{preview.importedItems} 个项目。执行前自动保存当前完整快照。</span></div>
          </div>
        ) : (
          <>
            <div className="import-center-conflict-toolbar">
              <div><strong>冲突策略</strong><span>可先批量设置，再单独调整某一项</span></div>
              <div className="import-center-bulk-actions">
                {(Object.keys(RESOLUTION_LABELS) as ImportConflictResolution[]).map((value) => (
                  <button key={value} type="button" className={defaultResolution === value ? 'active' : ''} onClick={() => applyAllResolution(value)}>{RESOLUTION_LABELS[value]}</button>
                ))}
              </div>
            </div>
            <div className="import-center-conflicts">
              {preview.conflicts.length === 0 ? (
                <div className="import-center-empty"><CheckCircle2 size={18} /><span><strong>没有发现冲突</strong><small>可以直接导入；重复项会自动跳过。</small></span></div>
              ) : preview.conflicts.map((conflict) => (
                <article className="import-conflict-card" key={conflict.id}>
                  <div className="import-conflict-title">
                    <div><strong>{conflict.title}</strong><small>{conflict.groupName} / {conflict.directoryName}</small></div>
                    <select className="soft-input" value={resolutionFor(conflict.id)} onChange={(event) => setResolutions((current) => ({ ...current, [conflict.id]: event.target.value as ImportConflictResolution }))}>
                      {(Object.keys(RESOLUTION_LABELS) as ImportConflictResolution[]).map((value) => <option key={value} value={value}>{RESOLUTION_LABELS[value]}</option>)}
                    </select>
                  </div>
                  <div className="import-conflict-compare">
                    <div><span>当前</span><p>{conflict.currentSummary || '（空）'}</p></div>
                    <div><span>导入</span><p>{conflict.importedSummary || '（空）'}</p></div>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}

        <footer className="import-center-footer">
          <span><RotateCcw size={14} /> 每次执行导入前都会覆盖保存“上次导入前快照”</span>
          <div><button type="button" className="btn-secondary" onClick={onClose}>取消</button><button type="button" className="btn-primary" onClick={() => void applyImport()}><CopyPlus size={14} /> {mode === 'replace' ? '创建快照并覆盖' : '创建快照并导入'}</button></div>
        </footer>
      </section>
    </div>
  );
}
