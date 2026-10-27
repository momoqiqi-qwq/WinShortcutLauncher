import { describe, expect, it } from 'vitest';
import type { Directory } from '../../types';
import {
  resolveHtmlPageColor,
  resolveHtmlPageName,
  resolveHtmlView,
  type HtmlPage,
} from '../htmlFolder';

function page(path: string, stem: string): HtmlPage {
  return {
    name: `${stem}.html`,
    stem,
    path,
    extension: 'html',
    relative: `${stem}.html`,
    directory: '',
    isIndex: stem === 'index',
  };
}

function directory(overrides: Partial<Directory> = {}): Directory {
  return { id: 'dir-1', name: 'HTML', order: 0, kind: 'html', items: [], ...overrides };
}

describe('HTML 卡片显示名与颜色（v175）', () => {
  it('没改过名时用文件名（不含扩展名）', () => {
    expect(resolveHtmlPageName(directory(), page('C:\\a\\index.html', 'index'))).toBe('index');
  });

  it('改过名就用改过的名字，空白名回退到文件名', () => {
    const dir = directory({ htmlNames: { 'C:\\a\\index.html': '  首页  ' } });
    expect(resolveHtmlPageName(dir, page('C:\\a\\index.html', 'index'))).toBe('首页');
    expect(resolveHtmlPageName(directory({ htmlNames: { 'C:\\a\\index.html': '   ' } }), page('C:\\a\\index.html', 'index'))).toBe('index');
  });

  it('颜色按绝对路径命中，没上色返回 undefined', () => {
    const dir = directory({ htmlColors: { 'C:\\a\\index.html': '#8b5cf6' } });
    expect(resolveHtmlPageColor(dir, page('C:\\a\\index.html', 'index'))).toBe('#8b5cf6');
    expect(resolveHtmlPageColor(dir, page('C:\\a\\about.html', 'about'))).toBeUndefined();
    expect(resolveHtmlPageColor(directory(), page('C:\\a\\index.html', 'index'))).toBeUndefined();
  });

  it('目录显示设置缺字段时补默认值（递归扫描默认开）', () => {
    const view = resolveHtmlView(directory());
    expect(view.recursive).toBe(true);
    expect(view.preview).toBe(true);
    expect(view.previewScale).toBe('fit');
  });
});
