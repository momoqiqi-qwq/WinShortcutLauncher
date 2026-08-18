import { ChevronRight, FolderPlus, Merge, Palette, Trash2 } from 'lucide-react';
import { useMemo, useState, type MouseEvent } from 'react';
import type { ContextMenuState } from '../../types';
import { useAppStore } from '../../stores/appStore';
import { useSmartMenuPosition } from './useSmartMenuPosition';
import { byOrder } from '../../lib/sort';
import { uiAlert, uiConfirm, uiPrompt } from '../../lib/uiDialog';

const GROUP_COLOR_PRESETS = [
  { label: '默认', value: '' },
  { label: '琥珀', value: '#f59e0b' },
  { label: '青绿', value: '#10b981' },
  { label: '天蓝', value: '#0ea5e9' },
  { label: '紫色', value: '#8b5cf6' },
  { label: '玫红', value: '#ec4899' },
  { label: '珊瑚', value: '#f97316' },
  { label: '石墨', value: '#64748b' },
] as const;

interface GroupContextMenuProps {
  menu: Extract<ContextMenuState, { kind: 'group' }>;
  onClose: () => void;
}

export function GroupContextMenu({ menu, onClose }: GroupContextMenuProps) {
  const rawGroups = useAppStore((state) => state.groups);
  const groups = useMemo(() => rawGroups.slice().sort(byOrder), [rawGroups]);
  const group = groups.find((entry) => entry.id === menu.groupId);
  const addGroup = useAppStore((state) => state.addGroup);
  const deleteGroup = useAppStore((state) => state.deleteGroup);
  const mergeGroup = useAppStore((state) => state.mergeGroup);
  const setGroupColor = useAppStore((state) => state.setGroupColor);
  const experience = useAppStore((state) => state.experience);
  const hiddenItems = new Set(experience.groupContextMenuHiddenItems ?? []);
  const show = (id: import('../../types').GroupContextMenuItemId) => !hiddenItems.has(id);
  const { ref, style, submenuClassName } = useSmartMenuPosition(menu.x, menu.y, 8, 260);
  const [openSubmenu, setOpenSubmenu] = useState<'merge' | 'color' | null>(null);

  if (!group) return null;
  const currentGroup = group;
  const targetGroups = groups.filter((entry) => entry.id !== currentGroup.id);

  function createGroup() {
    addGroup('新父目录');
    onClose();
  }

  async function remove() {
    if (groups.length <= 1) return;
    const ok = !experience.confirmDeleteNavigation || await uiConfirm(`确定删除父目录「${currentGroup.name}」及其中所有子目录吗？`);
    if (ok) deleteGroup(currentGroup.id);
    onClose();
  }

  async function mergeTo(targetGroupId: string) {
    const target = groups.find((entry) => entry.id === targetGroupId);
    if (!target) return;
    const ok = await uiConfirm(`确定把父目录「${currentGroup.name}」合并到「${target.name}」吗？合并后当前父目录会被删除。`);
    if (ok) mergeGroup(currentGroup.id, targetGroupId);
    onClose();
  }

  function applyColor(color?: string) {
    setGroupColor(currentGroup.id, color || undefined);
    onClose();
  }

  async function applyCustomColor() {
    const raw = await uiPrompt('请输入父目录颜色（支持 #RGB / #RRGGBB / #RRGGBBAA）', currentGroup.color ?? '#8b5cf6');
    if (raw == null) return;
    const next = raw.trim();
    if (!next) {
      applyColor(undefined);
      return;
    }
    if (!/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(next)) {
      await uiAlert('颜色格式不正确，请输入类似 #8b5cf6 的十六进制颜色。');
      return;
    }
    applyColor(next);
  }

  return (
    <div
      ref={ref}
      className={`menu-surface item-context-menu group-context-menu ${submenuClassName}`}
      style={style}
      onMouseDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      {show('create') && <div className="menu-item" onMouseEnter={() => setOpenSubmenu(null)} onClick={createGroup}><span>新建父目录</span><FolderPlus size={15} /></div>}
      {show('merge') && <div className={`menu-item with-submenu ${targetGroups.length === 0 ? 'disabled' : ''}`} onMouseEnter={() => setOpenSubmenu('merge')} onClick={() => targetGroups.length > 0 && setOpenSubmenu((value) => value === 'merge' ? null : 'merge')}>
        <span>合并到父目录</span><ChevronRight size={14} />
        {openSubmenu === 'merge' && targetGroups.length > 0 && (
          <div className="menu-surface directory-submenu small-submenu">
            {targetGroups.map((target) => (
              <div
                className="menu-item"
                key={target.id}
                onClick={(event: MouseEvent<HTMLDivElement>) => {
                  event.stopPropagation();
                  void mergeTo(target.id);
                }}
              >
                <span>{target.name}</span><Merge size={13} />
              </div>
            ))}
          </div>
        )}
      </div>}
      {show('color') && <div className="menu-item with-submenu" onMouseEnter={() => setOpenSubmenu('color')} onClick={() => setOpenSubmenu((value) => value === 'color' ? null : 'color')}>
        <span>父目录背景色</span><ChevronRight size={14} />
        {openSubmenu === 'color' && (
          <div className="menu-surface directory-submenu small-submenu">
            {GROUP_COLOR_PRESETS.map((preset) => (
              <div
                className="menu-item"
                key={preset.label}
                onClick={(event: MouseEvent<HTMLDivElement>) => {
                  event.stopPropagation();
                  applyColor(preset.value || undefined);
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <span
                    aria-hidden="true"
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 999,
                      border: '1px solid color-mix(in srgb, var(--border), transparent 18%)',
                      background: preset.value || 'linear-gradient(135deg, transparent 0 46%, var(--danger) 46% 54%, transparent 54% 100%)',
                    }}
                  />
                  {preset.label}
                </span>
                <Palette size={13} />
              </div>
            ))}
            <div className="menu-item" onClick={(event: MouseEvent<HTMLDivElement>) => { event.stopPropagation(); void applyCustomColor(); }}>
              <span>自定义颜色…</span><Palette size={13} />
            </div>
          </div>
        )}
      </div>}
      {show('delete') && <div className={`menu-item danger ${groups.length <= 1 ? 'disabled' : ''}`} title={groups.length <= 1 ? '至少保留一个父目录' : undefined} onMouseEnter={() => setOpenSubmenu(null)} onClick={() => void remove()}><span>删除父目录</span><Trash2 size={15} /></div>}
      {!show('create') && !show('merge') && !show('color') && !show('delete') && <div className="menu-empty-hint">此菜单项目已全部隐藏，可在设置中恢复</div>}
    </div>
  );
}
