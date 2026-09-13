import { makeId } from './id';
import type { MultiAccountBatchMeta, ShortcutItem } from '../types';

interface FreshBatchIdentity {
  batchId: string;
  createdAt: number;
}

function cloneBrowserRoute(item: ShortcutItem) {
  return item.browserRoute ? { ...item.browserRoute } : undefined;
}

function cloneBatchSnapshot(batch?: MultiAccountBatchMeta) {
  return batch ? { ...batch } : undefined;
}

function remapBatch(batch: MultiAccountBatchMeta | undefined, batchIds: Map<string, FreshBatchIdentity>) {
  if (!batch?.batchId) return batch ? { ...batch } : undefined;
  let fresh = batchIds.get(batch.batchId);
  if (!fresh) {
    fresh = { batchId: makeId('batch'), createdAt: Date.now() };
    batchIds.set(batch.batchId, fresh);
  }
  return { ...batch, batchId: fresh.batchId, createdAt: fresh.createdAt };
}

/**
 * Freeze the project clipboard at copy time. Nested routing/batch metadata is
 * cloned so later edits to the original project cannot mutate the clipboard.
 */
export function snapshotShortcutItems(items: readonly ShortcutItem[]): ShortcutItem[] {
  return items.map((item) => ({
    ...item,
    browserRoute: cloneBrowserRoute(item),
    multiAccountBatch: cloneBatchSnapshot(item.multiAccountBatch),
  }));
}

/**
 * Create independent project copies with fresh item IDs and fresh multi-account
 * batch IDs. Items copied from the same original batch stay grouped together,
 * while the new copy never points back at the source batch.
 */
export function cloneShortcutItemsForCopy(
  items: readonly ShortcutItem[],
  startOrder: number,
  rename?: (item: ShortcutItem, index: number) => string,
): ShortcutItem[] {
  const batchIds = new Map<string, FreshBatchIdentity>();
  return items.map((item, index) => ({
    ...item,
    id: makeId('item'),
    name: rename ? rename(item, index) : item.name,
    order: startOrder + index,
    browserRoute: cloneBrowserRoute(item),
    multiAccountBatch: remapBatch(item.multiAccountBatch, batchIds),
    launchCount: 0,
    lastLaunchedAt: undefined,
  }));
}
