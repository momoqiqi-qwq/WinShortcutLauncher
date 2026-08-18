import { Check, Copy, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { showLauncherNotice } from '../../lib/notify';

export const APP_PACKAGE_VERSION = '0.1.106';
export const PROJECT_URL = 'https://github.com/momoqiqi-qwq/WinShortcutLauncher';

export function AboutSettingsSection() {
  const [copied, setCopied] = useState(false);

  async function copyProjectUrl() {
    try {
      await navigator.clipboard.writeText(PROJECT_URL);
      setCopied(true);
      showLauncherNotice('项目地址已复制');
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      showLauncherNotice('复制失败，请手动复制项目地址');
    }
  }

  return (
    <section className="settings-section narrow-section about-settings-section">
      <h3>关于</h3>
      <dl className="about-info-grid">
        <div>
          <dt>版本</dt>
          <dd>v{APP_PACKAGE_VERSION}</dd>
        </div>
        <div>
          <dt>作者</dt>
          <dd>momoni_yile</dd>
        </div>
        <div>
          <dt>框架</dt>
          <dd>Tauri 2 · React 18 · TypeScript · Vite</dd>
        </div>
        <div className="about-project-row">
          <dt>项目地址</dt>
          <dd>
            <a href={PROJECT_URL} target="_blank" rel="noreferrer" title="打开项目地址">
              <span>{PROJECT_URL}</span>
              <ExternalLink size={14} />
            </a>
            <button type="button" className="about-copy-button" onClick={copyProjectUrl} title="复制项目地址">
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? '已复制' : '复制'}
            </button>
          </dd>
        </div>
      </dl>
    </section>
  );
}
