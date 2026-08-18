type ResetCallback = () => void;

const activeResets = new Set<ResetCallback>();
let installed = false;
let pendingResetTimer: number | null = null;

function flushActiveResets() {
  pendingResetTimer = null;
  if (activeResets.size === 0) return;
  const callbacks = Array.from(activeResets);
  activeResets.clear();
  for (const callback of callbacks) callback();
}

function scheduleReset() {
  if (pendingResetTimer !== null) return;
  pendingResetTimer = window.setTimeout(flushActiveResets, 0);
}

function install() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('pointerup', scheduleReset, true);
  window.addEventListener('pointercancel', scheduleReset, true);
  window.addEventListener('mouseup', scheduleReset, true);
  window.addEventListener('blur', flushActiveResets, true);
}

export function trackActivePointerReset(callback: ResetCallback) {
  install();
  activeResets.add(callback);
  return () => activeResets.delete(callback);
}
