import { describe, expect, it } from 'vitest';
import type { Group } from '../../types';
import { analyzeAppConfig, formatConfigDiagnostics } from '../configDiagnostics';

function makeGroups(): Group[] {
  return [{
    id: 'g',
    name: '工作',
    order: 0,
    directories: [{
      id: 'd',
      name: '常用',
      order: 0,
      kind: 'normal',
      items: [
        { id: 'same', name: 'GitHub', path: 'https://github.com', type: 'url', order: 0 },
        { id: 'same', name: '', path: 'github.com', type: 'url', order: 1, icon: 'icon' },
        { id: 'x', name: '空路径', path: '', type: 'file', order: 2 }
      ]
    }]
  }];
}
describe('configuration diagnostics', () => {
  it('detects duplicate IDs, invalid URLs, empty names and paths', () => {
    const result = analyzeAppConfig({ groups: makeGroups() });
    expect(result.summary).toMatchObject({ groups: 1, directories: 1, items: 3, urls: 2, missingIcons: 2 });
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'duplicate-id', 'empty-name', 'empty-path', 'invalid-url', 'missing-icon'
    ]));
    const invalidUrl = result.issues.find((issue) => issue.code === 'invalid-url');
    expect(invalidUrl?.entries[0]).toMatchObject({
      groupName: '工作',
      directoryName: '常用',
      itemName: '未命名项目',
      path: 'github.com',
    });
    expect(formatConfigDiagnostics(result)).toContain('工作 / 常用 / 未命名项目');
  });

  it('returns a healthy result for clean data', () => {
    const result = analyzeAppConfig({
      groups: [{
        id: 'g1', name: 'G', order: 0, directories: [{
          id: 'd1', name: 'D', order: 0, kind: 'normal', items: [
            { id: 'i1', name: 'Site', path: 'https://example.com', type: 'url', icon: 'icon', order: 0 }
          ]
        }]
      }]
    });
    expect(result.issues).toEqual([]);
    expect(formatConfigDiagnostics(result)).toContain('未发现明显配置问题');
  });
});
