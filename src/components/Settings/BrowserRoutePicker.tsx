import type { BrowserRouteOverride, BrowserRouteOverrideMode, BrowserRouterSettings, DetectedBrowser } from '../../types';
import { getBrowserProfileDisplayName } from '../../lib/browserRouter';

interface BrowserRoutePickerProps {
  value?: BrowserRouteOverride;
  onChange: (route: BrowserRouteOverride) => void;
  catalog: DetectedBrowser[];
  router: BrowserRouterSettings;
  includeInherit?: boolean;
  compact?: boolean;
}

export function BrowserRoutePicker({ value, onChange, catalog, router, includeInherit = true, compact = false }: BrowserRoutePickerProps) {
  const route: BrowserRouteOverride = value ?? { mode: 'inherit' };
  const browser = catalog.find((entry) => entry.id === route.browserId);

  function setMode(mode: BrowserRouteOverrideMode) {
    if (mode !== 'specified') {
      onChange({ mode });
      return;
    }
    const nextBrowser = browser ?? catalog[0];
    onChange({
      mode,
      browserId: nextBrowser?.id,
      profileId: nextBrowser?.profiles[0]?.id,
    });
  }

  return (
    <div className={`browser-route-picker ${compact ? 'compact' : ''}`}>
      <select className="soft-input" value={route.mode} onChange={(event) => setMode(event.target.value as BrowserRouteOverrideMode)}>
        {includeInherit && <option value="inherit">继承上一级</option>}
        <option value="default">系统默认浏览器</option>
        <option value="foreground-browser">前台浏览器</option>
        <option value="specified">指定浏览器 / Profile</option>
      </select>
      {route.mode === 'specified' && (
        <>
          <select
            className="soft-input"
            value={route.browserId ?? ''}
            onChange={(event) => {
              const nextBrowser = catalog.find((entry) => entry.id === event.target.value);
              onChange({ mode: 'specified', browserId: event.target.value, profileId: nextBrowser?.profiles[0]?.id });
            }}
          >
            <option value="">选择浏览器</option>
            {catalog.map((entry) => <option value={entry.id} key={entry.id}>{entry.name}</option>)}
          </select>
          <select
            className="soft-input"
            value={route.profileId ?? ''}
            disabled={!browser}
            onChange={(event) => onChange({ ...route, profileId: event.target.value || undefined })}
          >
            <option value="">浏览器默认配置</option>
            {browser?.profiles.map((profile) => (
              <option value={profile.id} key={profile.id}>{getBrowserProfileDisplayName(router, browser.id, profile)}</option>
            ))}
          </select>
        </>
      )}
    </div>
  );
}
