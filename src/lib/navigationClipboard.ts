import { makeId } from './id';
import { getUniqueDirectoryName } from './directoryExperience';
import { reindex } from './sort';
import type { AppConfig, Directory, Group } from '../types';

export type NavigationClipboard =
  | { kind: 'directory'; copiedAt: number; sourceGroupName: string; directory: Directory }
  | { kind: 'group'; copiedAt: number; group: Group }
  | null;

function deepClone<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {
      // Fall through to the JSON clone below. Launcher config data is JSON-safe.
    }
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function uniqueName(existingNames: readonly string[], requestedName: string) {
  return getUniqueDirectoryName(existingNames, requestedName);
}


type BatchClone = { id: string; createdAt: number };

function cloneItemsWithFreshIds(items: Directory['items'], batchIds: Map<string, BatchClone>) {
  return reindex((items ?? []).map((item) => {
    let multiAccountBatch = item.multiAccountBatch ? { ...item.multiAccountBatch } : undefined;
    if (multiAccountBatch?.batchId) {
      let mapped = batchIds.get(multiAccountBatch.batchId);
      if (!mapped) {
        mapped = { id: makeId('batch'), createdAt: Date.now() };
        batchIds.set(multiAccountBatch.batchId, mapped);
      }
      multiAccountBatch = { ...multiAccountBatch, batchId: mapped.id, createdAt: mapped.createdAt };
    }
    return {
      ...item,
      id: makeId('item'),
      browserRoute: item.browserRoute ? { ...item.browserRoute } : undefined,
      multiAccountBatch,
    };
  }));
}

export function snapshotDirectory(directory: Directory): Directory {
  return deepClone(directory);
}

export function snapshotGroup(group: Group): Group {
  return deepClone(group);
}

export function cloneDirectoryForPaste(
  source: Directory,
  targetOrder: number,
  existingNames: readonly string[],
): Directory {
  const copy = snapshotDirectory(source);
  copy.id = makeId('dir');
  copy.name = uniqueName(existingNames, copy.name);
  copy.order = targetOrder;
  copy.items = cloneItemsWithFreshIds(copy.items ?? [], new Map());
  return copy;
}

export function cloneGroupForPaste(
  source: Group,
  targetOrder: number,
  existingNames: readonly string[],
): Group {
  const copy = snapshotGroup(source);
  copy.id = makeId('group');
  copy.name = uniqueName(existingNames, copy.name);
  copy.order = targetOrder;
  copy.browserRoute = copy.browserRoute ? { ...copy.browserRoute } : undefined;
  const batchIds = new Map<string, BatchClone>();
  copy.directories = reindex((copy.directories ?? []).map((directory) => {
    const cloned = snapshotDirectory(directory);
    cloned.id = makeId('dir');
    cloned.items = cloneItemsWithFreshIds(cloned.items ?? [], batchIds);
    return cloned;
  }));
  return copy;
}

export function appendCopiedGroupToConfig(config: AppConfig, source: Group) {
  const clonedConfig = deepClone(config);
  const groups = Array.isArray(clonedConfig.groups) ? clonedConfig.groups : [];
  const group = cloneGroupForPaste(source, groups.length, groups.map((entry) => entry.name));
  clonedConfig.groups = [...groups, group];
  return { config: clonedConfig, group };
}

export function canPasteDirectoryIntoGroup(source: Directory, target: Group) {
  if ((source.kind ?? 'normal') !== 'all') return true;
  return !target.directories.some((directory) => (directory.kind ?? 'normal') === 'all');
}
