/**
 * v150: 便签草稿桥。
 *
 * 便签编辑器为了性能把输入先留在本地草稿，空闲 450ms 才写回 store。
 * 外部拖拽追加内容时直接改 store，如果先不把草稿落盘，自动保存会把
 * 追加结果覆盖掉；所以拖拽前先 flush 一次打开中的便签草稿。
 */
type NoteFlushEntry = { directoryId: string; flush: () => void };

let activeEntry: NoteFlushEntry | null = null;

/** 注册当前打开的便签落盘函数，返回注销函数（供 useEffect 清理）。 */
export function registerActiveNoteFlush(directoryId: string, flush: () => void) {
  activeEntry = { directoryId, flush };
  return () => {
    if (activeEntry?.directoryId === directoryId && activeEntry.flush === flush) activeEntry = null;
  };
}

/**
 * 立刻把打开中的便签草稿写回 store。
 * 不传 directoryId 时无论当前打开哪个便签都会落盘，保证 store 是最新内容。
 */
export function flushActiveNoteDraft(directoryId?: string) {
  if (!activeEntry) return;
  if (directoryId && activeEntry.directoryId !== directoryId) return;
  activeEntry.flush();
}
