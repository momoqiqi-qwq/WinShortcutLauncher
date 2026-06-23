import type { MouseEvent } from 'react';
import { useCallback } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

const NO_DRAG_SELECTOR = [
  'button',
  'input',
  'select',
  'textarea',
  'a',
  '[role="button"]',
  '[data-no-drag]',
  '.item-card',
  '.top-tab',
  '.side-tab',
  '.menu-surface',
  '.modal-backdrop',
  '.modal-card',
  '.icon-button',
  '.settings-panel',
  '.global-search-backdrop',
  '.global-search-modal',
  '.transfer-station-panel',
  '.station-item'
].join(',');

export function useWindowDrag() {
  return useCallback((event: MouseEvent<HTMLElement>) => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    if (!target || target.closest(NO_DRAG_SELECTOR)) return;
    getCurrentWindow().startDragging().catch((error) => console.warn('start dragging failed', error));
  }, []);
}
