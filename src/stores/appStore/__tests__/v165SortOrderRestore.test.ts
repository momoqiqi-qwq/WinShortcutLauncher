import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '../../appStore';
import type { ShortcutItem } from '../../../types';

function activeTarget() {
  const state = useAppStore.getState();
  const group = state.groups.find((item) => item.id === state.activeGroupId) ?? state.groups[0];
  const dir = group.directories.find((item) => item.id === state.activeDirectoryId) ?? group.directories[0];
  return { group, dir };
}

function makeItem(id: string, name: string, order: number): ShortcutItem {
  return { id, name, path: `C:\\${name}.exe`, type: 'file', order };
}

function itemIds(directoryId: string): string[] {
  const state = useAppStore.getState();
  for (const group of state.groups) {
    const dir = group.directories.find((item) => item.id === directoryId);
    if (dir) return dir.items.slice().sort((a, b) => a.order - b.order).map((item) => item.id);
  }
  return [];
}

function directoryById(directoryId: string) {
  for (const group of useAppStore.getState().groups) {
    const dir = group.directories.find((item) => item.id === directoryId);
    if (dir) return dir;
  }
  return undefined;
}

/** 自定义顺序 zeta → alpha → mike，与按名称（alpha → mike → zeta）故意不同。 */
function seedCustomOrder() {
  const { group, dir } = activeTarget();
  useAppStore.getState().addItems(group.id, dir.id, [
    makeItem('zeta', 'Zeta', 0),
    makeItem('alpha', 'Alpha', 1),
    makeItem('mike', 'Mike', 2),
  ]);
  useAppStore.getState().reorderItems(dir.id, ['zeta', 'alpha', 'mike']);
  return dir.id;
}

describe('V165 排序切回可恢复', () => {
  beforeEach(() => {
    useAppStore.getState().resetAll();
  });

  it('切到按名称不会重写项目顺序', () => {
    const directoryId = seedCustomOrder();
    expect(itemIds(directoryId)).toEqual(['zeta', 'alpha', 'mike']);

    useAppStore.getState().sortDirectoryItems(directoryId, 'name');
    expect(itemIds(directoryId)).toEqual(['zeta', 'alpha', 'mike']);

    useAppStore.getState().sortDirectoryItems(directoryId, 'type');
    expect(itemIds(directoryId)).toEqual(['zeta', 'alpha', 'mike']);
  });

  it('切走再切回自定义，顺序原样恢复', () => {
    const directoryId = seedCustomOrder();

    useAppStore.getState().sortDirectoryItems(directoryId, 'name');
    useAppStore.getState().sortDirectoryItems(directoryId, 'custom');

    expect(itemIds(directoryId)).toEqual(['zeta', 'alpha', 'mike']);
    expect(directoryById(directoryId)?.display?.sortItemsSavedOrder ?? null).toBeNull();
  });

  it('切走时留档，即使 order 被其它路径改过也能按留档还原', () => {
    const directoryId = seedCustomOrder();

    // 切离自定义：留档 zeta/alpha/mike
    useAppStore.getState().sortDirectoryItems(directoryId, 'name');
    expect(directoryById(directoryId)?.display?.sortItemsSavedOrder).toEqual(['zeta', 'alpha', 'mike']);

    // 模拟旧版/其它路径把 order 改成了名称顺序
    useAppStore.getState().reorderItems(directoryId, ['alpha', 'mike', 'zeta']);
    expect(itemIds(directoryId)).toEqual(['alpha', 'mike', 'zeta']);

    // 切回自定义：按留档还原
    useAppStore.getState().sortDirectoryItems(directoryId, 'custom');
    expect(itemIds(directoryId)).toEqual(['zeta', 'alpha', 'mike']);
  });

  it('留档之后再新增的项目接在末尾', () => {
    const directoryId = seedCustomOrder();
    useAppStore.getState().sortDirectoryItems(directoryId, 'name');

    const { group } = activeTarget();
    useAppStore.getState().addItems(group.id, directoryId, [makeItem('newbie', 'Aaa', 99)]);

    useAppStore.getState().sortDirectoryItems(directoryId, 'custom');
    expect(itemIds(directoryId)).toEqual(['zeta', 'alpha', 'mike', 'newbie']);
  });

  it('切排序只维护顺序，不写目录级 sortMode 覆盖', () => {
    const directoryId = seedCustomOrder();
    useAppStore.getState().updateDisplay({ sortMode: 'name' });
    useAppStore.getState().sortDirectoryItems(directoryId, 'name');

    expect(directoryById(directoryId)?.display?.sortMode).toBeUndefined();
    expect(useAppStore.getState().display.sortMode).toBe('name');
  });
});
