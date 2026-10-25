import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

/** 后端 `exe_pick.rs` 探测到的目标程序。 */
export interface ExePickTarget {
  /** 进程可执行文件的完整路径。 */
  path: string;
  /** 程序名（exe 文件名去掉扩展名）。 */
  name: string;
  /** 窗口标题，用来让用户确认「拾到的是那个窗口」。 */
  title: string;
}

export type ExePickStatus = 'picked' | 'cancelled' | 'timeout' | 'failed';

export interface ExePickResult {
  status: ExePickStatus;
  target?: ExePickTarget;
  message?: string;
}

/**
 * 后端探测上限是 120 秒；这里再兜一层，万一结束事件没送到也别让对话框永远转圈。
 */
const PICK_TIMEOUT_MS = 150_000;

/**
 * 开始一次「拖动拾取程序」。
 *
 * 主窗口会先隐藏；用户把光标移到目标程序上点一下左键（或按住拖到目标上再松开）即确认，
 * Esc 取消。函数返回时主窗口已经恢复。
 */
export async function startExePick(): Promise<ExePickResult> {
  // 先挂监听再开始探测：探测线程可能在 invoke 返回之后极快地结束，事件不能漏。
  let settle: ((value: ExePickResult) => void) | null = null;
  const ended = new Promise<ExePickResult>((resolve) => {
    settle = resolve;
  });
  const unlisten: UnlistenFn = await listen<ExePickResult>('exe-pick-end', (event) => {
    settle?.(event.payload);
    settle = null;
  });

  try {
    await invoke('start_exe_pick');
    return await withTimeout(ended, PICK_TIMEOUT_MS);
  } catch (error) {
    return { status: 'failed', message: String(error) };
  } finally {
    await unlisten();
  }
}

/** 取消拾取：会让后端收摊并恢复主窗口。 */
export async function cancelExePick(): Promise<void> {
  await invoke('stop_exe_pick').catch(() => {});
}

function withTimeout(promise: Promise<ExePickResult>, ms: number): Promise<ExePickResult> {
  return new Promise<ExePickResult>((resolve) => {
    const timer = window.setTimeout(() => {
      void cancelExePick();
      resolve({ status: 'timeout', message: '拾取等待超时，已结束' });
    }, ms);
    void promise.then((value) => {
      window.clearTimeout(timer);
      resolve(value);
    });
  });
}
