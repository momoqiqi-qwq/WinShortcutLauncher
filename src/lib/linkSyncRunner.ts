import type { Group } from '../types';
import { useAppStore } from '../stores/appStore';
import { normalizeGroups } from '../stores/appStore/normalizers';
import { getActiveConfigProfileId, getConfigProfileConfig } from './configProfiles';
import { applyLinkSources } from './directoryLinks';

/**
 * v169: 链接同步引擎。
 *
 * 同步源有两类：
 * - **当前配置**：直接用 store 里的内存数据 —— 源目录一改，链接立刻跟着变；
 * - **其他配置**：读 IndexedDB 里该配置已保存的副本（短 TTL 缓存，窗口获得焦点时失效）。
 *
 * 整个流程幂等：源没变化时 `applyLinkSources` 返回 `changed: false`，不会写回 store，
 * 也就不会触发自动保存 → 不会和「保存配置」形成回环。
 */

const PROFILE_CACHE_MS = 800;

const profileCache = new Map<string, { groups: Group[]; at: number }>();

let running = false;
let rerunRequested = false;

export interface LinkSyncOutcome {
  changed: boolean;
  updated: number;
  unresolved: number;
  /** 因为上一次同步还在跑，本次被合并掉了。 */
  skipped?: boolean;
}

export function invalidateLinkSourceCache(profileId?: string) {
  if (profileId === undefined) profileCache.clear();
  else profileCache.delete(profileId);
}

async function loadProfileGroups(profileId: string): Promise<Group[] | undefined> {
  const cached = profileCache.get(profileId);
  if (cached && Date.now() - cached.at < PROFILE_CACHE_MS) return cached.groups;
  const config = await getConfigProfileConfig(profileId).catch(() => null);
  if (!config) return undefined;
  const groups = normalizeGroups(config.groups);
  profileCache.set(profileId, { groups, at: Date.now() });
  return groups;
}

function collectLinkedProfiles(groups: Group[], activeProfileId: string): string[] {
  const ids = new Set<string>();
  const consider = (profileId: string | undefined) => {
    if (!profileId) return;
    if (profileId === activeProfileId) return;
    ids.add(profileId);
  };
  for (const group of groups) {
    consider(group.link?.profileId);
    for (const directory of group.directories) {
      if (directory.kind === 'link') consider(directory.link?.profileId);
    }
  }
  return [...ids];
}

export async function syncDirectoryLinks(): Promise<LinkSyncOutcome> {
  if (running) {
    rerunRequested = true;
    return { changed: false, updated: 0, unresolved: 0, skipped: true };
  }
  running = true;
  const total: LinkSyncOutcome = { changed: false, updated: 0, unresolved: 0 };
  try {
    do {
      rerunRequested = false;
      const activeProfileId = getActiveConfigProfileId() ?? '';
      const groups = useAppStore.getState().groups;
      const neededProfiles = collectLinkedProfiles(groups, activeProfileId);
      const resolved = new Map<string, Group[]>();
      await Promise.all(neededProfiles.map(async (profileId) => {
        const loaded = await loadProfileGroups(profileId);
        if (loaded) resolved.set(profileId, loaded);
      }));
      const result = applyLinkSources(groups, (profileId) => (
        !profileId || profileId === activeProfileId ? groups : resolved.get(profileId)
      ));
      total.unresolved = result.unresolved;
      if (result.changed) {
        total.changed = true;
        total.updated += result.updated;
        useAppStore.setState({ groups: result.groups });
      }
    } while (rerunRequested);
  } finally {
    running = false;
  }
  return total;
}
