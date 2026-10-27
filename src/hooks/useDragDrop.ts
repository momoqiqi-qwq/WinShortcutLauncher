import { useEffect, useState } from 'react';
import { getCurrentWebview } from '@tauri-apps/api/webview';

/** v175: 原生拖拽落点的物理坐标 —— 用来判断「松手时鼠标压在哪个子目录上」。 */
export interface DragDropPoint {
  x: number;
  y: number;
}

export function useDragDrop(
  onDropPaths: (paths: string[], point?: DragDropPoint) => void,
  enabled = true,
) {
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
          const position = (payload as { position?: { x: number; y: number } }).position;
          onDropPaths(
            payload.paths ?? [],
            position ? { x: position.x, y: position.y } : undefined,
          );
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
