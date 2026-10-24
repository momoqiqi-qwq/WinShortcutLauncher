import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig, Group } from '../../../types';

const profileConfigs = new Map<string, { groups: unknown }>();
let activeProfileId: string | null = 'profile-active';

vi.mock('../../../lib/configProfiles', () => ({
  getActiveConfigProfileId: () => activeProfileId,
  getConfigProfileConfig: async (id: string) => profileConfigs.get(id) ?? null,
}));

const { useAppStore } = await import('../../appStore');
const { syncDirectoryLinks, invalidateLinkSourceCache } = await import('../../../lib/linkSyncRunner');
const { isMirroredDirectoryId, isMirroredItemId } = await import('../../../lib/directoryLinks');

const SOURCE_PROFILE = 'profile-src';

function sourceGroups(): Group[] {
  return [
    {
      id: 'g-src',
      name: '工作',
      order: 0,
      directories: [
        {
          id: 'd-src-tools',
          name: '工具',
          order: 0,
          kind: 'normal',
          items: [
            { id: 'i-src-vscode', name: 'VSCode', path: 'C:\\VSCode.exe', type: 'file', order: 0 },
            { id: 'i-src-git', name: 'Git', path: 'C:\\Git.exe', type: 'file', order: 1 },
          ],
        },
      ],
    },
  ];
}

function resetStore() {
  const groups: Group[] = [
    {
      id: 'g-main',
      name: '主目录',
      order: 0,
      directories: [{ id: 'd-local', name: '本地', order: 0, kind: 'normal', items: [] }],
    },
  ];
  useAppStore.setState({ groups, activeGroupId: 'g-main', activeDirectoryId: 'd-local' });
}

async function waitFor(check: () => boolean, timeoutMs = 1500) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return check();
}

function linkDirectory() {
  return useAppStore
    .getState()
    .groups.flatMap((group) => group.directories)
    .find((directory) => directory.kind === 'link');
}

describe('链接子目录 / 链接父目录：跨配置生效', () => {
  beforeEach(() => {
    profileConfigs.clear();
    profileConfigs.set(SOURCE_PROFILE, { groups: sourceGroups() });
    activeProfileId = 'profile-active';
    invalidateLinkSourceCache();
    resetStore();
  });

  it('新建链接子目录后，另一个配置里的项目会同步进来', async () => {
    const directoryId = useAppStore.getState().addLinkedDirectory('g-main', {
      profileId: SOURCE_PROFILE,
      profileName: '源配置',
      groupId: 'g-src',
      directoryId: 'd-src-tools',
    });
    expect(directoryId).toBeTruthy();

    const synced = await waitFor(() => (linkDirectory()?.items.length ?? 0) === 2);
    expect(synced).toBe(true);

    const target = linkDirectory()!;
    expect(target.name).toBe('工具');
    expect(target.items.map((item) => item.name)).toEqual(['VSCode', 'Git']);
    expect(target.items.every((item) => isMirroredItemId(item.id))).toBe(true);
    expect(target.link).toEqual({
      profileId: SOURCE_PROFILE,
      profileName: '源配置',
      groupId: 'g-src',
      directoryId: 'd-src-tools',
    });
  });

  it('源配置里改了内容，链接会跟着更新（跨配置同步）', async () => {
    useAppStore.getState().addLinkedDirectory('g-main', {
      profileId: SOURCE_PROFILE,
      groupId: 'g-src',
      directoryId: 'd-src-tools',
    });
    await waitFor(() => (linkDirectory()?.items.length ?? 0) === 2);

    const nextSource = sourceGroups();
    nextSource[0].directories[0].name = '常用工具';
    nextSource[0].directories[0].items = [
      { id: 'i-src-zed', name: 'Zed', path: 'C:\\Zed.exe', type: 'file', order: 0 },
    ];
    profileConfigs.set(SOURCE_PROFILE, { groups: nextSource });
    invalidateLinkSourceCache();
    // 真实运行时由 useDirectoryLinkSync 的轮询 / 聚焦触发；这里手动触发一次同步。
    await useAppStore.getState().syncLinks();
    expect(linkDirectory()!.name).toBe('常用工具');
    expect(linkDirectory()!.items.map((item) => item.name)).toEqual(['Zed']);
  });

  it('链接父目录把源父目录的整组子目录搬过来', async () => {
    const groupId = useAppStore.getState().addLinkedGroup({
      profileId: SOURCE_PROFILE,
      groupId: 'g-src',
    });
    expect(groupId).toBeTruthy();

    const synced = await waitFor(() => {
      const group = useAppStore.getState().groups.find((entry) => entry.id === groupId);
      return Boolean(group?.directories.some((directory) => isMirroredDirectoryId(directory.id)));
    });
    expect(synced).toBe(true);

    const group = useAppStore.getState().groups.find((entry) => entry.id === groupId)!;
    expect(group.name).toBe('工作');
    expect(group.directories.map((directory) => directory.name)).toEqual(['工具']);
    expect(group.directories[0].items.map((item) => item.name)).toEqual(['VSCode', 'Git']);
    // 占位子目录已被真实内容顶掉。
    expect(group.directories.some((directory) => directory.id.startsWith('linkpending:'))).toBe(false);
  });

  it('切换配置时（exportConfig → importConfig）链接来源不丢', () => {
    useAppStore.getState().addLinkedDirectory('g-main', {
      profileId: SOURCE_PROFILE,
      profileName: '源配置',
      groupId: 'g-src',
      directoryId: 'd-src-tools',
    });
    const exported = useAppStore.getState().exportConfig() as AppConfig;
    const serialized = JSON.parse(JSON.stringify(exported)) as AppConfig;
    const link = serialized.groups
      .flatMap((group) => group.directories)
      .find((directory) => directory.kind === 'link');
    expect(link?.link?.groupId).toBe('g-src');
    expect(link?.link?.directoryId).toBe('d-src-tools');

    // 再导回来（模拟切走再切回），链接仍在，并且还能继续同步。
    useAppStore.getState().importConfig(serialized);
    expect(linkDirectory()?.link?.profileId).toBe(SOURCE_PROFILE);
  });

  it('解除链接后内容留在原地，但不再跟随源', async () => {
    useAppStore.getState().addLinkedDirectory('g-main', {
      profileId: SOURCE_PROFILE,
      groupId: 'g-src',
      directoryId: 'd-src-tools',
    });
    await waitFor(() => (linkDirectory()?.items.length ?? 0) === 2);

    const directoryId = linkDirectory()!.id;
    expect(useAppStore.getState().detachLink({ kind: 'directory', id: directoryId })).toBe(true);
    const detached = useAppStore
      .getState()
      .groups.flatMap((group) => group.directories)
      .find((directory) => directory.id === directoryId)!;
    expect(detached.kind).toBe('normal');
    expect(detached.link).toBeUndefined();
    expect(detached.items.map((item) => item.name)).toEqual(['VSCode', 'Git']);

    const nextSource = sourceGroups();
    nextSource[0].directories[0].items = [];
    profileConfigs.set(SOURCE_PROFILE, { groups: nextSource });
    invalidateLinkSourceCache();
    await syncDirectoryLinks();
    const after = useAppStore
      .getState()
      .groups.flatMap((group) => group.directories)
      .find((directory) => directory.id === directoryId)!;
    expect(after.items.map((item) => item.name)).toEqual(['VSCode', 'Git']);
  });
});
