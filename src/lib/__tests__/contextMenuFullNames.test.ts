import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DIRECTORY_CONTEXT_MENU_IDS } from '../experienceSettings';
import { searchSettingsItems } from '../settingsSearchIndex';

const directoryMenu = readFileSync(new URL('../../components/ContextMenu/DirectoryContextMenu.tsx', import.meta.url), 'utf8');
const itemMenu = readFileSync(new URL('../../components/ContextMenu/ItemContextMenu.tsx', import.meta.url), 'utf8');
const contextMenuSettings = readFileSync(
  new URL('../../components/Settings/ContextMenuSettingsSection.tsx', import.meta.url),
  'utf8'
);

// v153: 子目录右键 / 项目右键都要有「显示完整名称」，且都切换同一份 display 开关。
describe('context menu full-name toggles', () => {
  it('exposes 显示完整名称 in the subdirectory context menu, wired to sidebarShowFullNames', () => {
    expect(directoryMenu).toContain('<span>显示完整名称</span>');
    expect(directoryMenu).toMatch(/show\('fullNames'\)/);
    expect(directoryMenu).toContain('const next = !(display.sidebarShowFullNames === true);');
    expect(directoryMenu).toContain('updateDisplay({ sidebarShowFullNames: next });');
  });

  it('exposes 显示完整名称 in the item context menu, wired to showFullItemName', () => {
    expect(itemMenu).toContain('<span>显示完整名称</span>');
    expect(itemMenu).toContain('const next = !(globalDisplay.showFullItemName === true);');
    expect(itemMenu).toContain('updateDisplay({ showFullItemName: next });');
  });

  it('keeps fullNames registered as a hideable directory menu entry', () => {
    expect(DIRECTORY_CONTEXT_MENU_IDS).toContain('fullNames');
    expect(DIRECTORY_CONTEXT_MENU_IDS.indexOf('fullNames')).toBe(DIRECTORY_CONTEXT_MENU_IDS.indexOf('color') + 1);
    expect(contextMenuSettings).toMatch(/fullNames: \{ label: '显示完整名称'/);
  });

  it('lets 设置搜索 find both full-name toggles by 右键 / 显示完整名称', () => {
    for (const query of ['右键', '显示完整名称']) {
      const ids = searchSettingsItems(query).map((item) => item.id);
      expect(ids).toContain('item-name-full');
      expect(ids).toContain('sidebar-name-full');
    }
  });
});
