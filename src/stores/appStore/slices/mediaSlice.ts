import { makeId } from '../../../lib/id';
import type { AppSliceCreator, MediaActions } from '../types';

export const createMediaSlice: AppSliceCreator<MediaActions> = (set) => ({
  setImageBrowserItems: (items) => set({ imageBrowserItems: items }),
  addImageBrowserItems: (items) => set((state) => {
    const exists = new Set((state.imageBrowserItems ?? []).map((item) => item.path.toLowerCase()));
    const next = [...(state.imageBrowserItems ?? [])];
    for (const item of items) {
      if (!item.path || exists.has(item.path.toLowerCase())) continue;
      next.push(item);
      exists.add(item.path.toLowerCase());
    }
    return { imageBrowserItems: next };
  }),
  removeImageBrowserItem: (itemId) => set((state) => ({
    imageBrowserItems: (state.imageBrowserItems ?? []).filter((item) => item.id !== itemId),
  })),
  clearImageBrowserItems: () => set({ imageBrowserItems: [] }),
  addTransferItems: (items) => set((state) => ({
    transferItems: [
      ...state.transferItems,
      ...items.map((item) => ({ ...item, id: makeId('transfer'), createdAt: Date.now() })),
    ],
  })),
  setTransferItems: (items) => set({ transferItems: items }),
  removeTransferItem: (itemId) => set((state) => ({
    transferItems: state.transferItems.filter((item) => item.id !== itemId),
  })),
  clearTransferItems: () => set({ transferItems: [] }),
});
