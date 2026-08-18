import { describe, expect, it } from 'vitest';
import {
  ensureNoteLine,
  getNoteLineCount,
  getNoteLineStart,
  insertNoteSeparatorAtLine,
  makeNoteSeparator,
} from '../noteEditor';

describe('note editor helpers', () => {
  it('counts logical lines and resolves their start offsets', () => {
    const value = '第一行\n第二行\n第三行';
    expect(getNoteLineCount(value)).toBe(3);
    expect(getNoteLineStart(value, 1)).toBe(0);
    expect(getNoteLineStart(value, 2)).toBe(4);
    expect(getNoteLineStart(value, 3)).toBe(8);
  });

  it('adds missing blank lines when jumping beyond the end', () => {
    const value = ensureNoteLine('第一行', 4);
    expect(value).toBe('第一行\n\n\n');
    expect(getNoteLineCount(value)).toBe(4);
  });

  it('replaces an empty selected line with a separator', () => {
    const value = '第一行\n\n第三行';
    const lineStart = getNoteLineStart(value, 2);
    expect(insertNoteSeparatorAtLine(value, lineStart, '------')).toEqual({
      value: '第一行\n------\n第三行',
      caret: lineStart + 6,
    });
  });

  it('inserts before a non-empty selected line without moving to another line', () => {
    const value = '第一行\n第二行';
    const lineStart = getNoteLineStart(value, 2);
    const result = insertNoteSeparatorAtLine(value, lineStart, '****');
    expect(result.value).toBe('第一行\n****\n第二行');
    expect(result.caret).toBe(lineStart + 4);
  });

  it('clamps separator length and uses one glyph', () => {
    expect(makeNoteSeparator('ab', 2, '-')).toBe('aaaa');
    expect(makeNoteSeparator('', 100, '*')).toHaveLength(80);
  });
});
