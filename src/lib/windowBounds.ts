export const DEFAULT_WINDOW_WIDTH = 1180;
export const DEFAULT_WINDOW_HEIGHT = 880;
export const MIN_WINDOW_WIDTH = 900;
export const MIN_WINDOW_HEIGHT = 640;

export type SavedWindowBounds = {
  width: number;
  height: number;
  x?: number;
  y?: number;
  savedAt: number;
};

export function normalizeWindowNumber(value: unknown, min: number, max: number) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return null;
  return Math.round(Math.min(max, Math.max(min, numberValue)));
}

export function parseSavedWindowBounds(raw: string | null): SavedWindowBounds | null {
  try {
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedWindowBounds>;
    const rawWidth = Number(parsed.width);
    const rawHeight = Number(parsed.height);
    if (!Number.isFinite(rawWidth) || !Number.isFinite(rawHeight)) return null;
    const tooSmall = rawWidth < MIN_WINDOW_WIDTH || rawHeight < MIN_WINDOW_HEIGHT;
    const width = tooSmall ? DEFAULT_WINDOW_WIDTH : normalizeWindowNumber(rawWidth, MIN_WINDOW_WIDTH, 10000);
    const height = tooSmall ? DEFAULT_WINDOW_HEIGHT : normalizeWindowNumber(rawHeight, MIN_WINDOW_HEIGHT, 10000);
    if (!width || !height) return null;
    const x = normalizeWindowNumber(parsed.x, -20000, 20000);
    const y = normalizeWindowNumber(parsed.y, -20000, 20000);
    return { width, height, x: x ?? undefined, y: y ?? undefined, savedAt: Number(parsed.savedAt) || 0 };
  } catch {
    return null;
  }
}

export function clampWindowBoundsToArea(
  bounds: SavedWindowBounds,
  area: { x: number; y: number; width: number; height: number }
): SavedWindowBounds {
  if (!Number.isFinite(bounds.x) || !Number.isFinite(bounds.y)) return bounds;
  const minX = area.x;
  const minY = area.y;
  const maxX = area.x + area.width;
  const maxY = area.y + area.height;
  const x = Math.min(Math.max(bounds.x!, minX), Math.max(minX, maxX - bounds.width));
  const y = Math.min(Math.max(bounds.y!, minY), Math.max(minY, maxY - bounds.height));
  return { ...bounds, x, y };
}
