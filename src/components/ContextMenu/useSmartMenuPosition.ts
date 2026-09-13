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

function getRawViewportSize() {
  const rawWidth = Math.min(
    window.innerWidth || Number.POSITIVE_INFINITY,
    document.documentElement.clientWidth || Number.POSITIVE_INFINITY
  );
  const rawHeight = Math.min(
    window.innerHeight || Number.POSITIVE_INFINITY,
    document.documentElement.clientHeight || Number.POSITIVE_INFINITY
  );
  return {
    width: Number.isFinite(rawWidth) ? rawWidth : window.innerWidth,
    height: Number.isFinite(rawHeight) ? rawHeight : window.innerHeight,
  };
}

function getViewportSize(scale: number) {
  const raw = getRawViewportSize();
  return { width: raw.width / scale, height: raw.height / scale };
}

/**
 * Submenus normally stay aligned to the hovered row and therefore expand downward.
 * Only when their rendered bottom would leave the viewport do we translate the whole
 * submenu upward by the minimum required amount. This avoids clipping the last rows
 * while preserving the user's spatial relationship with the parent menu item.
 */
function fitVisibleSubmenus(menuElement: HTMLDivElement, margin: number) {
  const scale = getUiScale();
  const viewport = getRawViewportSize();
  const marginPx = margin * scale;
  const submenus = menuElement.querySelectorAll<HTMLElement>('.text-submenu, .directory-submenu');
  const maxSubmenuHeight = Math.max(80, (viewport.height - marginPx * 2) / scale);

  submenus.forEach((submenu) => {
    submenu.style.maxHeight = `${maxSubmenuHeight}px`;
    submenu.style.overflowY = 'auto';
    submenu.style.setProperty('--submenu-shift-y', '0px');
    const rect = submenu.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const overflowBottom = rect.bottom - (viewport.height - marginPx);
    if (overflowBottom <= 0) return;

    const desiredShift = -overflowBottom / scale;
    const highestAllowedShift = (marginPx - rect.top) / scale;
    const shift = Math.max(desiredShift, highestAllowedShift);
    submenu.style.setProperty('--submenu-shift-y', `${shift}px`);
  });
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
      const viewport = getViewportSize(scale);
      const rect = menuElement.getBoundingClientRect();
      const measuredWidth = rect.width > 0 ? rect.width : menuElement.offsetWidth;
      const measuredHeight = rect.height > 0 ? rect.height : menuElement.offsetHeight;
      const menuWidth = Math.max(1, measuredWidth / scale);
      const menuHeight = Math.max(1, measuredHeight / scale);
      const sx = x / scale;
      const sy = y / scale;
      const pointerGap = 2;

      const canOpenRight = sx + pointerGap + menuWidth + margin <= viewport.width;
      const canOpenLeft = sx - pointerGap - menuWidth >= margin;

      let left = canOpenRight || !canOpenLeft ? sx + pointerGap : sx - pointerGap - menuWidth;
      // Always prefer opening downward. If it would cross the bottom edge, shift the
      // entire menu upward just enough to fit instead of flipping it above the pointer.
      let top = sy + pointerGap;

      left = clamp(left, margin, viewport.width - menuWidth - margin);
      top = clamp(top, margin, viewport.height - menuHeight - margin);

      const hasSpaceRight = left + menuWidth + estimatedSubmenuWidth + margin <= viewport.width;
      const hasSpaceLeft = left - estimatedSubmenuWidth - margin >= margin;
      const submenuSide = !hasSpaceRight && hasSpaceLeft ? 'left' : 'right';

      setPosition({ left, top, ready: true, submenuSide });
      window.requestAnimationFrame(() => fitVisibleSubmenus(menuElement, margin));
    }

    updatePosition();
    const observer = new MutationObserver(() => {
      window.requestAnimationFrame(() => fitVisibleSubmenus(menuElement, margin));
    });
    observer.observe(menuElement, { childList: true, subtree: true });
    window.addEventListener('resize', updatePosition);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updatePosition);
    };
  }, [x, y, margin, estimatedSubmenuWidth]);

  // Runs after React inserts/removes a conditional submenu, before paint.
  useLayoutEffect(() => {
    if (ref.current) fitVisibleSubmenus(ref.current, margin);
  });

  const style: CSSProperties = {
    left: position.left,
    top: position.top,
    opacity: position.ready ? 1 : 0
  };

  const submenuClassName = position.submenuSide === 'left' ? 'submenu-open-left' : 'submenu-open-right';

  return { ref, style, submenuClassName, submenuSide: position.submenuSide };
}
