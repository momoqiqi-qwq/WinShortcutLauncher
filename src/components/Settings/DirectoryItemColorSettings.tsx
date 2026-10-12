import { FolderTree, LayoutGrid, Palette, RotateCcw, Sparkles } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useAppStore } from '../../stores/appStore';
import { isMappedDirectory } from '../../lib/mappedFolder';
import './DirectoryItemColorSettings.css';

// v147: 与父目录背景色共用同一套色板，保证三处（父目录/子目录/项目）观感一致。
const FRAME_COLORS = ['#f59e0b', '#10b981', '#0ea5e9', '#8b5cf6', '#ec4899', '#f97316', '#64748b'] as const;

/** 列表最多渲染这么多行，避免配置很大时设置页卡顿。 */
const MAX_ROWS = 200;

export function DirectoryItemColorSettings() {
  const groups = useAppStore((state) => state.groups);
  const activeGroup = useAppStore((state) => state.getActiveGroup());
  const activeDirectory = useAppStore((state) => state.getActiveDirectory());
  const setDirectoryColor = useAppStore((state) => state.setDirectoryColor);
  const setDirectoryColors = useAppStore((state) => state.setDirectoryColors);
  const setItemColor = useAppStore((state) => state.setItemColor);
  const setItemColors = useAppStore((state) => state.setItemColors);

  const directoryEntries = groups
    .flatMap((group) => group.directories.map((directory) => ({ group, directory })))
    .slice(0, MAX_ROWS);

  const activeKind = activeDirectory?.kind ?? 'normal';
  const isMirrorDirectory = activeKind === 'startMenu' || Boolean(activeDirectory && isMappedDirectory(activeDirectory));
  // “全部”子目录本身不存项目，它展示的是同组各子目录的项目合集。
  const itemEntries = activeDirectory
    ? (activeKind === 'all'
      ? (activeGroup?.directories ?? [])
        .filter((directory) => (directory.kind ?? 'normal') !== 'all' && !isMappedDirectory(directory))
        .flatMap((directory) => directory.items)
      : activeDirectory.items
    ).slice(0, MAX_ROWS)
    : [];

  function applyDirectoryColorSequence(offset = 0) {
    setDirectoryColors(Object.fromEntries(directoryEntries.map(({ directory }, index) => [
      directory.id,
      FRAME_COLORS[(index + offset) % FRAME_COLORS.length],
    ])));
  }

  function clearDirectoryColors() {
    setDirectoryColors(Object.fromEntries(directoryEntries.map(({ directory }) => [directory.id, undefined])));
  }

  function applyItemColorSequence(offset = 0) {
    setItemColors(Object.fromEntries(itemEntries.map((item, index) => [
      item.id,
      FRAME_COLORS[(index + offset) % FRAME_COLORS.length],
    ])));
  }

  function clearItemColors() {
    setItemColors(Object.fromEntries(itemEntries.map((item) => [item.id, undefined])));
  }

  return (
    <section className="settings-section narrow-section experience-settings-section directory-item-color-settings">
      <div className="settings-section-title-row">
        <h3><Palette size={17} /> 子目录与项目配色</h3>
      </div>
      <p className="settings-hint">
        子目录和项目可以像父目录一样单独上色：上色后会画出一圈同色描边，并淡淡填充背景。填充浓度、边框粗细和形状可在“界面设置 → 子目录与项目彩色框”继续调整。
      </p>

      <div className="color-frame-block">
        <div className="color-frame-block-head">
          <h4><FolderTree size={14} /> 子目录</h4>
          <div className="experience-preset-row">
            <button className="btn-secondary btn-compact" type="button" onClick={() => applyDirectoryColorSequence(0)}><Sparkles size={13} /> 一键彩色</button>
            <button className="btn-secondary btn-compact" type="button" onClick={() => applyDirectoryColorSequence(2)}>换一组颜色</button>
            <button className="btn-secondary btn-compact" type="button" onClick={clearDirectoryColors}><RotateCcw size={13} /> 全部跟随主题</button>
          </div>
        </div>
        <div className="color-frame-list">
          {directoryEntries.map(({ group, directory }) => (
            <div className="color-frame-row" key={directory.id}>
              <div className="color-frame-name" title={`${group.name} / ${directory.name}`}>
                <span className="color-frame-group">{group.name}</span>
                <span className="color-frame-divider">/</span>
                <span className="color-frame-label">{directory.name}</span>
              </div>
              <input
                className="color-frame-picker"
                type="color"
                aria-label={`${directory.name} 自定义颜色`}
                value={directory.color ?? '#8b5cf6'}
                onChange={(event) => setDirectoryColor(directory.id, event.target.value)}
              />
              <div className="color-frame-swatches" aria-label={`${directory.name} 颜色预设`}>
                {FRAME_COLORS.slice(0, 6).map((color) => (
                  <button
                    type="button"
                    key={color}
                    className={directory.color?.toLowerCase() === color.toLowerCase() ? 'active' : ''}
                    style={{ '--frame-swatch-color': color } as CSSProperties}
                    title={`设为 ${color}`}
                    aria-label={`${directory.name} 设为 ${color}`}
                    onClick={() => setDirectoryColor(directory.id, color)}
                  />
                ))}
              </div>
              <button className="btn-secondary btn-compact color-frame-follow-theme" type="button" onClick={() => setDirectoryColor(directory.id, undefined)}>跟主题</button>
            </div>
          ))}
          {directoryEntries.length === 0 && <p className="settings-hint">当前还没有子目录。</p>}
        </div>
      </div>

      <div className="color-frame-block">
        <div className="color-frame-block-head">
          <h4><LayoutGrid size={14} /> {activeKind === 'all' ? '当前父目录的全部项目' : '当前子目录的项目'}</h4>
          {!isMirrorDirectory && itemEntries.length > 0 && (
            <div className="experience-preset-row">
              <button className="btn-secondary btn-compact" type="button" onClick={() => applyItemColorSequence(0)}><Sparkles size={13} /> 一键彩色</button>
              <button className="btn-secondary btn-compact" type="button" onClick={() => applyItemColorSequence(2)}>换一组颜色</button>
              <button className="btn-secondary btn-compact" type="button" onClick={clearItemColors}><RotateCcw size={13} /> 全部跟随主题</button>
            </div>
          )}
        </div>
        <div className="color-frame-list">
          {isMirrorDirectory && (
            <p className="settings-hint">当前子目录是镜像子目录（开始菜单 / 映射文件夹），里面的项目来自真实文件夹，不能自定义颜色。</p>
          )}
          {!isMirrorDirectory && itemEntries.map((item) => (
            <div className="color-frame-row" key={item.id}>
              <div className="color-frame-name" title={item.name}>
                <span className="color-frame-label">{item.name}</span>
              </div>
              <input
                className="color-frame-picker"
                type="color"
                aria-label={`${item.name} 自定义颜色`}
                value={item.color ?? '#8b5cf6'}
                onChange={(event) => setItemColor(item.id, event.target.value)}
              />
              <div className="color-frame-swatches" aria-label={`${item.name} 颜色预设`}>
                {FRAME_COLORS.slice(0, 6).map((color) => (
                  <button
                    type="button"
                    key={color}
                    className={item.color?.toLowerCase() === color.toLowerCase() ? 'active' : ''}
                    style={{ '--frame-swatch-color': color } as CSSProperties}
                    title={`设为 ${color}`}
                    aria-label={`${item.name} 设为 ${color}`}
                    onClick={() => setItemColor(item.id, color)}
                  />
                ))}
              </div>
              <button className="btn-secondary btn-compact color-frame-follow-theme" type="button" onClick={() => setItemColor(item.id, undefined)}>跟主题</button>
            </div>
          ))}
          {!isMirrorDirectory && itemEntries.length === 0 && (
            <p className="settings-hint">当前子目录里还没有项目。</p>
          )}
        </div>
      </div>
    </section>
  );
}
