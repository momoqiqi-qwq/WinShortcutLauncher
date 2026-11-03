import { open } from '@tauri-apps/plugin-dialog';
import { forwardRef, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Check, ClipboardPaste, GripVertical, MoreHorizontal, Palette, Pencil, Plus, RefreshCw, Rows3, Trash2, Upload } from 'lucide-react';
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
  reorderConfigProfiles,
  saveConfigProfileConfig,
  setActiveConfigProfileId,
  setConfigProfileColor,
  type ConfigProfileMeta,
} from '../../lib/configProfiles';
import { isHexColor, resolveColorFrameClusters } from '../../lib/colorFrames';
import { readProfileListLayout, writeProfileListLayout, type ProfileListLayout } from '../../lib/profileListLayout';
import { ProfileColorClusterFrames } from './ProfileColorClusterFrames';
import { fileNameFromPath, loadImportedConfigFromPath, profileNameFromPath } from '../../lib/importFile';
import { showLauncherNotice } from '../../lib/notify';
import { uiAlert, uiConfirm, uiPrompt } from '../../lib/uiDialog';
import { appendCopiedGroupToConfig } from '../../lib/navigationClipboard';
import './ConfigProfilesMenu.css';

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * v189: 配置行可用的颜色。与父目录 / 子目录 / 项目同一套色板（`#f59e0b` 这一组），
 * 另外面板里还能填任意 `#RGB` / `#RRGGBB` / `#RRGGBBAA`。
 */
const PROFILE_COLOR_PRESETS = [
  { label: '琥珀', value: '#f59e0b' },
  { label: '青绿', value: '#10b981' },
  { label: '天蓝', value: '#0ea5e9' },
  { label: '紫色', value: '#8b5cf6' },
  { label: '玫红', value: '#ec4899' },
  { label: '珊瑚', value: '#f97316' },
  { label: '石墨', value: '#64748b' },
  { label: '大红', value: '#ef4444' },
] as const;

