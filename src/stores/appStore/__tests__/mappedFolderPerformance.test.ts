import { beforeEach, describe, expect, it, vi } from 'vitest';

const invokeMock = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));

import { useAppStore } from '../../appStore';

/**
 * V145 回归测试：映射文件夹的卡顿。
 *
 * 卡顿的链路是「扫描完 → 对**每个**条目各发一次 `get_file_icon`」，
 * 而 `get_file_icon` 以前是同步命令（跑在 Tauri 主线程上）且每个图标都要起
 * 一个 `powershell.exe`。映射目录列的是根目录里的全部文件与文件夹，
 * 于是几十上百个条目 = 几十上百次进程创建 + 主线程长时间占用。
 *
 * 修法：图标改为由 `ItemCard` 按视口懒加载，切片里不再批量预取。
 * 这个测试锁住「切片不预取」这一半（另一半是 Rust 侧的 async + 原生提取，
 * 由 `src-tauri/build.rs` 与 `scripts/verify-source-fixes.mjs` 守）。
 */
describe('mapped folder icon loading', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    useAppStore.getState().resetAll();
  });

  function createMappedDirectory(root: string) {
    const groupId = useAppStore.getState().groups[0].id;
    const directoryId = useAppStore.getState().addDirectory(groupId, '映射文件夹', 'mapped');
    useAppStore.getState().setDirectoryMappedPath(directoryId, root);
    return directoryId;
  }

  it('does not extract an icon for every scanned entry', async () => {
    const directoryId = createMappedDirectory('C:\\Mapped');
    const entries = Array.from({ length: 40 }, (_, index) => ({
      name: `entry-${index}.exe`,
      path: `C:\\Mapped\\entry-${index}.exe`,
      extension: 'exe',
      isDir: false,
    }));

    const commands: string[] = [];
    invokeMock.mockImplementation((command: string) => {
      commands.push(command);
      if (command === 'list_mapped_folder') return Promise.resolve(entries);
      return Promise.resolve('data:image/png;base64,AAAA');
    });

    const count = await useAppStore.getState().refreshMappedFolder(directoryId);

    expect(count).toBe(40);
    expect(useAppStore.getState().getMappedItems(directoryId)).toHaveLength(40);
    expect(commands).toContain('list_mapped_folder');
    // 关键断言：一次扫描只允许一次 invoke，不能顺带把 40 个图标全取了。
    expect(commands.filter((command) => command === 'get_file_icon')).toHaveLength(0);
    expect(commands).toHaveLength(1);
  });

  it('keeps the scanned items free of pre-baked icons so cards can lazily resolve them', async () => {
    const directoryId = createMappedDirectory('C:\\Mapped');
    invokeMock.mockImplementation((command: string) => {
      if (command === 'list_mapped_folder') {
        return Promise.resolve([{ name: 'tool.exe', path: 'C:\\Mapped\\tool.exe', extension: 'exe', isDir: false }]);
      }
      return Promise.resolve('data:image/png;base64,AAAA');
    });

    await useAppStore.getState().refreshMappedFolder(directoryId);
    const [item] = useAppStore.getState().getMappedItems(directoryId);

    expect(item.path).toBe('C:\\Mapped\\tool.exe');
    // ItemCard 靠 item.path 自己解析图标；这里留空才说明没有提前取。
    expect(item.icon).toBeUndefined();
  });

  it('reports a mapped directory that has no folder configured without touching the shell', async () => {
    const groupId = useAppStore.getState().groups[0].id;
    const directoryId = useAppStore.getState().addDirectory(groupId, '空映射', 'mapped');
    invokeMock.mockImplementation(() => Promise.resolve([]));

    const count = await useAppStore.getState().refreshMappedFolder(directoryId);

    expect(count).toBe(0);
    expect(invokeMock).not.toHaveBeenCalled();
    expect(useAppStore.getState().mappedError[directoryId]).toBe('该映射子目录还没有选择文件夹');
  });
});
