export function showLauncherNotice(message: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('launcher-show-notice', { detail: message }));
}
