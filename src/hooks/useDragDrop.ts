import { useEffect, useState } from 'react';
import { getCurrentWebview } from '@tauri-apps/api/webview';

export function useDragDrop(onDropPaths: (paths: string[]) => void, enabled = true) {
  const [dragHover, setDragHover] = useState(false);

  useEffect(() => {
    let cleanup: (() => void) | undefined;

    getCurrentWebview()
      .onDragDropEvent((event) => {
        if (!enabled) {
          setDragHover(false);
          return;
        }
        const payload = event.payload;
        if (payload.type === 'enter' || payload.type === 'over') {
          setDragHover(true);
        }
        if (payload.type === 'leave') {
          setDragHover(false);
        }
        if (payload.type === 'drop') {
          setDragHover(false);
          onDropPaths(payload.paths ?? []);
        }
      })
      .then((unlisten) => {
        cleanup = unlisten;
      })
      .catch((error) => console.error('Drag drop listener failed', error));

    return () => cleanup?.();
  }, [onDropPaths, enabled]);

  return { dragHover };
}
