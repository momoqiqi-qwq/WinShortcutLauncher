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
  extractDroppedPlainTextAsync,
  extractDroppedWebLinkAsync,
  getDropTypeSummary,
  getDroppedUrlShortcutFile,
  nameFromDroppedUrlFile,
  normalizeDroppedUrl,
  readDroppedUrlShortcutFile,
  shouldAcceptExternalDropCandidate,
  websiteAddressName,
} from '../lib/browserDrop';
import { flushActiveNoteDraft } from '../lib/noteDraftBridge';
import {
  NATIVE_EXTERNAL_DRAG_STATE_EVENT,
  NATIVE_EXTERNAL_DROP_EVENT,
  type NativeExternalDragStatePayload,
  type NativeExternalDropPayload,
} from '../lib/nativeExternalDrop';
import { isStartMenuDirectory } from '../lib/startMenu';
import { isMappedDirectory } from '../lib/mappedFolder';
import type { BrowserRouteOverride, Directory, Group, ItemClickAction } from '../types';

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

function findDirectoryById(directoryId: string): Directory | undefined {
  for (const group of useAppStore.getState().groups) {
    const directory = group.directories.find((entry) => entry.id === directoryId);
    if (directory) return directory;
  }
  return undefined;
}

/** 普通子目录、便签子目录与镜像子目录（开始菜单 / 映射文件夹）都能接收拖入。 */
function isDropAcceptingDirectory(directory?: Directory) {
  const kind = directory?.kind ?? 'normal';
  return kind === 'normal' || kind === 'startMenu' || kind === 'mapped' || kind === 'notes';
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
      if (directory && isDropAcceptingDirectory(directory)) {
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
  if (activeGroup && activeDirectory && isDropAcceptingDirectory(activeDirectory)) {
    return { groupId: activeGroup.id, directoryId: activeDirectory.id };
  }
  return findFirstNormalDirectory(activeGroup);
}

function isNotesDirectory(entry?: Directory) {
  return (entry?.kind ?? 'normal') === 'notes';
}

/** v150: 这次拖入的目标是不是便签子目录；是就返回它，否则 null。 */
function resolveNoteTarget(preferredTarget?: DropTargetSelection): DropTargetSelection {
  const target = preferredTarget ?? activeFallbackTarget();
  if (!target) return null;
  return isNotesDirectory(findDirectoryById(target.directoryId)) ? target : null;
}

/**
 * v150: 把拖入的文字 / 网址追加到便签。
 * 写 store 前先把打开中的便签草稿落盘，否则 450ms 后的自动保存会把追加内容覆盖掉。
 */
function appendDroppedTextToNote(directoryId: string, rawText: string) {
  const text = (rawText || '').replace(/\r\n?/g, '\n').trim();
  if (!text) return false;
  flushActiveNoteDraft();
  useAppStore.getState().appendDirectoryNote(directoryId, text);
  return true;
}

/** 拖到镜像子目录：直接在该文件夹里生成快捷方式，不进「添加快捷项目」对话框。 */
async function addPathsToMirror(directoryId: string, paths: string[]) {
  const clean = paths.map((path) => path.trim()).filter(Boolean);
  if (!clean.length) return;
  const isMapped = isMappedDirectory(findDirectoryById(directoryId));
  const label = isMapped ? '映射文件夹' : '开始菜单';
  try {
    const result = isMapped
      ? await useAppStore.getState().addToMappedFolder(directoryId, clean)
      : await useAppStore.getState().addToStartMenu(clean);
    const parts: string[] = [];
    if (result.created.length) parts.push(`已在${label}创建 ${result.created.length} 个快捷方式`);
    if (result.skipped.length) parts.push(`${result.skipped.length} 个已在${label}中，已跳过`);
    if (result.errors.length) parts.push(`失败 ${result.errors.length} 个：${result.errors[0]}`);
    showLauncherNotice(parts.length ? parts.join('；') : '没有写入任何快捷方式');
  } catch (error) {
    showLauncherNotice(`写入${label}失败：${String(error)}`);
  }
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

    // v150: 拖到便签子目录：网址原样作为文本落进便签，新内容自动隔一行。
    if (isNotesDirectory(findDirectoryById(resolvedTarget.directoryId))) {
      appendDroppedTextToNote(resolvedTarget.directoryId, link.url);
      showLauncherNotice('已追加到便签');
      return;
    }

    // 拖到镜像子目录：写成那个真实文件夹里的 .url 快捷方式。
    const mirrorDirectory = findDirectoryById(resolvedTarget.directoryId);
    if (isStartMenuDirectory(mirrorDirectory) || isMappedDirectory(mirrorDirectory)) {
      const isMapped = isMappedDirectory(mirrorDirectory);
      const label = isMapped ? '映射文件夹' : '开始菜单';
      const urlName = cleanDroppedTitle(link.name || '', link.url)
        || websiteAddressName(link.url)
        || createUrlShortcut(link.url).name;
      try {
        if (isMapped) {
          await useAppStore.getState().addUrlToMappedFolder(resolvedTarget.directoryId, link.url, urlName);
        } else {
          await useAppStore.getState().addUrlToStartMenu(link.url, urlName);
        }
        showLauncherNotice(`已在${label}创建网址快捷方式：${urlName}`);
      } catch (error) {
        showLauncherNotice(`写入${label}失败：${String(error)}`);
      }
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
    // v150: 拖到便签子目录：普通文件路径直接作为一行文字记进便签（.url 仍走下面的网址解析）。
    const noteTargetForPaths = resolveNoteTarget(preferredTarget);
    if (noteTargetForPaths && !paths.some((path) => /\.(url|website)$/i.test(path.trim()))) {
      const noteText = paths.map((path) => path.trim()).filter(Boolean).join('\n');
      if (appendDroppedTextToNote(noteTargetForPaths.directoryId, noteText)) {
        showLauncherNotice('已追加到便签');
        return;
      }
    }
    // 落在镜像子目录上：直接写进那个真实文件夹，不再弹「添加快捷项目」。
    const mirrorTarget = preferredTarget ?? activeFallbackTarget();
    const mirrorDirectory = mirrorTarget ? findDirectoryById(mirrorTarget.directoryId) : undefined;
    if (mirrorTarget && (isStartMenuDirectory(mirrorDirectory) || isMappedDirectory(mirrorDirectory))) {
      void addPathsToMirror(mirrorTarget.directoryId, paths);
      return;
    }
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

      // v150: 拖到便签子目录：原始文字优先（微信 / QQ 会话文本），没有文字才落网址。
      const noteTarget = resolveNoteTarget(preferredTarget);
      if (noteTarget) {
        const noteText = (payload.text || '').trim() ? payload.text : payload.url;
        if (appendDroppedTextToNote(noteTarget.directoryId, noteText || '')) {
          showLauncherNotice('已追加到便签');
          return;
        }
      }

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

      // v150: 拖到便签子目录：优先落原始文字（微信 / QQ 会话文本），没有文字再落网址。
      const noteTarget = resolveNoteTarget(preferredTarget);
      if (noteTarget && !files.length && !urlShortcutFile) {
        const plainText = await extractDroppedPlainTextAsync(dataTransfer);
        const noteLink = plainText ? null : await extractDroppedWebLinkAsync(dataTransfer);
        if (appendDroppedTextToNote(noteTarget.directoryId, plainText || noteLink?.url || '')) {
          setWebDragHover(false);
          setExternalDropTargetGroupId(null);
          showLauncherNotice('已追加到便签');
          return;
        }
      }

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
