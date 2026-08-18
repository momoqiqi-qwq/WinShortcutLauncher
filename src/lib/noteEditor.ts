export function getNoteLineCount(value: string): number {
  return Math.max(1, value.split('\n').length);
}

export function getNoteLineStart(value: string, lineNumber: number): number {
  const target = Math.max(1, Math.round(lineNumber));
  const lines = value.split('\n');
  let position = 0;
  for (let index = 0; index < target - 1 && index < lines.length; index += 1) {
    position += lines[index].length + 1;
  }
  return Math.max(0, Math.min(position, value.length));
}

export function ensureNoteLine(value: string, lineNumber: number): string {
  const target = Math.max(1, Math.round(lineNumber));
  const currentCount = getNoteLineCount(value);
  if (currentCount >= target) return value;
  return `${value}${'\n'.repeat(target - currentCount)}`;
}

export function makeNoteSeparator(char: string | undefined, length: number | undefined, fallback: string): string {
  const glyph = Array.from((char || fallback).trim())[0] ?? fallback;
  return glyph.repeat(Math.max(4, Math.min(80, Math.round(Number(length) || 14))));
}

export interface SeparatorInsertResult {
  value: string;
  caret: number;
}

export function insertNoteSeparatorAtLine(
  value: string,
  lineStart: number,
  separator: string,
): SeparatorInsertResult {
  const safeLineStart = Math.max(0, Math.min(lineStart, value.length));
  const lineEndIndex = value.indexOf('\n', safeLineStart);
  const lineEnd = lineEndIndex < 0 ? value.length : lineEndIndex;
  const currentLine = value.slice(safeLineStart, lineEnd);

  if (currentLine.trim().length === 0) {
    return {
      value: `${value.slice(0, safeLineStart)}${separator}${value.slice(lineEnd)}`,
      caret: safeLineStart + separator.length,
    };
  }

  const prefix = safeLineStart > 0 && value[safeLineStart - 1] !== '\n' ? '\n' : '';
  const suffix = safeLineStart < value.length ? '\n' : '';
  return {
    value: `${value.slice(0, safeLineStart)}${prefix}${separator}${suffix}${value.slice(safeLineStart)}`,
    caret: safeLineStart + prefix.length + separator.length,
  };
}
