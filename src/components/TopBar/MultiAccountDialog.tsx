import { invoke } from '@tauri-apps/api/core';
import { Check, Copy, Globe2, Layers3, Pencil, RefreshCw, Save, Trash2, UsersRound, Wrench, X } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useBrowserCatalog } from '../../hooks/useBrowserCatalog';
import { usePresenceTransition } from '../../hooks/usePresenceTransition';
import { browserProfileOverrideKey, getBrowserProfileDisplayName } from '../../lib/browserRouter';
import { createUrlShortcut } from '../../lib/createShortcutItems';
import { buildOnlineFaviconUrl } from '../../lib/faviconProviders';
import { makeId } from '../../lib/id';
import { showLauncherNotice } from '../../lib/notify';
import { uiConfirm, uiPrompt } from '../../lib/uiDialog';
import { useAppStore } from '../../stores/appStore';
import type {
  DetectedBrowser,
  DetectedBrowserProfile,
  MultiAccountNameOrder,
  MultiAccountTargetMode,
  MultiAccountTemplate,
  ShortcutItem,
} from '../../types';
import './MultiAccountDialog.css';

const DEFAULT_PROFILE_SENTINEL = '__browser_default__';
type DialogTab = 'generate' | 'templates' | 'batches';

interface ProfileTarget {
  key: string;
  browser: DetectedBrowser;
  profile?: DetectedBrowserProfile;
  profileName: string;
}

interface ParsedUrlEntry {
  url: string;
  label: string;
  explicitLabel: boolean;
  sourceLine: string;
}

interface BatchItemRef {
  item: ShortcutItem;
  groupId: string;
  groupName: string;
  directoryId: string;
  directoryName: string;
}

interface BatchRecord {
  id: string;
  name: string;
  createdAt: number;
  items: BatchItemRef[];
  urls: string[];
  targetKeys: string[];
  missingTargetKeys: string[];
}

function normalizeUrl(raw: string) {
  const value = raw.trim();
  if (!value) return '';
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
}

function fallbackUrlLabel(url: string) {
  try {
    const host = new URL(url).hostname.replace(/^www\./i, '');
    return host || 'Website';
  } catch {
    return 'Website';
  }
}

function parseUrlLines(text: string): { entries: ParsedUrlEntry[]; errors: string[] } {
  const entries: ParsedUrlEntry[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  text.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) return;
    const pipeIndex = line.indexOf('|');
    const explicitLabel = pipeIndex > 0;
    const labelPart = explicitLabel ? line.slice(0, pipeIndex).trim() : '';
    const urlPart = explicitLabel ? line.slice(pipeIndex + 1).trim() : line;
    const url = normalizeUrl(urlPart);
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('unsupported protocol');
      const normalized = parsed.toString();
      if (seen.has(normalized)) return;
      seen.add(normalized);
      entries.push({
        url: normalized,
        label: labelPart || fallbackUrlLabel(normalized),
        explicitLabel: Boolean(labelPart),
        sourceLine: line,
      });
    } catch {
      errors.push(`第 ${index + 1} 行：${line}`);
    }
  });
  return { entries, errors };
}

function isChromeOrFloorp(browser: DetectedBrowser) {
  const haystack = `${browser.id} ${browser.name} ${browser.executable}`.toLowerCase();
  return haystack.includes('chrome') || haystack.includes('floorp');
}

