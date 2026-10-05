import type {
  BehaviorSettings,
  Directory,
  DirectoryDisplaySettings,
  DirectoryKind,
  DisplaySettings,
  FaviconProviderId,
  FontApplyArea,
  Group,
  MultiAccountSettings,
  NoteSettings,
  RainbowSettings,
  ShortcutItem,
  ShortcutType,
  WindowControlId,
} from '../../types';
import { makeId } from '../../lib/id';
import { byOrder, reindex } from '../../lib/sort';
import {
  DEFAULT_IMAGE_BROWSER_SETTINGS,
  type ImageBrowserGroup,
  type ImageBrowserSettings,
} from '../../utils/v16Types';
import {
  DEFAULT_WINDOW_CONTROL_ORDER,
  defaultBehavior,
  defaultDisplay,
  defaultMultiAccount,
  defaultNotes,
  defaultRainbow,
} from './defaults';
import { normalizeUiScale } from '../../lib/uiScale';
import { normalizeBrowserRouteOverride } from '../../lib/browserRouter';
import { normalizeItemClickAction } from '../../lib/itemClickActions';

function normalizeWindowControlOrder(order?: unknown): WindowControlId[] {
  const allowed = new Set<WindowControlId>(DEFAULT_WINDOW_CONTROL_ORDER);
  const input = Array.isArray(order) ? order : [];
  const next: WindowControlId[] = [];
  for (const raw of input) {
    if (allowed.has(raw as WindowControlId) && !next.includes(raw as WindowControlId)) next.push(raw as WindowControlId);
  }
  for (const id of DEFAULT_WINDOW_CONTROL_ORDER) {
    if (next.includes(id)) continue;
    const defaultIndex = DEFAULT_WINDOW_CONTROL_ORDER.indexOf(id);
    const previous = DEFAULT_WINDOW_CONTROL_ORDER.slice(0, defaultIndex).reverse().find((candidate) => next.includes(candidate));
    if (previous) next.splice(next.indexOf(previous) + 1, 0, id);
    else next.push(id);
  }
  return next;
}



function normalizeFontApplyAreas(value: unknown): FontApplyArea[] {
  const allowed: FontApplyArea[] = ['main', 'settings', 'menus', 'notes'];
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is FontApplyArea => allowed.includes(item as FontApplyArea))
    .filter((item, index, list) => list.indexOf(item) === index);
}

function normalizeFontFamily(value: unknown) {
  return String(value ?? '').replace(/[\r\n\t]/g, ' ').trim().slice(0, 180);
}

function normalizeWindowControlHidden(hidden?: unknown): WindowControlId[] {
  const allowed = new Set<WindowControlId>(DEFAULT_WINDOW_CONTROL_ORDER);
  const input = Array.isArray(hidden) ? hidden : [];
  const next: WindowControlId[] = [];
  for (const raw of input) {
    if (allowed.has(raw as WindowControlId) && !next.includes(raw as WindowControlId)) next.push(raw as WindowControlId);
  }
  return next;
}

function normalizeSortGroupsSavedOrder(value?: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const next = value.filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
  return next.length ? next : null;
}

