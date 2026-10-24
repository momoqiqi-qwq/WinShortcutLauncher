import { useEffect, useMemo, useRef, useState } from 'react';
import { FolderSymlink, Link2, Loader2 } from 'lucide-react';
import type { DirectoryLinkRef, Group } from '../../types';
import {
  LINK_SOURCE_PICKER_EVENT,
  type LinkSourcePickerRequest,
} from '../../lib/linkSourcePicker';
import {
  getActiveConfigProfileId,
  getConfigProfileConfig,
  listConfigProfiles,
  type ConfigProfileMeta,
} from '../../lib/configProfiles';
import { isLinkableDirectorySource } from '../../lib/directoryLinks';
import { normalizeGroups } from '../../stores/appStore/normalizers';
import { useAppStore } from '../../stores/appStore';
import './LinkSourcePicker.css';

function byOrder<T extends { order: number }>(list: T[]): T[] {
  return [...list].sort((a, b) => a.order - b.order);
}

/**
 * v169: 「选择链接源」选择器。
 *
 * 支持跨配置：选中的配置会从 IndexedDB 读它**已保存**的那份内容（当前配置直接用内存里的
 * 最新数据，所以同配置链接连没保存的改动都能立刻同步）。
 */
export function LinkSourcePicker() {
  const [request, setRequest] = useState<LinkSourcePickerRequest | null>(null);
  const queueRef = useRef<LinkSourcePickerRequest[]>([]);
  const [profiles, setProfiles] = useState<ConfigProfileMeta[]>([]);
  const [profileId, setProfileId] = useState('');
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupId, setGroupId] = useState('');
  const [directoryId, setDirectoryId] = useState('');
  const [loading, setLoading] = useState(false);
  const storeGroups = useAppStore((state) => state.groups);

  useEffect(() => {
    function handle(event: Event) {
      const detail = (event as CustomEvent<LinkSourcePickerRequest>).detail;
      if (!detail) return;
      queueRef.current.push(detail);
      setRequest((current) => current ?? queueRef.current.shift() ?? null);
    }
    window.addEventListener(LINK_SOURCE_PICKER_EVENT, handle as EventListener);
    return () => window.removeEventListener(LINK_SOURCE_PICKER_EVENT, handle as EventListener);
  }, []);

  const close = (value: DirectoryLinkRef | null) => {
    request?.resolve(value);
    setRequest(queueRef.current.shift() ?? null);
  };

  // 打开时拉配置列表 + 载入选中配置的目录树。
  useEffect(() => {
    if (!request) return;
    let cancelled = false;
    void (async () => {
      const list = await listConfigProfiles().catch(() => [] as ConfigProfileMeta[]);
      if (cancelled) return;
      setProfiles(list);
      const activeId = getActiveConfigProfileId();
      const initialProfileId = request.initial?.profileId ?? '';
      setProfileId(initialProfileId === activeId ? '' : initialProfileId);
      setGroupId(request.initial?.groupId ?? '');
      setDirectoryId(request.initial?.directoryId ?? '');
    })();
    return () => { cancelled = true; };
  }, [request?.id]);

  const activeProfileId = getActiveConfigProfileId();

  // 当前配置直接用 store 里的最新数据；其他配置读它已保存的副本。
  useEffect(() => {
    if (!request) return;
    let cancelled = false;
    if (!profileId) {
      setGroups(storeGroups);
      return;
    }
    setLoading(true);
    void (async () => {
      const config = await getConfigProfileConfig(profileId).catch(() => null);
      if (cancelled) return;
      setGroups(config ? normalizeGroups(config.groups) : []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [profileId, request?.id, storeGroups]);

  const sortedGroups = useMemo(() => byOrder(groups), [groups]);
  const currentGroup = sortedGroups.find((group) => group.id === groupId);
  const directoryChoices = useMemo(
    () => (request?.mode === 'directory' && currentGroup
      ? byOrder(currentGroup.directories).filter(isLinkableDirectorySource)
      : []),
    [currentGroup, request?.mode],
  );

  // 目录树换了以后，把失效的选择清掉。
  useEffect(() => {
    if (!request) return;
    if (groupId && !sortedGroups.some((group) => group.id === groupId)) setGroupId('');
  }, [sortedGroups, groupId, request?.id]);
  useEffect(() => {
    if (!request || request.mode !== 'directory') return;
    if (directoryId && !directoryChoices.some((directory) => directory.id === directoryId)) setDirectoryId('');
  }, [directoryChoices, directoryId, request?.id]);

  const ready = Boolean(currentGroup) && (request?.mode === 'group' || Boolean(directoryId));

  if (!request) return null;

  const submit = () => {
    if (!request || !currentGroup || !ready) return;
    const targetDirectory = directoryChoices.find((directory) => directory.id === directoryId);
    const profileMeta = profiles.find((profile) => profile.id === profileId);
    close({
      profileId,
      ...(profileId ? { profileName: profileMeta?.name ?? '' } : {}),
      groupId: currentGroup.id,
      ...(request.mode === 'directory' && targetDirectory ? { directoryId: targetDirectory.id } : {}),
    });
  };

  return (
    <div className="ui-dialog-backdrop link-source-backdrop" onMouseDown={() => close(null)}>
      <div
        className="ui-dialog-card link-source-card"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => { if (event.key === 'Escape') close(null); }}
      >
        <div className="link-source-head">
          <span className="link-source-icon"><FolderSymlink size={18} /></span>
          <div>
            <div className="ui-dialog-title">{request.title}</div>
            <div className="ui-dialog-message">
              {request.mode === 'group'
                ? '选择一个父目录，整个父目录（含子目录与项目）会实时镜像过来。'
                : '选择一个子目录，它的项目会实时镜像到当前子目录里。'}
            </div>
          </div>
        </div>

        <label className="link-source-field">
          <span>来源配置</span>
          <select
            className="ui-dialog-input"
            value={profileId}
            onChange={(event) => { setProfileId(event.target.value); setGroupId(''); setDirectoryId(''); }}
          >
            <option value="">当前配置（实时）</option>
            {profiles
              .filter((profile) => profile.id !== activeProfileId)
              .map((profile) => (
                <option key={profile.id} value={profile.id}>{profile.name}</option>
              ))}
          </select>
        </label>

        <label className="link-source-field">
          <span>父目录</span>
          <select
            className="ui-dialog-input"
            value={groupId}
            onChange={(event) => { setGroupId(event.target.value); setDirectoryId(''); }}
            disabled={loading}
          >
            <option value="">{loading ? '读取中…' : '请选择父目录'}</option>
            {sortedGroups.map((group) => (
              <option key={group.id} value={group.id}>{group.name}</option>
            ))}
          </select>
        </label>

        {request.mode === 'directory' && (
          <label className="link-source-field">
            <span>子目录</span>
            <select
              className="ui-dialog-input"
              value={directoryId}
              onChange={(event) => setDirectoryId(event.target.value)}
              disabled={!currentGroup}
            >
              <option value="">{currentGroup ? '请选择子目录' : '先选择父目录'}</option>
              {directoryChoices.map((directory) => (
                <option key={directory.id} value={directory.id}>
                  {directory.name}{directory.kind === 'notes' ? '（便签）' : ''}
                </option>
              ))}
            </select>
          </label>
        )}

        <p className="link-source-hint">
          {profileId
            ? '跨配置链接读取的是该配置已保存的内容；在那边保存后，这边会自动同步。'
            : '同配置链接：源目录一改动，链接里立刻跟着变。'}
        </p>

        <div className="link-source-actions">
          {loading && <span className="link-source-loading"><Loader2 size={13} /> 读取配置内容…</span>}
          <button type="button" className="link-source-btn" onClick={() => close(null)}>取消</button>
          <button type="button" className="link-source-btn primary" disabled={!ready} onClick={submit}>
            <Link2 size={14} /> 建立链接
          </button>
        </div>
      </div>
    </div>
  );
}
