import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, ClipboardCopy, LocateFixed, RefreshCw, ScanSearch } from 'lucide-react';
import { useMemo, useState } from 'react';
import { analyzeAppConfig, formatConfigDiagnostics, type DiagnosticEntry } from '../../lib/configDiagnostics';
import { showLauncherNotice } from '../../lib/notify';
import { useAppStore } from '../../stores/appStore';

function issueClass(severity: 'error' | 'warning' | 'info') {
  return `diagnostic-issue diagnostic-${severity}`;
}

function entryLocation(entry: DiagnosticEntry) {
  const parts = [entry.groupName];
  if (entry.directoryName) parts.push(entry.directoryName);
  if (entry.itemName) parts.push(entry.itemName);
  return parts.join(' / ');
}

export function DiagnosticsSettingsSection() {
  const groups = useAppStore((state) => state.groups);
  const setActiveGroup = useAppStore((state) => state.setActiveGroup);
  const setActiveDirectory = useAppStore((state) => state.setActiveDirectory);
  const selectItem = useAppStore((state) => state.selectItem);
  const clearSelection = useAppStore((state) => state.clearSelection);
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen);
  const [refreshToken, setRefreshToken] = useState(0);
  const [expandedIssues, setExpandedIssues] = useState<Set<string>>(new Set());
  const result = useMemo(() => analyzeAppConfig({ groups }), [groups, refreshToken]);

  async function copySummary() {
    const text = formatConfigDiagnostics(result);
    try {
      await navigator.clipboard.writeText(text);
      showLauncherNotice('诊断摘要已复制');
    } catch {
      showLauncherNotice('复制失败，请检查剪贴板权限');
    }
  }

  function toggleIssue(code: string) {
    setExpandedIssues((current) => {
      const next = new Set(current);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });
  }

  function jumpTo(entry: DiagnosticEntry) {
    setActiveGroup(entry.groupId);
    if (entry.directoryId) setActiveDirectory(entry.directoryId);
    clearSelection();
    if (entry.itemId) selectItem(entry.itemId, false);
    setSettingsOpen(false);
    window.setTimeout(() => {
      if (entry.itemId) {
        document.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(entry.itemId)}"]`)?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
      } else if (entry.directoryId) {
        document.querySelector<HTMLElement>(`[data-directory-id="${CSS.escape(entry.directoryId)}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      } else {
        document.querySelector<HTMLElement>(`[data-group-id="${CSS.escape(entry.groupId)}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
      }
    }, 180);
    showLauncherNotice(`已跳转到：${entryLocation(entry)}`);
  }

  return (
    <div className="settings-category-grid diagnostics-settings-grid">
      <section className="settings-section diagnostics-summary-section">
        <div className="settings-section-title-row">
          <div>
            <h3><ScanSearch size={17} /> 配置自检</h3>
            <p className="settings-hint">检查重复 ID、空路径、异常网址、重复项目和缺失图标。展开问题可查看父目录、子目录、项目和路径，并一键跳转。</p>
          </div>
          <div className="settings-inline-actions">
            <button className="btn-secondary btn-compact" onClick={() => setRefreshToken((value) => value + 1)}>
              <RefreshCw size={13} /> 重新检查
            </button>
            <button className="btn-secondary btn-compact" onClick={copySummary}>
              <ClipboardCopy size={13} /> 复制详细摘要
            </button>
          </div>
        </div>

        <div className="diagnostic-stat-grid">
          <div><strong>{result.summary.groups}</strong><span>父目录</span></div>
          <div><strong>{result.summary.directories}</strong><span>子目录</span></div>
          <div><strong>{result.summary.items}</strong><span>项目</span></div>
          <div><strong>{result.summary.notes}</strong><span>便签</span></div>
          <div><strong>{result.summary.urls}</strong><span>网址</span></div>
          <div><strong>{result.summary.missingIcons}</strong><span>缺失图标</span></div>
        </div>
      </section>

      <section className="settings-section diagnostics-result-section">
        <div className="settings-section-title-row">
          <h3>{result.issues.length ? <AlertTriangle size={17} /> : <CheckCircle2 size={17} />} 检查结果</h3>
          <span className={`diagnostic-result-badge ${result.issues.length ? 'has-issues' : 'healthy'}`}>
            {result.issues.length ? `${result.issues.length} 类提示` : '状态正常'}
          </span>
        </div>

        {result.issues.length === 0 ? (
          <div className="diagnostic-healthy-card">
            <CheckCircle2 size={24} />
            <div><strong>没有发现明显配置问题</strong><small>仍建议定期导出配置作为备份。</small></div>
          </div>
        ) : (
          <div className="diagnostic-issue-list">
            {result.issues.map((issue) => {
              const expanded = expandedIssues.has(issue.code);
              return (
                <div className={issueClass(issue.severity)} key={issue.code}>
                  <button type="button" className="diagnostic-issue-toggle" onClick={() => toggleIssue(issue.code)}>
                    <span className="diagnostic-expand-icon">{expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</span>
                    <span className="diagnostic-issue-head-copy"><strong>{issue.title}</strong><small>{issue.detail}</small></span>
                    <span className="diagnostic-count-badge">{issue.entries.length || issue.count}</span>
                  </button>
                  {expanded && (
                    <div className="diagnostic-entry-list">
                      {issue.entries.map((entry) => (
                        <div className="diagnostic-entry" key={entry.key}>
                          <div className="diagnostic-entry-copy">
                            <strong>{entryLocation(entry)}</strong>
                            <span>{entry.message}</span>
                            {entry.path && <code title={entry.path}>{entry.path}</code>}
                          </div>
                          <button type="button" className="btn-secondary btn-compact diagnostic-jump-button" onClick={() => jumpTo(entry)}>
                            <LocateFixed size={13} /> 跳转
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="settings-section diagnostics-test-section">
        <h3>开发回归测试</h3>
        <p className="settings-hint">源码包已加入 Vitest 测试和持续集成配置。打包前运行 <code>npm run verify</code>，会先执行回归测试，再执行 TypeScript 与 Vite 构建。</p>
        <div className="diagnostic-command-row">
          <code>npm test</code>
          <code>npm run verify</code>
          <code>npm run test:watch</code>
        </div>
      </section>
    </div>
  );
}
