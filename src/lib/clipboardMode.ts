/**
 * 剪贴板模式（V167）。
 *
 * 项目 / 子目录 / 父目录共用同一套「复制 → 粘贴」通道，Ctrl+X 引入的「剪切」只改变
 * **粘贴时是克隆还是移动**，不改剪贴板里存的内容结构，所以模式单独放一个字段，
 * 由 `itemClipboardMode`（项目）和 `navigationClipboard.mode`（子目录 / 父目录）携带。
 *
 * - `copy`：粘贴 = 复制一份（新 id，项目还会重置启动统计）
 * - `cut`：粘贴 = 移动（保留原 id，从原位置删除），也就是 Ctrl+X → Ctrl+V
 */
export type ClipboardMode = 'copy' | 'cut';

/** 剪贴板被消费后统一回落到的模式。 */
export const DEFAULT_CLIPBOARD_MODE: ClipboardMode = 'copy';

export function isCutMode(mode: ClipboardMode | undefined): boolean {
  return mode === 'cut';
}
