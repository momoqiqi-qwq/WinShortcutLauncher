import { describe, expect, it } from 'vitest';
import {
  extractDroppedWebLink,
  extractDroppedWebLinkAsync,
  hasDroppedWebLinkType,
  normalizeDroppedUrl,
  readDroppedUrlShortcutFile,
  shouldAcceptExternalDropCandidate,
} from '../browserDrop';

function fakeTransfer(data: Record<string, string>, files: File[] = []) {
  const types = Object.keys(data);
  if (files.length) types.push('Files');
  return {
    types,
    files,
    getData(type: string) {
      return data[type] ?? '';
    },
  } as unknown as DataTransfer;
}

function fakeItemTransfer(items: Array<{ type: string; value: string }>) {
  return {
    types: [],
    files: [],
    items: items.map(({ type, value }) => ({
      kind: 'string',
      type,
      getAsString(callback: (value: string) => void) {
        queueMicrotask(() => callback(value));
      },
    })),
    getData() {
      return '';
    },
  } as unknown as DataTransfer;
}

describe('browser drag compatibility', () => {
  it('accepts protected-mode external drags even when the type list is empty', () => {
    const protectedTransfer = fakeTransfer({});
    expect(shouldAcceptExternalDropCandidate(protectedTransfer)).toBe(true);
  });

  it('does not hijack the launcher own native transfer payload', () => {
    const transfer = fakeTransfer({ 'application/x-launcher-transfer-paths': '{"paths":[]}' });
    expect(shouldAcceptExternalDropCandidate(transfer)).toBe(false);
  });

  it('reads Gecko string payloads exposed only through DataTransferItem.getAsString', async () => {
    const transfer = fakeItemTransfer([
      { type: 'text/x-moz-url-data', value: 'https://floorp.app/' },
      { type: 'text/x-moz-url-desc', value: 'Floorp Browser' },
    ]);
    await expect(extractDroppedWebLinkAsync(transfer)).resolves.toEqual({
      url: 'https://floorp.app/',
      name: 'Floorp Browser',
    });
  });

  it('accepts Floorp/Firefox text/x-moz-url-data and description flavors', () => {
    const transfer = fakeTransfer({
      'text/x-moz-url-data': 'https://floorp.app/',
      'text/x-moz-url-desc': 'Floorp Browser',
    });
    expect(hasDroppedWebLinkType(transfer)).toBe(true);
    expect(extractDroppedWebLink(transfer)).toEqual({
      url: 'https://floorp.app/',
      name: 'Floorp Browser',
    });
  });

  it('accepts Firefox private URL and Places bookmark data', () => {
    const privateTransfer = fakeTransfer({ 'text/x-moz-url-priv': 'https://example.com/private' });
    expect(hasDroppedWebLinkType(privateTransfer)).toBe(true);
    expect(extractDroppedWebLink(privateTransfer)?.url).toBe('https://example.com/private');

    const placeTransfer = fakeTransfer({
      'text/x-moz-place': JSON.stringify({ uri: 'https://mozilla.org/', title: 'Mozilla' }),
    });
    expect(hasDroppedWebLinkType(placeTransfer)).toBe(true);
    expect(extractDroppedWebLink(placeTransfer)).toEqual({ url: 'https://mozilla.org/', name: 'Mozilla' });
  });

  it('accepts Gecko file-promise URL drops', () => {
    const transfer = fakeTransfer({
      'application/x-moz-file-promise-url': 'https://example.com/download',
      'application/x-moz-file-promise-dest-filename': 'Example Site.url',
    });
    expect(hasDroppedWebLinkType(transfer)).toBe(true);
    expect(extractDroppedWebLink(transfer)).toEqual({
      url: 'https://example.com/download',
      name: 'Example Site',
    });
  });

  it('does not misclassify a Gecko image/file promise as a website', () => {
    const transfer = fakeTransfer({
      'text/x-moz-url-data': 'https://example.com/logo.png',
      'application/x-moz-file-promise-url': 'https://example.com/logo.png',
      'application/x-moz-file-promise-dest-filename': 'logo.png',
      'application/x-moz-file-promise': '',
    });
    expect(hasDroppedWebLinkType(transfer)).toBe(false);
    expect(extractDroppedWebLink(transfer)).toBeNull();
  });

  it('keeps Chromium/Edge-style URI list and DownloadURL support', () => {
    const uriTransfer = fakeTransfer({
      'text/uri-list': '# comment\nhttps://www.google.com/\n',
      'text/plain': 'Google',
    });
    expect(hasDroppedWebLinkType(uriTransfer)).toBe(true);
    expect(extractDroppedWebLink(uriTransfer)).toEqual({ url: 'https://www.google.com/', name: 'Google' });

    const downloadTransfer = fakeTransfer({ DownloadURL: 'text/html:Example:https://example.com/' });
    expect(hasDroppedWebLinkType(downloadTransfer)).toBe(true);
    expect(extractDroppedWebLink(downloadTransfer)).toEqual({ url: 'https://example.com/', name: 'Example' });
  });

  it('accepts Windows URL clipboard aliases exposed by some browser shells', () => {
    const transfer = fakeTransfer({ UniformResourceLocatorW: 'https://example.com/windows' });
    expect(hasDroppedWebLinkType(transfer)).toBe(true);
    expect(extractDroppedWebLink(transfer)?.url).toBe('https://example.com/windows');
  });

  it('accepts future browser URL-like text flavors as a fallback', () => {
    const transfer = fakeTransfer({ 'text/x-browser-url': 'https://vivaldi.com/' });
    expect(hasDroppedWebLinkType(transfer)).toBe(true);
    expect(extractDroppedWebLink(transfer)?.url).toBe('https://vivaldi.com/');
  });

  it('reads virtual .url/.website file contents when no text URL flavor is exposed', async () => {
    const file = new File(['[InternetShortcut]\r\nURL=https://waterfox.net/\r\n'], 'Waterfox.url', { type: 'text/plain' });
    const transfer = fakeTransfer({}, [file]);
    expect(hasDroppedWebLinkType(transfer)).toBe(true);
    await expect(readDroppedUrlShortcutFile(file)).resolves.toEqual({
      url: 'https://waterfox.net/',
      name: 'Waterfox',
    });
  });

  it('reads UTF-16LE Internet Shortcut files used by Windows/browser virtual drops', async () => {
    const source = '[InternetShortcut]\r\nURL=https://floorp.app/\r\n';
    const encoded = new Uint8Array(2 + source.length * 2);
    encoded[0] = 0xff;
    encoded[1] = 0xfe;
    for (let index = 0; index < source.length; index += 1) {
      const code = source.charCodeAt(index);
      encoded[2 + index * 2] = code & 0xff;
      encoded[3 + index * 2] = code >> 8;
    }
    const file = new File([encoded], 'Floorp.url');
    await expect(readDroppedUrlShortcutFile(file)).resolves.toEqual({
      url: 'https://floorp.app/',
      name: 'Floorp',
    });
  });

  it('normalizes URL= and UTF-16-like NUL padded text', () => {
    expect(normalizeDroppedUrl('URL=https://example.com/path')).toBe('https://example.com/path');
    expect(normalizeDroppedUrl('h\0t\0t\0p\0s\0:\0/\0/\0e\0x\0a\0m\0p\0l\0e\0.\0c\0o\0m\0/\0')).toBe('https://example.com/');
  });
});
