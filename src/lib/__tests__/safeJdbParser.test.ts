import { describe, expect, it } from 'vitest';
import { parseStaticJdbObject } from '../safeJdbParser';


describe('parseStaticJdbObject', () => {
  it('parses common Maye-style static object syntax', () => {
    const value = parseStaticJdbObject(`
      // Maye export
      const JDB = {
        CI: 1,
        data: {
          demo: {
            name: '常用',
            order: 0,
            item: [
              { name: 'OpenAI', url: 'https://openai.com/', fixed: true, },
            ],
          },
        },
      };
    `) as Record<string, any>;
    expect(value.CI).toBe(1);
    expect(value.data.demo.item[0].url).toBe('https://openai.com/');
  });

  it('rejects prototype-polluting keys', () => {
    expect(() => parseStaticJdbObject(`const JDB = { __proto__: { polluted: true } };`)).toThrow(/不允许/);
  });

  it('does not execute expressions or function calls', () => {
    expect(() => parseStaticJdbObject(`const JDB = { data: { x: globalThis.alert('boom') } };`)).toThrow(/静态数据|不支持/);
    expect(() => parseStaticJdbObject(`const JDB = { data: { x: (() => 1)() } };`)).toThrow();
    expect(() => parseStaticJdbObject('const JDB = { now: Date.now() };')).toThrow();
  });
});
