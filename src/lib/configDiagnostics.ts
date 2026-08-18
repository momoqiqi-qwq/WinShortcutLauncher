import type { AppConfig, Group, ShortcutItem } from '../types';

export type DiagnosticSeverity = 'error' | 'warning' | 'info';
export type DiagnosticEntityType = 'group' | 'directory' | 'item';

export interface DiagnosticEntry {
  key: string;
  entityType: DiagnosticEntityType;
  groupId: string;
  groupName: string;
  directoryId?: string;
  directoryName?: string;
  itemId?: string;
  itemName?: string;
  path?: string;
  message: string;
}

export interface DiagnosticIssue {
  severity: DiagnosticSeverity;
  code: string;
  title: string;
  detail: string;
  count: number;
  entries: DiagnosticEntry[];
}

export interface ConfigDiagnostics {
  generatedAt: number;
  summary: {
    groups: number;
    directories: number;
    items: number;
    notes: number;
    urls: number;
    missingIcons: number;
  };
  issues: DiagnosticIssue[];
}

interface LocatedEntity {
  id: string;
  entityType: DiagnosticEntityType;
  group: Group;
  directory?: Group['directories'][number];
  item?: ShortcutItem;
}

function entryFromEntity(entity: LocatedEntity, message: string): DiagnosticEntry {
  return {
    key: `${entity.entityType}:${entity.id}:${entity.group.id}:${entity.directory?.id ?? ''}:${entity.item?.id ?? ''}:${entity.item?.order ?? ''}:${entity.item?.name ?? ''}:${entity.item?.path ?? ''}:${message}`,
    entityType: entity.entityType,
    groupId: entity.group.id,
    groupName: entity.group.name || '未命名父目录',
    directoryId: entity.directory?.id,
    directoryName: entity.directory?.name || (entity.directory ? '未命名子目录' : undefined),
    itemId: entity.item?.id,
    itemName: entity.item?.name || (entity.item ? '未命名项目' : undefined),
    path: entity.item?.path,
    message,
  };
}

function isValidWebUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function displayLocation(entry: DiagnosticEntry) {
  const parts = [entry.groupName];
  if (entry.directoryName) parts.push(entry.directoryName);
  if (entry.itemName) parts.push(entry.itemName);
  return parts.join(' / ');
}

