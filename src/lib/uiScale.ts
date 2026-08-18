export const MIN_UI_SCALE = 0.1;
export const MAX_UI_SCALE = 1.8;
export const UI_SCALE_STEP = 0.1;

export function normalizeUiScale(value: unknown, fallback = 1) {
  const numeric = Number(value);
  const safe = Number.isFinite(numeric) ? numeric : fallback;
  return Math.round(Math.min(MAX_UI_SCALE, Math.max(MIN_UI_SCALE, safe)) * 100) / 100;
}