export function normalizeMultiAccountSettings(value?: unknown): MultiAccountSettings {
  const raw = value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Partial<MultiAccountSettings> : {};
  const separator = typeof raw.separator === 'string' ? raw.separator.slice(0, 12) : defaultMultiAccount.separator;
  const targetMode = raw.targetMode === 'selected' || raw.targetMode === 'new' ? raw.targetMode : 'current';
  const nameOrder = raw.nameOrder === 'profile-prefix' || raw.nameOrder === 'profile-only' ? raw.nameOrder : 'prefix-profile';
  const selectedTargetKeys = Array.isArray(raw.selectedTargetKeys)
    ? raw.selectedTargetKeys.filter((value): value is string => typeof value === 'string' && value.length > 0).slice(0, 512)
    : [];
  const url = typeof raw.url === 'string' ? raw.url.trim().slice(0, 8192) : '';
  const urlsText = typeof raw.urlsText === 'string' && raw.urlsText.trim()
    ? raw.urlsText.slice(0, 65536)
    : url;
  const templates = Array.isArray(raw.templates) ? raw.templates.slice(0, 128).map((entry, index) => {
    const template = entry !== null && typeof entry === 'object' && !Array.isArray(entry) ? entry as any : {};
    const templateTargetMode = template.targetMode === 'selected' || template.targetMode === 'new' ? template.targetMode : 'current';
    const templateNameOrder = template.nameOrder === 'profile-prefix' || template.nameOrder === 'profile-only' ? template.nameOrder : 'prefix-profile';
    return {
      id: typeof template.id === 'string' && template.id ? template.id.slice(0, 240) : `multi-template-${index + 1}`,
      name: typeof template.name === 'string' && template.name.trim() ? template.name.trim().slice(0, 240) : `模板 ${index + 1}`,
      urlsText: typeof template.urlsText === 'string' ? template.urlsText.slice(0, 65536) : '',
      batchName: typeof template.batchName === 'string' ? template.batchName.trim().slice(0, 240) : '',
      projectPrefix: typeof template.projectPrefix === 'string' ? template.projectPrefix.trim().slice(0, 240) : '',
      separator: typeof template.separator === 'string' ? template.separator.slice(0, 12) : ' ',
      nameOrder: templateNameOrder,
      lettersOnlyProfileName: template.lettersOnlyProfileName !== false,
      includeBrowserName: template.includeBrowserName === true,
      targetMode: templateTargetMode,
      selectedDirectoryId: typeof template.selectedDirectoryId === 'string' ? template.selectedDirectoryId.slice(0, 240) : '',
      newDirectoryName: typeof template.newDirectoryName === 'string' && template.newDirectoryName.trim() ? template.newDirectoryName.trim().slice(0, 240) : defaultMultiAccount.newDirectoryName,
      selectedTargetKeys: Array.isArray(template.selectedTargetKeys) ? template.selectedTargetKeys.filter((key: unknown): key is string => typeof key === 'string' && Boolean(key)).slice(0, 512) : [],
      skipDuplicates: template.skipDuplicates !== false,
      autoFetchIcon: template.autoFetchIcon !== false,
      pinGenerated: template.pinGenerated === true,
      activateTargetAfterCreate: template.activateTargetAfterCreate !== false,
    };
  }) : [];
  return {
    url,
    urlsText,
    batchName: typeof raw.batchName === 'string' ? raw.batchName.trim().slice(0, 240) : '',
    projectPrefix: typeof raw.projectPrefix === 'string' ? raw.projectPrefix.trim().slice(0, 240) : '',
    separator,
    nameOrder,
    lettersOnlyProfileName: raw.lettersOnlyProfileName !== false,
    includeBrowserName: raw.includeBrowserName === true,
    targetMode,
    selectedDirectoryId: typeof raw.selectedDirectoryId === 'string' ? raw.selectedDirectoryId.slice(0, 240) : '',
    newDirectoryName: typeof raw.newDirectoryName === 'string' && raw.newDirectoryName.trim() ? raw.newDirectoryName.trim().slice(0, 240) : defaultMultiAccount.newDirectoryName,
    selectedTargetKeys,
    skipDuplicates: raw.skipDuplicates !== false,
    autoFetchIcon: raw.autoFetchIcon !== false,
    pinGenerated: raw.pinGenerated === true,
    activateTargetAfterCreate: raw.activateTargetAfterCreate !== false,
    templates,
  };
}

export function normalizeBehavior(value?: unknown): BehaviorSettings {
  const settings = asRecord(value) as Partial<BehaviorSettings>;
  const merged = { ...defaultBehavior, ...settings };
  const finiteOr = (value: unknown, fallback: number) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  return {
    ...merged,
    launchMode: merged.launchMode === 'single' ? 'single' : 'double',
    urlOpenMode: merged.urlOpenMode === 'foreground-browser' || merged.urlOpenMode === 'specified' ? merged.urlOpenMode : 'default',
    edgeIgnoreTaskbar: merged.edgeIgnoreTaskbar === true,
    edgeHideDelaySeconds: Math.max(0, Math.min(10, finiteOr(merged.edgeHideDelaySeconds, 0))),
    edgeAnimationMs: Math.max(0, Math.min(1000, Math.round(finiteOr(merged.edgeAnimationMs, defaultBehavior.edgeAnimationMs)))),
    autoEdgeSnapBack: Boolean((merged as any).autoEdgeSnapBack),
    autoEdgeSnapBackAnimation: (merged as any).autoEdgeSnapBackAnimation !== false,
    autoEdgeSnapBackAnimationMs: Math.max(80, Math.min(600, Math.round(finiteOr((merged as any).autoEdgeSnapBackAnimationMs, defaultBehavior.autoEdgeSnapBackAnimationMs)))),
    autoEdgeHideDelay: Math.max(0, Math.min(10000, Math.round(finiteOr(merged.autoEdgeHideDelay, defaultBehavior.autoEdgeHideDelay)))),
    edgeVisiblePixels: Math.max(1, Math.min(64, Math.round(finiteOr(merged.edgeVisiblePixels, defaultBehavior.edgeVisiblePixels)))),
    edgeMouseLeaveHideMs: Math.max(0, Math.min(1000, Math.round(finiteOr(merged.edgeMouseLeaveHideMs, defaultBehavior.edgeMouseLeaveHideMs)))),
    edgeStripSize: Math.max(2, Math.min(64, Math.round(finiteOr(merged.edgeStripSize, defaultBehavior.edgeStripSize)))),
    edgeStripOpacity: Math.max(0.05, Math.min(1, finiteOr(merged.edgeStripOpacity, defaultBehavior.edgeStripOpacity))),
    rememberMainWindowBounds: merged.rememberMainWindowBounds !== false,
    manualWindowStateEnabled: typeof settings?.manualWindowStateEnabled === 'boolean'
      ? settings.manualWindowStateEnabled
      : false,
    restoreWindowStateOnLaunch: typeof settings?.restoreWindowStateOnLaunch === 'boolean'
      ? settings.restoreWindowStateOnLaunch
      : merged.rememberMainWindowBounds !== false,
    saveWindowStateOnExit: typeof settings?.saveWindowStateOnExit === 'boolean'
      ? settings.saveWindowStateOnExit
      : merged.rememberMainWindowBounds !== false,
    rememberSettingsPanelBounds: merged.rememberSettingsPanelBounds !== false,
    settingsPanelAdaptiveSize: merged.settingsPanelAdaptiveSize !== false,
    itemDragLongPressMs: Math.max(80, Math.min(1200, Math.round(finiteOr(merged.itemDragLongPressMs, defaultBehavior.itemDragLongPressMs)))),
    itemDragTolerance: Math.max(2, Math.min(28, Math.round(finiteOr(merged.itemDragTolerance, defaultBehavior.itemDragTolerance)))),
    itemDragBackgroundColor: /^#[0-9a-f]{6}$/i.test(String(merged.itemDragBackgroundColor)) ? String(merged.itemDragBackgroundColor) : defaultBehavior.itemDragBackgroundColor,
    itemDragGlowColor: /^#[0-9a-f]{6}$/i.test(String(merged.itemDragGlowColor)) ? String(merged.itemDragGlowColor) : defaultBehavior.itemDragGlowColor,
    itemDragGlowBrightness: Math.max(0, Math.min(1, finiteOr(merged.itemDragGlowBrightness, defaultBehavior.itemDragGlowBrightness))),
    promptRenameDroppedWebsite: merged.promptRenameDroppedWebsite !== false,
  };
}

