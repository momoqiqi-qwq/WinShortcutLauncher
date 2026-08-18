import type { CommandUsage } from '../types';

export function normalizeCommandUsage(value: unknown): Record<string, CommandUsage> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const normalized: Record<string, CommandUsage> = {};
  for (const [rawKey, rawUsage] of Object.entries(value as Record<string, unknown>)) {
    const key = String(rawKey).trim();
    if (!key || key.startsWith('custom:')) continue;
    if (!rawUsage || typeof rawUsage !== 'object' || Array.isArray(rawUsage)) continue;
    const candidate = rawUsage as Partial<CommandUsage>;
    const count = Number(candidate.count);
    const lastUsedAt = Number(candidate.lastUsedAt);
    normalized[key] = {
      count: Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0,
      lastUsedAt: Number.isFinite(lastUsedAt) ? Math.max(0, lastUsedAt) : 0,
    };
  }
  return normalized;
}
