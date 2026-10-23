import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '../../appStore';
import type { ShortcutItem } from '../../../types';

function makeItem(id: string, name: string, order: number): ShortcutItem {
  return { id, name, path: `C:\\${name}.exe`, type: 'file', order };
}

function activeTarget() {
  const state = useAppStore.getState();
  const group = state.groups.find((entry) => entry.id === state.activeGroupId) ?? state.groups[0];
  const dir = group.directories.find((entry) => entry.id === state.activeDirectoryId) ?? group.directories[0];
  return { group, dir };
}

function directoryById(directoryId: string) {
  for (const group of useAppStore.getState().groups) {
    const dir = group.directories.find((entry) => entry.id === directoryId);
    if (dir) return dir;
  }
  return undefined;
}

function groupByName(name: string) {
  return useAppStore.getState().groups.find((entry) => entry.name === name);
}

/** 只看测试自己塞进去的项目（默认「常用」子目录自带一批 sys_ 系统快捷方式）。 */
function seededIds(directoryId: string): string[] {
  return (directoryById(directoryId)?.items ?? [])
    .filter((item) => !item.id.startsWith('sys_'))
    .map((item) => item.id);
}

/** 造一个「源子目录（含 2 个项目）+ 目标父目录（含 1 个空子目录）」的现场。 */
function seedTwoGroups() {
  const state = useAppStore.getState();
  const { group, dir } = activeTarget();
  state.addItems(group.id, dir.id, [makeItem('a1', 'Alpha', 0), makeItem('a2', 'Beta', 1)]);
  state.addGroup('第二父目录');
  const second = groupByName('第二父目录');
  if (!second) throw new Error('第二父目录没有建出来');
  const targetDirId = second.directories[0].id;
  return { sourceGroupId: group.id, sourceDirId: dir.id, targetGroupId: second.id, targetDirId };
}

