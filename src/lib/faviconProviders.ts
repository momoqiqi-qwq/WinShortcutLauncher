import type { FaviconProviderId } from '../types';

export interface FaviconProviderMeta {
  id: FaviconProviderId;
  name: string;
  group: '国内' | '国外' | '直连';
  description: string;
  buildUrl?: (domain: string, originalUrl?: string) => string;
}

export const FAVICON_PROVIDERS: FaviconProviderMeta[] = [
  { id: 'auto', name: '自动兜底', group: '国内', description: '按当前选择和内置顺序自动尝试' },
  { id: 'quicker', name: 'Quicker', group: '国内', description: 'helperservice.getquicker.cn，国内访问通常较快', buildUrl: (domain) => `https://helperservice.getquicker.cn/favicon/get/${encodeURIComponent(domain)}` },
  { id: 'faviconIm', name: 'Favicon.im', group: '国内', description: '轻量 favicon 代理', buildUrl: (domain) => `https://favicon.im/${encodeURIComponent(domain)}` },
  { id: 'iowen', name: 'Iowen', group: '国内', description: '常见站点图标代理', buildUrl: (domain) => `https://api.iowen.cn/favicon/${encodeURIComponent(domain)}.png` },
  { id: 'google', name: 'Google', group: '国外', description: 'Google S2 favicon 服务', buildUrl: (domain) => `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128` },
  { id: 'duckduckgo', name: 'DuckDuckGo', group: '国外', description: 'DuckDuckGo icon 服务', buildUrl: (domain) => `https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico` },
  { id: 'clearbit', name: 'Clearbit', group: '国外', description: 'Clearbit logo 服务', buildUrl: (domain) => `https://logo.clearbit.com/${encodeURIComponent(domain)}` },
  { id: 'iconHorse', name: 'Icon Horse', group: '国外', description: 'Icon Horse favicon 服务', buildUrl: (domain) => `https://icon.horse/icon/${encodeURIComponent(domain)}` },
  { id: 'faviconKit', name: 'FaviconKit', group: '国外', description: 'FaviconKit 图标源', buildUrl: (domain) => `https://api.faviconkit.com/${encodeURIComponent(domain)}/128` },
  { id: 'yandex', name: 'Yandex', group: '国外', description: 'Yandex favicon 服务', buildUrl: (domain) => `https://favicon.yandex.net/favicon/${encodeURIComponent(domain)}` },
  { id: 'direct', name: '网站 /favicon.ico', group: '直连', description: '直接尝试网站根目录 favicon.ico', buildUrl: (_domain, originalUrl) => {
    try { return new URL('/favicon.ico', originalUrl).toString(); } catch { return ''; }
  } }
];

const COMMON_COMPOUND_SUFFIXES = new Set([
  'com.cn', 'net.cn', 'org.cn', 'gov.cn', 'edu.cn',
  'co.uk', 'org.uk', 'ac.uk',
  'com.au', 'net.au', 'org.au',
  'co.jp', 'ne.jp', 'or.jp',
  'co.kr', 'com.br', 'com.sg', 'com.hk', 'com.tw'
]);

export function baseDomainFromHost(value: string) {
  const host = value.trim().replace(/^www\./i, '').replace(/\.$/, '').toLowerCase();
  if (!host || host === 'localhost' || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(':')) return host;
  const labels = host.split('.').filter(Boolean);
  if (labels.length <= 2) return host;
  const lastTwo = labels.slice(-2).join('.');
  if (COMMON_COMPOUND_SUFFIXES.has(lastTwo) && labels.length >= 3) {
    return labels.slice(-3).join('.');
  }
  return lastTwo;
}

export function domainFromUrl(value: string) {
  try {
    const normalized = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
    return baseDomainFromHost(new URL(normalized).hostname);
  } catch {
    const host = value.trim().replace(/^https?:\/\//i, '').split('/')[0].split(':')[0];
    return baseDomainFromHost(host);
  }
}

export function buildOnlineFaviconUrl(url: string, providerId: FaviconProviderId = 'auto') {
  const domain = domainFromUrl(url);
  const id = providerId === 'auto' ? 'quicker' : providerId;
  const provider = FAVICON_PROVIDERS.find((entry) => entry.id === id) ?? FAVICON_PROVIDERS.find((entry) => entry.id === 'quicker');
  return provider?.buildUrl?.(domain, url) ?? '';
}
