import type { DisplaySettings } from '../types';

/**
 * v148: 相邻颜色组合。
 *
 * v147 里每个子目录 / 项目各自用自己选的颜色互不影响。这里补上「相邻组合」：
 * 同一容器（左侧子目录列表、内容区项目网格）内相邻的若干项并成一组，
 * 组内共用第一个有色项的颜色作基色，其余成员取该基色的同色系深浅。
 * `groupTint` 为 0 时组内完全同色，视觉上就是「相邻几项组合成一个整块」。
 */

export interface ColorFrameEntry {
  id: string;
  color?: string;
}

export interface ColorFrameBlendOptions {
  blend: DisplaySettings['colorFrameBlend'];
  /** 每几项并成一组（2–6）。 */
  groupSize: number;
  /** 组内每格相对基色的混白比例（0–0.6），0 表示组内完全同色。 */
  groupTint: number;
}

interface ParsedColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** 组内最深的一格最多混到 80% 白，避免多层叠加后压成纯白看不清。 */
const MAX_CUMULATIVE_TINT = 0.8;

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR_PATTERN.test(value.trim());
}

function parseColor(value: string | undefined): ParsedColor | null {
  if (!isHexColor(value)) return null;
  const hex = value.trim().slice(1);
  const expanded = hex.length <= 4 ? hex.split('').map((part) => part + part).join('') : hex;
  const hasAlpha = expanded.length === 8;
  return {
    r: Number.parseInt(expanded.slice(0, 2), 16),
    g: Number.parseInt(expanded.slice(2, 4), 16),
    b: Number.parseInt(expanded.slice(4, 6), 16),
    a: hasAlpha ? Number.parseInt(expanded.slice(6, 8), 16) / 255 : 1,
  };
}

function toHexChannel(value: number) {
  return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');
}

function formatColor(color: ParsedColor) {
  const base = `#${toHexChannel(color.r)}${toHexChannel(color.g)}${toHexChannel(color.b)}`;
  // 8 位色保留透明度，否则上色时会出现「本来半透明、框突然变实」的跳变。
  return color.a >= 1 ? base : `${base}${toHexChannel(color.a * 255)}`;
}

/** 把颜色朝白色混 `amount`（0–1），得到同色系的浅色；非法色值原样返回。 */
export function tintColor(value: string, amount: number): string {
  const parsed = parseColor(value);
  if (!parsed) return value;
  const ratio = Math.max(0, Math.min(1, amount));
  if (ratio === 0) return value;
  return formatColor({
    r: parsed.r + (255 - parsed.r) * ratio,
    g: parsed.g + (255 - parsed.g) * ratio,
    b: parsed.b + (255 - parsed.b) * ratio,
    a: parsed.a,
  });
}

/**
 * v156: 同色相邻成组框。
 *
 * 与 v138「同色相邻父目录自动成组框」同一套规则，只是作用在内容区的项目卡片上：
 * 按显示顺序找出「颜色相同且相邻」的项，数量 ≥2 才成组（单个项目不画额外的框）。
 * 颜色比较忽略大小写（`#FF0000` 与 `#ff0000` 视为同色），但框本身用组内第一项的原始写法。
 */
export interface ColorFrameCluster {
  id: string;
  color: string;
  itemIds: string[];
}

export function resolveColorFrameClusters(entries: ColorFrameEntry[]): ColorFrameCluster[] {
  const result: ColorFrameCluster[] = [];
  let index = 0;
  while (index < entries.length) {
    const color = entries[index].color?.trim().toLowerCase();
    if (!color) {
      index += 1;
      continue;
    }
    let end = index + 1;
    while (end < entries.length && entries[end].color?.trim().toLowerCase() === color) end += 1;
    if (end - index >= 2) {
      result.push({
        id: `cluster-${entries[index].id}`,
        color: (entries[index].color as string).trim(),
        itemIds: entries.slice(index, end).map((entry) => entry.id),
      });
    }
    index = end;
  }
  return result;
}

export function clampGroupSize(value: number) {
  if (!Number.isFinite(value)) return 3;
  return Math.max(2, Math.min(6, Math.round(value)));
}

export function clampGroupTint(value: number) {
  if (!Number.isFinite(value)) return 0.22;
  return Math.max(0, Math.min(0.6, value));
}

/**
 * 把每一项解析成最终要画在框上的颜色。
 *
 * 返回的 map 只包含「该有彩色框」的 id；没有出现在 map 里的项就是跟随主题。
 * `independent` 模式下等价于「谁有颜色谁用谁的颜色」。
 */
export function resolveColorFrameColors(
  entries: ColorFrameEntry[],
  options: ColorFrameBlendOptions,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const entry of entries) {
    if (entry.color) result[entry.id] = entry.color;
  }
  if (options.blend !== 'adjacent') return result;

  const size = clampGroupSize(options.groupSize);
  const tint = clampGroupTint(options.groupTint);
  for (let start = 0; start < entries.length; start += size) {
    const group = entries.slice(start, start + size);
    // 组内第一个有色项提供基色；整组都没上色就跳过，绝不凭空造色。
    const base = group.find((entry) => entry.color)?.color;
    if (!base) continue;
    let step = 0;
    for (const entry of group) {
      if (!entry.color) continue;
      result[entry.id] = step === 0
        ? base
        : tintColor(base, Math.min(MAX_CUMULATIVE_TINT, tint * step));
      step += 1;
    }
  }
  return result;
}
