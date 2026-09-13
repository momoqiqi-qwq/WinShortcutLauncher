import { invoke } from '@tauri-apps/api/core';

const FALLBACK_DOUBLE_CLICK_MS = 420;
let cachedDoubleClickMs: number | null = null;
let pendingDoubleClickMs: Promise<number> | null = null;

function normalizeDoubleClickMs(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return FALLBACK_DOUBLE_CLICK_MS;
  return Math.max(180, Math.min(1000, Math.round(numeric)));
}

export function getSystemDoubleClickTimeMs() {
  if (cachedDoubleClickMs != null) return Promise.resolve(cachedDoubleClickMs);
  if (pendingDoubleClickMs) return pendingDoubleClickMs;
  pendingDoubleClickMs = invoke<number>('get_double_click_time_ms')
    .then((value) => normalizeDoubleClickMs(value))
    .catch(() => FALLBACK_DOUBLE_CLICK_MS)
    .then((value) => {
      cachedDoubleClickMs = value;
      pendingDoubleClickMs = null;
      return value;
    });
  return pendingDoubleClickMs;
}

export function primeSystemDoubleClickTime() {
  void getSystemDoubleClickTimeMs();
}
