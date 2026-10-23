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

describe('V168 剪切粘贴的边界', () => {
  beforeEach(() => {
    useAppStore.getState().resetAll();
  });

  /** 全库里所有非系统项目 id（用来查有没有产生重复 id）。 */
  function allSeededIds(): string[] {
    return useAppStore.getState().groups
      .flatMap((group) => group.directories.flatMap((dir) => dir.items))
      .map((item) => item.id)
      .filter((id) => !id.startsWith('sys_'));
  }

  it('剪切后在粘贴前把项目删掉，粘贴不会把它们从快照里复活', () => {
    const { sourceDirId, targetDirId } = seedTwoGroups();
    useAppStore.getState().cutItemsToClipboard(['a1', 'a2']);
    useAppStore.getState().deleteItemsByIds(['a1', 'a2']);
    expect(seededIds(sourceDirId)).toEqual([]);

    expect(useAppStore.getState().pasteItemsToDirectory(targetDirId)).toBe(0);
    expect(seededIds(targetDirId)).toEqual([]);
    expect(useAppStore.getState().itemClipboardMode).toBe('copy');
  });

  it('剪切后项目被搬到第三个子目录，再粘贴：只有一个副本，不产生重复 id', () => {
    const { sourceDirId, targetGroupId, targetDirId } = seedTwoGroups();
    const thirdDirId = useAppStore.getState().addDirectory(targetGroupId, '第三个子目录');
    expect(thirdDirId).toBeTruthy();

    useAppStore.getState().cutItemsToClipboard(['a1', 'a2']);
    // 用户没粘贴，先自己把其中一项挪走。
    useAppStore.getState().moveItemToDirectory('a1', thirdDirId);
    expect(seededIds(thirdDirId)).toEqual(['a1']);

    expect(useAppStore.getState().pasteItemsToDirectory(targetDirId)).toBe(2);

    const ids = allSeededIds();
    expect(new Set(ids).size).toBe(ids.length);
    expect(seededIds(targetDirId)).toEqual(['a1', 'a2']);
    expect(seededIds(thirdDirId)).toEqual([]);
    expect(seededIds(sourceDirId)).toEqual([]);
  });

  it('剪切父目录合并后，选中目标不再指向被删掉的父目录', () => {
    const { sourceGroupId, targetGroupId } = seedTwoGroups();
    useAppStore.getState().cutGroupToClipboard(sourceGroupId);
    expect(useAppStore.getState().selectedNavTarget).toEqual({ kind: 'group', id: sourceGroupId });

    useAppStore.getState().pasteGroupIntoGroupFromClipboard(targetGroupId);

    const selection = useAppStore.getState().selectedNavTarget;
    expect(selection).toEqual({ kind: 'group', id: targetGroupId });
    expect(useAppStore.getState().groups.some((group) => group.id === sourceGroupId)).toBe(false);
  });

  it('剪切父目录粘到不存在的父目录：拒绝，剪贴板留着还能再选', () => {
    const { sourceGroupId } = seedTwoGroups();
    useAppStore.getState().cutGroupToClipboard(sourceGroupId);

    expect(useAppStore.getState().pasteGroupIntoGroupFromClipboard('dir-ghost')).toBeNull();
    expect(useAppStore.getState().navigationClipboard?.kind).toBe('group');
    expect(useAppStore.getState().navigationClipboard?.mode).toBe('cut');
  });

  it('剪切的「全部」子目录不会被搬进已经有「全部」的父目录', () => {
    const { sourceGroupId, targetGroupId } = seedTwoGroups();
    const sourceAllId = useAppStore.getState().addDirectory(sourceGroupId, '全部', 'all');
    useAppStore.getState().addDirectory(targetGroupId, '全部', 'all');

    expect(useAppStore.getState().cutDirectoryToClipboard(sourceAllId)).toBe(true);
    expect(useAppStore.getState().pasteDirectoryToGroup(targetGroupId)).toBeNull();

    const target = useAppStore.getState().groups.find((group) => group.id === targetGroupId);
    expect(target?.directories.filter((dir) => dir.kind === 'all')).toHaveLength(1);
    expect(
      useAppStore.getState().groups.some((group) => group.directories.some((dir) => dir.id === sourceAllId)),
    ).toBe(true);
    expect(useAppStore.getState().navigationClipboard?.kind).toBe('directory');
  });
});
