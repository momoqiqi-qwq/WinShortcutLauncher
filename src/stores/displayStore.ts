import { useAppStore } from './appStore';
import { useShallow } from 'zustand/react/shallow';

export function useDisplaySettings() {
  return useAppStore((state) => state.display);
}

export function useDisplayActions() {
  return useAppStore(useShallow((state) => ({
    updateDisplay: state.updateDisplay,
    setItemLabelLines: state.setItemLabelLines,
    applyDisplayToAllItems: state.applyDisplayToAllItems
  })));
}
