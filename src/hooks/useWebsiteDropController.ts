import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useDragDrop } from './useDragDrop';
import { useAppStore } from '../stores/appStore';
import { uiWebsiteNameChoice } from '../lib/uiDialog';
import { createUrlShortcut } from '../lib/createShortcutItems';
import { buildOnlineFaviconUrl } from '../lib/faviconProviders';
import { showLauncherNotice } from '../lib/notify';
import {
  cleanDroppedTitle,
  extractDroppedFilePaths,
  extractDroppedWebLinkAsync,
  getDropTypeSummary,
  getDroppedUrlShortcutFile,
  nameFromDroppedUrlFile,
  normalizeDroppedUrl,
  readDroppedUrlShortcutFile,
  shouldAcceptExternalDropCandidate,
  websiteAddressName,
} from '../lib/browserDrop';
import {
  NATIVE_EXTERNAL_DRAG_STATE_EVENT,
  NATIVE_EXTERNAL_DROP_EVENT,
  type NativeExternalDragStatePayload,
  type NativeExternalDropPayload,
} from '../lib/nativeExternalDrop';
import type { BrowserRouteOverride, Group, ItemClickAction } from '../types';

export type DropTargetSelection = { groupId: string; directoryId: string } | null;

type WebsiteDropControllerOptions = {
  disabled: boolean;
};

type DropTiming = {
  source: 'html' | 'native';
  startedAt: number;
  dropReceivedMs?: number;
  dialogShownMs?: number;
  titleMs?: number;
  faviconMs?: number;
  titleSource?: 'network/cache' | 'browser';
  titleExpected?: boolean;
  loggedFinal?: boolean;
};

async function resolveDroppedWebsiteIcon(url: string, saveLocal: boolean, providerId = 'auto', fallback = true) {
  if (saveLocal) {
    const localIcon = await invoke<string>('fetch_website_favicon', { url, providerId, fallback }).catch(() => '');
    if (localIcon) return localIcon;
  }
  return buildOnlineFaviconUrl(url, providerId as any);
}

async function resolveDroppedWebsiteTitle(url: string) {
  const title = await invoke<string>('fetch_website_title', { url }).catch(() => '');
  return cleanDroppedTitle(title || '', url);
}

function elapsedMs(timing: DropTiming) {
  return Math.max(0, Math.round(performance.now() - timing.startedAt));
}

function logDropTiming(timing: DropTiming) {
  if (timing.loggedFinal || timing.faviconMs == null || (timing.titleExpected && timing.titleMs == null)) return;
  const dialog = timing.dialogShownMs == null ? 'Dialog skipped' : `Dialog shown ${timing.dialogShownMs}ms`;
  const title = timing.titleMs == null
    ? 'Title skipped'
    : timing.titleSource === 'browser'
      ? `Title supplied ${timing.titleMs}ms`
      : `Title ${timing.titleMs}ms`;
  timing.loggedFinal = true;
  const received = timing.dropReceivedMs ?? 0;
  console.info(`[website-drop-timing:${timing.source}] Drop received ${received}ms → ${dialog} → ${title} → Favicon ${timing.faviconMs}ms`);
}

function findFirstNormalDirectory(group?: Group): DropTargetSelection {
  if (!group) return null;
  const directory = group.directories.find((entry) => (entry.kind ?? 'normal') === 'normal');
  return directory ? { groupId: group.id, directoryId: directory.id } : null;
}

function findDropGroupId(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  return target.closest<HTMLElement>('[data-group-id]')?.dataset.groupId ?? null;
}

function findDropDirectoryId(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  return target.closest<HTMLElement>('[data-directory-id]')?.dataset.directoryId ?? null;
}

function previewDropGroupId(target: EventTarget | null) {
  const groupId = findDropGroupId(target);
  if (groupId) return groupId;
  const directoryId = findDropDirectoryId(target);
  if (!directoryId) return null;
  return useAppStore.getState().groups.find((group) => group.directories.some((directory) => directory.id === directoryId))?.id ?? null;
}

function targetFromClientPoint(x?: number, y?: number) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const rawX = Number(x);
  const rawY = Number(y);
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const candidates = [[rawX, rawY], [rawX / dpr, rawY / dpr]];
  let fallback: Element | null = null;
  for (const [clientX, clientY] of candidates) {
    const element = document.elementFromPoint(clientX, clientY);
    if (!fallback) fallback = element;
    if (element?.closest('[data-directory-id], [data-group-id]')) return element;
  }
  return fallback;
}

