import { describe, expect, it } from 'vitest';
import type { Directory } from '../../types';
import {
  getDirectoryDisplayCount,
  getUniqueDirectoryName,
} from '../directoryExperience';

describe('directory navigation experience', () => {
  it('automatically numbers duplicate directory names', () => {
    expect(getUniqueDirectoryName(['工作', '工作 2'], '工作')).toBe('工作 3');
    expect(getUniqueDirectoryName(['常用'], '新目录')).toBe('新目录');
  });

  it('counts normal, notes and all directories correctly', () => {
    const directories: Directory[] = [
      { id: 'normal-a', name: 'A', order: 0, kind: 'normal', items: [{ id: 'a', name: 'A', path: 'A', type: 'file', order: 0 }] },
      { id: 'normal-b', name: 'B', order: 1, kind: 'normal', items: [{ id: 'b', name: 'B', path: 'B', type: 'file', order: 0 }, { id: 'c', name: 'C', path: 'C', type: 'file', order: 1 }] },
      { id: 'notes', name: '便签', order: 2, kind: 'notes', items: [], note: '一\n二\n三' },
      { id: 'all', name: '全部', order: 3, kind: 'all', items: [] },
    ];
    expect(getDirectoryDisplayCount(directories[0], directories)).toBe(1);
    expect(getDirectoryDisplayCount(directories[2], directories)).toBe(3);
    expect(getDirectoryDisplayCount(directories[3], directories)).toBe(3);
  });
});
