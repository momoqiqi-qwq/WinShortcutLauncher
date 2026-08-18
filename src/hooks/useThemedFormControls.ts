import { useEffect } from 'react';

function updateRangeProgress(input: HTMLInputElement) {
  if (input.type !== 'range') return;
  const min = Number.isFinite(Number(input.min)) ? Number(input.min) : 0;
  const max = Number.isFinite(Number(input.max)) ? Number(input.max) : 100;
  const value = Number(input.value);
  const span = max - min;
  const progress = span > 0 && Number.isFinite(value)
    ? Math.max(0, Math.min(100, ((value - min) / span) * 100))
    : 0;
  input.style.setProperty('--range-progress', `${progress}%`);
}

function updateRangesInside(root: ParentNode) {
  if (root instanceof HTMLInputElement) updateRangeProgress(root);
  root.querySelectorAll?.('input[type="range"]').forEach((element) => {
    if (element instanceof HTMLInputElement) updateRangeProgress(element);
  });
}

/** Keeps themed range progress fills in sync for controls mounted in floating panels. */
export function useThemedFormControls() {
  useEffect(() => {
    updateRangesInside(document);

    const handleValueChange = (event: Event) => {
      if (event.target instanceof HTMLInputElement) updateRangeProgress(event.target);
    };
    const refreshAfterAction = () => window.requestAnimationFrame(() => updateRangesInside(document));
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => mutation.addedNodes.forEach((node) => {
        if (node instanceof HTMLElement) updateRangesInside(node);
      }));
    });

    document.addEventListener('input', handleValueChange, true);
    document.addEventListener('change', handleValueChange, true);
    document.addEventListener('click', refreshAfterAction, true);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      document.removeEventListener('input', handleValueChange, true);
      document.removeEventListener('change', handleValueChange, true);
      document.removeEventListener('click', refreshAfterAction, true);
      observer.disconnect();
    };
  }, []);
}
