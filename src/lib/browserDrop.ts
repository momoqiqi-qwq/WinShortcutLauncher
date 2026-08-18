export type DroppedWebLink = { url: string; name?: string };

const KNOWN_WEB_LINK_TYPES = new Set([
  'text/uri-list',
  'text/plain',
  'text/html',
  'text/url',
  'text/x-url',
  'application/x-url',
  'uniformresourcelocator',
  'uniformresourcelocatorw',
  'url',
  'downloadurl',
  'text/unicode',
  'text/x-moz-text-internal',
  'text/x-moz-url',
  'text/x-moz-url-data',
  'text/x-moz-url-desc',
  'text/x-moz-url-priv',
  'text/x-moz-place',
  'application/x-moz-file-promise-url',
]);

const KNOWN_FILE_TYPES = new Set([
  'files',
  'application/x-moz-file',
  'application/x-moz-file-promise',
]);

function transferTypes(dataTransfer: DataTransfer | null) {
  if (!dataTransfer) return [];
  return Array.from(dataTransfer.types ?? []).map((type) => String(type));
}


const INTERNAL_LAUNCHER_DRAG_TYPES = new Set([
  'application/x-launcher-transfer-paths',
]);

export function getDropTypeSummary(dataTransfer: DataTransfer | null) {
  if (!dataTransfer) return '';
  const types = transferTypes(dataTransfer);
  const itemTypes = Array.from(dataTransfer.items ?? [])
    .map((item) => `${item.kind}:${item.type || '(empty)'}`)
    .filter(Boolean);
  return Array.from(new Set([...types, ...itemTypes])).join(', ');
}

/**
 * External browser drags are in DataTransfer "protected mode" during dragenter/dragover.
 * Chromium normally exposes enough type names for early classification, but Gecko/Floorp
 * can expose an empty/partial list until the actual drop. If we refuse dragover at that
 * point, WebView2 never dispatches the final drop event. Therefore the launcher accepts
 * any non-launcher native drag at the window boundary and validates the payload on drop.
 */
export function shouldAcceptExternalDropCandidate(dataTransfer: DataTransfer | null) {
  if (!dataTransfer) return false;
  const types = transferTypes(dataTransfer).map((type) => type.toLowerCase());
  return !types.some((type) => INTERNAL_LAUNCHER_DRAG_TYPES.has(type));
}