function resolvePreferredTarget(target: EventTarget | null): DropTargetSelection {
  const state = useAppStore.getState();
  const directoryId = findDropDirectoryId(target);
  if (directoryId) {
    for (const group of state.groups) {
      const directory = group.directories.find((entry) => entry.id === directoryId);
      if (directory && (directory.kind ?? 'normal') === 'normal') {
        return { groupId: group.id, directoryId: directory.id };
      }
    }
  }

  const groupId = findDropGroupId(target);
  if (!groupId) return null;
  const group = state.groups.find((entry) => entry.id === groupId);
  const existing = findFirstNormalDirectory(group);
  if (existing) return existing;
  if (!group) return null;
  const createdDirectoryId = state.addDirectory(group.id, '常用', 'normal');
  showLauncherNotice(`已为「${group.name}」新建普通子目录“常用”`);
  return { groupId: group.id, directoryId: createdDirectoryId };
}

function activeFallbackTarget(): DropTargetSelection {
  const state = useAppStore.getState();
  const activeGroup = state.getActiveGroup();
  const activeDirectory = state.getActiveDirectory();
  if (activeGroup && activeDirectory && (activeDirectory.kind ?? 'normal') === 'normal') {
    return { groupId: activeGroup.id, directoryId: activeDirectory.id };
  }
  return findFirstNormalDirectory(activeGroup);
}

