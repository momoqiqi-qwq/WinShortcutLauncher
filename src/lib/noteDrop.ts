/** v150: 外部拖入的文字 / 网址写进便签时的纯文本处理。 */

/** 单次拖入最多写入的字符数，避免超长正文把配置撑爆。 */
const MAX_DROPPED_NOTE_TEXT = 20000;

/** 统一换行、去掉 NUL 与首尾空行，行尾空白也一并清掉。 */
export function normalizeDroppedNoteText(raw: string) {
  if (!raw) return '';
  const unified = raw.replace(/\0/g, '').replace(/\r\n?/g, '\n');
  const lines = unified.split('\n').map((line) => line.replace(/[ \t]+$/g, ''));
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  return lines.join('\n').trim().slice(0, MAX_DROPPED_NOTE_TEXT);
}

/**
 * 新内容前自动隔一行：
 * 便签已有内容时先补一个空行再追加；空便签直接落内容。
 */
export function appendNoteText(existing: string, incoming: string) {
  const tail = normalizeDroppedNoteText(incoming);
  if (!tail) return existing ?? '';
  const head = (existing ?? '').replace(/\r\n?/g, '\n').replace(/\s+$/g, '');
  if (!head) return tail;
  return `${head}\n\n${tail}`;
}

/** 拖入内容里是否已经有可读文本（用于决定是否走便签追加）。 */
export function hasDroppedNoteText(raw: string) {
  return Boolean(normalizeDroppedNoteText(raw));
}
