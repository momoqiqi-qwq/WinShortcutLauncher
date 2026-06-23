import { useEffect, useRef } from 'react';
import { PhysicalPosition } from '@tauri-apps/api/dpi';
import { currentMonitor, getCurrentWindow } from '@tauri-apps/api/window';

const BOUNCE_DURATION_MS = 160;

type Point = { x: number; y: number };

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

function raf() {
  return new Promise<number>((resolve) => window.requestAnimationFrame(resolve));
}

async function animateWindowPosition(from: Point, to: Point, duration = BOUNCE_DURATION_MS) {
  const appWindow = getCurrentWindow();
  const start = performance.now();
  let lastX = Number.NaN;
  let lastY = Number.NaN;

  while (true) {
    const now = await raf();
    const progress = Math.min(1, (now - start) / duration);
    const eased = easeOutCubic(progress);
    const x = Math.round(from.x + (to.x - from.x) * eased);
    const y = Math.round(from.y + (to.y - from.y) * eased);

    if (x !== lastX || y !== lastY) {
      lastX = x;
      lastY = y;
      await appWindow.setPosition(new PhysicalPosition(x, y));
    }

    if (progress >= 1) break;
  }
}

export function useWindowBoundsGuard(enabled: boolean) {
  const animatingRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    async function onMouseUp() {
      // 贴边隐藏由 Rust 原生控制时，不做边界弹回，避免和贴边动画互相抢位置。
      const dockMode = document.documentElement.dataset.edgeDockMode;
      if (dockMode && dockMode !== 'disabled') return;
      if (animatingRef.current) return;

      try {
        const appWindow = getCurrentWindow();
        const [position, size, monitor] = await Promise.all([
          appWindow.outerPosition(),
          appWindow.outerSize(),
          currentMonitor(),
        ]);
        if (!monitor) return;

        const minX = monitor.position.x;
        const minY = monitor.position.y;
        const maxX = monitor.position.x + monitor.size.width;
        const maxY = monitor.position.y + monitor.size.height;

        let targetX = position.x;
        let targetY = position.y;

        if (size.width >= monitor.size.width) targetX = minX;
        else if (position.x < minX) targetX = minX;
        else if (position.x + size.width > maxX) targetX = maxX - size.width;

        if (size.height >= monitor.size.height) targetY = minY;
        else if (position.y < minY) targetY = minY;
        else if (position.y + size.height > maxY) targetY = maxY - size.height;

        // 必须同时满足两个条件才弹回：鼠标已松开 + 窗口确实超出屏幕边界。
        if (targetX === position.x && targetY === position.y) return;

        animatingRef.current = true;
        await animateWindowPosition(position, { x: targetX, y: targetY });
      } catch (error) {
        console.warn('bounds guard failed', error);
      } finally {
        animatingRef.current = false;
      }
    }

    window.addEventListener('mouseup', onMouseUp);
    return () => window.removeEventListener('mouseup', onMouseUp);
  }, [enabled]);
}