export function normalizeNoteSettings(value?: unknown): NoteSettings {
  const settings = asRecord(value) as Partial<NoteSettings>;
  const merged = { ...defaultNotes, ...settings };
  const cleanChar = (value: unknown, fallback: string) => {
    const str = String(value ?? '').trim();
    return str ? Array.from(str)[0] : fallback;
  };
  return {
    fontSize: Math.max(10, Math.min(32, Math.round(Number(merged.fontSize) || defaultNotes.fontSize))),
    lineHeight: Math.max(1, Math.min(3, Number(merged.lineHeight) || defaultNotes.lineHeight)),
    padding: Math.max(6, Math.min(48, Math.round(Number(merged.padding) || defaultNotes.padding))),
    radius: Math.max(0, Math.min(40, Math.round(Number(merged.radius) || defaultNotes.radius))),
    autosaveDelayMs: Math.max(120, Math.min(3000, Math.round(Number(merged.autosaveDelayMs) || defaultNotes.autosaveDelayMs))),
    wrap: merged.wrap !== false,
    showTitle: merged.showTitle !== false,
    showLineNumbers: Boolean((merged as any).showLineNumbers),
    lineNumberScope: (merged as any).lineNumberScope === 'current' ? 'current' : 'all',
    separatorLength: Math.max(4, Math.min(80, Math.round(Number(merged.separatorLength) || defaultNotes.separatorLength))),
    dashSeparatorChar: cleanChar(merged.dashSeparatorChar, defaultNotes.dashSeparatorChar),
    starSeparatorChar: cleanChar(merged.starSeparatorChar, defaultNotes.starSeparatorChar),
  };
}


function isHexColor(value: unknown): value is string {
  return /^#[0-9a-f]{6}$/i.test(String(value ?? ''));
}

function normalizeColorList(value: unknown, fallback: string[]): string[] {
  const list = Array.isArray(value) ? value.filter(isHexColor) : [];
  return (list.length ? list : fallback).slice(0, 12);
}

