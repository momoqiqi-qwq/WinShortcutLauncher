import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Directory, Group } from '../../../types';

// 菜单要等 useLayoutEffect 量完位置才上桌（SSR 不跑 effect），这里替换成「已就位」。
vi.mock('../useSmartMenuPosition', () => ({
  useSmartMenuPosition: () => ({ ref: { current: null }, style: {}, submenuClassName: '' }),
}));

const sourceDirectory: Directory = {
  id: 'd-src',
  name: '源子目录',
  order: 0,
  kind: 'normal',
  items: [{ id: 'i-1', name: '一号', type: 'url', path: 'https://a.example.com', order: 0 }],
};

const linkDirectory: Directory = {
  id: 'd-link',
  name: '链接子目录',
  order: 1,
  kind: 'link',
  items: [{ id: 'linkitem:d:d-link:i-1', name: '一号', type: 'url', path: 'https://a.example.com', order: 0 }],
  link: { profileId: 'p-src', profileName: '工作配置', groupId: 'g-src', directoryId: 'd-src' },
};

const groups: Group[] = [
  {
    id: 'g-main',
    name: '主目录',
    order: 0,
    directories: [
      { id: 'd-local', name: '本地子目录', order: 0, kind: 'normal', items: [] },
      linkDirectory,
    ],
  },
  {
    id: 'g-link',
    name: '链接父目录',
    order: 1,
    directories: [],
    link: { profileId: 'p-src', profileName: '工作配置', groupId: 'g-src' },
  },
];

// zustand 的 SSR 快照会退回 initialState，所以直接把 store 换成一份固定状态。
vi.mock('../../../stores/appStore', async () => {
  const state: Record<string, unknown> = {
    groups,
    experience: {
      groupContextMenuHiddenItems: [],
      directoryContextMenuHiddenItems: [],
      areaContextMenuHiddenItems: [],
    },
    navigationClipboard: null,
  };
  const fallback = new Proxy(state, {
    get(target, key) {
      if (typeof key === 'string' && key in target) return target[key];
      return () => undefined;
    },
  });
  const useAppStore = (selector?: (value: unknown) => unknown) => (selector ? selector(fallback) : fallback);
  Object.assign(useAppStore, {
    getState: () => fallback,
    setState: () => undefined,
    subscribe: () => () => undefined,
  });
  return { useAppStore, selectGroups: (value: { groups: Group[] }) => value.groups };
});

const { GroupContextMenu } = await import('../GroupContextMenu');
const { DirectoryContextMenu } = await import('../DirectoryContextMenu');

function render(node: Parameters<typeof renderToStaticMarkup>[0]) {
  return renderToStaticMarkup(node);
}

describe('右键菜单里的链接入口（渲染级）', () => {
  it('父目录右键有「链接子目录」「链接父目录」', () => {
    const html = render(createElement(GroupContextMenu, {
      menu: { kind: 'group', groupId: 'g-main', x: 10, y: 10 },
      onClose: () => {},
    }));
    expect(html).toContain('链接子目录…');
    expect(html).toContain('链接父目录…');
  });

  it('链接父目录的右键有同步与解除，且提示链接来源', () => {
    const html = render(createElement(GroupContextMenu, {
      menu: { kind: 'group', groupId: 'g-link', x: 10, y: 10 },
      onClose: () => {},
    }));
    expect(html).toContain('立即同步链接');
    expect(html).toContain('解除链接');
    expect(html).toContain('链接自：');
  });

  it('链接子目录的右键有同步、换源、定位、解除', () => {
    const html = render(createElement(DirectoryContextMenu, {
      menu: { kind: 'directory', directoryId: 'd-link', x: 10, y: 10 },
      onClose: () => {},
    }));
    expect(html).toContain('立即同步链接');
    expect(html).toContain('更换链接源…');
    expect(html).toContain('定位到源子目录');
    expect(html).toContain('解除链接');
    expect(html).toContain('链接自：');
  });

  it('普通子目录不会出现链接管理项', () => {
    const html = render(createElement(DirectoryContextMenu, {
      menu: { kind: 'directory', directoryId: 'd-local', x: 10, y: 10 },
      onClose: () => {},
    }));
    expect(html).not.toContain('更换链接源…');
    expect(html).not.toContain('定位到源子目录');
  });
});
