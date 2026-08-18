import { describe, expect, it } from 'vitest';
import { matchSearchText, searchTextMatches, toFullPinyin, toPinyinInitials } from '../pinyinSearch';

describe('shared pinyin search', () => {
  it('creates full pinyin and initials for runtime Chinese names', () => {
    expect(toFullPinyin('工作')).toBe('gongzuo');
    expect(toPinyinInitials('工作')).toBe('gz');
    expect(toFullPinyin('文件夹')).toBe('wenjianjia');
    expect(toPinyinInitials('文件夹')).toBe('wjj');
    expect(toFullPinyin('浏览器')).toBe('liulanqi');
    expect(toPinyinInitials('浏览器')).toBe('llq');
  });

  it('supports full, partial and initial pinyin matches', () => {
    expect(matchSearchText('浏览器', 'liulanqi')).toBe('exact');
    expect(matchSearchText('浏览器', 'liu')).toBe('prefix');
    expect(matchSearchText('浏览器', 'llq')).toBe('exact');
    expect(searchTextMatches('爱奇艺', 'ai')).toBe(true);
  });

  it('keeps common polyphonic phrases searchable', () => {
    expect(toFullPinyin('重庆')).toBe('chongqing');
    expect(toPinyinInitials('重庆')).toBe('cq');
    expect(searchTextMatches('银行', 'yh')).toBe(true);
  });
});
