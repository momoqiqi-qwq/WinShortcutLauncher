import { describe, expect, it } from 'vitest';
import { baseDomainFromHost, buildOnlineFaviconUrl, domainFromUrl } from '../faviconProviders';

describe('favicon domain normalization', () => {
  it('reuses the same cache domain for subdomains', () => {
    expect(domainFromUrl('https://github.com/openai')).toBe('github.com');
    expect(domainFromUrl('https://www.github.com/openai')).toBe('github.com');
    expect(domainFromUrl('https://gist.github.com/openai')).toBe('github.com');
  });

  it('handles common compound public suffixes', () => {
    expect(baseDomainFromHost('docs.example.com.cn')).toBe('example.com.cn');
    expect(baseDomainFromHost('shop.example.co.uk')).toBe('example.co.uk');
  });

  it('keeps localhost and IP addresses unchanged', () => {
    expect(baseDomainFromHost('localhost')).toBe('localhost');
    expect(baseDomainFromHost('127.0.0.1')).toBe('127.0.0.1');
  });

  it('builds provider URLs from the normalized domain', () => {
    const url = buildOnlineFaviconUrl('https://gist.github.com/openai', 'quicker');
    expect(url).toContain('github.com');
    expect(url).not.toContain('gist.github.com');
  });
});

describe('hosted platform cache domains', () => {
  it('keeps each hosted subdomain as its own site', () => {
    // GitHub Pages 每个子域是独立站点，共用 github.io 的缓存会拿到 GitHub 的图标。
    expect(domainFromUrl('https://treapgogo.github.io/deepseek-whale-girl/')).toBe('treapgogo.github.io');
    expect(domainFromUrl('https://momoqiqi.github.io/x')).toBe('momoqiqi.github.io');
    expect(baseDomainFromHost('proj.vercel.app')).toBe('proj.vercel.app');
  });

  it('falls back to a network icon for the page provider', () => {
    const url = buildOnlineFaviconUrl('https://treapgogo.github.io/deepseek-whale-girl/', 'page');
    expect(url).toContain('helperservice.getquicker.cn');
    expect(url).toContain('treapgogo.github.io');
  });
});
