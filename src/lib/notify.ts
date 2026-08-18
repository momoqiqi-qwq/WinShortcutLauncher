export interface LauncherNoticeDetail {
  message: string;
  durationMs?: number;
}

export function showLauncherNotice(message: string, options: Omit<LauncherNoticeDetail, 'message'> = {}) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<LauncherNoticeDetail>('launcher-show-notice', {
    detail: { message, ...options }
  }));
}
