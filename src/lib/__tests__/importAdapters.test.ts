import { describe, expect, it } from 'vitest';
import { adaptImportedConfig, parseImportedConfigText } from '../importAdapters';

describe('legacy import adapters', () => {
  it('parses Maye JDB JavaScript objects', () => {
    const parsed = parseImportedConfigText(`var JDB = { CI: 1, data: { work: { name: '工作', order: 0, item: [{ name: 'GitHub', url: 'https://github.com' }] } } };`);
    const config = adaptImportedConfig(parsed);
    expect(config.groups[0].name).toBe('工作');
    expect(config.groups[0].directories[0].items[0]).toMatchObject({ name: 'GitHub', type: 'url' });
  });

  it('turns an empty Lucy-style group with Content into a note directory', () => {
    const config = adaptImportedConfig({
      groups: [{
        id: 'g1',
        name: 'Lucy',
        directories: [{ id: 'd1', name: '备忘', Content: 'hello', items: [] }]
      }]
    });
    expect(config.groups[0].directories[0]).toMatchObject({ kind: 'notes', note: 'hello', items: [] });
  });

  it('normalizes old noteContent fields', () => {
    const config = adaptImportedConfig({
      groups: [{ name: '旧配置', directories: [{ name: '便签', noteContent: '旧内容' }] }]
    });
    expect(config.groups[0].directories[0]).toMatchObject({ kind: 'notes', note: '旧内容' });
  });

  it('rejects unsupported text instead of silently importing garbage', () => {
    expect(() => parseImportedConfigText('not valid config')).toThrow(/不是有效/);
  });
});
