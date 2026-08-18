import { invoke } from '@tauri-apps/api/core';
import { useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import type { FaviconProviderId } from '../../types';
import { FAVICON_PROVIDERS } from '../../lib/faviconProviders';
import { uiAlert } from '../../lib/uiDialog';

type FaviconTestResult = { providerId: FaviconProviderId; providerName: string; group: string; success: boolean; elapsedMs: number; url?: string; error?: string };

export function IconSettingsSection() {
  const display = useAppStore((state) => state.display);
  const updateDisplay = useAppStore((state) => state.updateDisplay);
  const [domain, setDomain] = useState('nlpcloud.com');
  const [results, setResults] = useState<FaviconTestResult[]>([]);
  const [busy, setBusy] = useState(false);

  async function testSources() {
    if (busy) return;
    setBusy(true);
    setResults([]);
    try {
      setResults(await invoke<FaviconTestResult[]>('test_favicon_sources', { domain: domain.trim() || 'nlpcloud.com' }));
    } catch (error) {
      void uiAlert(`favicon 源测速失败：${String(error || '未知错误')}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="settings-section narrow-section">
      <div className="settings-section-title-row"><h3>图标</h3><span className="settings-hint">favicon 来源与测速</span></div>
      <label className="check-row"><input type="checkbox" checked={display.autoSaveWebsiteIcon !== false} onChange={(event) => updateDisplay({ autoSaveWebsiteIcon: event.target.checked })} />自动获取网站 favicon 时保存到本地</label>
      <p className="settings-hint">开启后会把 favicon 保存到本地；同一主域名及其子域名会优先复用已下载图标，例如 github.com、www.github.com、gist.github.com 共用缓存。关闭后只使用在线 favicon 地址。</p>
      <div className="field-row"><label>favicon 获取源</label><select className="soft-input" value={display.faviconProvider ?? 'auto'} onChange={(event) => updateDisplay({ faviconProvider: event.target.value as FaviconProviderId })}>{['国内', '国外', '直连'].map((group) => <optgroup key={group} label={group}>{FAVICON_PROVIDERS.filter((provider) => provider.group === group).map((provider) => <option key={provider.id} value={provider.id}>{provider.name} - {provider.description}</option>)}</optgroup>)}</select></div>
      <label className="check-row"><input type="checkbox" checked={display.faviconProviderFallback !== false} onChange={(event) => updateDisplay({ faviconProviderFallback: event.target.checked })} />当前来源失败时自动尝试其他来源</label>
      <div className="settings-subtitle settings-subtitle-spaced">favicon 源测速</div>
      <div className="path-pick-row"><input className="soft-input" value={domain} onChange={(event) => setDomain(event.target.value)} placeholder="例如 nlpcloud.com" /><button className="btn-primary" disabled={busy} onClick={() => void testSources()}>{busy ? '测试中...' : '测试速度'}</button></div>
      {!!results.length && <div className="favicon-test-table">{results.map((result) => <div key={result.providerId} className={`favicon-test-row ${result.success ? 'ok' : 'failed'}`}><span>{result.group}</span><strong>{result.providerName}</strong><em>{result.success ? '成功' : '失败'}</em><b>{result.elapsedMs} ms</b></div>)}</div>}
    </section>
  );
}
