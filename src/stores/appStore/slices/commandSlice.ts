import { normalizeCommandUsage } from '../../../lib/commandUsage';
import type { AppSliceCreator, CommandUsageSlice } from '../types';

export const createCommandSlice: AppSliceCreator<CommandUsageSlice> = (set) => ({
  commandUsage: {},
  recordCommandUsage: (commandKey) => set((state) => ({
    commandUsage: normalizeCommandUsage({
      ...state.commandUsage,
      [commandKey]: {
        count: (state.commandUsage[commandKey]?.count ?? 0) + 1,
        lastUsedAt: Date.now(),
      },
    }),
  })),
  clearCommandUsage: () => set({ commandUsage: {} }),
});
