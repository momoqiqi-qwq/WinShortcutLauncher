import { useMemo } from 'react';
import { useAppStore } from '../../stores/appStore';
import { createShortcutItemsFromPaths } from '../../lib/createShortcutItems';
import type { TransferItem } from '../../types';
import type { TransferStationItem } from '../../utils/v16Types';
import { TransferStationPanel } from './TransferStationPanel';
import './TransferStation.css';

interface TransferStationProps {
  open: boolean;
  onClose: () => void;
}

function toStationItem(item: TransferItem): TransferStationItem {
  return {
    id: item.id,
    name: item.name,
    path: item.path,
    icon: item.icon,
    kind: item.type === 'folder' ? 'folder' : item.type === 'file' ? 'file' : 'unknown',
    addedAt: item.createdAt
  };
}

function fromStationItem(item: TransferStationItem): TransferItem {
  return {
    id: item.id,
    name: item.name,
    path: item.path,
    icon: item.icon,
    type: item.kind === 'folder' ? 'folder' : 'file',
    createdAt: item.addedAt
  };
}

export function TransferStation({ open, onClose }: TransferStationProps) {
  const transferItems = useAppStore((state) => state.transferItems);
  const setTransferItems = useAppStore((state) => state.setTransferItems);
  const settings = useAppStore((state) => state.transferStation);
  const activeGroupId = useAppStore((state) => state.activeGroupId);
  const activeDirectory = useAppStore((state) => state.getActiveDirectory());
  const activeGroup = useAppStore((state) => state.getActiveGroup());
  const addItems = useAppStore((state) => state.addItems);

  const targetDirectoryId = useMemo(() => {
    if (!activeDirectory || (activeDirectory.kind ?? 'normal') === 'normal') return activeDirectory?.id;
    return activeGroup?.directories.find((dir) => (dir.kind ?? 'normal') === 'normal')?.id;
  }, [activeDirectory, activeGroup]);

  const stationItems = useMemo(() => transferItems.map(toStationItem), [transferItems]);

  async function addPathsToCurrentDirectory(paths: string[]) {
    if (!targetDirectoryId || !paths.length) return;
    const shortcuts = await createShortcutItemsFromPaths(paths);
    addItems(activeGroupId, targetDirectoryId, shortcuts);
  }

  return (
    <TransferStationPanel
      openPanel={open}
      items={stationItems}
      settings={settings}
      onClose={onClose}
      onChange={(items) => setTransferItems(items.map(fromStationItem))}
      onAddToCurrentDirectory={addPathsToCurrentDirectory}
    />
  );
}
