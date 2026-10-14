import { describe, expect, it } from 'vitest';
import { getFirstDirectory, normalizeGroups } from '../normalizers';
import { restorePersistedState } from '../persistence';

/**
 * Startup-restore regression guard.
 *
 * `getFirstDirectory(groups, { normalized: true })` skips a second full-tree
 * `normalizeGroups` pass for callers that already hold normalized output
 * (restorePersistedState / deleteGroup / moveDirectoryToGroup / importConfig).
 * On a 4000-item config that second pass cost ~3 ms and accounted for ~42% of
 * the whole restore. These tests lock the equivalence with the defensive path;
 * timings are only logged, never asserted, so CI stays stable.
 */

function buildPersistedPayload(groupCount: number, dirsPerGroup: number, itemsPerDir: number) {
  return {
    groups: Array.from({ length: groupCount }, (_, g) => ({
      id: `group_${g}`,
      name: `分组 ${g}`,
      order: g,
      directories: Array.from({ length: dirsPerGroup }, (_, d) => ({
        id: `dir_${g}_${d}`,
        name: `子目录 ${d}`,
        order: d,
        kind: 'normal',
        items: Array.from({ length: itemsPerDir }, (_, i) => ({
          id: `item_${g}_${d}_${i}`,
          name: `项目 ${i}`,
          path: `C:\\Tools\\tool-${g}-${d}-${i}.exe`,
          type: 'file',
          order: i,
          launchCount: i % 7,
        })),
      })),
    })),
    theme: 'dark-soft',
  };
}

function timeIt(label: string, runs: number, fn: () => void) {
  fn(); // warm up
  const started = performance.now();
  for (let i = 0; i < runs; i += 1) fn();
  const perRun = (performance.now() - started) / runs;
  console.log(`[perf] ${label}: ${perRun.toFixed(3)} ms/run (${runs} runs)`);
  return perRun;
}

describe('getFirstDirectory fast path', () => {
  it('returns exactly what the re-normalizing path returns', () => {
    const payloads = [
      buildPersistedPayload(8, 10, 50).groups,
      buildPersistedPayload(3, 4, 2).groups,
      buildPersistedPayload(1, 1, 1).groups,
    ];

    for (const raw of payloads) {
      const normalized = normalizeGroups(raw);
      expect(getFirstDirectory(normalized, { normalized: true })).toEqual(
        getFirstDirectory(normalized),
      );
    }
  });

  it('resolves the first group/directory by order, not by raw array position', () => {
    // Deliberately out of order: the normalizing path sorts by `order` and
    // re-indexes, so index 0 of the normalized tree is the order-0 entry.
    const raw = [
      {
        id: 'group_late',
        name: 'second-in-array',
        order: 9,
        directories: [{ id: 'dir_late', name: 'dir-second', order: 7, kind: 'normal', items: [] }],
      },
      {
        id: 'group_first',
        name: 'first-by-order',
        order: 0,
        directories: [{ id: 'dir_first', name: 'dir-first', order: 3, kind: 'normal', items: [] }],
      },
    ];

    const normalized = normalizeGroups(raw);
    expect(normalized[0].name).toBe('first-by-order');
    expect(normalized[0].directories[0].name).toBe('dir-first');

    const expected = { groupId: normalized[0].id, directoryId: normalized[0].directories[0].id };
    expect(getFirstDirectory(normalized, { normalized: true })).toEqual(expected);
    expect(getFirstDirectory(normalized, { normalized: true })).toEqual(
      getFirstDirectory(normalized),
    );
  });

  it('falls back to defense-in-depth when the tree is not in normalized shape', () => {
    const badInputs: unknown[] = [
      undefined,
      null,
      'nope',
      42,
      {},
      [],
      [{}],
      [{ id: 'group_only' }],
      [{ id: 'group_only', directories: [] }],
      [{ directories: [{ id: 'dir_only' }] }],
    ];

    for (const bad of badInputs) {
      // An unguarded fast path would throw or return undefined ids here.
      const result = getFirstDirectory(bad, { normalized: true });
      expect(typeof result.groupId).toBe('string');
      expect(typeof result.directoryId).toBe('string');
      expect(result.groupId).not.toHaveLength(0);
      expect(result.directoryId).not.toHaveLength(0);
    }

    // Anonymous entries get a freshly minted id on every normalizeGroups call
    // (`normalizedId` in normalizers.ts), so two calls on id-less input are not
    // deep-equal. Explicit ids are preserved and therefore reproducible.
    const partial = [
      { id: 'group_x', order: 0, directories: [{ name: 'anon', order: 0, kind: 'normal', items: [] }] },
    ];
    expect(getFirstDirectory(partial, { normalized: true }).groupId).toBe('group_x');
    expect(getFirstDirectory(partial, { normalized: true }).directoryId).not.toHaveLength(0);
  });

  it('requires normalized input, so callers must not pass raw unsorted data', () => {
    // Both entries carry explicit ids; only `order` distinguishes them.
    const raw = [
      {
        id: 'group_late',
        name: 'second-in-array',
        order: 9,
        directories: [{ id: 'dir_late', name: 'dir-second', order: 7, kind: 'normal', items: [] }],
      },
      {
        id: 'group_first',
        name: 'first-by-order',
        order: 0,
        directories: [{ id: 'dir_first', name: 'dir-first', order: 3, kind: 'normal', items: [] }],
      },
    ];

    // The defensive path sorts, so it lands on the order-0 entry.
    expect(getFirstDirectory(raw)).toEqual({ groupId: 'group_first', directoryId: 'dir_first' });
    // The fast path deliberately trusts index 0 — passing it raw data is a caller
    // bug, which is exactly why every call site must normalize first (and why the
    // flag stays opt-in instead of auto-detected).
    expect(getFirstDirectory(raw, { normalized: true })).toEqual({
      groupId: 'group_late',
      directoryId: 'dir_late',
    });
  });

  it('measures restore cost on a realistic payload', () => {
    const payload = buildPersistedPayload(8, 10, 50); // 8 groups x 10 dirs x 50 items = 4000 items

    const normalizeMs = timeIt('normalizeGroups only', 20, () => {
      normalizeGroups(payload.groups);
    });
    const defensiveMs = timeIt('getFirstDirectory (defensive re-normalize)', 20, () => {
      getFirstDirectory(payload.groups);
    });
    const groups = normalizeGroups(payload.groups);
    const fastMs = timeIt('getFirstDirectory (normalized: true)', 20, () => {
      getFirstDirectory(groups, { normalized: true });
    });
    const restoreMs = timeIt('restorePersistedState', 20, () => {
      restorePersistedState(payload);
    });

    console.log(
      `[perf] getFirstDirectory fast/defensive: ${(defensiveMs / Math.max(fastMs, 1e-6)).toFixed(1)}x faster`,
    );
    console.log(`[perf] restore/normalize ratio: ${(restoreMs / normalizeMs).toFixed(2)}x`);

    expect(groups[0].directories[0].items).toHaveLength(50);
    expect(restoreMs).toBeLessThan(normalizeMs * 4);
  });
});