export function normalizeRainbow(value?: unknown): RainbowSettings {
  const settings = asRecord(value) as Partial<RainbowSettings>;
  const merged = { ...defaultRainbow, ...settings } as RainbowSettings;
  const finiteOr = (value: unknown, fallback: number) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  return {
    ...merged,
    enabled: merged.enabled !== false,
    cursorEnabled: merged.cursorEnabled !== false,
    cursorStyle: (['dot-ring', 'windows-outline', 'windows-full', 'windows-inside', 'mac-ring'] as const).includes(merged.cursorStyle as any) ? merged.cursorStyle : defaultRainbow.cursorStyle,
    cursorSize: Math.max(8, Math.min(72, Math.round(finiteOr(merged.cursorSize, defaultRainbow.cursorSize)))),
    trailEnabled: merged.trailEnabled !== false,
    trailCount: Math.max(0, Math.min(80, Math.round(finiteOr(merged.trailCount, defaultRainbow.trailCount)))),
    trailDurationMs: Math.max(120, Math.min(2500, Math.round(finiteOr(merged.trailDurationMs, defaultRainbow.trailDurationMs)))),
    trailSize: Math.max(2, Math.min(40, Math.round(finiteOr(merged.trailSize, defaultRainbow.trailSize)))),
    trailBrightness: Math.max(0, Math.min(1.4, finiteOr(merged.trailBrightness, defaultRainbow.trailBrightness))),
    borderEnabled: merged.borderEnabled !== false,
    borderMode: (['rotate', 'static', 'fixed-flow'] as const).includes(merged.borderMode as any) ? merged.borderMode : defaultRainbow.borderMode,
    borderSpeedSeconds: Math.max(3, Math.min(120, Math.round(finiteOr(merged.borderSpeedSeconds, defaultRainbow.borderSpeedSeconds)))),
    borderWidth: Math.max(0, Math.min(8, Math.round(finiteOr(merged.borderWidth, defaultRainbow.borderWidth)))),
    borderBrightness: Math.max(0, Math.min(1.5, finiteOr(merged.borderBrightness, defaultRainbow.borderBrightness))),
    textEnabled: merged.textEnabled !== false,
    textOnGroups: merged.textOnGroups !== false,
    textOnDirectories: Boolean(merged.textOnDirectories),
    textOnSettings: Boolean(merged.textOnSettings),
    textSpeedSeconds: Math.max(8, Math.min(180, Math.round(finiteOr(merged.textSpeedSeconds, defaultRainbow.textSpeedSeconds)))),
    cursorColors: normalizeColorList(merged.cursorColors, defaultRainbow.cursorColors),
    borderColors: normalizeColorList(merged.borderColors, defaultRainbow.borderColors),
    textColors: normalizeColorList(merged.textColors, defaultRainbow.textColors)
  };
}

