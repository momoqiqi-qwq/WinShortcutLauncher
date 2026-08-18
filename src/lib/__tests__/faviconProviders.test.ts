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
