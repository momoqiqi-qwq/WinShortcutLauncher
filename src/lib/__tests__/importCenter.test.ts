import { describe, expect, it } from 'vitest';
import type { AppConfig } from '../../types';
import { buildImportPreview, mergeImportedConfig, normalizeImportIdentity } from '../importCenter';

function config(groups: AppConfig['groups']): AppConfig {
  return {
    groups,
    theme: 'dark-soft',
    display: {} as AppConfig['display'],
    behavior: {} as AppConfig['behavior'],
    windowState: { opacity: 1, edgeAutoHide: false },
    autoSave: { enabled: false, directory: '', intervalMinutes: 5, fileName: 'x.json' },
  };
}

describe('import center', () => {
  it('normalizes Windows paths and URLs for duplicate detection', () => {
    expect(normalizeImportIdentity('C:/Apps/Test.EXE')).toBe(normalizeImportIdentity('c:\\apps\\test.exe'));
    expect(normalizeImportIdentity('https://EXAMPLE.com/')).toBe(normalizeImportIdentity('https://example.com'));
  });

  it('previews new, duplicate and conflicting items', () => {
    const current = config([{ id: 'g1', name: '常用', order: 0, directories: [{ id: 'd1', name: '工具', order: 0, items: [
      { id: 'a', name: 'A', path: 'C:/A.exe', type: 'file', order: 0 },
      { id: 'b', name: 'B', path: 'C:/B.exe', type: 'file', order: 1 },
    ] }] }]);
    const incoming = config([{ id: 'other', name: '常用', order: 0, directories: [{ id: 'other-d', name: '工具', order: 0, items: [
      { id: 'x', name: 'A', path: 'c:\\a.exe', type: 'file', order: 0 },
      { id: 'y', name: 'B renamed', path: 'c:\\b.exe', type: 'file', order: 1 },
      { id: 'z', name: 'C', path: 'C:/C.exe', type: 'file', order: 2 },
    ] }] }]);
    const preview = buildImportPreview(current, incoming);
    expect(preview.addedItems).toBe(1);
    expect(preview.duplicates).toBe(1);
    expect(preview.conflicts.filter((entry) => entry.kind === 'item')).toHaveLength(1);
  });

  it('supports keeping both on an item conflict', () => {
    const current = config([{ id: 'g1', name: '常用', order: 0, directories: [{ id: 'd1', name: '工具', order: 0, items: [
      { id: 'a', name: '旧名字', path: 'C:/A.exe', type: 'file', order: 0 },
    ] }] }]);
    const incoming = config([{ id: 'g2', name: '常用', order: 0, directories: [{ id: 'd2', name: '工具', order: 0, items: [
      { id: 'b', name: '新名字', path: 'c:\\a.exe', type: 'file', order: 0 },
    ] }] }]);
    const preview = buildImportPreview(current, incoming);
    const conflict = preview.conflicts.find((entry) => entry.kind === 'item');
    expect(conflict).toBeTruthy();
    const merged = mergeImportedConfig(current, incoming, { [conflict!.id]: 'both' });
    expect(merged.config.groups[0].directories[0].items).toHaveLength(2);
    expect(merged.config.groups[0].directories[0].items[1].name).toContain('导入');
  });
});
