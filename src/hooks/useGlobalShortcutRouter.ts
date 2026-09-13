import { useEffect } from 'react';
import { useAppStore } from '../stores/appStore';
import { shortcutMatchesEvent } from '../lib/keyboardShortcuts';
import { showLauncherNotice } from '../lib/notify';
import { uiConfirm } from '../lib/uiDialog';

type GlobalShortcutRouterOptions = {
  closeTopOverlay: () => boolean;
  openGlobalSearch: () => void;
  openTransferStation: () => void;
  openImageBrowser: () => void;
  openSettings: () => void;
};

export function useGlobalShortcutRouter({
  closeTopOverlay,
  openGlobalSearch,
  openTransferStation,
  openImageBrowser,
  openSettings,
}: GlobalShortcutRouterOptions) {
  useEffect(() => {
    function isEditableTarget(target: EventTarget | null) {
      const element = target as HTMLElement | null;
      if (!element) return false;
      return Boolean(element.closest('input, textarea, select, [contenteditable="true"], .edit-dialog, .modal-card, .menu-surface'));
    }

    function visibleItemIds() {
      const state = useAppStore.getState();
      const activeDirectory = state.getActiveDirectory();
      const activeGroup = state.getActiveGroup();
      if (!activeDirectory) return [];
      if ((activeDirectory.kind ?? 'normal') === 'all') {
        return (activeGroup?.directories ?? [])
          .filter((dir) => (dir.kind ?? 'normal') === 'normal')
          .flatMap((dir) => dir.items.map((item) => item.id));
      }
      if ((activeDirectory.kind ?? 'normal') !== 'normal') return [];
      return activeDirectory.items.map((item) => item.id);
    }

    async function handleKeyDown(event: KeyboardEvent) {
      const state = useAppStore.getState();
      const shortcuts = state.shortcuts;

      if (shortcutMatchesEvent(shortcuts.closeOverlay, event) && closeTopOverlay()) {
        event.preventDefault();
        return;
      }
      if (isEditableTarget(event.target)) return;
      if (state.multiSelectMode && shortcutMatchesEvent(shortcuts.closeOverlay, event)) {
        event.preventDefault();
        state.finishMultiSelect();
        return;
      }

      if (event.ctrlKey && !event.altKey && !event.shiftKey && event.code === 'KeyC') {
        if (state.selectedItemIds.length > 0) {
          event.preventDefault();
          const count = state.copyItemsToClipboard(state.selectedItemIds);
          if (count > 0) showLauncherNotice(`已复制 ${count} 个项目`);
          return;
        }
        if (state.selectedNavTarget?.kind === 'directory') {
          event.preventDefault();
          const directory = state.groups.flatMap((group) => group.directories).find((entry) => entry.id === state.selectedNavTarget?.id);
          if (directory && state.copyDirectoryToClipboard(directory.id)) showLauncherNotice(`已复制子目录「${directory.name}」`);
          return;
        }
        if (state.selectedNavTarget?.kind === 'group') {
          event.preventDefault();
          const group = state.groups.find((entry) => entry.id === state.selectedNavTarget?.id);
          if (group && state.copyGroupToClipboard(group.id)) showLauncherNotice(`已复制父目录「${group.name}」`);
          return;
        }
      }
      if (event.ctrlKey && !event.altKey && !event.shiftKey && event.code === 'KeyV') {
        if (state.navigationClipboard?.kind === 'group') {
          event.preventDefault();
          const pastedId = state.pasteGroupFromClipboard();
          const pasted = pastedId ? useAppStore.getState().groups.find((group) => group.id === pastedId) : undefined;
          if (pasted) showLauncherNotice(`已粘贴父目录「${pasted.name}」`);
          return;
        }
        if (state.navigationClipboard?.kind === 'directory') {
          event.preventDefault();
          const selectedGroupId = state.selectedNavTarget?.kind === 'group'
            ? state.selectedNavTarget.id
            : state.selectedNavTarget?.kind === 'directory'
              ? state.groups.find((group) => group.directories.some((directory) => directory.id === state.selectedNavTarget?.id))?.id
              : undefined;
          const targetGroup = state.groups.find((group) => group.id === selectedGroupId) ?? state.getActiveGroup();
          const pastedId = targetGroup ? state.pasteDirectoryToGroup(targetGroup.id) : null;
          const pasted = pastedId
            ? useAppStore.getState().groups.find((group) => group.id === targetGroup?.id)?.directories.find((directory) => directory.id === pastedId)
            : undefined;
          if (pasted && targetGroup) showLauncherNotice(`已粘贴子目录到「${targetGroup.name}」：${pasted.name}`);
          else if (targetGroup && (state.navigationClipboard.directory.kind ?? 'normal') === 'all') showLauncherNotice(`「${targetGroup.name}」已经有“全部”子目录，不能重复粘贴`);
          return;
        }
        if (state.itemClipboard.length > 0) {
          const activeDirectory = state.getActiveDirectory();
          const activeGroup = state.getActiveGroup();
          const target = (activeDirectory?.kind ?? 'normal') === 'normal'
            ? activeDirectory
            : activeGroup?.directories.find((directory) => (directory.kind ?? 'normal') === 'normal');
          if (target) {
            event.preventDefault();
            const count = state.pasteItemsToDirectory(target.id);
            if (count > 0) showLauncherNotice(`已粘贴 ${count} 个项目到「${target.name}」`);
          }
          return;
        }
      }

      if (shortcutMatchesEvent(shortcuts.openSettings, event)) {
        event.preventDefault();
        openSettings();
        return;
      }
      if (shortcutMatchesEvent(shortcuts.openGlobalSearch, event)) {
        event.preventDefault();
        openGlobalSearch();
        return;
      }
      if (shortcutMatchesEvent(shortcuts.openTransferStation, event)) {
        event.preventDefault();
        openTransferStation();
        return;
      }
      if (shortcutMatchesEvent(shortcuts.openImageBrowser, event)) {
        event.preventDefault();
        openImageBrowser();
        return;
      }
      if (shortcutMatchesEvent(shortcuts.toggleAlwaysOnTop, event)) {
        event.preventDefault();
        state.updateBehavior({ alwaysOnTop: !state.behavior.alwaysOnTop });
        return;
      }
      if (shortcutMatchesEvent(shortcuts.selectAllItems, event)) {
        const ids = visibleItemIds();
        if (ids.length) {
          event.preventDefault();
          state.selectItems(ids);
          state.beginMultiSelect();
        }
        return;
      }
      if (!shortcutMatchesEvent(shortcuts.deleteSelection, event)) return;

      if (state.selectedItemIds.length > 0) {
        event.preventDefault();
        if (!state.experience.confirmDeleteItems || await uiConfirm(`确定删除选中的 ${state.selectedItemIds.length} 个项目吗？`)) {
          state.deleteSelectedItems();
        }
        return;
      }

      const selectedNavTarget = state.selectedNavTarget;
      if (selectedNavTarget?.kind === 'group') {
        const group = state.groups.find((entry) => entry.id === selectedNavTarget.id);
        if (group && state.groups.length > 1) {
          event.preventDefault();
          if (!state.experience.confirmDeleteNavigation || await uiConfirm(`确定删除父目录「${group.name}」及其中所有子目录吗？`)) {
            state.deleteGroup(group.id);
          }
        }
        return;
      }

      if (selectedNavTarget?.kind === 'directory') {
        const parentGroup = state.groups.find((entry) => entry.directories.some((dir) => dir.id === selectedNavTarget.id));
        const directory = parentGroup?.directories.find((dir) => dir.id === selectedNavTarget.id);
        if (directory && parentGroup && parentGroup.directories.length > 1) {
          event.preventDefault();
          if (!state.experience.confirmDeleteNavigation || await uiConfirm(`确定删除子目录「${directory.name}」吗？`)) {
            state.deleteDirectory(directory.id);
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeTopOverlay, openGlobalSearch, openTransferStation, openImageBrowser, openSettings]);
}