export function normalizeImageBrowserSettings(value?: unknown): ImageBrowserSettings {
  const settings = asRecord(value) as Partial<ImageBrowserSettings>;
  const merged = { ...DEFAULT_IMAGE_BROWSER_SETTINGS, ...settings } as ImageBrowserSettings;
  const rawGroups = Array.isArray((merged as any).groups) && (merged as any).groups.length
    ? (merged as any).groups
    : DEFAULT_IMAGE_BROWSER_SETTINGS.groups;
  const groups: ImageBrowserGroup[] = rawGroups
    .map((group: any, index: number) => ({
      id: String(group?.id || (index === 0 ? 'default' : makeId('imggrp'))),
      name: String(group?.name || (index === 0 ? '默认' : `分组 ${index + 1}`)),
      order: Number.isFinite(Number(group?.order)) ? Number(group.order) : index,
    }))
    .sort(byOrder)
    .map((group: any, index: number) => ({ ...group, order: index }));
  const activeGroupId = groups.some((group) => group.id === merged.activeGroupId) ? merged.activeGroupId : groups[0].id;
  return {
    ...merged,
    panelWidth: Math.max(180, Math.min(10000, Math.round(Number(merged.panelWidth) || DEFAULT_IMAGE_BROWSER_SETTINGS.panelWidth))),
    thumbnailPaneWidth: Math.max(48, Math.min(10000, Math.round(Number(merged.thumbnailPaneWidth) || DEFAULT_IMAGE_BROWSER_SETTINGS.thumbnailPaneWidth))),
    thumbnailWidth: Math.max(32, Math.min(10000, Math.round(Number(merged.thumbnailWidth) || DEFAULT_IMAGE_BROWSER_SETTINGS.thumbnailWidth))),
    previewPadding: Math.max(0, Math.min(240, Math.round(Number(merged.previewPadding) || 0))),
    previewRadius: Math.max(0, Math.min(240, Math.round(Number(merged.previewRadius) || 0))),
    panelOpacity: Math.max(0.2, Math.min(1, Number(merged.panelOpacity) || DEFAULT_IMAGE_BROWSER_SETTINGS.panelOpacity)),
    previewFit: (['contain', 'cover', 'actual'] as const).includes(merged.previewFit as any) ? merged.previewFit : DEFAULT_IMAGE_BROWSER_SETTINGS.previewFit,
    dragExportAction: (['copy', 'move'] as const).includes(merged.dragExportAction as any) ? merged.dragExportAction : DEFAULT_IMAGE_BROWSER_SETTINGS.dragExportAction,
    imageNamePosition: (['inside', 'top', 'bottom', 'hidden'] as const).includes(merged.imageNamePosition as any) ? merged.imageNamePosition : DEFAULT_IMAGE_BROWSER_SETTINGS.imageNamePosition,
    groups,
    activeGroupId,
    showAddButton: merged.showAddButton !== false,
    showCopyAllButton: merged.showCopyAllButton !== false,
    showClearButton: merged.showClearButton !== false,
    showActiveActions: merged.showActiveActions !== false,
  };
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

function cleanText(value: unknown, fallback = '', maxLength = 4096): string {
  const text = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  const cleaned = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  return (cleaned || fallback).slice(0, maxLength);
}

function finiteNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizedId(value: unknown, prefix: string, usedIds?: Set<string>): string {
  let id = cleanText(value, '', 240);
  if (!id || usedIds?.has(id)) {
    do id = makeId(prefix); while (usedIds?.has(id));
  }
  usedIds?.add(id);
  return id;
}

function normalizeGroupColor(value: unknown): string | undefined {
  const color = cleanText(value, '', 32);
  if (!color) return undefined;
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(color) ? color : undefined;
}

function inferShortcutType(value: unknown, path: string): ShortcutType {
  if (value === 'file' || value === 'folder' || value === 'url' || value === 'command') return value;
  if (/^(https?:\/\/|mailto:|ftp:\/\/)/i.test(path)) return 'url';
  return 'file';
}

/**
 * Convert any imported/persisted project-like value into a render-safe ShortcutItem.
 * This is intentionally the single normalization gateway for item fields used by UI code.
 */
export function normalizeShortcutItem(value: unknown, fallbackOrder = 0, usedIds?: Set<string>): ShortcutItem {
  const raw = asRecord(value);
  const path = cleanText(raw.path ?? raw.target ?? raw.url ?? raw.command, '', 8192);
  const icon = cleanText(raw.icon ?? raw.iconPath ?? raw.image, '', 8192);
  const name = cleanText(raw.name ?? raw.title ?? raw.label, '未命名项目', 240);
  const labelLinesRaw = Math.round(finiteNumber(raw.labelLines, 0));
  const launchCount = Math.max(0, Math.round(finiteNumber(raw.launchCount, 0)));
  const lastLaunchedAtRaw = finiteNumber(raw.lastLaunchedAt, 0);
  const browserRoute = normalizeBrowserRouteOverride(raw.browserRoute);
  const singleClickAction = normalizeItemClickAction(raw.singleClickAction);
  const doubleClickAction = normalizeItemClickAction(raw.doubleClickAction);
  const rawBatch = asRecord(raw.multiAccountBatch);
  const batchId = cleanText(rawBatch.batchId, '', 240);
  const multiAccountBatch = batchId ? {
    batchId,
    batchName: cleanText(rawBatch.batchName, '多账号批次', 240),
    createdAt: Math.max(0, finiteNumber(rawBatch.createdAt, 0)),
    sourceUrl: cleanText(rawBatch.sourceUrl, path, 8192),
    ...(cleanText(rawBatch.sourceLabel, '', 240) ? { sourceLabel: cleanText(rawBatch.sourceLabel, '', 240) } : {}),
    targetKey: cleanText(rawBatch.targetKey, '', 512),
  } : undefined;
  return {
    id: normalizedId(raw.id, 'item', usedIds),
    name,
    path,
    ...(icon ? { icon } : {}),
    type: inferShortcutType(raw.type, path),
    order: finiteNumber(raw.order, fallbackOrder),
    ...(labelLinesRaw >= 1 && labelLinesRaw <= 5 ? { labelLines: labelLinesRaw } : {}),
    pinned: raw.pinned === true,
    launchCount,
    ...(lastLaunchedAtRaw > 0 ? { lastLaunchedAt: lastLaunchedAtRaw } : {}),
    ...(browserRoute ? { browserRoute } : {}),
    ...(singleClickAction ? { singleClickAction } : {}),
    ...(doubleClickAction ? { doubleClickAction } : {}),
    ...(multiAccountBatch ? { multiAccountBatch } : {}),
  };
}

function normalizeDirectoryDisplay(value: unknown): DirectoryDisplaySettings | undefined {
  const raw = asRecord(value);
  const keys = Object.keys(raw).filter((key) => Object.prototype.hasOwnProperty.call(defaultDisplay, key));
  if (!keys.length) return undefined;
  const normalized = normalizeDisplay(raw as Partial<DisplaySettings>);
  const patch = Object.fromEntries(keys.map((key) => [key, normalized[key as keyof DisplaySettings]])) as DirectoryDisplaySettings;
  return Object.keys(patch).length ? patch : undefined;
}

function getImportedDirectoryNote(value: unknown): string {
  const raw = asRecord(value);
  for (const candidate of [raw.note, raw.noteContent, raw.content, raw.Content, raw.memo, raw.remark, raw.text]) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate;
  }
  return '';
}

function isImportedNotesDirectory(value: unknown, note: string, itemCount: number): boolean {
  const raw = asRecord(value);
  const kindText = cleanText(raw.kind ?? raw.type ?? raw.groupType ?? raw.categoryType ?? raw.mode, '', 80).toLowerCase();
  if (['notes', 'note', 'sticky', 'memo', 'markdown', '便签', '笔记', '备忘'].includes(kindText)) return true;
  if (raw.isNote === true || raw.noteMode === true) return true;
  return Boolean(note.trim()) && itemCount === 0;
}

