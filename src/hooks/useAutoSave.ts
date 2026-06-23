import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../stores/appStore';

function joinPath(directory: string, fileName: string) {
  const dir = directory.trim().replace(/[\\/]+$/, '');
  const safeFile = (fileName.trim() || 'win-launcher-config-autosave.json').replace(/[\\/]/g, '_');
  const sep = dir.includes('\\') ? '\\' : '/';
  return `${dir}${sep}${safeFile}`;
}

export async function saveConfigToPath(path: string) {
  const config = useAppStore.getState().exportConfig();
  await invoke('save_config', { config: JSON.stringify(config, null, 2), path });
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
      saveConfigToPath(targetPath).catch((error) => {
        console.error('自动保存配置失败', error);
      });
    };

    saveOnce();
    const timer = window.setInterval(saveOnce, intervalMs);
    return () => window.clearInterval(timer);
  }, [autoSave.enabled, autoSave.directory, autoSave.fileName, autoSave.intervalMinutes]);
}
