import { invoke } from '@tauri-apps/api/core';
import { ChevronRight, ClipboardCopy, ExternalLink, FolderOpen, Maximize2, Palette, Pencil } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ContextMenuState } from '../../types';
import { useAppStore } from '../../stores/appStore';
import { resolveHtmlPageName } from '../../lib/htmlFolder';
import { launchHtmlPage } from '../../lib/launchShortcut';
import { showLauncherNotice } from '../../lib/notify';
import { uiAlert, uiPrompt } from '../../lib/uiDialog';
import { writeTextToClipboard } from '../../lib/clipboardText';
import { useSmartMenuPosition } from './useSmartMenuPosition';

/**
 * v175: HTML 目录里单张页面卡片的右键菜单。
 *
 * 和项目卡片菜单保持同一套语言：改名、上色、打开、复制路径。
 * 区别在于**改名只改显示名**，绝不碰磁盘上的真实文件名 ——
 * 卡片墙是浏览入口，不该因为「想把标题改成中文」就去动用户的网页文件。
 */

interface HtmlPageContextMenuProps {
  menu: Extract<ContextMenuState, { kind: 'htmlPage' }>;
  onClose: () => void;
}

// 与父目录 / 子目录 / 项目卡片共用同一套色板，四处观感一致。
const HTML_PAGE_COLOR_PRESETS = [
  { label: '默认', value: '' },
  { label: '琥珀', value: '#f59e0b' },
  { label: '青绿', value: '#10b981' },
  { label: '天蓝', value: '#0ea5e9' },
  { label: '紫色', value: '#8b5cf6' },
  { label: '玫红', value: '#ec4899' },
  { label: '珊瑚', value: '#f97316' },
  { label: '石墨', value: '#64748b' },
] as const;

export function HtmlPageContextMenu({ menu, onClose }: HtmlPageContextMenuProps) {
  const groups = useAppStore((state) => state.groups);
  const pages = useAppStore((state) => state.getHtmlPages(menu.directoryId));
  const setHtmlPageName = useAppStore((state) => state.setHtmlPageName);
  const setHtmlPageColor = useAppStore((state) => state.setHtmlPageColor);
  const clearHtmlCardSize = useAppStore((state) => state.clearHtmlCardSize);
  const [openSubmenu, setOpenSubmenu] = useState<'color' | null>(null);
  const { ref, style, submenuClassName } = useSmartMenuPosition(menu.x, menu.y, 8, 300);

  const directory = useMemo(
    () => groups.flatMap((group) => group.directories).find((entry) => entry.id === menu.directoryId),
    [groups, menu.directoryId],
  );
  const page = useMemo(
    () => pages.find((entry) => entry.path === menu.pagePath),
    [pages, menu.pagePath],
  );

  if (!directory || !page) return null;

  const title = resolveHtmlPageName(directory, page);
  const color = directory.htmlColors?.[page.path];

  function openPage() {
    onClose();
    void launchHtmlPage(page!.path).catch((error) => showLauncherNotice(String(error)));
  }

  async function renamePage() {
    const next = await uiPrompt(
      '卡片名称（只改显示名，不动真实文件名；清空即恢复文件名）',
      title,
      '重命名卡片',
    );
    if (next === null) {
      onClose();
      return;
    }
    setHtmlPageName(menu.directoryId, menu.pagePath, next);
    showLauncherNotice(next.trim() ? `已重命名为：${next.trim()}` : `已恢复文件名：${page!.stem}`);
    onClose();
  }

  function applyColor(value: string) {
    setHtmlPageColor(menu.directoryId, menu.pagePath, value);
    showLauncherNotice(value ? `已设置卡片颜色：${title}` : `「${title}」已跟随主题`);
    onClose();
  }

  async function applyCustomColor() {
    const raw = await uiPrompt('请输入卡片颜色（支持 #RGB / #RRGGBB / #RRGGBBAA）', color ?? '#8b5cf6');
    if (raw === null) {
      onClose();
      return;
    }
    const next = raw.trim();
    if (!next) {
      applyColor('');
      return;
    }
    if (!/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(next)) {
      await uiAlert('颜色格式不正确，请输入类似 #8b5cf6 的十六进制颜色。');
      return;
    }
    applyColor(next);
  }

  async function copyText(value: string, label: string) {
    try {
      await writeTextToClipboard(value);
      showLauncherNotice(`已复制${label}`);
    } catch (error) {
      void uiAlert(`复制失败：${String(error)}`);
    }
    onClose();
  }

  return (
    <div
      ref={ref}
      className={`menu-surface item-context-menu ${submenuClassName}`}
      style={style}
      onMouseDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="menu-item" onMouseEnter={() => setOpenSubmenu(null)} onClick={openPage}>
        <span>用默认浏览器打开</span><ExternalLink size={14} />
      </div>
      <div
        className="menu-item"
        onMouseEnter={() => setOpenSubmenu(null)}
        onClick={() => {
          invoke('open_file_location', { path: page.path }).catch((error) => uiAlert(`打开所在文件夹失败：${String(error)}`));
          onClose();
        }}
      >
        <span>打开所在文件夹</span><FolderOpen size={14} />
      </div>
      <div className="menu-separator" />
      <div className="menu-item" onMouseEnter={() => setOpenSubmenu(null)} onClick={() => void renamePage()}>
        <span>重命名卡片</span><Pencil size={14} />
      </div>
      <div
        className="menu-item with-submenu"
        onMouseEnter={() => setOpenSubmenu('color')}
        onClick={() => setOpenSubmenu((value) => (value === 'color' ? null : 'color'))}
      >
        <span>卡片颜色</span><ChevronRight size={14} />
        {openSubmenu === 'color' && (
          <div className="menu-surface directory-submenu small-submenu">
            {HTML_PAGE_COLOR_PRESETS.map((preset) => (
              <div
                className="menu-item"
                key={preset.label}
                onClick={(event) => {
                  event.stopPropagation();
                  applyColor(preset.value);
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
            <div className="menu-item" onClick={(event) => { event.stopPropagation(); void applyCustomColor(); }}>
              <span>自定义颜色…</span><Palette size={13} />
            </div>
            <div className="menu-item disabled" title="同色且相邻的卡片会被同一个框圈起来，深浅由「设置 → 界面 → 彩色框 → 相邻组合」决定">
              <span style={{ fontSize: 11, opacity: 0.75 }}>相邻组合：跟随彩色框设置</span>
            </div>
          </div>
        )}
      </div>
      <div
        className="menu-item"
        title="忘掉这张卡被拖出来的尺寸，回到目录默认大小"
        onMouseEnter={() => setOpenSubmenu(null)}
        onClick={() => {
          clearHtmlCardSize(menu.directoryId, menu.pagePath);
          showLauncherNotice(`已恢复默认大小：${title}`);
          onClose();
        }}
      >
        <span>恢复默认大小</span><Maximize2 size={14} />
      </div>
      <div className="menu-separator" />
      <div className="menu-item" onMouseEnter={() => setOpenSubmenu(null)} onClick={() => void copyText(title, '名称')}>
        <span>复制名称</span><ClipboardCopy size={14} />
      </div>
      <div className="menu-item" onMouseEnter={() => setOpenSubmenu(null)} onClick={() => void copyText(page.path, '路径')}>
        <span>复制路径</span><ClipboardCopy size={14} />
      </div>
    </div>
  );
}