export function useWebsiteDropController({ disabled }: WebsiteDropControllerOptions) {
  const [dropPaths, setDropPaths] = useState<string[]>([]);
  const [dropImportTarget, setDropImportTarget] = useState<DropTargetSelection>(null);
  const [webDragHover, setWebDragHover] = useState(false);
  const [externalDropTargetGroupId, setExternalDropTargetGroupId] = useState<string | null>(null);

  const handleDroppedWebLink = useCallback(async (
    link: { url: string; name?: string },
    preferredTarget?: DropTargetSelection,
    timingSource: DropTiming['source'] = 'html',
    startedAt = performance.now(),
  ) => {
    if (disabled) return;
    const timing: DropTiming = { source: timingSource, startedAt };
    timing.dropReceivedMs = elapsedMs(timing);
    const state = useAppStore.getState();
    const resolvedTarget = preferredTarget ?? activeFallbackTarget();
    if (!resolvedTarget) {
      showLauncherNotice('当前没有可添加网址的普通子目录');
      return;
    }

    const droppedName = cleanDroppedTitle(link.name || '', link.url);
    timing.titleExpected = !droppedName;
    if (droppedName) {
      timing.titleMs = 0;
      timing.titleSource = 'browser';
    }
    const shouldPromptRename = state.behavior.promptRenameDroppedWebsite !== false;
    const addressName = websiteAddressName(link.url) || createUrlShortcut(link.url).name;
    let titlePromise: Promise<string> | null = null;
    let iconPromise: Promise<string> | null = null;

    const loadTitle = () => {
      if (!titlePromise) {
        titlePromise = resolveDroppedWebsiteTitle(link.url).finally(() => {
          timing.titleMs = elapsedMs(timing);
          timing.titleSource = 'network/cache';
          logDropTiming(timing);
        });
      }
      return titlePromise;
    };
    const loadIcon = () => {
      if (!iconPromise) {
        iconPromise = resolveDroppedWebsiteIcon(
          link.url,
          state.display.autoSaveWebsiteIcon !== false,
          state.display.faviconProvider ?? 'auto',
          state.display.faviconProviderFallback !== false,
        ).finally(() => {
          timing.faviconMs = elapsedMs(timing);
          logDropTiming(timing);
        });
      }
      return iconPromise;
    };

    let finalName = droppedName || createUrlShortcut(link.url).name;
    let selectedBrowserRoute: BrowserRouteOverride | undefined;
    let selectedSingleClickAction: ItemClickAction | undefined;
    let selectedDoubleClickAction: ItemClickAction | undefined;
    if (shouldPromptRename) {
      const choice = await uiWebsiteNameChoice(
        finalName,
        addressName,
        droppedName ? undefined : loadTitle,
        () => {
          if (timing.dialogShownMs == null) timing.dialogShownMs = elapsedMs(timing);
          void loadIcon();
          logDropTiming(timing);
        },
        {
          url: link.url,
          browserRoute: { mode: 'inherit' },
          singleClickAction: 'inherit',
          doubleClickAction: 'inherit',
        },
      );
      if (!choice) return;
      finalName = choice.name.trim().slice(0, 120);
      selectedBrowserRoute = choice.browserRoute;
      selectedSingleClickAction = choice.singleClickAction;
      selectedDoubleClickAction = choice.doubleClickAction;
    } else {
      void loadIcon();
      if (!droppedName) void loadTitle();
    }

    const item = createUrlShortcut(link.url, finalName);
    if (selectedBrowserRoute) item.browserRoute = selectedBrowserRoute;
    if (selectedSingleClickAction && selectedSingleClickAction !== 'inherit') item.singleClickAction = selectedSingleClickAction;
    if (selectedDoubleClickAction && selectedDoubleClickAction !== 'inherit') item.doubleClickAction = selectedDoubleClickAction;
    state.addItems(resolvedTarget.groupId, resolvedTarget.directoryId, [item]);
    showLauncherNotice(`已添加网站：${item.name}`);

    const [icon, lateTitle] = await Promise.all([
      loadIcon(),
      shouldPromptRename || droppedName ? Promise.resolve('') : loadTitle(),
    ]);
    const patch: Record<string, string> = {};
    if (icon) patch.icon = icon;
    if (lateTitle) patch.name = lateTitle;
    if (Object.keys(patch).length) useAppStore.getState().updateItem(item.id, patch);
  }, [disabled]);

  const handleDropPaths = useCallback((paths: string[], preferredTarget?: DropTargetSelection, timingSource: DropTiming['source'] = 'html', startedAt = performance.now()) => {
    if (disabled || !paths.length) return;
    void (async () => {
      const filePaths: string[] = [];
      for (const path of paths) {
        if (/\.(url|website)$/i.test(path.trim())) {
          const resolvedUrl = await invoke<string>('read_url_shortcut', { path }).catch(() => '');
          const normalizedUrl = normalizeDroppedUrl(resolvedUrl || '');
          if (normalizedUrl) {
            await handleDroppedWebLink({ url: normalizedUrl, name: nameFromDroppedUrlFile(path, normalizedUrl) }, preferredTarget, timingSource, startedAt);
            continue;
          }
        }
        filePaths.push(path);
      }
      if (filePaths.length) {
        setDropImportTarget(preferredTarget ?? null);
        setDropPaths(filePaths);
      }
    })();
  }, [disabled, handleDroppedWebLink]);

  useEffect(() => {
    let disposed = false;
    let unlistenDrop: (() => void) | undefined;
    let unlistenState: (() => void) | undefined;

    void listen<NativeExternalDropPayload>(NATIVE_EXTERNAL_DROP_EVENT, ({ payload }) => {
      setWebDragHover(false);
      setExternalDropTargetGroupId(null);
      if (disabled) return;
      const startedAt = performance.now();
      const pointTarget = targetFromClientPoint(payload.x, payload.y);
      const preferredTarget = resolvePreferredTarget(pointTarget);

      const url = normalizeDroppedUrl(payload.url || '');
      if (url) {
        void handleDroppedWebLink({ url, name: payload.title || undefined }, preferredTarget, 'native', startedAt);
        return;
      }

      const paths = (payload.paths || []).filter(Boolean);
      if (paths.length) {
        handleDropPaths(paths, preferredTarget, 'native', startedAt);
        return;
      }

      const formatSummary = (payload.formats || []).join(', ');
      console.warn('[native-browser-drop] unrecognized external drop', payload);
      if (/x-moz-tabbrowser-tab/i.test(formatSummary)) {
        showLauncherNotice('检测到 Firefox/Floorp 标签页内部拖拽，但没有可读取的网址。请从地址栏左侧站点图标、地址栏网址或网页链接拖入。');
      } else {
        showLauncherNotice(formatSummary
          ? `Windows 已接受拖拽，但没有识别出网址或文件（${formatSummary}）`
          : 'Windows 已接受拖拽，但没有识别出网址或文件');
      }
    }).then((unlisten) => {
      if (disposed) unlisten();
      else unlistenDrop = unlisten;
    }).catch((error) => console.error('[native-browser-drop] drop listener failed', error));

    void listen<NativeExternalDragStatePayload>(NATIVE_EXTERNAL_DRAG_STATE_EVENT, ({ payload }) => {
      if (disabled) return;
      setWebDragHover(Boolean(payload.hovering));
      if (!payload.hovering) {
        setExternalDropTargetGroupId(null);
        return;
      }
      const target = targetFromClientPoint(payload.x, payload.y);
      setExternalDropTargetGroupId(previewDropGroupId(target));
    }).then((unlisten) => {
      if (disposed) unlisten();
      else unlistenState = unlisten;
    }).catch((error) => console.error('[native-browser-drop] state listener failed', error));

    return () => {
      disposed = true;
      unlistenDrop?.();
      unlistenState?.();
    };
  }, [disabled, handleDroppedWebLink, handleDropPaths]);

  const { dragHover } = useDragDrop((paths) => handleDropPaths(paths, undefined, 'native'), !disabled);

  useEffect(() => {
    function maybeAcceptExternalDrag(event: DragEvent) {
      if (disabled) return false;
      return shouldAcceptExternalDropCandidate(event.dataTransfer);
    }

    function handleExternalDragEnter(event: DragEvent) {
      if (!maybeAcceptExternalDrag(event)) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      setWebDragHover(true);
      setExternalDropTargetGroupId(previewDropGroupId(event.target));
    }

    function handleExternalDragOver(event: DragEvent) {
      if (!maybeAcceptExternalDrag(event)) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      setWebDragHover(true);
      setExternalDropTargetGroupId(previewDropGroupId(event.target));
    }

    function handleExternalDragLeave(event: DragEvent) {
      const related = event.relatedTarget as Node | null;
      if (related && document.documentElement.contains(related)) return;
      setWebDragHover(false);
      setExternalDropTargetGroupId(null);
    }

    async function handleExternalDrop(event: DragEvent) {
      const startedAt = performance.now();
      const dataTransfer = event.dataTransfer;
      if (!dataTransfer || !shouldAcceptExternalDropCandidate(dataTransfer)) {
        setWebDragHover(false);
        setExternalDropTargetGroupId(null);
        return;
      }
      event.preventDefault();
      event.stopPropagation();

      const typeSummary = getDropTypeSummary(dataTransfer);
      const urlShortcutFile = getDroppedUrlShortcutFile(dataTransfer);
      const files = extractDroppedFilePaths(dataTransfer);
      const preferredTarget = resolvePreferredTarget(event.target);
      const link = await extractDroppedWebLinkAsync(dataTransfer);

      setWebDragHover(false);
      setExternalDropTargetGroupId(null);

      if (!link && !urlShortcutFile && !files.length) {
        console.warn('[browser-drop] unrecognized external drop', { types: typeSummary });
        if (/x-moz-tabbrowser-tab/i.test(typeSummary)) {
          showLauncherNotice('检测到 Firefox/Floorp 标签页内部拖拽，但浏览器没有向外部应用提供网址。请从地址栏左侧站点图标、地址栏网址或网页链接拖入。');
        } else {
          showLauncherNotice(typeSummary
            ? `浏览器拖拽已到达应用，但没有可读取的网址数据（${typeSummary}）`
            : '浏览器拖拽已到达应用，但浏览器没有暴露可读取的网址数据');
        }
        return;
      }

      if (link) {
        void handleDroppedWebLink(link, preferredTarget, 'html', startedAt);
        return;
      }
      if (urlShortcutFile) {
        void readDroppedUrlShortcutFile(urlShortcutFile).then((fileLink) => {
          if (fileLink) {
            void handleDroppedWebLink(fileLink, preferredTarget, 'html', startedAt);
            return;
          }
          if (files.length) handleDropPaths(files, preferredTarget, 'html', startedAt);
        });
        return;
      }
      if (files.length) handleDropPaths(files, preferredTarget, 'html', startedAt);
    }

    window.addEventListener('dragenter', handleExternalDragEnter, { capture: true });
    window.addEventListener('dragover', handleExternalDragOver, { capture: true });
    window.addEventListener('dragleave', handleExternalDragLeave, { capture: true });
    window.addEventListener('drop', handleExternalDrop, { capture: true });
    document.addEventListener('dragenter', handleExternalDragEnter, { capture: true });
    document.addEventListener('dragover', handleExternalDragOver, { capture: true });
    document.addEventListener('dragleave', handleExternalDragLeave, { capture: true });
    document.addEventListener('drop', handleExternalDrop, { capture: true });
    return () => {
      window.removeEventListener('dragenter', handleExternalDragEnter, { capture: true });
      window.removeEventListener('dragover', handleExternalDragOver, { capture: true });
      window.removeEventListener('dragleave', handleExternalDragLeave, { capture: true });
      window.removeEventListener('drop', handleExternalDrop, { capture: true });
      document.removeEventListener('dragenter', handleExternalDragEnter, { capture: true });
      document.removeEventListener('dragover', handleExternalDragOver, { capture: true });
      document.removeEventListener('dragleave', handleExternalDragLeave, { capture: true });
      document.removeEventListener('drop', handleExternalDrop, { capture: true });
    };
  }, [disabled, handleDroppedWebLink, handleDropPaths]);

  return {
    dragHover,
    webDragHover,
    externalDropTargetGroupId,
    dropPaths,
    dropImportTarget,
    clearDropImport: () => {
      setDropPaths([]);
      setDropImportTarget(null);
    },
  };
}
