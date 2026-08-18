import type { Directory } from '../types';

export function getUniqueDirectoryName(existingNames: readonly string[], requestedName: string) {
  const base = requestedName.trim() || '新目录';
  const normalizedNames = new Set(existingNames.map((name) => name.trim().toLocaleLowerCase('zh-CN')));
  if (!normalizedNames.has(base.toLocaleLowerCase('zh-CN'))) return base;

  let index = 2;
  while (normalizedNames.has(`${base} ${index}`.toLocaleLowerCase('zh-CN'))) index += 1;
  return `${base} ${index}`;
}

export function getDirectoryDisplayCount(directory: Directory, siblingDirectories: readonly Directory[]) {
  const kind = directory.kind ?? 'normal';
  if (kind === 'all') {
    return siblingDirectories
      .filter((entry) => (entry.kind ?? 'normal') === 'normal')
      .reduce((sum, entry) => sum + entry.items.length, 0);
  }
  if (kind === 'notes') {
    const note = directory.note ?? '';
    return note ? note.split('\n').length : 0;
  }
  return directory.items.length;
}
