import type { DragEvent } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { readTransferStationDrag } from '../TransferStation/TransferStationPanel';

export function transferStationFolderDropProps(item: { type?: string; path: string }) {
  const isFolderTarget = item.type === 'folder';
  return {
    onDragOver: (e: DragEvent) => {
      if (!isFolderTarget) return;
      const payload = readTransferStationDrag(e.dataTransfer);
      if (payload) {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = payload.action === 'move' ? 'move' : 'copy';
      }
    },
    onDrop: async (e: DragEvent) => {
      if (!isFolderTarget) return;
      const payload = readTransferStationDrag(e.dataTransfer);
      if (!payload) return;
      e.preventDefault();
      e.stopPropagation();
      await invoke('copy_transfer_paths_to_folder', {
        paths: payload.paths,
        folder: item.path,
        action: payload.action || 'copy',
      });
    },
  };
}