function sameColor(a: string | undefined, b: string | undefined) {
  return (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();
}

/**
 * v192: 多行模式下那行时间戳。写成 `MM-DD HH:mm` 的定长格式 —— 面板很窄，
 * 用 `toLocaleString` 会带出年份和秒，一行放不下反而要换行。
 */
function formatProfileStamp(timestamp?: number) {
  if (!timestamp || !Number.isFinite(timestamp)) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * v187: 单行配置 —— 和 Sidebar 的子目录拖动同一套 dnd-kit 用法。
 *
 * 拖动手柄单独做成一行最左边的小按钮，行内的「使用 / 粘贴 / ···」都保持原来的点击行为，
 * 不会因为挂上 sortable 而抢走点击事件（当前配置行整行是 disabled 的，只有手柄能拖）。
 *
 * v189: 手柄右边多一个颜色圆点 —— 点开就是色板（预设 8 色 + 自定义 + 跟随主题）。
 * 上色只改这一行的描边/底色/左侧色条，点和拖动都不受影响；相邻同色的行由列表统一圈框。
 */
function SortableProfileRow({
  profile,
  current,
  multiline,
  busy,
  copiedGroupName,
  rowMenuOpen,
  colorMenuOpen,
  colorMenuAbove,
  dragSessionActive,
  onToggleMenu,
  onToggleColorMenu,
  onPickColor,
  onCustomColor,
  onSwitch,
  onPaste,
  onRename,
  onDelete,
}: {
  profile: ConfigProfileMeta;
  current: boolean;
  /** v192: 多行显示 —— 名称完整换行，来源 + 时间戳单独一行，按钮另起一行。 */
  multiline: boolean;
  busy: boolean;
  copiedGroupName: string | null;
  rowMenuOpen: boolean;
  colorMenuOpen: boolean;
  /** v189: 靠列表底部时色板朝上弹，免得被滚动容器裁掉。 */
  colorMenuAbove: boolean;
  dragSessionActive: boolean;
  onToggleMenu: (profile: ConfigProfileMeta) => void;
  onToggleColorMenu: (profile: ConfigProfileMeta) => void;
  onPickColor: (profile: ConfigProfileMeta, color?: string) => void;
  onCustomColor: (profile: ConfigProfileMeta) => void;
  onSwitch: (profile: ConfigProfileMeta) => void;
  onPaste: (profile: ConfigProfileMeta) => void;
  onRename: (profile: ConfigProfileMeta) => void;
  onDelete: (profile: ConfigProfileMeta) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: profile.id, disabled: busy });
  const style = {
    transform: dragSessionActive ? CSS.Transform.toString(transform) : undefined,
    transition: dragSessionActive ? transition : undefined,
    '--profile-color': profile.color,
  } as CSSProperties;
  // v192: 多行模式才显示时间戳；单行模式保持 V191 的样子（名称 + 来源两行，紧凑 55px）。
  const updatedStamp = multiline ? formatProfileStamp(profile.updatedAt) : '';
  const createdStamp = multiline ? formatProfileStamp(profile.createdAt) : '';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`config-profile-row ${current ? 'current' : ''} ${profile.color ? 'tinted' : ''} ${colorMenuOpen ? 'color-open' : ''} ${isDragging ? 'dragging' : ''}`}
      data-profile-id={profile.id}
    >
      <button
        type="button"
        className="config-profile-grip"
        disabled={busy}
        title="按住上下拖动，调整配置显示顺序"
        aria-label={`拖动 ${profile.name} 调整顺序`}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={14} />
      </button>
      <button
        type="button"
        className={`config-profile-swatch ${profile.color ? 'filled' : ''}`}
        disabled={busy}
        aria-expanded={colorMenuOpen}
        title={profile.color ? `${profile.name} 的颜色：${profile.color}（点击更换）` : `给 ${profile.name} 上色`}
        aria-label={profile.color ? `${profile.name} 的颜色是 ${profile.color}，点击更换` : `给 ${profile.name} 上色`}
        onClick={() => onToggleColorMenu(profile)}
      >
        {!profile.color && <Palette size={10} />}
      </button>
      <button
        type="button"
        role="menuitem"
        className="config-profile-main"
        disabled={busy || current}
        title={current ? '当前正在使用' : `切换到 ${profile.name}`}
        onClick={() => onSwitch(profile)}
      >
        <span className="config-profile-name" title={profile.name}>{profile.name}</span>
        {profile.sourceName && <small title={profile.sourceName}>来源：{profile.sourceName}</small>}
        {multiline && (updatedStamp || createdStamp) && (
          <small className="config-profile-stamp">
            {updatedStamp && `更新 ${updatedStamp}`}
            {updatedStamp && createdStamp && ' · '}
            {createdStamp && `创建 ${createdStamp}`}
          </small>
        )}
      </button>
      <div className="config-profile-actions">
        {copiedGroupName && <button type="button" className="config-profile-paste" disabled={busy} title={`把父目录「${copiedGroupName}」粘贴到 ${profile.name}`} onClick={() => onPaste(profile)}><ClipboardPaste size={12} />粘贴</button>}
        {current ? <span className="config-profile-current"><Check size={12} />当前</span> : <button type="button" className="config-profile-use" disabled={busy} onClick={() => onSwitch(profile)}>使用</button>}
      </div>
      <div className="config-profile-more-wrap">
        <button type="button" className="config-profile-more" disabled={busy} aria-label={`管理 ${profile.name}`} aria-expanded={rowMenuOpen} onClick={() => onToggleMenu(profile)}><MoreHorizontal size={15} /></button>
        {rowMenuOpen && (
          <div className="config-profile-row-menu">
            {copiedGroupName && <button type="button" disabled={busy} onClick={() => onPaste(profile)}><ClipboardPaste size={12} />粘贴父目录「{copiedGroupName}」</button>}
            <button type="button" disabled={busy} onClick={() => onToggleColorMenu(profile)}><Palette size={12} />{profile.color ? '更换颜色' : '给这个配置上色'}</button>
            <button type="button" disabled={busy} onClick={() => onRename(profile)}><Pencil size={12} />重命名</button>
            <button type="button" className="danger" disabled={busy || current} onClick={() => onDelete(profile)}><Trash2 size={12} />删除</button>
          </div>
        )}
      </div>
      {colorMenuOpen && (
        <div className={`config-profile-colors ${colorMenuAbove ? 'flip-up' : ''}`} role="dialog" aria-label={`${profile.name} 的颜色`} onMouseDown={(event) => event.stopPropagation()}>
          <div className="config-profile-color-swatches">
            {PROFILE_COLOR_PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                className={`config-profile-color-dot ${sameColor(profile.color, preset.value) ? 'active' : ''}`}
                style={{ background: preset.value }}
                title={preset.label}
                aria-label={preset.label}
                onClick={() => onPickColor(profile, preset.value)}
              />
            ))}
          </div>
          <div className="config-profile-color-actions">
            <button type="button" className={profile.color ? '' : 'active'} onClick={() => onPickColor(profile, undefined)}>跟随主题</button>
            <button type="button" onClick={() => onCustomColor(profile)}><Palette size={10} />自定义…</button>
          </div>
          <small className="config-profile-color-hint">相邻同色的配置会自动圈成一组</small>
        </div>
      )}
    </div>
  );
}

