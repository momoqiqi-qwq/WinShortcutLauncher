import { describe, expect, it } from 'vitest';
import { appendNoteText, hasDroppedNoteText, normalizeDroppedNoteText } from '../noteDrop';

describe('note drop text helpers', () => {
  it('normalizes CRLF, trailing spaces and surrounding blank lines', () => {
    expect(normalizeDroppedNoteText('  第一行\r\n第二行  \r\n\r\n')).toBe('第一行\n第二行');
    expect(normalizeDroppedNoteText('\0微信消息\0')).toBe('微信消息');
  });

  it('returns empty text for blank payloads', () => {
    expect(normalizeDroppedNoteText('')).toBe('');
    expect(normalizeDroppedNoteText('  \r\n \t')).toBe('');
    expect(hasDroppedNoteText('   ')).toBe(false);
  });

  it('drops incoming text straight into an empty note', () => {
    expect(appendNoteText('', 'https://example.com/')).toBe('https://example.com/');
  });

  it('separates a new drop from existing content with one blank line', () => {
    expect(appendNoteText('第一段', '第二段')).toBe('第一段\n\n第二段');
    expect(appendNoteText('第一段\n', '第二段')).toBe('第一段\n\n第二段');
    expect(appendNoteText('第一段\n\n  \n', '第二段')).toBe('第一段\n\n第二段');
  });

  it('keeps the existing note when the dropped text is empty', () => {
    expect(appendNoteText('第一段', '   ')).toBe('第一段');
  });

  it('caps extremely long dropped text', () => {
    const long = '甲'.repeat(25000);
    expect(normalizeDroppedNoteText(long)).toHaveLength(20000);
  });
});
