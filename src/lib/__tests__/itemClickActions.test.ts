import { describe, expect, it } from 'vitest';
import type { ShortcutItem } from '../../types';
import {
  getItemCopyPayload,
  getItemInteractionHint,
  normalizeItemClickAction,
  resolveItemClickAction,
} from '../itemClickActions';

const urlItem: ShortcutItem = {
  id: 'item-url',
  name: 'OpenAI',
  path: 'https://openai.com/',
  type: 'url',
  order: 0,
};

describe('v129 item click actions', () => {
  it('keeps the old global launch mode when the project inherits', () => {
    expect(resolveItemClickAction(undefined, 'single', 'single')).toBe('open');
    expect(resolveItemClickAction(undefined, 'double', 'single')).toBe('none');
    expect(resolveItemClickAction('inherit', 'single', 'double')).toBe('none');
    expect(resolveItemClickAction('inherit', 'double', 'double')).toBe('open');
  });

  it('allows single-click and double-click to copy different content', () => {
    expect(resolveItemClickAction('copy-path', 'single', 'double')).toBe('copy-path');
    expect(resolveItemClickAction('copy-name', 'double', 'double')).toBe('copy-name');
    expect(getItemCopyPayload(urlItem, 'copy-path')).toEqual({ text: urlItem.path, label: '网址' });
    expect(getItemCopyPayload(urlItem, 'copy-name')).toEqual({ text: urlItem.name, label: '名称' });
    expect(getItemCopyPayload(urlItem, 'copy-name-path')?.text).toBe(`${urlItem.name}\n${urlItem.path}`);
  });

  it('normalizes only supported persisted actions', () => {
    expect(normalizeItemClickAction('copy-name-path')).toBe('copy-name-path');
    expect(normalizeItemClickAction('bad-action')).toBeUndefined();
    expect(normalizeItemClickAction(null)).toBeUndefined();
  });

  it('shows both configured actions in the project hint', () => {
    const hint = getItemInteractionHint({
      ...urlItem,
      singleClickAction: 'copy-path',
      doubleClickAction: 'copy-name',
    }, 'double', true);
    expect(hint).toContain('单击：复制网址');
    expect(hint).toContain('双击：复制名称');
    expect(hint).toContain('长按拖动排序');
  });
});