function alphaSuffix(index: number) {
  let value = Math.max(0, index);
  let output = '';
  do {
    output = String.fromCharCode(65 + (value % 26)) + output;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return output;
}

function cleanLetterName(value: string, lettersOnly: boolean) {
  const withoutDigits = value.normalize('NFKC').replace(/\p{N}+/gu, ' ');
  if (!lettersOnly) return withoutDigits.replace(/\s+/g, ' ').trim();
  return withoutDigits.replace(/[^\p{L}\s]+/gu, ' ').replace(/\s+/g, ' ').trim();
}

function buildProjectName(
  projectPrefix: string,
  urlEntry: ParsedUrlEntry,
  urlCount: number,
  account: string,
  separator: string,
  order: MultiAccountNameOrder,
) {
  const accountName = account.trim() || 'Account';
  const sitePart = (urlCount > 1 || urlEntry.explicitLabel) ? urlEntry.label.trim() : '';
  const prefixParts = [projectPrefix.trim(), sitePart].filter(Boolean);
  const prefix = prefixParts.join(separator).trim();
  if (order === 'profile-only') return sitePart ? `${sitePart}${separator}${accountName}`.trim() : accountName;
  if (!prefix) return accountName;
  if (order === 'profile-prefix') return `${accountName}${separator}${prefix}`.trim();
  return `${prefix}${separator}${accountName}`.trim();
}

function sameAssignedTarget(item: ShortcutItem, url: string, target: ProfileTarget) {
  if (item.type !== 'url' || item.path.trim() !== url) return false;
  if (item.browserRoute?.mode !== 'specified' || item.browserRoute.browserId !== target.browser.id) return false;
  return (item.browserRoute.profileId ?? '') === (target.profile?.id ?? '');
}

function templatePatch(template: MultiAccountTemplate) {
  return {
    urlsText: template.urlsText,
    url: parseUrlLines(template.urlsText).entries[0]?.url ?? '',
    batchName: template.batchName,
    projectPrefix: template.projectPrefix,
    separator: template.separator,
    nameOrder: template.nameOrder,
    lettersOnlyProfileName: template.lettersOnlyProfileName,
    includeBrowserName: template.includeBrowserName,
    targetMode: template.targetMode,
    selectedDirectoryId: template.selectedDirectoryId,
    newDirectoryName: template.newDirectoryName,
    selectedTargetKeys: template.selectedTargetKeys,
    skipDuplicates: template.skipDuplicates,
    autoFetchIcon: template.autoFetchIcon,
    pinGenerated: template.pinGenerated,
    activateTargetAfterCreate: template.activateTargetAfterCreate,
  };
}

export function MultiAccountDialog({ onClose, closing = false, panelRef }: { onClose: () => void; closing?: boolean; panelRef?: (node: HTMLFormElement | null) => void }) {
  const groups = useAppStore((state) => state.groups);
  const activeGroupId = useAppStore((state) => state.activeGroupId);
  const activeDirectoryId = useAppStore((state) => state.activeDirectoryId);
  const router = useAppStore((state) => state.browserRouter);
  const settings = useAppStore((state) => state.multiAccount);
  const display = useAppStore((state) => state.display);
  const experience = useAppStore((state) => state.experience);
  const addItems = useAppStore((state) => state.addItems);
  const addDirectory = useAppStore((state) => state.addDirectory);
  const setActiveDirectory = useAppStore((state) => state.setActiveDirectory);
  const updateItem = useAppStore((state) => state.updateItem);
  const deleteItemsByIds = useAppStore((state) => state.deleteItemsByIds);
  const updateMultiAccount = useAppStore((state) => state.updateMultiAccount);
  const updateBrowserRouter = useAppStore((state) => state.updateBrowserRouter);
  const { catalog, busy, error, refresh } = useBrowserCatalog(router.customBrowsers);
  const [tab, setTab] = useState<DialogTab>('generate');
  const [selectedKeys, setSelectedKeys] = useState<string[]>(settings.selectedTargetKeys ?? []);
  const [selectionInitialized, setSelectionInitialized] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [replaceSourceUrl, setReplaceSourceUrl] = useState('');
  const [replaceUrl, setReplaceUrl] = useState('');
  const [reassignSourceKey, setReassignSourceKey] = useState('');
  const [reassignTargetKey, setReassignTargetKey] = useState('');
  /** 批次编辑浮窗（改 URL / 重新分配 Profile）只在点击“编辑批次”时打开 */
  const [batchEditorOpen, setBatchEditorOpen] = useState(false);
  /** 主对话框已经由 TopBar 的 presence 控制退场；这里给内层浮窗补上同样的进出场动画 */
  const batchEditorPresence = usePresenceTransition(batchEditorOpen, experience.reduceMotion ? 0 : 200);

  const activeGroup = groups.find((group) => group.id === activeGroupId) ?? groups[0];
  const normalDirectories = useMemo(
    () => (activeGroup?.directories ?? []).filter((directory) => (directory.kind ?? 'normal') === 'normal'),
    [activeGroup],
  );
  const parsedUrls = useMemo(() => parseUrlLines(settings.urlsText || settings.url), [settings.urlsText, settings.url]);

  const targets = useMemo<ProfileTarget[]>(() => catalog.flatMap((browser) => {
    if (!browser.profiles.length) {
      const key = browserProfileOverrideKey(browser.id, DEFAULT_PROFILE_SENTINEL);
      return [{ key, browser, profileName: router.profileOverrides[key]?.name || 'Default' }];
    }
    return browser.profiles.map((profile) => ({
      key: browserProfileOverrideKey(browser.id, profile.id),
      browser,
      profile,
      profileName: getBrowserProfileDisplayName(router, browser.id, profile),
    }));
  }), [catalog, router]);

  const targetMap = useMemo(() => new Map(targets.map((target) => [target.key, target])), [targets]);
  const availableTargetKeys = useMemo(() => new Set(targets.map((target) => target.key)), [targets]);

  const batches = useMemo<BatchRecord[]>(() => {
    const grouped = new Map<string, BatchRecord>();
    groups.forEach((group) => group.directories.forEach((directory) => directory.items.forEach((item) => {
      const meta = item.multiAccountBatch;
      if (!meta?.batchId) return;
      const existing = grouped.get(meta.batchId) ?? {
        id: meta.batchId,
        name: meta.batchName || '多账号批次',
        createdAt: meta.createdAt || 0,
        items: [],
        urls: [],
        targetKeys: [],
        missingTargetKeys: [],
      };
      existing.name = meta.batchName || existing.name;
      existing.createdAt = Math.max(existing.createdAt, meta.createdAt || 0);
      existing.items.push({ item, groupId: group.id, groupName: group.name, directoryId: directory.id, directoryName: directory.name });
      if (meta.sourceUrl && !existing.urls.includes(meta.sourceUrl)) existing.urls.push(meta.sourceUrl);
      if (meta.targetKey && !existing.targetKeys.includes(meta.targetKey)) existing.targetKeys.push(meta.targetKey);
      grouped.set(meta.batchId, existing);
    })));
    return Array.from(grouped.values())
      .map((batch) => ({
        ...batch,
        missingTargetKeys: batch.targetKeys.filter((key) => !availableTargetKeys.has(key)),
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [availableTargetKeys, groups]);

  const selectedBatch = batches.find((batch) => batch.id === selectedBatchId) ?? batches[0];

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      if (batchEditorOpen) {
        setBatchEditorOpen(false);
        return;
      }
      onClose();
    }
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [batchEditorOpen, onClose]);

  useEffect(() => {
    if (selectionInitialized || !targets.length) return;
    const available = new Set(targets.map((target) => target.key));
    const remembered = (settings.selectedTargetKeys ?? []).filter((key) => available.has(key));
    const defaults = targets.filter((target) => isChromeOrFloorp(target.browser)).map((target) => target.key);
    setSelectedKeys(remembered.length ? remembered : defaults);
    setSelectionInitialized(true);
  }, [selectionInitialized, settings.selectedTargetKeys, targets]);

  useEffect(() => {
    if (settings.targetMode !== 'selected') return;
    if (normalDirectories.some((directory) => directory.id === settings.selectedDirectoryId)) return;
    updateMultiAccount({ selectedDirectoryId: normalDirectories[0]?.id ?? '' });
  }, [normalDirectories, settings.selectedDirectoryId, settings.targetMode, updateMultiAccount]);

  useEffect(() => {
    if (!selectedBatch) return;
    setSelectedBatchId(selectedBatch.id);
    setReplaceSourceUrl((current) => selectedBatch.urls.includes(current) ? current : selectedBatch.urls[0] ?? '');
    setReassignSourceKey((current) => selectedBatch.targetKeys.includes(current) ? current : selectedBatch.targetKeys[0] ?? '');
  }, [selectedBatch?.id]);

  const selectedSet = useMemo(() => new Set(selectedKeys), [selectedKeys]);
  const selectedTargets = useMemo(() => targets.filter((target) => selectedSet.has(target.key)), [targets, selectedSet]);
  const targetsByBrowser = useMemo(() => catalog.map((browser) => ({
    browser,
    targets: targets.filter((target) => target.browser.id === browser.id),
  })).filter((entry) => entry.targets.length > 0), [catalog, targets]);

  function setSelected(next: string[]) {
    const unique = Array.from(new Set(next));
    setSelectedKeys(unique);
    updateMultiAccount({ selectedTargetKeys: unique });
  }

  function toggleTarget(key: string) {
    setSelected(selectedSet.has(key) ? selectedKeys.filter((value) => value !== key) : [...selectedKeys, key]);
  }

  function toggleBrowser(browserTargets: ProfileTarget[]) {
    const allSelected = browserTargets.every((target) => selectedSet.has(target.key));
    const keys = new Set(selectedKeys);
    browserTargets.forEach((target) => allSelected ? keys.delete(target.key) : keys.add(target.key));
    setSelected(Array.from(keys));
  }

  function selectRecommended() {
    setSelected(targets.filter((target) => isChromeOrFloorp(target.browser)).map((target) => target.key));
  }

  function selectAll() {
    setSelected(targets.map((target) => target.key));
  }

  function clearAll() {
    setSelected([]);
  }

  function setProfileAlias(target: ProfileTarget, value: string) {
    const current = router.profileOverrides[target.key] ?? {};
    const name = value.trim().slice(0, 120);
    const nextOverrides = { ...router.profileOverrides };
    if (!name && !current.color) {
      delete nextOverrides[target.key];
    } else {
      nextOverrides[target.key] = { ...current, ...(name ? { name } : { name: undefined }) };
    }
    updateBrowserRouter({ profileOverrides: nextOverrides });
  }

  async function resolveIcon(url: string) {
    if (!settings.autoFetchIcon) return undefined;
    if (display.autoSaveWebsiteIcon !== false) {
      const local = await invoke<string>('fetch_website_favicon', {
        url,
        providerId: display.faviconProvider ?? 'auto',
        fallback: display.faviconProviderFallback !== false,
      }).catch(() => '');
      if (local) return local;
    }
    return buildOnlineFaviconUrl(url, display.faviconProvider ?? 'auto');
  }

  function resolveTargetDirectoryId() {
    if (!activeGroup) return '';
    if (settings.targetMode === 'new') {
      const requestedName = settings.newDirectoryName.trim() || '多账号';
      const existing = normalDirectories.find((directory) => directory.name.trim().toLocaleLowerCase() === requestedName.toLocaleLowerCase());
      return existing?.id || addDirectory(activeGroup.id, requestedName, 'normal');
    }
    if (settings.targetMode === 'selected') {
      const selected = normalDirectories.find((directory) => directory.id === settings.selectedDirectoryId);
      if (selected) return selected.id;
    }
    const current = normalDirectories.find((directory) => directory.id === activeDirectoryId);
    return current?.id ?? normalDirectories[0]?.id ?? addDirectory(activeGroup.id, '多账号', 'normal');
  }

  function makeTemplate(name: string, id = makeId('multi_template')): MultiAccountTemplate {
    return {
      id,
      name: name.trim() || '多账号模板',
      urlsText: settings.urlsText || settings.url,
      batchName: settings.batchName,
      projectPrefix: settings.projectPrefix,
      separator: settings.separator,
      nameOrder: settings.nameOrder,
      lettersOnlyProfileName: settings.lettersOnlyProfileName,
      includeBrowserName: settings.includeBrowserName,
      targetMode: settings.targetMode,
      selectedDirectoryId: settings.selectedDirectoryId,
      newDirectoryName: settings.newDirectoryName,
      selectedTargetKeys: selectedKeys,
      skipDuplicates: settings.skipDuplicates,
      autoFetchIcon: settings.autoFetchIcon,
      pinGenerated: settings.pinGenerated,
      activateTargetAfterCreate: settings.activateTargetAfterCreate,
    };
  }

  async function saveAsTemplate() {
    const name = await uiPrompt('模板名称', settings.batchName || settings.projectPrefix || '工作账号', '保存多账号模板');
    if (name == null) return;
    const template = makeTemplate(name);
    updateMultiAccount({ templates: [...settings.templates, template] });
    showLauncherNotice(`已保存模板：${template.name}`);
    setTab('templates');
  }

  function applyTemplate(template: MultiAccountTemplate) {
    updateMultiAccount(templatePatch(template));
    setSelectedKeys(template.selectedTargetKeys);
    setSelectionInitialized(true);
    setTab('generate');
    showLauncherNotice(`已应用模板：${template.name}`);
  }

  async function overwriteTemplate(template: MultiAccountTemplate) {
    const ok = await uiConfirm(`用当前多账号设置覆盖模板「${template.name}」吗？`);
    if (!ok) return;
    const updated = makeTemplate(template.name, template.id);
    updateMultiAccount({ templates: settings.templates.map((entry) => entry.id === template.id ? updated : entry) });
    showLauncherNotice(`已更新模板：${template.name}`);
  }

  async function deleteTemplate(template: MultiAccountTemplate) {
    const ok = await uiConfirm(`删除模板「${template.name}」吗？`);
    if (!ok) return;
    updateMultiAccount({ templates: settings.templates.filter((entry) => entry.id !== template.id) });
  }

  async function renameBatch(batch: BatchRecord) {
    const name = await uiPrompt('新的批次名称', batch.name, '重命名多账号批次');
    if (name == null || !name.trim()) return;
    batch.items.forEach(({ item }) => {
      if (!item.multiAccountBatch) return;
      updateItem(item.id, { multiAccountBatch: { ...item.multiAccountBatch, batchName: name.trim() } });
    });
    showLauncherNotice(`已重命名批次：${name.trim()}`);
  }

  async function replaceBatchUrl(batch: BatchRecord) {
    const normalized = normalizeUrl(replaceUrl);
    if (!replaceSourceUrl || !normalized) {
      setFormError('请选择要替换的原网址，并输入新网址');
      return;
    }
    try {
      new URL(normalized);
    } catch {
      setFormError('新网址格式不正确');
      return;
    }
    const matched = batch.items.filter(({ item }) => item.multiAccountBatch?.sourceUrl === replaceSourceUrl);
    if (!matched.length) return;
    const ok = await uiConfirm(`把批次「${batch.name}」中的 ${matched.length} 个项目网址替换为：\n${normalized}`);
    if (!ok) return;
    const icon = settings.autoFetchIcon ? await resolveIcon(normalized) : undefined;
    matched.forEach(({ item }) => {
      const meta = item.multiAccountBatch!;
      updateItem(item.id, {
        path: normalized,
        ...(icon ? { icon } : {}),
        multiAccountBatch: { ...meta, sourceUrl: normalized },
      });
    });
    setReplaceUrl('');
    setReplaceSourceUrl(normalized);
    showLauncherNotice(`已更新 ${matched.length} 个批次项目网址`);
  }

  async function reassignBatchTarget(batch: BatchRecord) {
    const target = targetMap.get(reassignTargetKey);
    if (!reassignSourceKey || !target) {
      setFormError('请选择原账号和新的浏览器账号 / Profile');
      return;
    }
    const matched = batch.items.filter(({ item }) => item.multiAccountBatch?.targetKey === reassignSourceKey);
    if (!matched.length) return;
    const ok = await uiConfirm(`把 ${matched.length} 个项目重新分配到「${target.browser.name} · ${target.profileName}」吗？`);
    if (!ok) return;
    matched.forEach(({ item }) => {
      const meta = item.multiAccountBatch!;
      updateItem(item.id, {
        browserRoute: {
          mode: 'specified',
          browserId: target.browser.id,
          ...(target.profile ? { profileId: target.profile.id } : {}),
        },
        multiAccountBatch: { ...meta, targetKey: target.key },
      });
    });
    setReassignSourceKey(target.key);
    showLauncherNotice(`已重新分配 ${matched.length} 个项目`);
  }

  async function deleteBatch(batch: BatchRecord) {
    const ok = await uiConfirm(`删除批次「${batch.name}」的 ${batch.items.length} 个项目吗？\n此操作只删除这一批生成的项目。`);
    if (!ok) return;
    const removed = deleteItemsByIds(batch.items.map(({ item }) => item.id));
    showLauncherNotice(`已删除 ${removed} 个批次项目`);
    setSelectedBatchId('');
    setBatchEditorOpen(false);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError('');
    if (parsedUrls.errors.length) {
      setFormError(`有 ${parsedUrls.errors.length} 行网址无法识别：${parsedUrls.errors.slice(0, 2).join('；')}`);
      return;
    }
    if (!parsedUrls.entries.length) {
      setFormError('请至少输入一个网址');
      return;
    }
    if (!activeGroup) {
      setFormError('当前没有可用父目录');
      return;
    }
    if (!selectedTargets.length) {
      setFormError('至少选择一个浏览器账号 / Profile');
      return;
    }

    setSubmitting(true);
    try {
      const directoryId = resolveTargetDirectoryId();
      if (!directoryId) throw new Error('没有可用的普通子目录');
      const stateAfterDirectory = useAppStore.getState();
      const targetDirectory = stateAfterDirectory.groups.flatMap((group) => group.directories).find((directory) => directory.id === directoryId);
      const iconEntries = await Promise.all(parsedUrls.entries.map(async (entry) => [entry.url, await resolveIcon(entry.url)] as const));
      const icons = new Map(iconEntries);
      const rawAccountNames = selectedTargets.map((target) => {
        const profilePart = cleanLetterName(target.profileName || 'Default', settings.lettersOnlyProfileName) || 'Account';
        const browserPart = cleanLetterName(target.browser.name, settings.lettersOnlyProfileName) || 'Browser';
        return settings.includeBrowserName ? `${browserPart} ${profilePart}`.trim() : profilePart;
      });
      const generated: ShortcutItem[] = [];
      let skipped = 0;
      const batchId = makeId('multi_batch');
      const createdAt = Date.now();
      const batchName = settings.batchName.trim()
        || settings.projectPrefix.trim()
        || parsedUrls.entries[0]?.label
        || '多账号批次';

      parsedUrls.entries.forEach((urlEntry) => {
        const seenNames = new Map<string, number>();
        selectedTargets.forEach((target, index) => {
          if (settings.skipDuplicates && (targetDirectory?.items ?? []).some((item) => sameAssignedTarget(item, urlEntry.url, target))) {
            skipped += 1;
            return;
          }
          const baseAccountName = rawAccountNames[index];
          const collisionKey = baseAccountName.toLocaleLowerCase();
          const collisionIndex = seenNames.get(collisionKey) ?? 0;
          seenNames.set(collisionKey, collisionIndex + 1);
          const accountName = collisionIndex === 0 ? baseAccountName : `${baseAccountName} ${alphaSuffix(collisionIndex - 1)}`;
          const item = createUrlShortcut(
            urlEntry.url,
            buildProjectName(settings.projectPrefix, urlEntry, parsedUrls.entries.length, accountName, settings.separator, settings.nameOrder),
          );
          item.browserRoute = {
            mode: 'specified',
            browserId: target.browser.id,
            ...(target.profile ? { profileId: target.profile.id } : {}),
          };
          item.multiAccountBatch = {
            batchId,
            batchName,
            createdAt,
            sourceUrl: urlEntry.url,
            sourceLabel: urlEntry.label,
            targetKey: target.key,
          };
          item.pinned = settings.pinGenerated;
          const icon = icons.get(urlEntry.url);
          if (icon) item.icon = icon;
          generated.push(item);
        });
      });

      if (generated.length) addItems(activeGroup.id, directoryId, generated);
      updateMultiAccount({
        url: parsedUrls.entries[0]?.url ?? '',
        urlsText: settings.urlsText || settings.url,
        selectedTargetKeys: selectedKeys,
        selectedDirectoryId: directoryId,
        batchName,
      });
      if (settings.activateTargetAfterCreate) setActiveDirectory(directoryId);
      showLauncherNotice(generated.length
        ? `多账号批次「${batchName}」已生成 ${generated.length} 个项目${skipped ? `，跳过 ${skipped} 个重复项` : ''}`
        : `没有新增项目${skipped ? `，已跳过 ${skipped} 个重复项` : ''}`);
      if (generated.length) {
        setSelectedBatchId(batchId);
        setTab('batches');
      }
    } catch (submitError) {
      setFormError(String(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={`multi-account-backdrop ${closing ? 'is-closing' : ''}`} aria-hidden={closing || undefined} data-no-drag onMouseDown={(event) => { if (!closing && event.target === event.currentTarget) onClose(); }} onContextMenu={(event) => event.preventDefault()}>
      <form ref={panelRef} className={`multi-account-dialog ${closing ? 'is-closing' : ''}`} onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        <div className="multi-account-header">
          <div><UsersRound size={20} /><span><strong>多账号中心</strong><small>批量网址 × 批量账号 · 模板 · 账号别名 · 批次管理</small></span></div>
          <button type="button" className="icon-button" title="关闭" onClick={onClose}><X size={17} /></button>
        </div>

        <div className="multi-account-tabs">
          <button type="button" className={tab === 'generate' ? 'active' : ''} onClick={() => setTab('generate')}><Globe2 size={14} />批量生成</button>
          <button type="button" className={tab === 'templates' ? 'active' : ''} onClick={() => setTab('templates')}><Save size={14} />模板 <span>{settings.templates.length}</span></button>
          <button type="button" className={tab === 'batches' ? 'active' : ''} onClick={() => setTab('batches')}><Layers3 size={14} />批次管理 <span>{batches.length}</span></button>
        </div>

        {/* 只有这一层滚动：标题 / 页签 / 页脚固定，中间内容区拿到整屏高度 */}
        <div className="multi-account-body">

        {tab === 'generate' && <>
          <div className="multi-account-main-grid">
            <section className="multi-account-section">
              <h4><Globe2 size={15} />网址与命名</h4>
              <label>批量网址<textarea autoFocus rows={6} value={settings.urlsText || settings.url} placeholder={'https://mail.google.com\nYouTube | https://youtube.com\nChatGPT | https://chatgpt.com'} onChange={(event) => updateMultiAccount({ urlsText: event.target.value, url: parseUrlLines(event.target.value).entries[0]?.url ?? '' })} /><small>一行一个网址；可写“名称 | 网址”。当前识别 {parsedUrls.entries.length} 个网址。</small></label>
              {parsedUrls.errors.length > 0 && <div className="multi-account-inline-warning">有 {parsedUrls.errors.length} 行无法识别</div>}
              <div className="multi-account-two-col">
                <label>批次名称<input value={settings.batchName} placeholder="例如：Google 全账号" onChange={(event) => updateMultiAccount({ batchName: event.target.value })} /></label>
                <label>项目公共前缀<input value={settings.projectPrefix} placeholder="例如：工作" onChange={(event) => updateMultiAccount({ projectPrefix: event.target.value })} /></label>
              </div>
              <div className="multi-account-two-col">
                <label>命名顺序<select value={settings.nameOrder} onChange={(event) => updateMultiAccount({ nameOrder: event.target.value as MultiAccountNameOrder })}><option value="prefix-profile">前缀/站点 + 账号</option><option value="profile-prefix">账号 + 前缀/站点</option><option value="profile-only">站点 + 账号（单网址仅账号）</option></select></label>
                <label>分隔符<input value={settings.separator} maxLength={12} placeholder="空格 / - / ·" onChange={(event) => updateMultiAccount({ separator: event.target.value })} /></label>
              </div>
              <label className="multi-account-check"><input type="checkbox" checked={settings.lettersOnlyProfileName} onChange={(event) => updateMultiAccount({ lettersOnlyProfileName: event.target.checked })} /><span><strong>账号名只保留字母</strong><small>删除数字和符号；重名只追加 A/B/C，不重新加数字。</small></span></label>
              <label className="multi-account-check"><input type="checkbox" checked={settings.includeBrowserName} onChange={(event) => updateMultiAccount({ includeBrowserName: event.target.checked })} /><span><strong>账号名中加入浏览器名</strong></span></label>
              <button type="button" className="multi-account-wide-action" onClick={() => void saveAsTemplate()}><Save size={14} />把当前设置保存为模板</button>
            </section>

            <section className="multi-account-section">
              <h4>生成位置与行为</h4>
              <label>目标方式<select value={settings.targetMode} onChange={(event) => updateMultiAccount({ targetMode: event.target.value as MultiAccountTargetMode })}><option value="current">当前父目录 · 当前子目录</option><option value="selected">当前父目录 · 指定子目录</option><option value="new">当前父目录 · 新建/复用子目录</option></select></label>
              {settings.targetMode === 'selected' && <label>子目录<select value={settings.selectedDirectoryId} onChange={(event) => updateMultiAccount({ selectedDirectoryId: event.target.value })}>{normalDirectories.map((directory) => <option key={directory.id} value={directory.id}>{directory.name}</option>)}</select></label>}
              {settings.targetMode === 'new' && <label>子目录名称<input value={settings.newDirectoryName} onChange={(event) => updateMultiAccount({ newDirectoryName: event.target.value })} /><small>同名普通子目录存在时直接复用。</small></label>}
              <label className="multi-account-check"><input type="checkbox" checked={settings.skipDuplicates} onChange={(event) => updateMultiAccount({ skipDuplicates: event.target.checked })} /><span><strong>跳过重复分配</strong><small>同一网址 + 浏览器 + Profile 已存在时不重复生成。</small></span></label>
              <label className="multi-account-check"><input type="checkbox" checked={settings.autoFetchIcon} onChange={(event) => updateMultiAccount({ autoFetchIcon: event.target.checked })} /><span><strong>自动获取网站图标</strong><small>每个不同网址只获取一次，再复用给全部账号。</small></span></label>
              <label className="multi-account-check"><input type="checkbox" checked={settings.pinGenerated} onChange={(event) => updateMultiAccount({ pinGenerated: event.target.checked })} /><span><strong>新项目固定到前面</strong></span></label>
              <label className="multi-account-check"><input type="checkbox" checked={settings.activateTargetAfterCreate} onChange={(event) => updateMultiAccount({ activateTargetAfterCreate: event.target.checked })} /><span><strong>生成后切换到目标子目录</strong></span></label>
              <div className="multi-account-matrix-preview"><strong>{parsedUrls.entries.length} × {selectedTargets.length}</strong><span>最多生成 {parsedUrls.entries.length * selectedTargets.length} 个项目</span></div>
            </section>
          </div>

          <section className="multi-account-section multi-account-browser-section">
            <div className="multi-account-browser-toolbar">
              <h4>浏览器账号 / Profile <span>{selectedTargets.length}/{targets.length}</span></h4>
              <div><button type="button" onClick={selectRecommended}>Chrome + Floorp</button><button type="button" onClick={selectAll}>全选</button><button type="button" onClick={clearAll}>清空</button><button type="button" disabled={busy} onClick={() => void refresh(true)}><RefreshCw size={13} />刷新</button></div>
            </div>
            {busy && !targets.length && <div className="multi-account-empty">正在扫描浏览器 Profile…</div>}
            {!busy && error && <div className="multi-account-error">浏览器扫描失败：{error}</div>}
            {!busy && !targets.length && <div className="multi-account-empty">没有扫描到浏览器。可先在“设置 → 浏览器路由”添加自定义/便携浏览器及 Profile 根目录。</div>}
            <div className="multi-account-browser-grid">
              {targetsByBrowser.map(({ browser, targets: browserTargets }) => {
                const selectedCount = browserTargets.filter((target) => selectedSet.has(target.key)).length;
                return <div className="multi-account-browser-card" key={browser.id}>
                  <button type="button" className="multi-account-browser-title" onClick={() => toggleBrowser(browserTargets)}><span>{browser.name}<small>{browser.engine} · {selectedCount}/{browserTargets.length}</small></span>{selectedCount === browserTargets.length && browserTargets.length > 0 ? <Check size={15} /> : <span className="multi-account-partial">{selectedCount}</span>}</button>
                  <div className="multi-account-profile-list">{browserTargets.map((target) => {
                    const rawName = target.profile?.name ?? 'Default';
                    const alias = router.profileOverrides[target.key]?.name ?? '';
                    return <div className="multi-account-profile-row" key={target.key}>
                      <label><input type="checkbox" checked={selectedSet.has(target.key)} onChange={() => toggleTarget(target.key)} /><span><strong>{target.profileName}</strong><small>{target.profile?.profileKey ?? '浏览器默认 Profile'}</small></span></label>
                      <input className="multi-account-alias-input" value={alias} placeholder={`别名：${rawName}`} title="账号别名；会同步到浏览器路由设置" onChange={(event) => setProfileAlias(target, event.target.value)} />
                    </div>;
                  })}</div>
                </div>;
              })}
            </div>
          </section>
        </>}

        {tab === 'templates' && <section className="multi-account-section multi-account-feature-page">
          <div className="multi-account-browser-toolbar"><h4><Save size={15} />多账号模板</h4><button type="button" onClick={() => { setTab('generate'); void saveAsTemplate(); }}><Save size={13} />保存当前设置</button></div>
          {!settings.templates.length && <div className="multi-account-empty">还没有模板。模板会记住网址列表、命名、目标子目录、选中的 Chrome/Floorp Profiles 和生成选项。</div>}
          <div className="multi-account-template-list">
            {settings.templates.map((template) => {
              const templateUrls = parseUrlLines(template.urlsText).entries;
              const missingCount = template.selectedTargetKeys.filter((key) => !availableTargetKeys.has(key)).length;
              return <article key={template.id} className="multi-account-template-card">
                <div><strong>{template.name}</strong><small>{templateUrls.length} 个网址 · {template.selectedTargetKeys.length} 个账号{missingCount ? ` · ${missingCount} 个账号当前缺失` : ''}</small><small>目标：{template.targetMode === 'new' ? template.newDirectoryName : template.targetMode === 'selected' ? '指定子目录' : '当前子目录'}</small></div>
                <div><button type="button" onClick={() => applyTemplate(template)}><Copy size={13} />应用</button><button type="button" onClick={() => void overwriteTemplate(template)}><Save size={13} />覆盖</button><button type="button" className="danger" onClick={() => void deleteTemplate(template)}><Trash2 size={13} />删除</button></div>
              </article>;
            })}
          </div>
        </section>}

        {tab === 'batches' && <section className="multi-account-section multi-account-feature-page">
          <div className="multi-account-browser-toolbar"><h4><Layers3 size={15} />批量项目管理</h4><button type="button" disabled={busy} onClick={() => void refresh(true)}><RefreshCw size={13} />检查账号</button></div>
          {!batches.length && <div className="multi-account-empty">还没有 v121 多账号批次。新生成的项目会自动记录批次，可以整批修改、重新分配或删除。</div>}
          {batches.length > 0 && <div className="multi-account-batch-layout">
            <aside className="multi-account-batch-list">{batches.map((batch) => <button type="button" key={batch.id} title={`${batch.name} · ${batch.items.length} 项 · ${batch.urls.length} 网址 · ${batch.targetKeys.length} 账号`} className={selectedBatch?.id === batch.id ? 'active' : ''} onClick={() => setSelectedBatchId(batch.id)}><strong>{batch.name}</strong><small>{batch.items.length} 项 · {batch.urls.length} 网址 · {batch.targetKeys.length} 账号</small>{batch.missingTargetKeys.length > 0 && <span>{batch.missingTargetKeys.length} 个账号失效</span>}</button>)}</aside>
            {selectedBatch && <div className="multi-account-batch-detail">
              <div className="multi-account-batch-heading"><div><strong>{selectedBatch.name}</strong><small>{selectedBatch.items.length} 个项目 · {selectedBatch.createdAt ? new Date(selectedBatch.createdAt).toLocaleString() : '旧批次'}</small></div><div><button type="button" onClick={() => setBatchEditorOpen(true)}><Wrench size={13} />编辑批次</button><button type="button" onClick={() => void renameBatch(selectedBatch)}><Pencil size={13} />重命名</button><button type="button" className="danger" onClick={() => void deleteBatch(selectedBatch)}><Trash2 size={13} />删除整批</button></div></div>

              {selectedBatch.missingTargetKeys.length > 0 && <div className="multi-account-inline-warning"><strong>检测到已不存在的 Profile：</strong>{selectedBatch.missingTargetKeys.join('、')}。<button type="button" onClick={() => setBatchEditorOpen(true)}>打开“编辑批次”处理</button></div>}

              <div className="multi-account-batch-items"><div className="multi-account-batch-items-head"><strong>这一批项目</strong><span>{selectedBatch.items.length}</span></div>{selectedBatch.items.map(({ item, groupName, directoryName }) => <div key={item.id}><span><strong>{item.name}</strong><small>{groupName} / {directoryName}</small></span><span><small>{item.path}</small><small>{targetMap.get(item.multiAccountBatch?.targetKey ?? '') ? `${targetMap.get(item.multiAccountBatch!.targetKey)!.browser.name} · ${targetMap.get(item.multiAccountBatch!.targetKey)!.profileName}` : 'Profile 已不存在'}</small></span></div>)}</div>
            </div>}
          </div>}

          {tab === 'batches' && batchEditorPresence.rendered && selectedBatch && <div className={`multi-account-batch-editor-backdrop ${batchEditorPresence.closing ? 'is-closing' : ''}`} aria-hidden={batchEditorPresence.closing || undefined} data-no-drag onMouseDown={(event) => { if (event.target === event.currentTarget) setBatchEditorOpen(false); }} onContextMenu={(event) => event.preventDefault()}>
            <div className={`multi-account-batch-editor ${batchEditorPresence.closing ? 'is-closing' : ''}`} onMouseDown={(event) => event.stopPropagation()}>
              <div className="multi-account-batch-editor-head">
                <strong><Wrench size={14} />编辑批次 · {selectedBatch.name}</strong>
                <button type="button" className="icon-button" title="关闭" onClick={() => setBatchEditorOpen(false)}><X size={15} /></button>
              </div>
              <div className="multi-account-batch-tools">
                <div><strong>一键修改整批 URL</strong><label>原网址<select value={replaceSourceUrl} onChange={(event) => setReplaceSourceUrl(event.target.value)}>{selectedBatch.urls.map((url) => <option key={url} value={url}>{url}</option>)}</select></label><label>新网址<input value={replaceUrl} placeholder="https://new.example.com" onChange={(event) => setReplaceUrl(event.target.value)} /></label><button type="button" onClick={() => void replaceBatchUrl(selectedBatch)}>替换这一组网址</button></div>
                <div><strong>一键重新分配 Profile</strong><label>原账号<select value={reassignSourceKey} onChange={(event) => setReassignSourceKey(event.target.value)}>{selectedBatch.targetKeys.map((key) => <option key={key} value={key}>{targetMap.get(key) ? `${targetMap.get(key)!.browser.name} · ${targetMap.get(key)!.profileName}` : `已失效：${key}`}</option>)}</select></label><label>新账号<select value={reassignTargetKey} onChange={(event) => setReassignTargetKey(event.target.value)}><option value="">请选择</option>{targets.map((target) => <option key={target.key} value={target.key}>{target.browser.name} · {target.profileName}</option>)}</select></label><button type="button" onClick={() => void reassignBatchTarget(selectedBatch)}>重新分配这一组</button></div>
              </div>
              {selectedBatch.missingTargetKeys.length > 0 && <div className="multi-account-inline-warning"><strong>检测到已不存在的 Profile：</strong>{selectedBatch.missingTargetKeys.join('、')}。可在上方“重新分配 Profile”中把它们迁移到现有账号。</div>}
            </div>
          </div>}
        </section>}
        </div>

        {formError && <div className="multi-account-error">{formError}</div>}
        <div className="multi-account-footer">
          <span>{tab === 'generate' ? <>生成到父目录：<strong>{activeGroup?.name ?? '—'}</strong></> : <>账号别名与模板会自动保存到当前配置</>}</span>
          <div><button type="button" className="ghost" onClick={onClose}>关闭</button>{tab === 'generate' && <button type="submit" disabled={submitting || busy || selectedTargets.length === 0 || parsedUrls.entries.length === 0}>{submitting ? '生成中…' : `生成 ${parsedUrls.entries.length * selectedTargets.length} 个项目`}</button>}</div>
        </div>
      </form>
    </div>
  );
}
