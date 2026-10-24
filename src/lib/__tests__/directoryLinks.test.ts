import { describe, expect, it } from 'vitest';
import type { Directory, Group, ShortcutItem } from '../../types';
import {
  applyLinkSources,
  createLinkedDirectory,
  createLinkedGroup,
  isMirroredDirectoryId,
  isMirroredItemId,
  linkedDirectoryId,
  linkedItemId,
  mirrorDirectory,
  mirrorGroupDirectories,
} from '../directoryLinks';
import { normalizeGroups } from '../../stores/appStore/normalizers';

function item(id: string, name: string, order: number): ShortcutItem {
  return { id, name, path: `C:\\Apps\\${name}.exe`, type: 'file', order };
}

function dir(id: string, name: string, order: number, items: ShortcutItem[] = []): Directory {
  return { id, name, order, kind: 'normal', items };
}

function group(id: string, name: string, order: number, directories: Directory[]): Group {
  return { id, name, order, directories };
}

/** 源配置：工作（两个子目录，共 3 个项目和 1 个子子目录）。 */
function sourceConfig(): Group[] {
  return [
    group('g-work', '工作', 0, [
      dir('d-tools', '工具', 0, [item('i-vscode', 'VSCode', 0), item('i-git', 'Git', 1)]),
      dir('d-docs', '文档', 1, [item('i-manual', '手册', 0)]),
    ]),
    group('g-life', '生活', 1, [dir('d-music', '音乐', 0, [item('i-foobar', 'Foobar', 0)])]),
  ];
}

/** 目标配置：只有一个普通父目录 + 一个链接子目录（源指向「工作 › 工具」）。 */
function targetConfig(): Group[] {
  const linkDirectory = createLinkedDirectory(
    { profileId: 'profile-src', profileName: '源配置', groupId: 'g-work', directoryId: 'd-tools' },
    '工具',
    0,
  );
  return [
    group('g-main', '主目录', 0, [linkDirectory, dir('d-local', '本地', 1, [item('i-local', '本地项目', 0)])]),
  ];
}

describe('目录链接：镜像 id', () => {
  it('镜像子目录 / 项目使用派生 id，不会和源撞车', () => {
    const source = dir('d-tools', '工具', 0, [item('i-vscode', 'VSCode', 0)]);
    const mirrored = mirrorDirectory(source, 'g:g-link', 0);
    expect(mirrored.id).toBe(linkedDirectoryId('g:g-link', 'd-tools'));
    expect(mirrored.id).not.toBe(source.id);
    expect(mirrored.items[0].id).toBe(linkedItemId('g:g-link', 'i-vscode'));
    expect(mirrored.items[0].id).not.toBe('i-vscode');
    expect(isMirroredDirectoryId(mirrored.id)).toBe(true);
    expect(isMirroredItemId(mirrored.items[0].id)).toBe(true);
  });

  it('便签子目录只镜像正文，不镜像项目', () => {
    const notes: Directory = { id: 'd-note', name: '便签', order: 0, kind: 'notes', note: '今天要做的事', items: [] };
    const mirrored = mirrorDirectory(notes, 'd:d-link', 0);
    expect(mirrored.kind).toBe('notes');
    expect(mirrored.note).toBe('今天要做的事');
    expect(mirrored.items).toEqual([]);
  });

  it('父目录链接镜像源下所有普通子目录，跳过「全部」这类系统目录', () => {
    const source = group('g-work', '工作', 0, [
      dir('d-all', '全部', 0),
      { ...dir('d-all-2', '全部', 1), kind: 'all' },
      dir('d-tools', '工具', 2, [item('i-vscode', 'VSCode', 0)]),
    ]);
    const mirrored = mirrorGroupDirectories(source, 'g:g-link');
    expect(mirrored.map((entry) => entry.name)).toEqual(['全部', '工具']);
    expect(mirrored.every((entry) => isMirroredDirectoryId(entry.id))).toBe(true);
  });

  it('源里已经是镜像内容的目录不会被再镜像一层', () => {
    const twice = dir(linkedDirectoryId('g:auto', 'd-tools'), '工具', 0, [
      { ...item('i-x', 'X', 0), id: linkedItemId('d:auto', 'i-x') },
    ]);
    expect(mirrorGroupDirectories(group('g', 'G', 0, [twice]), 'g:g-link')).toEqual([]);
  });
});

