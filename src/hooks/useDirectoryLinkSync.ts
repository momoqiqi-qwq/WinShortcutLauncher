import { useEffect } from 'react';
import { useAppStore } from '../stores/appStore';
import { invalidateLinkSourceCache, syncDirectoryLinks } from '../lib/linkSyncRunner';

/**
 * v169: 让「链接子目录 / 链接父目录」里的内容始终跟着源走。
 *
 * 触发点：
 * 1. 挂载时同步一次（打开应用 / 切配置后立刻对齐）；
 * 2. `groups` 变化后 60ms 去抖同步（同配置源改动 → 链接立刻跟上）；
 * 3. 窗口重新获得焦点：清掉其他配置的缓存再同步（那边可能刚保存过）；
 * 4. 可见状态下每 2s 轮询一次（跨配置的弱实时，代价只有一次 IndexedDB 读/配置）。
 */
export function useDirectoryLinkSync() {
  useEffect(() => {
    let timer: number | null = null;
    let disposed = false;

    const schedule = (delay = 0) => {
      if (disposed || timer !== null) return;
      timer = window.setTimeout(() => {
        timer = null;
        void syncDirectoryLinks();
      }, delay);
    };

    void syncDirectoryLinks();

    const unsubscribe = useAppStore.subscribe((state, previous) => {
      if (state.groups !== previous.groups) schedule(60);
    });

    const handleFocus = () => {
      invalidateLinkSourceCache();
      schedule(0);
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') handleFocus();
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') schedule(0);
    }, 2000);

    return () => {
      disposed = true;
      if (timer !== null) window.clearTimeout(timer);
      window.clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
      unsubscribe();
    };
  }, []);
}
