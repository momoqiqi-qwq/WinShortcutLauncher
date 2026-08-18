import { Globe2, RefreshCw } from 'lucide-react';
import { useMemo } from 'react';
import { useAppStore } from '../../stores/appStore';
import { byOrder } from '../../lib/sort';
import { useBrowserCatalog } from '../../hooks/useBrowserCatalog';
import { BrowserRoutePicker } from './BrowserRoutePicker';
import './BrowserRouterSettingsSection.css';

export function ParentGroupBrowserRoutingSettings() {
  const rawGroups = useAppStore((state) => state.groups);
  const groups = useMemo(() => rawGroups.slice().sort(byOrder), [rawGroups]);
  const router = useAppStore((state) => state.browserRouter);
  const setGroupBrowserRoute = useAppStore((state) => state.setGroupBrowserRoute);
  const { catalog, busy, refresh } = useBrowserCatalog(router.customBrowsers);

  return (
    <section className="settings-section parent-group-browser-routing">
      <div className="browser-router-heading">
        <div>
          <h3><Globe2 size={17} /> 父目录默认浏览器 / Profile</h3>
          <p>父目录中的网址默认继承这里；单个网址仍可以继续覆盖。未设置时继承“浏览器路由中心”的全局规则。</p>
        </div>
        <button type="button" className="btn-secondary btn-compact" disabled={busy} onClick={() => void refresh(true)}>
          <RefreshCw size={14} /> {busy ? '扫描中…' : '刷新浏览器'}
        </button>
      </div>
      <div className="parent-group-browser-list">
        {groups.map((group) => (
          <div className="parent-group-browser-row" key={group.id}>
            <div className="parent-group-browser-name">
              <span className="parent-group-browser-dot" style={{ background: group.color || 'var(--accent)' }} />
              <strong>{group.name}</strong>
            </div>
            <BrowserRoutePicker
              compact
              value={group.browserRoute}
              catalog={catalog}
              router={router}
              onChange={(route) => setGroupBrowserRoute(group.id, route)}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