describe('目录链接：跨配置同步', () => {
  it('链接子目录把另一个配置里的项目同步进来，并保留本地项目', () => {
    const source = sourceConfig();
    const target = targetConfig();
    const result = applyLinkSources(target, (profileId) => (profileId === 'profile-src' ? source : undefined));

    expect(result.changed).toBe(true);
    expect(result.unresolved).toBe(0);

    const linkDirectory = result.groups[0].directories[0];
    expect(linkDirectory.kind).toBe('link');
    expect(linkDirectory.name).toBe('工具');
    expect(linkDirectory.items.map((entry) => entry.name)).toEqual(['VSCode', 'Git']);
    expect(linkDirectory.items[0].id).toBe(linkedItemId('d:' + linkDirectory.id, 'i-vscode'));
    // 链接之外的子目录原样不动。
    expect(result.groups[0].directories[1]).toBe(target[0].directories[1]);
  });

  it('用户自己在链接子目录里追加的项目不会被同步删掉，排在镜像项目后面', () => {
    const source = sourceConfig();
    const target = targetConfig();
    target[0].directories[0].items.push(item('i-mine', '我自己加的', 0));

    const result = applyLinkSources(target, (profileId) => (profileId === 'profile-src' ? source : undefined));
    const linkDirectory = result.groups[0].directories[0];
    expect(linkDirectory.items.map((entry) => entry.name)).toEqual(['VSCode', 'Git', '我自己加的']);
    expect(linkDirectory.items[2].id).toBe('i-mine');
  });

  it('源没变时同步是幂等的（changed=false，引用也不变）', () => {
    const source = sourceConfig();
    const target = targetConfig();
    const first = applyLinkSources(target, (profileId) => (profileId === 'profile-src' ? source : undefined));
    const second = applyLinkSources(first.groups, (profileId) => (profileId === 'profile-src' ? source : undefined));
    expect(second.changed).toBe(false);
    expect(second.updated).toBe(0);
    expect(second.groups).toBe(first.groups);
  });

  it('源里新增 / 改名 / 删除项目都会同步过来', () => {
    const source = sourceConfig();
    const target = targetConfig();
    const step1 = applyLinkSources(target, (profileId) => (profileId === 'profile-src' ? source : undefined));

    source[0].directories[0].items = [item('i-vscode', 'VS Code 改名', 0), item('i-zed', 'Zed', 1)];
    source[0].directories[0].name = '常用工具';
    const step2 = applyLinkSources(step1.groups, (profileId) => (profileId === 'profile-src' ? source : undefined));

    expect(step2.changed).toBe(true);
    const linkDirectory = step2.groups[0].directories[0];
    expect(linkDirectory.name).toBe('常用工具');
    expect(linkDirectory.items.map((entry) => entry.name)).toEqual(['VS Code 改名', 'Zed']);
    expect(linkDirectory.items.some((entry) => entry.name === 'Git')).toBe(false);
  });

  it('链接父目录：父目录名称和整组子目录都跟随源，本地自建子目录排在后面', () => {
    const source = sourceConfig();
    const linkGroup = createLinkedGroup(
      { profileId: 'profile-src', profileName: '源配置', groupId: 'g-work' },
      '工作',
      0,
    );
    linkGroup.directories.push(dir('d-extra', '我在链接里加的', 1, [item('i-extra', 'Extra', 0)]));

    const result = applyLinkSources([linkGroup], (profileId) => (profileId === 'profile-src' ? source : undefined));
    expect(result.changed).toBe(true);

    const synced = result.groups[0];
    expect(synced.name).toBe('工作');
    expect(synced.link?.groupId).toBe('g-work');
    expect(synced.directories.map((entry) => entry.name)).toEqual(['工具', '文档', '我在链接里加的']);
    expect(synced.directories[0].items.map((entry) => entry.name)).toEqual(['VSCode', 'Git']);
    expect(isMirroredDirectoryId(synced.directories[0].id)).toBe(true);
    // 占位子目录已被真实内容替换。
    expect(synced.directories.some((entry) => entry.id.startsWith('linkpending:'))).toBe(false);
  });

  it('源配置被删 / 源被删时不动链接内容，只报 unresolved', () => {
    const target = targetConfig();
    const result = applyLinkSources(target, () => undefined);
    expect(result.changed).toBe(false);
    expect(result.unresolved).toBe(1);
    expect(result.groups).toBe(target);
  });
});

describe('目录链接：跨配置持久化', () => {
  it('normalizeGroups 保留子目录链接和父目录链接', () => {
    const groups = normalizeGroups(
      [
        {
          id: 'g-main',
          name: '主目录',
          order: 0,
          directories: [
            {
              id: 'd-link',
              name: '工具',
              order: 0,
              kind: 'link',
              link: { profileId: 'profile-src', profileName: '源配置', groupId: 'g-work', directoryId: 'd-tools' },
              items: [{ id: 'linkitem:d:d-link:i-vscode', name: 'VSCode', path: 'C:\\a.exe', type: 'file', order: 0 }],
            },
          ],
        },
        {
          id: 'g-link',
          name: '工作',
          order: 1,
          link: { profileId: 'profile-src', groupId: 'g-work' },
          directories: [{ id: 'linkdir:g:g-link:d-tools', name: '工具', order: 0, kind: 'normal', items: [] }],
        },
      ],
      undefined,
    );

    expect(groups[0].directories[0].kind).toBe('link');
    expect(groups[0].directories[0].link).toEqual({
      profileId: 'profile-src',
      profileName: '源配置',
      groupId: 'g-work',
      directoryId: 'd-tools',
    });
    // 链接子目录的镜像项目要保留，否则切配置回来链接就空了。
    expect(groups[0].directories[0].items).toHaveLength(1);
    expect(groups[1].link).toEqual({ profileId: 'profile-src', groupId: 'g-work' });
    expect(groups[1].directories).toHaveLength(1);
  });

  it('链接记录不完整时降级成普通子目录，不会留下坏链接', () => {
    const groups = normalizeGroups(
      [
        {
          id: 'g-main',
          name: '主目录',
          order: 0,
          directories: [{ id: 'd-bad', name: '坏链接', order: 0, kind: 'link', items: [] }],
        },
      ],
      undefined,
    );
    expect(groups[0].directories[0].kind).toBe('normal');
    expect(groups[0].directories[0].link).toBeUndefined();
  });
});
