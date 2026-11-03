import { describe, expect, it } from 'vitest';
import { PROFILE_LIST_LAYOUT_KEY, parseProfileListLayout, readProfileListLayout, writeProfileListLayout } from '../profileListLayout';

describe('profileListLayout (v192)', () => {
  it('defaults to the compact single-line layout for missing or unknown values', () => {
    expect(parseProfileListLayout(null)).toBe('compact');
    expect(parseProfileListLayout(undefined)).toBe('compact');
    expect(parseProfileListLayout('')).toBe('compact');
    expect(parseProfileListLayout('  ')).toBe('compact');
    expect(parseProfileListLayout('single')).toBe('compact');
  });

  it('only reads multiline back when it was stored verbatim (case/space tolerant)', () => {
    expect(parseProfileListLayout('multiline')).toBe('multiline');
    expect(parseProfileListLayout(' MultiLine ')).toBe('multiline');
  });

  it('round-trips through localStorage and clears the key when going back to compact', () => {
    const store = new Map<string, string>();
    const fake = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    } as unknown as Storage;
    const original = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', { value: fake, configurable: true });
    try {
      expect(readProfileListLayout()).toBe('compact');
      writeProfileListLayout('multiline');
      expect(store.get(PROFILE_LIST_LAYOUT_KEY)).toBe('multiline');
      expect(readProfileListLayout()).toBe('multiline');
      writeProfileListLayout('compact');
      expect(store.has(PROFILE_LIST_LAYOUT_KEY)).toBe(false);
      expect(readProfileListLayout()).toBe('compact');
    } finally {
      if (original === undefined) Reflect.deleteProperty(globalThis, 'localStorage');
      else Object.defineProperty(globalThis, 'localStorage', { value: original, configurable: true });
    }
  });
});
