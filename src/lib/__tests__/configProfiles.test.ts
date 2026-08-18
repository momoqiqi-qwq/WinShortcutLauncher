import { describe, expect, it } from 'vitest';
import { makeUniqueProfileName, normalizeProfileName } from '../configProfiles';

describe('config profile helpers', () => {
  it('normalizes profile names without allowing multiline labels', () => {
    expect(normalizeProfileName('  Work\n  Profile  ')).toBe('Work Profile');
    expect(normalizeProfileName('')).toBe('未命名配置');
  });

  it('creates deterministic unique display names without loading profile configs', () => {
    const names = ['工作', '工作 (2)', '游戏'];
    expect(makeUniqueProfileName('工作', names)).toBe('工作 (3)');
    expect(makeUniqueProfileName('测试', names)).toBe('测试');
  });
});