export function normalizeDirectory(
  value: unknown,
  fallbackOrder = 0,
  usedDirectoryIds?: Set<string>,
  usedItemIds?: Set<string>,
): Directory {
  const raw = asRecord(value);
  const rawItems = Array.isArray(raw.items) ? raw.items : [];
  const items = reindex(
    rawItems
      .map((item, index) => normalizeShortcutItem(item, index, usedItemIds))
      .sort(byOrder),
  );
  const note = getImportedDirectoryNote(raw);
  const rawKind = cleanText(raw.kind, 'normal', 40) as DirectoryKind;
  // 镜像类子目录（开始菜单 / 映射文件夹）的内容是实时扫描出来的，不落盘；这里只保留类型标记。
  const kind: DirectoryKind = rawKind === 'all'
    ? 'all'
    : rawKind === 'startMenu'
      ? 'startMenu'
      : rawKind === 'mapped'
        ? 'mapped'
        : isImportedNotesDirectory(raw, note, items.length)
          ? 'notes'
          : 'normal';
  // 映射目录必须记住被镜像的文件夹，否则重启后不知道要扫哪里。
  const mappedPath = kind === 'mapped'
    ? cleanText(raw.mappedPath ?? raw.mirrorPath ?? raw.folderPath, '', 4096).trim()
    : '';
  const display = normalizeDirectoryDisplay(raw.display);
  return {
    id: normalizedId(raw.id, 'dir', usedDirectoryIds),
    name: cleanText(raw.name ?? raw.title ?? raw.label, '常用', 240),
    order: finiteNumber(raw.order, fallbackOrder),
    kind,
    ...(mappedPath ? { mappedPath } : {}),
    ...(display ? { display } : {}),
    note,
    ...(typeof raw.noteShowLineNumbers === 'boolean' ? { noteShowLineNumbers: raw.noteShowLineNumbers } : {}),
    items: kind === 'notes' || kind === 'startMenu' || kind === 'mapped' ? [] : items,
  };
}

const EMPTY_DIRECTORY = { name: '常用', order: 0, kind: 'normal', items: [] };
const EMPTY_GROUP = { name: '我的快捷方式', order: 0, directories: [EMPTY_DIRECTORY] };

/**
 * Normalize arbitrary persisted/imported group data. Invalid roots, arrays and nested values
 * are replaced with a safe fallback while preserving valid user content whenever possible.
 */
export function normalizeGroups(groups: unknown, fallbackGroups?: unknown): Group[] {
  const input = Array.isArray(groups) && groups.length
    ? groups
    : Array.isArray(fallbackGroups) && fallbackGroups.length
      ? fallbackGroups
      : [EMPTY_GROUP];
  const usedGroupIds = new Set<string>();
  const usedDirectoryIds = new Set<string>();
  const usedItemIds = new Set<string>();
  const normalized = input.map((value, groupIndex) => {
    const raw = asRecord(value);
    const rawDirectories = Array.isArray(raw.directories) && raw.directories.length
      ? raw.directories
      : [EMPTY_DIRECTORY];
    const directories = reindex(
      rawDirectories
        .map((directory, directoryIndex) => normalizeDirectory(directory, directoryIndex, usedDirectoryIds, usedItemIds))
        .sort(byOrder),
    );
    const color = normalizeGroupColor(raw.color);
    const browserRoute = normalizeBrowserRouteOverride(raw.browserRoute);
    const sidebarColumnsRaw = Number(raw.sidebarColumns);
    const sidebarColumns = Number.isFinite(sidebarColumnsRaw)
      ? Math.max(1, Math.min(6, Math.round(sidebarColumnsRaw)))
      : undefined;
    return {
      id: normalizedId(raw.id, 'group', usedGroupIds),
      name: cleanText(raw.name ?? raw.title ?? raw.label, `分组 ${groupIndex + 1}`, 240),
      order: finiteNumber(raw.order, groupIndex),
      ...(color ? { color } : {}),
      ...(browserRoute ? { browserRoute } : {}),
      ...(sidebarColumns ? { sidebarColumns } : {}),
      directories,
    } satisfies Group;
  });
  return reindex(normalized.sort(byOrder));
}

export function getFirstDirectory(groups: unknown): { groupId: string; directoryId: string } {
  const sortedGroups = normalizeGroups(groups);
  const group = sortedGroups[0];
  const dir = group.directories[0];
  return { groupId: group.id, directoryId: dir.id };
}

export function cleanDisplayPatch(patch: DirectoryDisplaySettings): DirectoryDisplaySettings | undefined {
  const next = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) as DirectoryDisplaySettings;
  return Object.keys(next).length ? next : undefined;
}

