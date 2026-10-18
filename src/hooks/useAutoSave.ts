import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../stores/appStore';

function joinPath(directory: string, fileName: string) {
  const dir = directory.trim().replace(/[\\/]+$/, '');
  const safeFile = (fileName.trim() || 'win-launcher-config-autosave.json').replace(/[\\/]/g, '_');
  const sep = dir.includes('\\') ? '\\' : '/';
  return `${dir}${sep}${safeFile}`;
}

// v162: 记住每个路径上一次成功写入的内容。自动保存时内容没变就不再写盘，
// 避免每隔几分钟把同样的配置原样重写一遍（同步盘会因此反复上传）。
// 每次启动后的第一次自动保存仍会写，保证文件存在且是最新的。
const lastSavedByPath = new Map<string, string>();

export async function saveConfigToPath(path: string, options: { skipIfUnchanged?: boolean } = {}) {
  const config = useAppStore.getState().exportConfig();
  const serialized = JSON.stringify(config, null, 2);
  if (options.skipIfUnchanged && lastSavedByPath.get(path) === serialized) return false;
  await invoke('save_config', { config: serialized, path });
  lastSavedByPath.set(path, serialized);
  return true;
}

export function getAutoSaveTargetPath(directory: string, fileName: string) {
  if (!directory.trim()) return '';
  return joinPath(directory, fileName);
}

export function useAutoSave() {
  const autoSave = useAppStore((state) => state.autoSave);

  useEffect(() => {
    if (!autoSave.enabled || !autoSave.directory.trim()) return;
    const intervalMs = Math.max(1, autoSave.intervalMinutes) * 60 * 1000;
    const targetPath = getAutoSaveTargetPath(autoSave.directory, autoSave.fileName);

    const saveOnce = () => {
      saveConfigToPath(targetPath, { skipIfUnchanged: true }).catch((error) => {
        console.error('自动保存配置失败', error);
      });
    };

    saveOnce();
    const timer = window.setInterval(saveOnce, intervalMs);
    return () => window.clearInterval(timer);
  }, [autoSave.enabled, autoSave.directory, autoSave.fileName, autoSave.intervalMinutes]);
}
