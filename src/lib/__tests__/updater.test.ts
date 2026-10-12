import { describe, expect, it } from 'vitest';
import {
  describeDownloadSource,
  formatBytes,
  isNewerVersion,
  parseVersion,
  pickInstallerAsset,
  type UpdateAsset,
} from '../updater';

function asset(name: string, size = 10, downloadUrl = `https://example.com/${name}`): UpdateAsset {
  return { name, size, downloadUrl };
}

describe('parseVersion', () => {
  it('接受带 v 前缀、缺位补零、带预发布后缀的版本号', () => {
    expect(parseVersion('v0.1.149')).toEqual([0, 1, 149]);
    expect(parseVersion('0.1.9')).toEqual([0, 1, 9]);
    expect(parseVersion('1.2')).toEqual([1, 2, 0]);
    expect(parseVersion('2')).toEqual([2, 0, 0]);
    expect(parseVersion('v2.0.0-beta.1')).toEqual([2, 0, 0]);
    expect(parseVersion('  0.1.149  ')).toEqual([0, 1, 149]);
  });

  it('无法解析时返回 null', () => {
    expect(parseVersion('')).toBeNull();
    expect(parseVersion('v')).toBeNull();
    expect(parseVersion('abc')).toBeNull();
    expect(parseVersion('1.2.x')).toBeNull();
  });
});

describe('isNewerVersion', () => {
  it('逐段比较，不使用字符串比较', () => {
    expect(isNewerVersion('v0.1.150', '0.1.149')).toBe(true);
    expect(isNewerVersion('v0.1.149', '0.1.149')).toBe(false);
    expect(isNewerVersion('v0.1.9', '0.1.10')).toBe(false);
    expect(isNewerVersion('0.2.0', '0.1.999')).toBe(true);
  });

  it('当前版本号读不出来时，只要能解析出最新版本就提示更新', () => {
    expect(isNewerVersion('0.1.150', 'unknown')).toBe(true);
    expect(isNewerVersion('', '0.1.149')).toBe(false);
  });
});

describe('pickInstallerAsset', () => {
  it('优先挑带 setup 的 exe', () => {
    const picked = pickInstallerAsset([
      asset('Yue-launcher.exe'),
      asset('Yue launcher_0.1.150_x64-setup.exe'),
      asset('notes.txt'),
    ]);
    expect(picked?.name).toBe('Yue launcher_0.1.150_x64-setup.exe');
  });

  it('没有 setup 时退到第一个 exe，再退到第一个附件', () => {
    expect(pickInstallerAsset([asset('notes.txt'), asset('Yue-launcher.exe')])?.name).toBe('Yue-launcher.exe');
    expect(pickInstallerAsset([asset('notes.txt'), asset('checksums.json')])?.name).toBe('notes.txt');
  });

  it('空列表返回 null', () => {
    expect(pickInstallerAsset([])).toBeNull();
    expect(pickInstallerAsset(undefined)).toBeNull();
    expect(pickInstallerAsset(null)).toBeNull();
  });
});

describe('formatBytes', () => {
  it('按 B/KB/MB 显示，小于 100 留一位小数', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(204800)).toBe('200 KB');
    expect(formatBytes(1572864)).toBe('1.5 MB');
  });

  it('异常输入不抛错', () => {
    expect(formatBytes(Number.NaN)).toBe('0 B');
    expect(formatBytes(-1)).toBe('0 B');
  });
});

describe('describeDownloadSource', () => {
  it('把「默认目录是哪来的」翻成中文提示', () => {
    expect(describeDownloadSource('remembered', 'D:/dl')).toContain('上次');
    expect(describeDownloadSource('app', 'D:/dl')).toContain('软件所在目录');
    expect(describeDownloadSource('downloads', 'D:/dl')).toContain('下载文件夹');
    expect(describeDownloadSource('temp', 'D:/dl')).toContain('临时目录');
    expect(describeDownloadSource(undefined, 'D:/dl')).toBe('更新包默认下载位置');
  });
});