function clampDisplayNumber(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

function legacyBackgroundPoint(position: unknown): { x: number; y: number } {
  switch (position) {
    case 'top': return { x: 50, y: 0 };
    case 'bottom': return { x: 50, y: 100 };
    case 'left': return { x: 0, y: 50 };
    case 'right': return { x: 100, y: 50 };
    default: return { x: 50, y: 50 };
  }
}

export function normalizeDisplay(value?: unknown): DisplaySettings {
  const display = asRecord(value) as Partial<DisplaySettings>;
  const legacyScale = display.uiScale;
  const mainUiScale = display?.mainUiScale ?? legacyScale ?? defaultDisplay.mainUiScale;
  const settingsUiScale = display?.settingsUiScale ?? legacyScale ?? defaultDisplay.settingsUiScale;
  const mainLegacyPoint = legacyBackgroundPoint(display?.backgroundPosition);
  const settingsLegacyPoint = legacyBackgroundPoint(display?.settingsBackgroundPosition);
  const backgroundImage = String(display?.backgroundImage ?? defaultDisplay.backgroundImage).replace(/[\r\n\t]/g, '').trim();
  const settingsBackgroundImage = String(display?.settingsBackgroundImage ?? defaultDisplay.settingsBackgroundImage).replace(/[\r\n\t]/g, '').trim();
  return {
    ...defaultDisplay,
    ...(display ?? {}),
    modernWinUI3Mode: display?.modernWinUI3Mode === true,
    fontFamily: normalizeFontFamily(display?.fontFamily),
    fontApplyAreas: normalizeFontApplyAreas(display?.fontApplyAreas),
    showFullItemName: display?.showFullItemName === true,
    uiScale: normalizeUiScale(legacyScale ?? mainUiScale),
    mainUiScale: normalizeUiScale(mainUiScale),
    settingsUiScale: normalizeUiScale(settingsUiScale),
    itemIconResolveMode: (['auto', 'read_icon_as_data_url', 'get_file_icon'] as const).includes((display?.itemIconResolveMode ?? defaultDisplay.itemIconResolveMode) as any) ? (display?.itemIconResolveMode ?? defaultDisplay.itemIconResolveMode) : defaultDisplay.itemIconResolveMode,
    iconParallelTasks: Math.max(1, Math.min(8, Math.round(Number(display?.iconParallelTasks ?? defaultDisplay.iconParallelTasks) || defaultDisplay.iconParallelTasks))),
    autoSaveWebsiteIcon: display?.autoSaveWebsiteIcon !== false,
    faviconProvider: (['auto', 'quicker', 'faviconIm', 'iowen', 'google', 'duckduckgo', 'clearbit', 'iconHorse', 'faviconKit', 'yandex', 'direct'] as const).includes((display?.faviconProvider ?? defaultDisplay.faviconProvider) as FaviconProviderId) ? (display?.faviconProvider ?? defaultDisplay.faviconProvider) : defaultDisplay.faviconProvider,
    faviconProviderFallback: display?.faviconProviderFallback !== false,
    toastDurationMs: Math.max(500, Math.min(10000, Math.round(Number(display?.toastDurationMs ?? defaultDisplay.toastDurationMs) || defaultDisplay.toastDurationMs))),
    sortMode: (['custom', 'name', 'type', 'recent', 'frequent'] as const).includes((display?.sortMode ?? defaultDisplay.sortMode) as any) ? (display?.sortMode ?? defaultDisplay.sortMode) : defaultDisplay.sortMode,
    topTabWidth: clampDisplayNumber(display?.topTabWidth, 64, 280, defaultDisplay.topTabWidth),
    topTabHeight: clampDisplayNumber(display?.topTabHeight, 26, 58, defaultDisplay.topTabHeight),
    topTabGap: clampDisplayNumber(display?.topTabGap, 0, 24, defaultDisplay.topTabGap),
    topTabFontSize: clampDisplayNumber(display?.topTabFontSize, 10, 22, defaultDisplay.topTabFontSize),
    topTabBorderWidth: clampDisplayNumber(display?.topTabBorderWidth, 0, 4, defaultDisplay.topTabBorderWidth),
    topTabColorStrength: clampDisplayNumber(display?.topTabColorStrength, 0.04, 0.55, defaultDisplay.topTabColorStrength),
    sidebarColumns: Math.round(clampDisplayNumber(display?.sidebarColumns, 1, 6, defaultDisplay.sidebarColumns)),
    sidebarItemLines: Math.round(clampDisplayNumber(display?.sidebarItemLines, 1, 4, defaultDisplay.sidebarItemLines)),
    sidebarShowFullNames: display?.sidebarShowFullNames === true,
    windowControlStyle: (['round', 'square', 'bar', 'pad'] as const).includes((display?.windowControlStyle ?? defaultDisplay.windowControlStyle) as any) ? (display?.windowControlStyle ?? defaultDisplay.windowControlStyle) : defaultDisplay.windowControlStyle,
    windowControlOrder: normalizeWindowControlOrder(display?.windowControlOrder),
    windowControlHidden: normalizeWindowControlHidden((display as any)?.windowControlHidden),
    sortGroupsSavedOrder: normalizeSortGroupsSavedOrder((display as any)?.sortGroupsSavedOrder),
    backgroundEnabled: display?.backgroundEnabled === true && Boolean(backgroundImage),
    backgroundImage,
    backgroundMediaKind: (['auto', 'image', 'video'] as const).includes((display?.backgroundMediaKind ?? defaultDisplay.backgroundMediaKind) as any) ? (display?.backgroundMediaKind ?? defaultDisplay.backgroundMediaKind) : defaultDisplay.backgroundMediaKind,
    backgroundOpacity: clampDisplayNumber(display?.backgroundOpacity, 0, 1, defaultDisplay.backgroundOpacity),
    backgroundDim: clampDisplayNumber(display?.backgroundDim, 0, 0.9, defaultDisplay.backgroundDim),
    backgroundBlur: clampDisplayNumber(display?.backgroundBlur, 0, 32, defaultDisplay.backgroundBlur),
    backgroundFit: (['cover', 'contain', 'stretch', 'tile'] as const).includes((display?.backgroundFit ?? defaultDisplay.backgroundFit) as any) ? (display?.backgroundFit ?? defaultDisplay.backgroundFit) : defaultDisplay.backgroundFit,
    backgroundPosition: (['center', 'top', 'bottom', 'left', 'right'] as const).includes((display?.backgroundPosition ?? defaultDisplay.backgroundPosition) as any) ? (display?.backgroundPosition ?? defaultDisplay.backgroundPosition) : defaultDisplay.backgroundPosition,
    backgroundPositionX: clampDisplayNumber((display as any)?.backgroundPositionX, 0, 100, mainLegacyPoint.x),
    backgroundPositionY: clampDisplayNumber((display as any)?.backgroundPositionY, 0, 100, mainLegacyPoint.y),
    backgroundMotionEnabled: display?.backgroundMotionEnabled !== false,
    backgroundPlaybackRate: clampDisplayNumber(display?.backgroundPlaybackRate, 0.25, 2, defaultDisplay.backgroundPlaybackRate),
    backgroundPauseWhenHidden: display?.backgroundPauseWhenHidden !== false,
    backgroundContainAmbient: display?.backgroundContainAmbient !== false,
    backgroundPanelOpacity: clampDisplayNumber(display?.backgroundPanelOpacity, 0.2, 1, defaultDisplay.backgroundPanelOpacity),
    settingsBackgroundEnabled: display?.settingsBackgroundEnabled === true && Boolean(settingsBackgroundImage),
    settingsBackgroundImage,
    settingsBackgroundMediaKind: (['auto', 'image', 'video'] as const).includes((display?.settingsBackgroundMediaKind ?? defaultDisplay.settingsBackgroundMediaKind) as any) ? (display?.settingsBackgroundMediaKind ?? defaultDisplay.settingsBackgroundMediaKind) : defaultDisplay.settingsBackgroundMediaKind,
    settingsBackgroundOpacity: clampDisplayNumber(display?.settingsBackgroundOpacity, 0, 1, defaultDisplay.settingsBackgroundOpacity),
    settingsBackgroundDim: clampDisplayNumber(display?.settingsBackgroundDim, 0, 0.9, defaultDisplay.settingsBackgroundDim),
    settingsBackgroundBlur: clampDisplayNumber(display?.settingsBackgroundBlur, 0, 32, defaultDisplay.settingsBackgroundBlur),
    settingsBackgroundFit: (['cover', 'contain', 'stretch', 'tile'] as const).includes((display?.settingsBackgroundFit ?? defaultDisplay.settingsBackgroundFit) as any) ? (display?.settingsBackgroundFit ?? defaultDisplay.settingsBackgroundFit) : defaultDisplay.settingsBackgroundFit,
    settingsBackgroundPosition: (['center', 'top', 'bottom', 'left', 'right'] as const).includes((display?.settingsBackgroundPosition ?? defaultDisplay.settingsBackgroundPosition) as any) ? (display?.settingsBackgroundPosition ?? defaultDisplay.settingsBackgroundPosition) : defaultDisplay.settingsBackgroundPosition,
    settingsBackgroundPositionX: clampDisplayNumber((display as any)?.settingsBackgroundPositionX, 0, 100, settingsLegacyPoint.x),
    settingsBackgroundPositionY: clampDisplayNumber((display as any)?.settingsBackgroundPositionY, 0, 100, settingsLegacyPoint.y),
    settingsBackgroundMotionEnabled: display?.settingsBackgroundMotionEnabled !== false,
    settingsBackgroundPlaybackRate: clampDisplayNumber(display?.settingsBackgroundPlaybackRate, 0.25, 2, defaultDisplay.settingsBackgroundPlaybackRate),
    settingsBackgroundPauseWhenHidden: display?.settingsBackgroundPauseWhenHidden !== false,
    settingsBackgroundContainAmbient: display?.settingsBackgroundContainAmbient !== false,
    settingsBackgroundPanelOpacity: clampDisplayNumber(display?.settingsBackgroundPanelOpacity, 0.2, 1, defaultDisplay.settingsBackgroundPanelOpacity),
    settingsBackgroundGlassEffect: display?.settingsBackgroundGlassEffect === true,
    settingsBackgroundGlassBlur: clampDisplayNumber(display?.settingsBackgroundGlassBlur, 0, 40, defaultDisplay.settingsBackgroundGlassBlur),
    settingsBackgroundGlassSaturation: clampDisplayNumber(display?.settingsBackgroundGlassSaturation, 1, 1.8, defaultDisplay.settingsBackgroundGlassSaturation),
    settingsBackgroundGlassHighlight: clampDisplayNumber(display?.settingsBackgroundGlassHighlight, 0, 1, defaultDisplay.settingsBackgroundGlassHighlight)
  };
}

