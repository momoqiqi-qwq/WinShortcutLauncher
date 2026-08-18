import { invoke } from '@tauri-apps/api/core';
import type { AppConfig } from '../types';
import { adaptImportedConfig, parseImportedConfigText } from './importAdapters';

export function fileNameFromPath(path: string) {
  return path.split(/[\\/]/).filter(Boolean).pop() || path;
}

export function profileNameFromPath(path: string) {
  const fileName = fileNameFromPath(path).trim();
  const withoutKnownSuffix = fileName
    .replace(/\.jdb\.json\.js$/i, '')
    .replace(/\.(json|js|db)$/i, '')
    .trim();
  return withoutKnownSuffix || '导入配置';
}

export async function loadImportedConfigFromPath(path: string): Promise<AppConfig> {
  if (path.toLowerCase().endsWith('.db')) {
    const raw = await invoke<string>('import_legacy_db_config', { path });
    return adaptImportedConfig(JSON.parse(raw)) as AppConfig;
  }
  const raw = await invoke<string>('load_config', { path });
  return adaptImportedConfig(parseImportedConfigText(raw)) as AppConfig;
}
