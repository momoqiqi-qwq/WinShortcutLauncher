import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../../stores/appStore';
import type { ShortcutItem } from '../../types';
import { GlobalSearchModal } from './GlobalSearchModal';
import { uiAlert } from '../../lib/uiDialog';

interface GlobalSearchProps {
  open: boolean;
  onClose: () => void;
}

export function GlobalSearch({ open, onClose }: GlobalSearchProps) {
  const groups = useAppStore((state) => state.groups);
  const settings = useAppStore((state) => state.globalSearch);
  const setActiveGroup = useAppStore((state) => state.setActiveGroup);
  const setActiveDirectory = useAppStore((state) => state.setActiveDirectory);
  const selectItem = useAppStore((state) => state.selectItem);

  async function openItem(item: ShortcutItem) {
    try {
      await invoke('launch_item', { path: item.path, asAdmin: false });
    } catch (error) {
      void uiAlert(`启动失败：${String(error)}`);
    }
  }

  return (
    <GlobalSearchModal
      open={open}
      groups={groups}
      settings={settings}
      onClose={onClose}
      onLocate={(groupId, directoryId, itemId) => {
        setActiveGroup(groupId);
        setActiveDirectory(directoryId);
        if (itemId) selectItem(itemId, false);
      }}
      onOpenItem={(item) => openItem(item as ShortcutItem)}
    />
  );
}
