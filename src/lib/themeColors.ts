export interface ParsedCssColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

function clampChannel(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function clampAlpha(value: number) {
  return Math.max(0, Math.min(1, value));
}

function parseHexColor(value: string): ParsedCssColor | null {
  const hex = value.slice(1);
  if (![3, 4, 6, 8].includes(hex.length) || !/^[0-9a-f]+$/i.test(hex)) return null;

  const expanded = hex.length <= 4 ? hex.split('').map((part) => part + part).join('') : hex;
  const hasAlpha = expanded.length === 8;
  return {
    r: Number.parseInt(expanded.slice(0, 2), 16),
    g: Number.parseInt(expanded.slice(2, 4), 16),
    b: Number.parseInt(expanded.slice(4, 6), 16),
    a: hasAlpha ? Number.parseInt(expanded.slice(6, 8), 16) / 255 : 1,
  };
}

function parseRgbColor(value: string): ParsedCssColor | null {
  const match = value.match(/^rgba?\(\s*([+-]?(?:\d+\.?\d*|\.\d+))\s*,\s*([+-]?(?:\d+\.?\d*|\.\d+))\s*,\s*([+-]?(?:\d+\.?\d*|\.\d+))(?:\s*,\s*([+-]?(?:\d+\.?\d*|\.\d+)))?\s*\)$/i);
  if (!match) return null;
  return {
    r: clampChannel(Number(match[1])),
    g: clampChannel(Number(match[2])),
    b: clampChannel(Number(match[3])),
    a: clampAlpha(match[4] === undefined ? 1 : Number(match[4])),
  };
}

export function parseCssColor(value: string): ParsedCssColor | null {
  const normalized = value.trim();
  if (normalized.startsWith('#')) return parseHexColor(normalized);
  return parseRgbColor(normalized);
}

/**
 * Converts a possibly translucent theme surface color into the opaque color users
 * already see when that surface is composited over the theme background. This lets
 * an opacity slider own the final alpha instead of inheriting hidden alpha
 * from a theme token such as rgba(255,255,255,.62).
 */
export function toOpaqueThemeSurface(foreground: string, background: string) {
  const fg = parseCssColor(foreground);
  const bg = parseCssColor(background);
  if (!fg || !bg) return foreground;
  if (fg.a >= 0.999) return foreground;

  const bgR = bg.r * bg.a + 255 * (1 - bg.a);
  const bgG = bg.g * bg.a + 255 * (1 - bg.a);
  const bgB = bg.b * bg.a + 255 * (1 - bg.a);
  const r = fg.r * fg.a + bgR * (1 - fg.a);
  const g = fg.g * fg.a + bgG * (1 - fg.a);
  const b = fg.b * fg.a + bgB * (1 - fg.a);
  return `rgb(${clampChannel(r)}, ${clampChannel(g)}, ${clampChannel(b)})`;
}

/**
 * v171: 原生表单控件的配色方向（`color-scheme`）跟着主题底色走。
 * 深色主题下若不给 `color-scheme: dark`，Windows/WebView2 会把 `<select>` 的
 * 弹层画成纯白底，而文字沿用主题的浅色 —— 结果就是「白底浅字」，几乎读不出来。
 */
export function pickNativeColorScheme(background: string, fallback: 'dark' | 'light' = 'light'): 'dark' | 'light' {
  const parsed = parseCssColor(background);
  if (!parsed) return fallback;
  const toLinear = (channel: number) => {
    const srgb = channel / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * toLinear(parsed.r) + 0.7152 * toLinear(parsed.g) + 0.0722 * toLinear(parsed.b);
  return luminance < 0.42 ? 'dark' : 'light';
}