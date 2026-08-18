import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { Globe2, Palette, Plus, RefreshCw, TestTube2, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import type { BrowserEngine, BrowserRouteMode, CustomBrowserConfig } from '../../types';
import { browserProfileOverrideKey, getBrowserProfileColor, getBrowserProfileDisplayName } from '../../lib/browserRouter';
import { buildBrowserLaunchTarget } from '../../lib/browserLaunchTarget';
import { useBrowserCatalog } from '../../hooks/useBrowserCatalog';
import { showLauncherNotice } from '../../lib/notify';
import { uiAlert, uiPrompt } from '../../lib/uiDialog';
import './BrowserRouterSettingsSection.css';

type ForegroundBrowserInfo = { name: string; executable: string };

function inferEngine(executable: string): BrowserEngine {
  const name = executable.replace(/\\/g, '/').split('/').pop()?.toLowerCase() ?? '';
  if (name.includes('firefox') || name.includes('floorp') || name.includes('zen')) return 'gecko';
  if (/chrome|edge|brave|vivaldi|opera|thorium|catsxp|360|qqbrowser|sogou|whale/.test(name)) return 'chromium';
  return 'generic';
}

function customBrowserId(executable: string) {
  const base = executable.replace(/\\/g, '/').split('/').pop()?.replace(/\.exe$/i, '') || 'browser';
  return `custom-${base.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}`;
}

export function BrowserRouterSettingsSection() {
  const router = useAppStore((state) => state.browserRouter);
  const updateBrowserRouter = useAppStore((state) => state.updateBrowserRouter);
  const { catalog, busy, error, refresh } = useBrowserCatalog(router.customBrowsers);
  const [testBusy, setTestBusy] = useState(false);
  const [foregroundText, setForegroundText] = useState('');

  const selectedBrowser = useMemo(
    () => catalog.find((browser) => browser.id === router.specifiedBrowserId),
    [catalog, router.specifiedBrowserId],
  );
  const selectedProfile = useMemo(
    () => selectedBrowser?.profiles.find((profile) => profile.id === router.specifiedProfileId),
    [selectedBrowser, router.specifiedProfileId],
  );

  useEffect(() => {
    if (router.mode !== 'specified' || router.specifiedBrowserId || !catalog.length) return;
    const first = catalog[0];
    updateBrowserRouter({
      specifiedBrowserId: first.id,
      specifiedProfileId: first.profiles[0]?.id ?? '',
    });
  }, [catalog, router.mode, router.specifiedBrowserId, updateBrowserRouter]);

  function updateMode(mode: BrowserRouteMode) {
    updateBrowserRouter({ mode });
    setForegroundText('');
    showLauncherNotice(
      mode === 'foreground-browser'
        ? '网址将优先使用前台浏览器'
        : mode === 'specified'
          ? '网址将使用指定浏览器 / Profile'
          : '网址将使用系统默认浏览器',
    );
  }

  async function testForegroundBrowser() {
    setTestBusy(true);
    setForegroundText('');
    try {
      const browser = await invoke<ForegroundBrowserInfo | null>('detect_foreground_browser');
      if (browser) {
        setForegroundText(`检测到：${browser.name}`);
        showLauncherNotice(`前台浏览器：${browser.name}`);
      } else {
        setForegroundText('没有检测到支持的前台浏览器，将回退系统默认浏览器');
      }
    } catch (testError) {
      setForegroundText(`检测失败：${String(testError)}`);
    } finally {
      setTestBusy(false);
    }
  }

  async function testTarget(browser = selectedBrowser, profile = selectedProfile) {
    if (!browser) {
      await uiAlert('请先选择一个浏览器。');
      return;
    }
    setTestBusy(true);
    try {
      const target = buildBrowserLaunchTarget(browser, profile, router);
      if (!target) throw new Error('浏览器路径无效');
      const message = await invoke<string>('test_browser_target', { target });
      showLauncherNotice(message || `已测试：${browser.name}`);
    } catch (testError) {
      await uiAlert(`测试失败：${String(testError)}`);
    } finally {
      setTestBusy(false);
    }
  }

  async function addCustomBrowser() {
    const picked = await open({
      multiple: false,
      directory: false,
      title: '选择浏览器可执行文件',
      filters: [{ name: '浏览器程序', extensions: ['exe'] }],
    });
    if (!picked || Array.isArray(picked)) return;
    const defaultName = picked.replace(/\\/g, '/').split('/').pop()?.replace(/\.exe$/i, '') || '自定义浏览器';
    const inputName = await uiPrompt('给这个浏览器起一个显示名称', defaultName);
    if (inputName == null) return;
    const browser: CustomBrowserConfig = {
      id: customBrowserId(picked),
      name: inputName.trim() || defaultName,
      executable: picked,
      engine: inferEngine(picked),
    };
    updateBrowserRouter({ customBrowsers: [...router.customBrowsers, browser] });
    window.setTimeout(() => void refresh(true), 0);
  }

  function updateCustomBrowser(id: string, patch: Partial<CustomBrowserConfig>) {
    updateBrowserRouter({
      customBrowsers: router.customBrowsers.map((browser) => browser.id === id ? { ...browser, ...patch } : browser),
    });
  }

  function removeCustomBrowser(id: string) {
    updateBrowserRouter({
      customBrowsers: router.customBrowsers.filter((browser) => browser.id !== id),
      ...(router.specifiedBrowserId === id ? { specifiedBrowserId: '', specifiedProfileId: '' } : {}),
    });
  }

  async function chooseProfileRoot(browser: CustomBrowserConfig) {
    const picked = await open({ multiple: false, directory: true, title: '选择浏览器 Profile / User Data 根目录' });
    if (!picked || Array.isArray(picked)) return;
    updateCustomBrowser(browser.id, { profileRoot: picked });
    window.setTimeout(() => void refresh(true), 0);
  }

  function setProfileOverride(browserId: string, profileId: string, patch: { name?: string; color?: string }) {
    const key = browserProfileOverrideKey(browserId, profileId);
    const current = router.profileOverrides[key] ?? {};
    const next = { ...current, ...patch };
    updateBrowserRouter({
      profileOverrides: {
        ...router.profileOverrides,
        [key]: next,
      },
    });
  }

  return (
    <div className="browser-router-settings" data-settings-target="url-browser-mode" data-settings-focus="浏览器路由中心">
      <div className="browser-router-heading">
        <div>
          <h4><Globe2 size={16} /> 浏览器路由中心</h4>
          <p>优先级：单个网址 → 父目录 → 全局。指定浏览器/Profile 启动失败时自动回退系统默认浏览器。</p>
        </div>
        <button type="button" className="btn-secondary btn-compact" disabled={busy} onClick={() => void refresh(true)}>
          <RefreshCw size={14} /> {busy ? '扫描中…' : '重新扫描'}
        </button>
      </div>

      <div className="field-row">
        <label>全局网址打开方式</label>
        <select className="soft-input" value={router.mode} onChange={(event) => updateMode(event.target.value as BrowserRouteMode)}>
          <option value="default">系统默认浏览器</option>
          <option value="foreground-browser">前台浏览器</option>
          <option value="specified">指定浏览器 / Profile</option>
        </select>
      </div>

      {router.mode === 'foreground-browser' && (
        <div className="browser-router-actions">
          <button type="button" className="btn-secondary" disabled={testBusy} onClick={() => void testForegroundBrowser()}>
            <TestTube2 size={14} /> {testBusy ? '检测中…' : '测试当前前台浏览器'}
          </button>
          {foregroundText && <span className="settings-hint">{foregroundText}</span>}
        </div>
      )}

      {router.mode === 'specified' && (
        <div className="browser-router-target-card">
          <div className="field-row">
            <label>指定浏览器</label>
            <select
              className="soft-input"
              value={router.specifiedBrowserId}
              onChange={(event) => {
                const browser = catalog.find((entry) => entry.id === event.target.value);
                updateBrowserRouter({
                  specifiedBrowserId: event.target.value,
                  specifiedProfileId: browser?.profiles[0]?.id ?? '',
                });
              }}
            >
              <option value="">请选择浏览器</option>
              {catalog.map((browser) => <option key={browser.id} value={browser.id}>{browser.name}</option>)}
            </select>
          </div>
          <div className="field-row">
            <label>Profile / 账号</label>
            <select
              className="soft-input"
              value={router.specifiedProfileId}
              disabled={!selectedBrowser}
              onChange={(event) => updateBrowserRouter({ specifiedProfileId: event.target.value })}
            >
              <option value="">浏览器默认配置</option>
              {selectedBrowser?.profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>{getBrowserProfileDisplayName(router, selectedBrowser.id, profile)}</option>
              ))}
            </select>
          </div>
          <div className="browser-router-actions">
            <button type="button" className="btn-primary" disabled={!selectedBrowser || testBusy} onClick={() => void testTarget()}>
              <TestTube2 size={14} /> 测试浏览器 / Profile
            </button>
          </div>
        </div>
      )}

      <div className="browser-router-catalog-head">
        <strong>已发现浏览器与 Profile</strong>
        <span>{catalog.length ? `${catalog.length} 个浏览器` : '尚未发现浏览器'}</span>
      </div>
      {error && <p className="settings-hint browser-router-error">扫描失败：{error}</p>}

      <div className="browser-router-catalog">
        {catalog.map((browser) => (
          <div className="browser-router-browser-card" key={browser.id}>
            <div className="browser-router-browser-title">
              <div>
                <strong>{browser.name}</strong>
                <span>{browser.engine === 'chromium' ? 'Chromium' : browser.engine === 'gecko' ? 'Firefox / Gecko' : '通用'} · {browser.source === 'custom' ? '自定义' : '自动发现'}</span>
              </div>
              <button type="button" className="btn-secondary btn-compact" disabled={testBusy} onClick={() => void testTarget(browser, undefined)}>测试浏览器</button>
            </div>
            <code title={browser.executable}>{browser.executable}</code>
            {browser.profiles.length > 0 ? (
              <div className="browser-router-profiles">
                {browser.profiles.map((profile, index) => {
                  const key = browserProfileOverrideKey(browser.id, profile.id);
                  const displayName = getBrowserProfileDisplayName(router, browser.id, profile);
                  const color = getBrowserProfileColor(router, browser.id, profile, index);
                  return (
                    <div className="browser-router-profile-row" key={profile.id}>
                      <input
                        type="color"
                        title="Profile 颜色"
                        value={color}
                        onChange={(event) => setProfileOverride(browser.id, profile.id, { color: event.target.value })}
                      />
                      <div className="browser-router-profile-main">
                        <input
                          className="soft-input"
                          value={displayName}
                          onChange={(event) => setProfileOverride(browser.id, profile.id, { name: event.target.value })}
                          title={`原始名称：${profile.name}`}
                        />
                        <small title={profile.path}>{profile.profileKey}</small>
                      </div>
                      <button type="button" className="btn-secondary btn-compact" disabled={testBusy} onClick={() => void testTarget(browser, profile)}>测试</button>
                      {router.profileOverrides[key] && (
                        <button
                          type="button"
                          className="icon-button browser-router-reset-profile"
                          title="恢复 Profile 默认名称和颜色"
                          onClick={() => {
                            const next = { ...router.profileOverrides };
                            delete next[key];
                            updateBrowserRouter({ profileOverrides: next });
                          }}
                        >
                          <Palette size={13} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : <p className="settings-hint">未发现 Profile；仍可把该浏览器作为指定浏览器使用。</p>}
          </div>
        ))}
      </div>

      <div className="browser-router-custom-head">
        <strong>自定义 / 便携版浏览器</strong>
        <button type="button" className="btn-secondary btn-compact" onClick={() => void addCustomBrowser()}><Plus size={14} /> 添加 EXE</button>
      </div>
      {router.customBrowsers.map((browser) => (
        <div className="browser-router-custom-row" key={browser.id}>
          <input className="soft-input" value={browser.name} onChange={(event) => updateCustomBrowser(browser.id, { name: event.target.value })} />
          <select className="soft-input" value={browser.engine} onChange={(event) => updateCustomBrowser(browser.id, { engine: event.target.value as BrowserEngine })}>
            <option value="chromium">Chromium</option>
            <option value="gecko">Firefox / Gecko</option>
            <option value="generic">通用浏览器</option>
          </select>
          <button type="button" className="btn-secondary btn-compact" onClick={() => void chooseProfileRoot(browser)}>Profile 根目录</button>
          <button type="button" className="icon-button danger" title="删除自定义浏览器" onClick={() => removeCustomBrowser(browser.id)}><Trash2 size={14} /></button>
          <code title={browser.executable}>{browser.executable}</code>
          <span className="settings-hint" title={browser.profileRoot}>{browser.profileRoot ? `Profile：${browser.profileRoot}` : '未指定 Profile 根目录'}</span>
        </div>
      ))}
      <p className="settings-hint">Chrome / Edge 会读取 User Data 下的 Profile；Firefox / Floorp 会读取 profiles.ini / Profiles。这里只读取名称与路径，不修改浏览器账号数据。</p>
    </div>
  );
}
