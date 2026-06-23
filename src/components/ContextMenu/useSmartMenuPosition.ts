import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';

interface Position {
  left: number;
  top: number;
  ready: boolean;
  submenuSide: 'left' | 'right';
}

function getUiScale() {
  const fromWindow = (window as unknown as { __launcherUiScale?: number; __launcherMainScale?: number }).__launcherMainScale ?? (window as unknown as { __launcherUiScale?: number }).__launcherUiScale;
  if (typeof fromWindow === 'number' && Number.isFinite(fromWindow) && fromWindow > 0) return fromWindow;
  const cssValue = getComputedStyle(document.documentElement).getPropertyValue('--main-ui-scale') || getComputedStyle(document.documentElement).getPropertyValue('--ui-scale');
  const parsed = Number(cssValue.trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function clamp(value: number, min: number, max: number) {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}

function getViewportSize(scale: number) {
  const rawWidth = Math.min(
    window.innerWidth || Number.POSITIVE_INFINITY,
    document.documentElement.clientWidth || Number.POSITIVE_INFINITY
  );
  const rawHeight = Math.min(
    window.innerHeight || Number.POSITIVE_INFINITY,
    document.documentElement.clientHeight || Number.POSITIVE_INFINITY
  );
  return {
    width: (Number.isFinite(rawWidth) ? rawWidth : window.innerWidth) / scale,
    height: (Number.isFinite(rawHeight) ? rawHeight : window.innerHeight) / scale
  };
}

export function useSmartMenuPosition(x: number, y: number, margin = 8, estimatedSubmenuWidth = 280) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<Position>({ left: x, top: y, ready: false, submenuSide: 'right' });

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const menuElement = element;

    function updatePosition() {
      const scale = getUiScale();
      const rect = menuElement.getBoundingClientRect();
      const measuredWidth = rect.width > 0 ? rect.width : menuElement.offsetWidth;
      const measuredHeight = rect.height > 0 ? rect.height : menuElement.offsetHeight;
      const menuWidth = Math.max(1, measuredWidth / scale);
      const menuHeight = Math.max(1, measuredHeight / scale);
      const viewport = getViewportSize(scale);
      const sx = x / scale;
      const sy = y / scale;
      const pointerGap = 2;

      const canOpenRight = sx + pointerGap + menuWidth + margin <= viewport.width;
      const canOpenLeft = sx - pointerGap - menuWidth >= margin;
      const canOpenDown = sy + pointerGap + menuHeight + margin <= viewport.height;
      const canOpenUp = sy - pointerGap - menuHeight >= margin;

      let left = canOpenRight || !canOpenLeft ? sx + pointerGap : sx - pointerGap - menuWidth;
      let top = canOpenDown || !canOpenUp ? sy + pointerGap : sy - pointerGap - menuHeight;

      left = clamp(left, margin, viewport.width - menuWidth - margin);
      top = clamp(top, margin, viewport.height - menuHeight - margin);

      const hasSpaceRight = left + menuWidth + estimatedSubmenuWidth + margin <= viewport.width;
      const hasSpaceLeft = left - estimatedSubmenuWidth - margin >= margin;
      const submenuSide = !hasSpaceRight && hasSpaceLeft ? 'left' : 'right';

      setPosition({ left, top, ready: true, submenuSide });
    }

    updatePosition();
    window.addEventListener('resize', updatePosition);
    return () => window.removeEventListener('resize', updatePosition);
  }, [x, y, margin, estimatedSubmenuWidth]);

  const style: CSSProperties = {
    left: position.left,
    top: position.top,
    opacity: position.ready ? 1 : 0
  };

  const submenuClassName = position.submenuSide === 'left' ? 'submenu-open-left' : 'submenu-open-right';

  return { ref, style, submenuClassName, submenuSide: position.submenuSide };
}