describe('V167 Ctrl+X 剪切粘贴（移动语义）', () => {
  beforeEach(() => {
    useAppStore.getState().resetAll();
  });

  it('剪切项目后粘贴到别的子目录是移动：保留原 id，源目录里消失', () => {
    const { sourceDirId, targetDirId } = seedTwoGroups();
    expect(useAppStore.getState().cutItemsToClipboard(['a1', 'a2'])).toBe(2);
    expect(useAppStore.getState().itemClipboardMode).toBe('cut');

    expect(useAppStore.getState().pasteItemsToDirectory(targetDirId)).toBe(2);

    expect(seededIds(sourceDirId)).toEqual([]);
    // 移动 = 保留 id；先前的复制粘贴会给新 id。
    expect(seededIds(targetDirId)).toEqual(['a1', 'a2']);
    // 剪贴板被消费掉，模式回落成复制。
    expect(useAppStore.getState().itemClipboard).toEqual([]);
    expect(useAppStore.getState().itemClipboardMode).toBe('copy');
  });

  it('剪切到原来那个子目录不会变成副本，也不会重复', () => {
    const { sourceDirId } = seedTwoGroups();
    useAppStore.getState().cutItemsToClipboard(['a1', 'a2']);

    expect(useAppStore.getState().pasteItemsToDirectory(sourceDirId)).toBe(0);
    expect(seededIds(sourceDirId)).toEqual(['a1', 'a2']);
    expect(useAppStore.getState().itemClipboard).toEqual([]);
  });

  it('复制（Ctrl+C）后粘贴仍然是克隆：id 不重复', () => {
    const { sourceDirId, targetDirId } = seedTwoGroups();
    expect(useAppStore.getState().copyItemsToClipboard(['a1'])).toBe(1);
    expect(useAppStore.getState().itemClipboardMode).toBe('copy');

    expect(useAppStore.getState().pasteItemsToDirectory(targetDirId)).toBe(1);

    const copied = seededIds(targetDirId);
    expect(copied).toHaveLength(1);
    expect(copied[0]).not.toBe('a1');
    // 源目录那份还在。
    expect(seededIds(sourceDirId)).toEqual(['a1', 'a2']);
  });

  it('剪切子目录后粘贴到另一个父目录是移动：id 不变，只在目标父目录里', () => {
    const { sourceGroupId, sourceDirId, targetGroupId } = seedTwoGroups();
    expect(useAppStore.getState().cutDirectoryToClipboard(sourceDirId)).toBe(true);
    const clipboard = useAppStore.getState().navigationClipboard;
    expect(clipboard?.kind === 'directory' ? clipboard.mode : null).toBe('cut');

    expect(useAppStore.getState().pasteDirectoryToGroup(targetGroupId)).toBe(sourceDirId);

    const sourceGroup = useAppStore.getState().groups.find((entry) => entry.id === sourceGroupId);
    const targetGroup = useAppStore.getState().groups.find((entry) => entry.id === targetGroupId);
    expect(sourceGroup?.directories.some((entry) => entry.id === sourceDirId)).toBe(false);
    expect(targetGroup?.directories.some((entry) => entry.id === sourceDirId)).toBe(true);
    expect(useAppStore.getState().navigationClipboard).toBeNull();
  });

  it('剪切子目录粘到同一个父目录：不动，也不清掉剪贴板', () => {
    const { sourceGroupId, sourceDirId } = seedTwoGroups();
    useAppStore.getState().cutDirectoryToClipboard(sourceDirId);

    expect(useAppStore.getState().pasteDirectoryToGroup(sourceGroupId)).toBeNull();
    const group = useAppStore.getState().groups.find((entry) => entry.id === sourceGroupId);
    expect(group?.directories.some((entry) => entry.id === sourceDirId)).toBe(true);
    expect(useAppStore.getState().navigationClipboard?.kind).toBe('directory');
  });

  it('剪切父目录后粘到另一个父目录是合并：源父目录消失，子目录搬过去', () => {
    const { sourceGroupId, sourceDirId, targetGroupId } = seedTwoGroups();
    const before = useAppStore.getState().groups.length;
    expect(useAppStore.getState().cutGroupToClipboard(sourceGroupId)).toBe(true);

    expect(useAppStore.getState().pasteGroupIntoGroupFromClipboard(targetGroupId)).toBe(targetGroupId);

    const state = useAppStore.getState();
    expect(state.groups.length).toBe(before - 1);
    const target = state.groups.find((entry) => entry.id === targetGroupId);
    // 合并给的是新目录 id，但内容（a1/a2）跟着过去了。
    const carried = (target?.directories ?? []).some((dir) => dir.items.some((item) => item.id === 'a1'));
    expect(carried).toBe(true);
    expect(state.groups.some((entry) => entry.id === sourceGroupId)).toBe(false);
    expect(state.groups.some((entry) => entry.directories.some((dir) => dir.id === sourceDirId))).toBe(false);
    expect(state.navigationClipboard).toBeNull();
  });

  it('剪切父目录粘到自己身上：什么也不做', () => {
    const { sourceGroupId } = seedTwoGroups();
    const before = useAppStore.getState().groups.length;
    useAppStore.getState().cutGroupToClipboard(sourceGroupId);

    expect(useAppStore.getState().pasteGroupIntoGroupFromClipboard(sourceGroupId)).toBeNull();
    expect(useAppStore.getState().groups.length).toBe(before);
  });

  it('复制子目录后粘贴仍然是克隆：新 id', () => {
    const { sourceDirId, targetGroupId } = seedTwoGroups();
    expect(useAppStore.getState().copyDirectoryToClipboard(sourceDirId)).toBe(true);

    const pastedId = useAppStore.getState().pasteDirectoryToGroup(targetGroupId);
    expect(pastedId).toBeTruthy();
    expect(pastedId).not.toBe(sourceDirId);
  });
});
