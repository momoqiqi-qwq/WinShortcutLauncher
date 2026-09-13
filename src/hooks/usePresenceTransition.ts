import { useEffect, useState } from 'react';

/** Keeps an overlay mounted briefly after it closes so its exit animation can finish. */
export function usePresenceTransition(open: boolean, exitDurationMs: number) {
  const [rendered, setRendered] = useState(open);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (open) {
      setRendered(true);
      setClosing(false);
      return;
    }
    if (!rendered) return;

    setClosing(true);
    const timer = window.setTimeout(() => {
      setRendered(false);
      setClosing(false);
    }, Math.max(0, exitDurationMs));
    return () => window.clearTimeout(timer);
  }, [exitDurationMs, open, rendered]);

  return { rendered, closing };
}