export const ConfigProfilesMenu = forwardRef<HTMLDivElement, {
  onClose: (restoreFocus?: boolean) => void;
  reduceMotion?: boolean;
  closing?: boolean;
}>(function ConfigProfilesMenu({ onClose, reduceMotion = false, closing = false }, ref) {
  const exportConfig = useAppStore((state) => state.exportConfig);
  const importConfig = useAppStore((state) => state.importConfig);
  const navigationClipboard = useAppStore((state) => state.navigationClipboard);
  const pasteGroupFromClipboard = useAppStore((state) => state.pasteGroupFromClipboard);
  const [profiles, setProfiles] = useState<ConfigProfileMeta[]>([]);
  const [activeId, setActiveId] = useState('');
  const [busy, setBusy] = useState(true);
  const [status, setStatus] = useState('正在加载配置…');
  const [rowMenuId, setRowMenuId] = useState<string | null>(null);
  // v189: 正在挑颜色的配置行（同一时刻只开一个色板）。
  const [colorMenuId, setColorMenuId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const [loadError, setLoadError] = useState('');
  // v187: 拖动排序会话。activeDragId 只用来在拖动期间开 transform / 给行加样式。
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [dndSessionKey, setDndSessionKey] = useState(0);
  // v192: 列表行布局 —— 单行紧凑 / 多行显示。偏好存 localStorage，重启后保持上次选择。
  const [layout, setLayout] = useState<ProfileListLayout>(() => readProfileListLayout());
  const multiline = layout === 'multiline';

  useEffect(() => {
    writeProfileListLayout(layout);
  }, [layout]);

  function toggleLayout() {
    // 换布局时行高会变，旧菜单/色板还按旧坐标摆着，直接收掉。
    setRowMenuId(null);
    setColorMenuId(null);
    setLayout((current) => (current === 'multiline' ? 'compact' : 'multiline'));
  }

  const activeProfile = useMemo(() => profiles.find((profile) => profile.id === activeId), [profiles, activeId]);
  const copiedGroup = navigationClipboard?.kind === 'group' ? navigationClipboard.group : null;
  const profileIds = useMemo(() => profiles.map((profile) => profile.id), [profiles]);
  // v189: 相邻同色的配置行 → 成组框（和父目录 / 子目录用的是同一个聚类函数）。
  const colorClusters = useMemo(
    () => resolveColorFrameClusters(profiles.map((profile) => ({ id: profile.id, color: profile.color }))),
    [profiles],
  );
  const sensors = useSensors(
    // distance:5 让「点一下就切换配置」照旧有效，只有真的拉动才算拖动。
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function hardResetDragSession() {
    setActiveDragId(null);
    setDndSessionKey((value) => value + 1);
  }

  function handleDragStart(event: DragStartEvent) {
    setRowMenuId(null);
    setColorMenuId(null);
    setActiveDragId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    try {
      if (!over || active.id === over.id) return;
      const oldIndex = profileIds.indexOf(String(active.id));
      const newIndex = profileIds.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return;
      const next = arrayMove(profiles, oldIndex, newIndex);
      // 先乐观更新，界面立刻跟手；写库失败再回滚成数据库里的真实顺序。
      setProfiles(next);
      void reorderConfigProfiles(next.map((profile) => profile.id))
        .then((saved) => setProfiles(saved))
        .catch(async (error) => {
          void uiAlert(`保存配置顺序失败：${errorMessage(error)}`);
          try {
            setProfiles(await listConfigProfiles());
          } catch {
            // 读也失败时保持乐观顺序，下次打开面板会重新从库里读。
          }
        });
    } finally {
      setActiveDragId(null);
    }
  }

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

  async function pasteCopiedGroup(profile: ConfigProfileMeta) {
    if (busy || !copiedGroup) return;
    setRowMenuId(null);
    setBusy(true);
    setStatus(`正在粘贴到 ${profile.name}…`);
    try {
      if (profile.id === activeId) {
        const pastedId = pasteGroupFromClipboard();
        if (!pastedId) throw new Error('复制的父目录已经失效，请重新复制。');
        const pasted = useAppStore.getState().groups.find((entry) => entry.id === pastedId);
        const updated = await saveConfigProfileConfig(profile.id, exportConfig());
        setProfiles((current) => current.map((entry) => entry.id === profile.id ? updated : entry));
        showLauncherNotice(`已粘贴到当前配置「${profile.name}」${pasted ? `：${pasted.name}` : ''}`);
      } else {
        const targetConfig = await getConfigProfileConfig(profile.id);
        if (!targetConfig) throw new Error(`配置“${profile.name}”的数据不存在。`);
        const appended = appendCopiedGroupToConfig(targetConfig, copiedGroup);
        const updated = await saveConfigProfileConfig(profile.id, appended.config);
        setProfiles((current) => current.map((entry) => entry.id === profile.id ? updated : entry));
        showLauncherNotice(`已把父目录「${appended.group.name}」粘贴到配置「${profile.name}」`);
      }
    } catch (error) {
      void uiAlert(`粘贴父目录失败：${errorMessage(error)}`);
    } finally {
      setBusy(false);
      setStatus('');
    }
  }

  /**
   * v189: 给配置行上色 / 改成跟随主题。
   *
   * 和拖动排序一样先乐观更新，写库失败再回滚 —— 挑颜色这种动作必须立刻有反馈，
   * 等 IndexedDB 回来才变色会明显顿一下。
   */
  function applyProfileColor(profile: ConfigProfileMeta, color?: string) {
    setColorMenuId(null);
    setProfiles((current) => current.map((entry) => entry.id === profile.id ? { ...entry, color } : entry));
    void setConfigProfileColor(profile.id, color)
      .then((saved) => {
        setProfiles((current) => current.map((entry) => entry.id === profile.id ? { ...entry, color: saved.color } : entry));
      })
      .catch(async (error) => {
        void uiAlert(`保存配置颜色失败：${errorMessage(error)}`);
        try {
          setProfiles(await listConfigProfiles());
        } catch {
          // 读也失败时保持乐观色，下次打开面板会重新从库里读。
        }
      });
  }

  /** v189: 自定义颜色 —— 和子目录 / 项目的「自定义颜色…」同一套提示与校验，留空表示跟随主题。 */
  async function customizeProfileColor(profile: ConfigProfileMeta) {
    setRowMenuId(null);
    setColorMenuId(null);
    const requested = await uiPrompt(
      '输入配置颜色，支持 #RGB / #RRGGBB / #RRGGBBAA。留空表示跟随主题。',
      profile.color ?? '#8b5cf6',
      `${profile.name} 的颜色`,
    );
    if (requested === null) return;
    const next = requested.trim();
    if (!next) {
      applyProfileColor(profile, undefined);
      return;
    }
    if (!isHexColor(next)) {
      void uiAlert('颜色格式不正确，请输入类似 #8b5cf6 的十六进制颜色。');
      return;
    }
    applyProfileColor(profile, next.toLowerCase());
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
    // v187: 拖动排序会话里方向键 / Esc 交给 dnd-kit，避免边拖边跳焦点或直接把面板关掉。
    if (activeDragId) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (colorMenuId) setColorMenuId(null);
      else if (rowMenuId) setRowMenuId(null);
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
      className={`topbar-config-profiles-menu ${reduceMotion ? 'reduce-motion' : ''} ${closing ? 'is-closing' : ''}`}
      aria-hidden={closing || undefined}
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
          <button
            type="button"
            className={`config-profiles-density${multiline ? ' active' : ''}`}
            aria-pressed={multiline}
            aria-label={multiline ? '多行显示已开启，点击切回单行' : '多行显示已关闭，点击开启'}
            title={multiline
              ? '多行显示：名称完整换行，来源时间和操作按钮各占一行（点击切回单行）'
              : '多行显示：名称完整换行，来源时间和操作按钮各占一行'}
            onClick={toggleLayout}
          >
            <Rows3 size={14} /><span>多行</span>
          </button>
        </div>
      </div>

      {copiedGroup && (
        <div className="config-profiles-clipboard" title={`已复制父目录：${copiedGroup.name}`}>
          <ClipboardPaste size={12} />
          <span>剪贴板：父目录「{copiedGroup.name}」</span>
          <small>可直接点配置行“粘贴”，无需先切换配置</small>
        </div>
      )}

      {status && <div className="config-profiles-status"><RefreshCw size={12} className="spin" />{status}</div>}
      {loadError && (
        <div className="config-profiles-error">
          <span>{loadError}</span>
          <button type="button" onClick={() => void initialize()}>重试</button>
        </div>
      )}

      {!loadError && (
        <DndContext
          key={dndSessionKey}
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragCancel={hardResetDragSession}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={profileIds} strategy={verticalListSortingStrategy}>
            <div ref={listRef} className={`config-profiles-list ${activeDragId ? 'is-dragging' : ''} ${multiline ? 'is-multiline' : ''}`}>
              {profiles.map((profile, index) => (
                <SortableProfileRow
                  key={profile.id}
                  profile={profile}
                  current={profile.id === activeId}
                  multiline={multiline}
                  busy={busy}
                  copiedGroupName={copiedGroup?.name ?? null}
                  rowMenuOpen={rowMenuId === profile.id}
                  colorMenuOpen={colorMenuId === profile.id}
                  colorMenuAbove={profiles.length - 1 - index < 3}
                  dragSessionActive={activeDragId !== null}
                  onToggleMenu={(target) => {
                    setColorMenuId(null);
                    setRowMenuId((current) => (current === target.id ? null : target.id));
                  }}
                  onToggleColorMenu={(target) => {
                    setRowMenuId(null);
                    setColorMenuId((current) => (current === target.id ? null : target.id));
                  }}
                  onPickColor={(target, color) => applyProfileColor(target, color)}
                  onCustomColor={(target) => void customizeProfileColor(target)}
                  onSwitch={(target) => void switchProfile(target)}
                  onPaste={(target) => void pasteCopiedGroup(target)}
                  onRename={(target) => void renameProfile(target)}
                  onDelete={(target) => void removeProfile(target)}
                />
              ))}
              {/* v189: 相邻同色的配置行圈成一个框，拖动时先撤掉，免得框跟着手抖。 */}
              <ProfileColorClusterFrames
                clusters={colorClusters}
                containerRef={listRef}
                suppressed={activeDragId !== null || busy}
              />
              {!profiles.length && !busy && <div className="config-profiles-empty">暂无配置。点击“创建”或“导入”。</div>}
            </div>
          </SortableContext>
        </DndContext>
      )}
      <div className="config-profiles-foot">按住每行左侧的 <GripVertical size={9} className="config-profiles-foot-grip" /> 手柄可上下拖动，调整配置的显示顺序。点左边的色点可给这一行上色（也能填自定义色值），相邻同色的配置会自动圈成一组。右上角「多行」可让名称完整换行、来源和时间戳各占一行、按钮单独一行（偏好会记住）。切换前会自动保存当前配置；多个配置不会合并，也不会同时加载到主 Store。</div>
    </div>
  );
});