export function normalizeDroppedUrl(raw: string) {
  const cleaned = raw
    .replace(/\0/g, '')
    .trim()
    .replace(/^URL\s*[:=]\s*/i, '')
    .replace(/^[<'"]+|[>'"]+$/g, '')
    .trim();
  if (!cleaned) return '';

  const direct = cleaned.match(/^[a-z][a-z0-9+.-]*:\/\/[^\s<>"']+/i)?.[0]
    || cleaned.match(/^www\.[^\s<>"']+/i)?.[0];
  if (!direct) return '';

  const normalized = /^[a-z][a-z0-9+.-]*:\/\//i.test(direct) ? direct : `https://${direct}`;
  try {
    const parsed = new URL(normalized);
    if (!/^https?:$/i.test(parsed.protocol)) return '';
    return parsed.toString();
  } catch {
    return '';
  }
}

export function getTransferText(dataTransfer: DataTransfer, type: string) {
  try {
    return dataTransfer.getData(type) || '';
  } catch {
    return '';
  }
}

function decodeHtmlText(value: string) {
  if (!value) return '';
  if (typeof document !== 'undefined') {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = value;
    return textarea.value;
  }
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

export function cleanDroppedTitle(value: string, url?: string) {
  const cleaned = decodeHtmlText(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\.(url|website)$/i, '')
    .replace(/^\s*URL\s*[:：]\s*/i, '')
    .replace(/[\r\n\t\0]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 120);
  if (!cleaned) return '';
  const normalizedCandidateUrl = normalizeDroppedUrl(cleaned);
  const normalizedTargetUrl = url ? normalizeDroppedUrl(url) : '';
  if (normalizedCandidateUrl && normalizedTargetUrl && normalizedCandidateUrl === normalizedTargetUrl) return '';
  if (normalizedCandidateUrl && !/\s/.test(cleaned)) return '';
  try {
    const host = new URL(normalizedTargetUrl || url || '').hostname.replace(/^www\./, '').toLowerCase();
    if (host && cleaned.toLowerCase() === host) return '';
  } catch {}
  return cleaned;
}

function pushDroppedTitleCandidate(candidates: string[], value: string | undefined, url?: string) {
  const name = cleanDroppedTitle(value || '', url);
  if (!name) return;
  if (!candidates.some((item) => item.toLowerCase() === name.toLowerCase())) candidates.push(name);
}

export function nameFromDroppedUrlFile(path: string, url?: string) {
  const last = path.replace(/\\/g, '/').split('/').pop() || path;
  return cleanDroppedTitle(last, url);
}

function extractTitleFromHtml(html: string, url?: string) {
  if (!html) return '';
  if (typeof DOMParser !== 'undefined') {
    try {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const anchors = Array.from(doc.querySelectorAll('a[href]')) as HTMLAnchorElement[];
      const normalizedUrl = url ? normalizeDroppedUrl(url) : '';
      const matched = anchors.find((anchor) => normalizeDroppedUrl(anchor.href) === normalizedUrl) || anchors[0];
      if (matched) {
        return cleanDroppedTitle(
          matched.getAttribute('aria-label')
            || matched.getAttribute('title')
            || matched.textContent
            || matched.innerText
            || '',
          url,
        );
      }
      return cleanDroppedTitle(doc.querySelector('title')?.textContent || '', url);
    } catch {}
  }

  const anchorText = html.match(/<a\b[^>]*>([\s\S]*?)<\/a>/i)?.[1] || '';
  const titleText = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '';
  return cleanDroppedTitle(anchorText || titleText, url);
}

function extractUrlFromHtml(html: string) {
  if (!html) return '';
  if (typeof DOMParser !== 'undefined') {
    try {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const anchor = doc.querySelector('a[href]') as HTMLAnchorElement | null;
      if (anchor?.href) return normalizeDroppedUrl(anchor.href);
    } catch {}
  }
  const href = html.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1] || '';
  return normalizeDroppedUrl(href) || normalizeDroppedUrl(html);
}

function parseMozPlace(raw: string): DroppedWebLink | null {
  const text = raw.trim();
  if (!text) return null;
  let values: unknown[] = [];
  try {
    const parsed = JSON.parse(text);
    values = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    try {
      values = JSON.parse(`[${text}]`);
    } catch {
      return null;
    }
  }

  for (const value of values) {
    if (!value || typeof value !== 'object') continue;
    const entry = value as Record<string, unknown>;
    const rawUrl = typeof entry.uri === 'string' ? entry.uri : typeof entry.url === 'string' ? entry.url : '';
    const url = normalizeDroppedUrl(rawUrl);
    if (!url) continue;
    const rawTitle = typeof entry.title === 'string' ? entry.title : typeof entry.name === 'string' ? entry.name : '';
    const name = cleanDroppedTitle(rawTitle, url);
    return { url, ...(name ? { name } : {}) };
  }
  return null;
}

function firstUrlFromLines(raw: string) {
  for (const line of raw.replace(/\0/g, '').split(/\r?\n/)) {
    const url = normalizeDroppedUrl(line.trim());
    if (url) return url;
  }
  return normalizeDroppedUrl(raw);
}


function hasNonUrlFilePayload(dataTransfer: DataTransfer) {
  if (dataTransfer.files && Array.from(dataTransfer.files).some((file) => !/\.(url|website)$/i.test(file.name || ''))) return true;
  const promisedName = getTransferText(dataTransfer, 'application/x-moz-file-promise-dest-filename').trim();
  if (promisedName && !/\.(url|website)$/i.test(promisedName)) return true;
  return false;
}

function hasUrlShortcutPromise(dataTransfer: DataTransfer) {
  if (getDroppedUrlShortcutFile(dataTransfer)) return true;
  const promisedName = getTransferText(dataTransfer, 'application/x-moz-file-promise-dest-filename').trim();
  return /\.(url|website)$/i.test(promisedName);
}
function readAliases(dataTransfer: DataTransfer, aliases: string[]) {
  for (const alias of aliases) {
    const value = getTransferText(dataTransfer, alias);
    if (value) return value;
  }
  return '';
}

export function extractDroppedWebLink(dataTransfer: DataTransfer | null): DroppedWebLink | null {
  if (!dataTransfer) return null;

  const titleCandidates: string[] = [];

  const uriList = getTransferText(dataTransfer, 'text/uri-list')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith('#'));
  let url = normalizeDroppedUrl(uriList || '');

  const moz = getTransferText(dataTransfer, 'text/x-moz-url');
  if (moz) {
    const lines = moz.replace(/\0/g, '').split(/\r?\n/).filter(Boolean);
    if (!url) url = normalizeDroppedUrl(lines[0] || '');
    pushDroppedTitleCandidate(titleCandidates, lines[1], url || lines[0]);
  }

  const mozData = readAliases(dataTransfer, ['text/x-moz-url-data', 'text/x-moz-url-priv']);
  // Firefox also uses x-moz-url-data while dragging images/files. If a concrete
  // non-.url file promise is present, keep that drag on the normal file path.
  if (!url && mozData && !hasNonUrlFilePayload(dataTransfer)) url = firstUrlFromLines(mozData);
  if (url) pushDroppedTitleCandidate(titleCandidates, getTransferText(dataTransfer, 'text/x-moz-url-desc'), url);

  const mozPlace = getTransferText(dataTransfer, 'text/x-moz-place');
  if (mozPlace) {
    const place = parseMozPlace(mozPlace);
    if (!url && place?.url) url = place.url;
    if (place?.name) pushDroppedTitleCandidate(titleCandidates, place.name, url || place.url);
  }

  const browserUrl = readAliases(dataTransfer, ['text/url', 'text/x-url', 'application/x-url', 'UniformResourceLocatorW', 'UniformResourceLocator', 'uniformresourcelocatorw', 'uniformresourcelocator', 'URL', 'url']);
  if (!url && browserUrl) url = firstUrlFromLines(browserUrl);

  const html = getTransferText(dataTransfer, 'text/html');
  if (html) {
    if (!url) url = extractUrlFromHtml(html);
    pushDroppedTitleCandidate(titleCandidates, extractTitleFromHtml(html, url), url);
  }

  const plain = readAliases(dataTransfer, ['text/plain', 'text/unicode', 'text/x-moz-text-internal']);
  if (!url && plain) url = firstUrlFromLines(plain);
  if (plain) {
    plain.replace(/\0/g, '').split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => pushDroppedTitleCandidate(titleCandidates, line, url));
  }

  const chromiumDownloadUrl = readAliases(dataTransfer, ['DownloadURL', 'downloadurl']);
  if (chromiumDownloadUrl) {
    const parts = chromiumDownloadUrl.replace(/\0/g, '').split(':');
    const maybeUrl = parts.length >= 3 ? parts.slice(2).join(':') : chromiumDownloadUrl;
    const mime = (parts[0] || '').toLowerCase();
    const fileName = parts[1] || '';
    const looksLikeWebsitePayload = mime === 'text/html' || /\.(url|website)$/i.test(fileName);
    if (!url && looksLikeWebsitePayload) url = firstUrlFromLines(maybeUrl);
    if (url && parts.length >= 3) pushDroppedTitleCandidate(titleCandidates, fileName, url);
  }

  const promisedUrl = getTransferText(dataTransfer, 'application/x-moz-file-promise-url');
  const promisedName = getTransferText(dataTransfer, 'application/x-moz-file-promise-dest-filename').trim();
  if (promisedUrl && !hasNonUrlFilePayload(dataTransfer)) {
    const promisedCandidate = firstUrlFromLines(promisedUrl);
    const looksLikeDirectAsset = /\.(?:avif|bmp|gif|ico|jpe?g|png|svg|webp|pdf|zip|rar|7z|exe|msi|mp[34]|webm|mov|mkv|wav|flac)(?:[?#]|$)/i.test(promisedCandidate);
    if (!url && promisedCandidate && (!looksLikeDirectAsset || /\.(url|website)$/i.test(promisedName))) url = promisedCandidate;
    if (url) pushDroppedTitleCandidate(titleCandidates, promisedName, url);
  }

  // Browser vendors occasionally expose extra URL/text flavors. Scan link-like
  // types as a final fallback so a browser update does not silently break drops.
  if (!url) {
    for (const type of transferTypes(dataTransfer)) {
      const lower = type.toLowerCase();
      if (KNOWN_WEB_LINK_TYPES.has(lower)) continue;
      if (!(lower === 'text/unicode' || (lower.startsWith('text/') && (lower.includes('url') || lower.startsWith('text/x-moz-'))))) continue;
      const raw = getTransferText(dataTransfer, type);
      if (!raw) continue;
      if (lower.includes('place')) {
        const place = parseMozPlace(raw);
        if (place?.url) {
          url = place.url;
          if (place.name) pushDroppedTitleCandidate(titleCandidates, place.name, url);
          break;
        }
      }
      url = firstUrlFromLines(raw);
      if (url) break;
    }
  }

  if (dataTransfer.files && dataTransfer.files.length === 1) {
    const fileName = (dataTransfer.files[0]?.name || '').trim();
    if (/\.(url|website)$/i.test(fileName)) pushDroppedTitleCandidate(titleCandidates, fileName, url);
  }

  if (!url) return null;
  return { url, name: titleCandidates[0] || undefined };
}


async function readStringDataTransferItems(dataTransfer: DataTransfer) {
  const entries = await Promise.all(
    Array.from(dataTransfer.items ?? [])
      .filter((item) => item.kind === 'string' && Boolean(item.type))
      .map((item) => new Promise<[string, string] | null>((resolve) => {
        try {
          item.getAsString((value) => resolve([item.type, value || '']));
        } catch {
          resolve(null);
        }
      })),
  );
  const values = new Map<string, string>();
  for (const entry of entries) {
    if (!entry || !entry[1]) continue;
    values.set(entry[0], entry[1]);
    values.set(entry[0].toLowerCase(), entry[1]);
  }
  return values;
}

/**
 * Some Gecko/Floorp -> WebView2 drops expose the string payload only through
 * DataTransferItem.getAsString() at drop time. Try the synchronous path first, then
 * rebuild a read-only DataTransfer facade from the item payloads as a second pass.
 */
export async function extractDroppedWebLinkAsync(dataTransfer: DataTransfer | null): Promise<DroppedWebLink | null> {
  if (!dataTransfer) return null;
  const direct = extractDroppedWebLink(dataTransfer);
  if (direct) return direct;

  const itemValues = await readStringDataTransferItems(dataTransfer);
  if (itemValues.size === 0) return null;
  const itemTypes = Array.from(dataTransfer.items ?? []).map((item) => item.type).filter(Boolean);
  const facade = {
    types: Array.from(new Set([...transferTypes(dataTransfer), ...itemTypes])),
    files: dataTransfer.files,
    items: dataTransfer.items,
    getData(type: string) {
      return itemValues.get(type) || itemValues.get(type.toLowerCase()) || getTransferText(dataTransfer, type);
    },
  } as unknown as DataTransfer;
  return extractDroppedWebLink(facade);
}

export function extractDroppedFilePaths(dataTransfer: DataTransfer | null): string[] {
  if (!dataTransfer?.files || dataTransfer.files.length === 0) return [];
  return Array.from(dataTransfer.files)
    .map((file) => ((file as File & { path?: string }).path || file.name || '').trim())
    .filter(Boolean);
}

export function getDroppedUrlShortcutFile(dataTransfer: DataTransfer | null): File | null {
  if (!dataTransfer?.files || dataTransfer.files.length === 0) return null;
  return Array.from(dataTransfer.files).find((file) => /\.(url|website)$/i.test(file.name || '')) || null;
}

export async function readDroppedUrlShortcutFile(file: File): Promise<DroppedWebLink | null> {
  if (!/\.(url|website)$/i.test(file.name || '')) return null;
  try {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const looksUtf16Le = (bytes[0] === 0xff && bytes[1] === 0xfe)
      || (bytes.length > 4 && bytes[1] === 0 && bytes[3] === 0);
    const looksUtf16Be = bytes[0] === 0xfe && bytes[1] === 0xff;
    let text = '';
    if (looksUtf16Le) text = new TextDecoder('utf-16le').decode(bytes);
    else if (looksUtf16Be) text = new TextDecoder('utf-16be').decode(bytes);
    else text = new TextDecoder('utf-8').decode(bytes);
    text = text.replace(/^\uFEFF/, '').replace(/\0/g, '');
    const rawUrl = text.match(/^\s*URL\s*=\s*(.+?)\s*$/im)?.[1] || '';
    const url = normalizeDroppedUrl(rawUrl);
    if (!url) return null;
    const name = nameFromDroppedUrlFile(file.name, url);
    return { url, ...(name ? { name } : {}) };
  } catch {
    return null;
  }
}

export function hasDroppedWebLinkType(dataTransfer: DataTransfer | null) {
  if (!dataTransfer) return false;
  if (getDroppedUrlShortcutFile(dataTransfer) || hasUrlShortcutPromise(dataTransfer)) return true;
  const nonUrlFilePayload = hasNonUrlFilePayload(dataTransfer);
  return transferTypes(dataTransfer).some((type) => {
    const lower = type.toLowerCase();
    if (lower === 'downloadurl') {
      const raw = getTransferText(dataTransfer, type);
      const parts = raw.split(':');
      return (parts[0] || '').toLowerCase() === 'text/html' || /\.(url|website)$/i.test(parts[1] || '');
    }
    if (lower === 'text/x-moz-url-data' || lower === 'text/x-moz-url-priv' || lower === 'application/x-moz-file-promise-url') return !nonUrlFilePayload;
    return KNOWN_WEB_LINK_TYPES.has(lower)
      || lower.startsWith('text/x-moz-url')
      || lower === 'text/x-moz-place'
      || lower === 'text/unicode'
      || (lower.startsWith('text/') && lower.includes('url'));
  });
}

export function hasDroppedFileType(dataTransfer: DataTransfer | null) {
  if (!dataTransfer) return false;
  if (dataTransfer.files && dataTransfer.files.length > 0) return true;
  return transferTypes(dataTransfer).some((type) => KNOWN_FILE_TYPES.has(type.toLowerCase()));
}
