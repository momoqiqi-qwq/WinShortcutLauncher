import { open } from '@tauri-apps/plugin-dialog';
import { forwardRef, useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Check, MoreHorizontal, Pencil, Plus, RefreshCw, Trash2, Upload } from 'lucide-react';
import { cloneConfig, useAppStore } from '../../stores/appStore';
import { flushAppStorePersistence } from '../../stores/appStore/persistence';
import {
  createConfigProfile,
  deleteConfigProfile,
  ensureInitialConfigProfile,
  getActiveConfigProfileId,
  getConfigProfileConfig,
  listConfigProfiles,
  makeUniqueProfileName,
  renameConfigProfile,
  saveConfigProfileConfig,
  setActiveConfigProfileId,
  type ConfigProfileMeta,
} from '../../lib/configProfiles';
import { fileNameFromPath, loadImportedConfigFromPath, profileNameFromPath } from '../../lib/importFile';
import { showLauncherNotice } from '../../lib/notify';
import { uiAlert, uiConfirm, uiPrompt } from '../../lib/uiDialog';
import './ConfigProfilesMenu.css';

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export const ConfigProfilesMenu = forwardRef<HTMLDivElement, {
  left: number;
  onClose: (restoreFocus?: boolean) => void;
  reduceMotion?: boolean;
}>(function ConfigProfilesMenu({ left, onClose, reduceMotion = false }, ref) {
  const exportConfig = useAppStore((state) => state.exportConfig);
  const importConfig = useAppStore((state) => state.importConfig);
  const [profiles, setProfiles] = useState<ConfigProfileMeta[]>([]);
  const [activeId, setActiveId] = useState('');
  const [busy, setBusy] = useState(true);
  const [status, setStatus] = useState('正在加载配置…');
  const [rowMenuId, setRowMenuId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState('');

  const activeProfile = useMemo(() => profiles.find((profile) => profile.id === activeId), [profiles, activeId]);

  async function initialize() {
    setBusy(true);
    setStatus('正在加载配置…');
    setLoadError('');
    try {
      const initialized = await ensureInitialConfigProfile(exportConfig());
      setProfiles(initialized.profiles);
      setActiveId(initialized.activeId);
    } catch (error) {
      setLoadError(errorMessage(error));
    } finally {
      setBusy(false);
      setStatus('');
    }
  }

  useEffect(() => {
    void initialize();
  }, []);

  async function refreshProfiles(saveCurrent = false) {
    if (busy) return;
    setBusy(true);
    setStatus(saveCurrent ? '正在保存当前配置…' : '正在刷新…');
    try {
      let currentId = activeId || getActiveConfigProfileId() || '';
      if (!currentId) {
        const initialized = await ensureInitialConfigProfile(exportConfig());
        currentId = initialized.activeId;
      } else if (saveCurrent) {
        await saveConfigProfileConfig(currentId, exportConfig());
      }
      const next = await listConfigProfiles();
      setProfiles(next);
      setActiveId(currentId);
      setLoadError('');
    } catch (error) {
      setLoadError(errorMessage(error));
    } finally {
      setBusy(false);
      setStatus('');
    }
  }

  async function switchProfile(profile: ConfigProfileMeta) {
    if (busy || profile.id === activeId) return;
    setBusy(true);
    setStatus(`正在切换到 ${profile.name}…`);
    try {
      const currentId = activeId || getActiveConfigProfileId();
      if (!currentId) throw new Error('找不到当前配置，请刷新后重试。');

      // Save only the active profile before switching. Other profiles stay in IndexedDB and are
      // never loaded into Zustand, keeping the working store small even with many saved profiles.
      await saveConfigProfileConfig(currentId, exportConfig());
      const targetConfig = await getConfigProfileConfig(profile.id);
      if (!targetConfig) throw new Error(`配置“${profile.name}”的数据不存在。`);

      importConfig(targetConfig);
      flushAppStorePersistence();
      setActiveConfigProfileId(profile.id);
      setActiveId(profile.id);
      showLauncherNotice(`已切换到配置：${profile.name}`);
      onClose(false);
    } catch (error) {
      void uiAlert(`切换配置失败：${errorMessage(error)}`);
    } finally {
      setBusy(false);
      setStatus('');
    }
  }

  async function createProfile() {
    if (busy) return;
    const requested = await uiPrompt('输入新配置名称。新配置会使用默认内容，当前配置会先自动保存。', '新配置', '创建配置');
    if (requested === null) return;
    const name = makeUniqueProfileName(requested || '新配置', profiles.map((profile) => profile.name));
    setBusy(true);
    setStatus('正在创建配置…');
    try {
      const currentId = activeId || getActiveConfigProfileId();
      if (currentId) await saveConfigProfileConfig(currentId, exportConfig());
      const config = cloneConfig();
      const meta = await createConfigProfile(name, config);
      importConfig(config);
      flushAppStorePersistence();
      setActiveConfigProfileId(meta.id);
      setProfiles((current) => [...current, meta]);
      setActiveId(meta.id);
      showLauncherNotice(`已创建并切换到配置：${meta.name}`);
      onClose(false);
    } catch (error) {
      void uiAlert(`创建配置失败：${errorMessage(error)}`);
    } finally {
      setBusy(false);
      setStatus('');
    }
  }

  async function importProfiles() {
    if (busy) return;
    const selected = await open({
      title: '导入多个配置文件',
      multiple: true,
      filters: [
        { name: '支持的配置', extensions: ['json', 'js', 'db'] },
        { name: 'JSON / Maye JDB 配置', extensions: ['json', 'js'] },
        { name: 'Lucy / Maye 数据库', extensions: ['db'] },
      ],
    });
    if (!selected) return;
    const paths = (Array.isArray(selected) ? selected : [selected]).map(String).filter(Boolean);
    if (!paths.length) return;

    setBusy(true);
    const imported: ConfigProfileMeta[] = [];
    const failures: string[] = [];
    const usedNames = new Set(profiles.map((profile) => profile.name));
    try {
      // Import sequentially on purpose: large configs may contain many icons/images, so this keeps
      // peak memory and simultaneous Tauri/DB I/O bounded while still supporting multi-select.
      for (let index = 0; index < paths.length; index += 1) {
        const path = paths[index];
        setStatus(`正在导入 ${index + 1}/${paths.length}…`);
        try {
          const config = await loadImportedConfigFromPath(path);
          const name = makeUniqueProfileName(profileNameFromPath(path), usedNames);
          const meta = await createConfigProfile(name, config, { sourceName: fileNameFromPath(path) });
          imported.push(meta);
          usedNames.add(meta.name);
        } catch (error) {
          failures.push(`${fileNameFromPath(path)}：${errorMessage(error)}`);
        }
      }
      if (imported.length) {
        setProfiles((current) => [...current, ...imported]);
        showLauncherNotice(`已导入 ${imported.length} 个配置，当前配置未改变`);
      }
      if (failures.length) {
        void uiAlert(`有 ${failures.length} 个配置导入失败：\n\n${failures.join('\n')}`, '多配置导入');
      }
    } finally {
      setBusy(false);
      setStatus('');
    }
  }

  async function renameProfile(profile: ConfigProfileMeta) {
    if (busy) return;
    setRowMenuId(null);
    const requested = await uiPrompt('输入新的配置名称。', profile.name, '重命名配置');
    if (requested === null || requested.trim() === profile.name) return;
    const names = profiles.filter((entry) => entry.id !== profile.id).map((entry) => entry.name);
    const name = makeUniqueProfileName(requested || profile.name, names);
    setBusy(true);
    try {
      const renamed = await renameConfigProfile(profile.id, name);
      setProfiles((current) => current.map((entry) => entry.id === profile.id ? renamed : entry));
    } catch (error) {
      void uiAlert(`重命名失败：${errorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function removeProfile(profile: ConfigProfileMeta) {
    if (busy) return;
    setRowMenuId(null);
    if (profile.id === activeId) return void uiAlert('当前正在使用的配置不能删除，请先切换到其他配置。');
    if (!await uiConfirm(`确定删除配置“${profile.name}”吗？此操作只删除保存的配置，不会影响当前正在使用的配置。`, '删除配置')) return;
    setBusy(true);
    try {
      await deleteConfigProfile(profile.id);
      setProfiles((current) => current.filter((entry) => entry.id !== profile.id));
      showLauncherNotice(`已删除配置：${profile.name}`);
    } catch (error) {
      void uiAlert(`删除配置失败：${errorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (rowMenuId) setRowMenuId(null);
      else onClose(true);
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'));
    if (!items.length) return;
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    const delta = event.key === 'ArrowDown' ? 1 : -1;
    const nextIndex = currentIndex < 0 ? 0 : (currentIndex + delta + items.length) % items.length;
    event.preventDefault();
    items[nextIndex]?.focus();
  }

  return (
    <div
      id="topbar-config-profiles-menu"
      ref={ref}
      className={`topbar-config-profiles-menu ${reduceMotion ? 'reduce-motion' : ''}`}
      style={{ left }}
      data-no-drag
      role="menu"
      aria-label="多配置"
      onKeyDown={handleKeyDown}
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.stopPropagation()}
    >
      <div className="config-profiles-head">
        <div className="config-profiles-title">
          <strong>配置文件</strong>
          <small>{activeProfile ? `当前：${activeProfile.name}` : '独立保存多个配置，只启用一个'}</small>
        </div>
        <div className="config-profiles-toolbar">
          <button type="button" title="创建默认配置" disabled={busy} onClick={() => void createProfile()}><Plus size={14} /><span>创建</span></button>
          <button type="button" title="一次导入多个配置" disabled={busy} onClick={() => void importProfiles()}><Upload size={14} /><span>导入</span></button>
          <button type="button" title="保存当前配置并刷新列表" disabled={busy} onClick={() => void refreshProfiles(true)}><RefreshCw size={14} /><span>刷新</span></button>
        </div>
      </div>

      {status && <div className="config-profiles-status"><RefreshCw size={12} className="spin" />{status}</div>}
      {loadError && (
        <div className="config-profiles-error">
          <span>{loadError}</span>
          <button type="button" onClick={() => void initialize()}>重试</button>
        </div>
      )}

      {!loadError && (
        <div className="config-profiles-list">
          {profiles.map((profile) => {
            const current = profile.id === activeId;
            const rowMenuOpen = rowMenuId === profile.id;
            return (
              <div className={`config-profile-row ${current ? 'current' : ''}`} key={profile.id}>
                <button
                  type="button"
                  role="menuitem"
                  className="config-profile-main"
                  disabled={busy || current}
                  title={current ? '当前正在使用' : `切换到 ${profile.name}`}
                  onClick={() => void switchProfile(profile)}
                >
                  <span className="config-profile-name" title={profile.name}>{profile.name}</span>
                  {profile.sourceName && <small title={profile.sourceName}>来源：{profile.sourceName}</small>}
                </button>
                {current ? <span className="config-profile-current"><Check size={12} />当前</span> : <button type="button" className="config-profile-use" disabled={busy} onClick={() => void switchProfile(profile)}>使用</button>}
                <div className="config-profile-more-wrap">
                  <button type="button" className="config-profile-more" disabled={busy} aria-label={`管理 ${profile.name}`} aria-expanded={rowMenuOpen} onClick={() => setRowMenuId(rowMenuOpen ? null : profile.id)}><MoreHorizontal size={15} /></button>
                  {rowMenuOpen && (
                    <div className="config-profile-row-menu">
                      <button type="button" disabled={busy} onClick={() => void renameProfile(profile)}><Pencil size={12} />重命名</button>
                      <button type="button" className="danger" disabled={busy || current} onClick={() => void removeProfile(profile)}><Trash2 size={12} />删除</button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {!profiles.length && !busy && <div className="config-profiles-empty">暂无配置。点击“创建”或“导入”。</div>}
        </div>
      )}
      <div className="config-profiles-foot">切换前会自动保存当前配置；多个配置不会合并，也不会同时加载到主 Store。</div>
    </div>
  );
});