export function analyzeAppConfig(config: Pick<AppConfig, 'groups'>): ConfigDiagnostics {
  const groups = Array.isArray(config.groups) ? config.groups : [];
  const locatedGroups: LocatedEntity[] = [];
  const locatedDirectories: LocatedEntity[] = [];
  const locatedItems: LocatedEntity[] = [];

  for (const group of groups) {
    locatedGroups.push({ id: group.id, entityType: 'group', group });
    for (const directory of Array.isArray(group.directories) ? group.directories : []) {
      locatedDirectories.push({ id: directory.id, entityType: 'directory', group, directory });
      for (const item of Array.isArray(directory.items) ? directory.items : []) {
        locatedItems.push({ id: item.id, entityType: 'item', group, directory, item });
      }
    }
  }

  const directories = locatedDirectories.map((entry) => entry.directory!);
  const items = locatedItems.map((entry) => entry.item!);
  const notes = directories.filter((directory) => directory.kind === 'notes').length;
  const urls = items.filter((item) => item.type === 'url');
  const missingIcons = items.filter((item) => !item.icon?.trim()).length;
  const issues: DiagnosticIssue[] = [];

  const entitiesById = new Map<string, LocatedEntity[]>();
  for (const entity of [...locatedGroups, ...locatedDirectories, ...locatedItems]) {
    if (!entity.id) continue;
    const bucket = entitiesById.get(entity.id) ?? [];
    bucket.push(entity);
    entitiesById.set(entity.id, bucket);
  }
  const duplicateEntities = Array.from(entitiesById.entries()).filter(([, entries]) => entries.length > 1);
  if (duplicateEntities.length) {
    const entries = duplicateEntities.flatMap(([id, matches]) => matches.map((entity) => entryFromEntity(entity, `ID “${id}” 共出现 ${matches.length} 次`)));
    issues.push({
      severity: 'error',
      code: 'duplicate-id',
      title: '发现重复 ID',
      detail: `共 ${duplicateEntities.length} 组重复 ID。展开后可查看每个对象所在位置。`,
      count: duplicateEntities.length,
      entries,
    });
  }

  const emptyNameEntities = [...locatedGroups, ...locatedDirectories, ...locatedItems].filter((entity) => {
    if (entity.entityType === 'group') return !entity.group.name?.trim();
    if (entity.entityType === 'directory') return !entity.directory?.name?.trim();
    return !entity.item?.name?.trim();
  });
  if (emptyNameEntities.length) {
    issues.push({
      severity: 'warning',
      code: 'empty-name',
      title: '存在空名称',
      detail: `共 ${emptyNameEntities.length} 个对象没有名称。`,
      count: emptyNameEntities.length,
      entries: emptyNameEntities.map((entity) => entryFromEntity(entity, '名称为空')),
    });
  }

  const emptyPathEntities = locatedItems.filter((entity) => !entity.item?.path?.trim());
  if (emptyPathEntities.length) {
    issues.push({
      severity: 'error',
      code: 'empty-path',
      title: '存在空路径项目',
      detail: `共 ${emptyPathEntities.length} 个项目没有文件路径、网址或命令。`,
      count: emptyPathEntities.length,
      entries: emptyPathEntities.map((entity) => entryFromEntity(entity, '项目路径为空')),
    });
  }

  const invalidUrlEntities = locatedItems.filter((entity) => entity.item?.type === 'url' && !isValidWebUrl(entity.item.path));
  if (invalidUrlEntities.length) {
    issues.push({
      severity: 'warning',
      code: 'invalid-url',
      title: '存在格式异常的网址',
      detail: `共 ${invalidUrlEntities.length} 个网址无法识别为 http 或 https 地址。`,
      count: invalidUrlEntities.length,
      entries: invalidUrlEntities.map((entity) => entryFromEntity(entity, `异常网址：${entity.item?.path || '空'}`)),
    });
  }

  const pathGroups = new Map<string, LocatedEntity[]>();
  for (const entity of locatedItems) {
    const path = entity.item?.path?.trim().toLowerCase();
    if (!path) continue;
    const bucket = pathGroups.get(path) ?? [];
    bucket.push(entity);
    pathGroups.set(path, bucket);
  }
  const duplicatePaths = Array.from(pathGroups.entries()).filter(([, matches]) => matches.length > 1);
  if (duplicatePaths.length) {
    const entries = duplicatePaths.flatMap(([path, matches]) => matches.map((entity) => entryFromEntity(entity, `路径重复 ${matches.length} 次：${path}`)));
    issues.push({
      severity: 'info',
      code: 'duplicate-path',
      title: '发现重复项目路径',
      detail: `有 ${duplicatePaths.length} 组路径或网址被重复添加。`,
      count: duplicatePaths.length,
      entries,
    });
  }

  const missingIconEntities = locatedItems.filter((entity) => !entity.item?.icon?.trim());
  if (missingIconEntities.length) {
    issues.push({
      severity: 'info',
      code: 'missing-icon',
      title: '部分项目没有图标',
      detail: `共 ${missingIconEntities.length} 个项目缺少图标，可跳转后在空白处右键选择“刷新本页图标”。`,
      count: missingIconEntities.length,
      entries: missingIconEntities.map((entity) => entryFromEntity(entity, '缺少图标')),
    });
  }

  return {
    generatedAt: Date.now(),
    summary: {
      groups: groups.length,
      directories: directories.length,
      items: items.length,
      notes,
      urls: urls.length,
      missingIcons,
    },
    issues,
  };
}

export function formatConfigDiagnostics(result: ConfigDiagnostics) {
  const { summary } = result;
  const lines = [
    'Yue launcher 配置自检',
    `父目录：${summary.groups}`,
    `子目录：${summary.directories}`,
    `项目：${summary.items}`,
    `便签：${summary.notes}`,
    `网址：${summary.urls}`,
    `缺失图标：${summary.missingIcons}`,
    '',
    result.issues.length ? '发现的问题：' : '未发现明显配置问题。',
  ];
  result.issues.forEach((issue, index) => {
    lines.push(`${index + 1}. [${issue.severity}] ${issue.title}：${issue.detail}`);
    issue.entries.slice(0, 20).forEach((entry) => lines.push(`   - ${displayLocation(entry)}：${entry.message}${entry.path ? `（${entry.path}）` : ''}`));
    if (issue.entries.length > 20) lines.push(`   - 其余 ${issue.entries.length - 20} 项已省略`);
  });
  return lines.join('\n');
}
