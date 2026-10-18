import { beforeEach, describe, expect, it, vi } from 'vitest';

const invokeMock = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));

import { saveConfigToPath } from '../../hooks/useAutoSave';
import { useAppStore } from '../../stores/appStore';

describe('v162 auto save skips unchanged config', () => {
  beforeEach(() => {
    invokeMock.mockClear();
  });

  it('writes once, then skips while the exported config is unchanged', async () => {
    const path = 'C:\\autosave-test\\a.json';
    await expect(saveConfigToPath(path, { skipIfUnchanged: true })).resolves.toBe(true);
    await expect(saveConfigToPath(path, { skipIfUnchanged: true })).resolves.toBe(false);
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith('save_config', expect.objectContaining({ path }));
  });

  it('writes again after the config changes', async () => {
    const path = 'C:\\autosave-test\\b.json';
    await saveConfigToPath(path, { skipIfUnchanged: true });
    const before = useAppStore.getState().display;
    useAppStore.setState({ display: { ...before, iconParallelTasks: (before.iconParallelTasks ?? 6) + 1 } });
    try {
      await expect(saveConfigToPath(path, { skipIfUnchanged: true })).resolves.toBe(true);
      expect(invokeMock).toHaveBeenCalledTimes(2);
    } finally {
      useAppStore.setState({ display: before });
    }
  });

  it('manual save always writes, even when nothing changed', async () => {
    const path = 'C:\\autosave-test\\c.json';
    await saveConfigToPath(path);
    await saveConfigToPath(path);
    expect(invokeMock).toHaveBeenCalledTimes(2);
  });
});
