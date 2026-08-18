import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CustomBrowserConfig, DetectedBrowser } from '../types';

let cachedKey = '';
let cachedCatalog: DetectedBrowser[] = [];

function makeKey(customBrowsers: CustomBrowserConfig[]) {
  return JSON.stringify(customBrowsers.map((browser) => ({
    id: browser.id,
    name: browser.name,
    executable: browser.executable,
    engine: browser.engine,
    profileRoot: browser.profileRoot ?? '',
  })));
}

export function useBrowserCatalog(customBrowsers: CustomBrowserConfig[]) {
  const key = useMemo(() => makeKey(customBrowsers), [customBrowsers]);
  const [catalog, setCatalog] = useState<DetectedBrowser[]>(() => key === cachedKey ? cachedCatalog : []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async (force = true) => {
    if (!force && key === cachedKey && cachedCatalog.length) {
      setCatalog(cachedCatalog);
      return cachedCatalog;
    }
    setBusy(true);
    setError('');
    try {
      const next = await invoke<DetectedBrowser[]>('scan_browsers', { customBrowsers });
      cachedKey = key;
      cachedCatalog = Array.isArray(next) ? next : [];
      setCatalog(cachedCatalog);
      return cachedCatalog;
    } catch (scanError) {
      const message = String(scanError);
      setError(message);
      return [];
    } finally {
      setBusy(false);
    }
  }, [customBrowsers, key]);

  useEffect(() => {
    void refresh(false);
  }, [refresh]);

  return { catalog, busy, error, refresh };
}
