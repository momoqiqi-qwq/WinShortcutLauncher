import { useCallback, useEffect, useRef, useState } from 'react';
import { PhysicalPosition, PhysicalSize } from '@tauri-apps/api/dpi';
import { currentMonitor, getCurrentWindow } from '@tauri-apps/api/window';
import { useAppStore } from '../stores/appStore';

export type EdgeHiddenClass = '' | 'edge-docked-left' | 'edge-docked-right' | 'edge-docked-top';
type HiddenEdge = 'left' | 'right' | 'top';

type Point = { x: number; y: number };
type Size = { width: number; height: number };
type EdgeCandidate = { edge: HiddenEdge; since: number };
type Rect = Point & Size;

const STRIP_PX = 12;
const EDGE_TOLERANCE_PX = 24;
const REVEAL_GRACE_MS = 650;
const SLIDE_DURATION_MS = 180;
const POINTER_IDLE_BEFORE_HIDE_MS = 140;
const REVEAL_AFTER_HIDE_BLOCK_MS = 420;
const MIN_WINDOW_SIZE_PX = 8;

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

function raf() {
  return new Promise<number>((resolve) => window.requestAnimationFrame(resolve));
}

async function setWindowRect(rect: Rect) {
  const appWindow = getCurrentWindow();
  await appWindow.setPosition(new PhysicalPosition(Math.round(rect.x), Math.round(rect.y)));
  await appWindow.setSize(new PhysicalSize(Math.max(MIN_WINDOW_SIZE_PX, Math.round(rect.width)), Math.max(MIN_WINDOW_SIZE_PX, Math.round(rect.height))));
}

async function animateWindowRect(from: Rect, to: Rect, duration = SLIDE_DURATION_MS) {
  const start = performance.now();
  let last: Rect | null = null;

  while (true) {
    const now = await raf();
    const progress = Math.min(1, (now - start) / duration);
    const eased = easeOutCubic(progress);
    const rect: Rect = {
      x: Math.round(from.x + (to.x - from.x) * eased),
      y: Math.round(from.y + (to.y - from.y) * eased),
      width: Math.round(from.width + (to.width - from.width) * eased),
      height: Math.round(from.height + (to.height - from.height) * eased)
    };

    if (!last || rect.x !== last.x || rect.y !== last.y || rect.width !== last.width || rect.height !== last.height) {
      last = rect;
      await setWindowRect(rect);
    }

    if (progress >= 1) break;
  }
}

function hasBlockingUiOpen() {
  return Boolean(document.querySelector('.modal-backdrop, .menu-surface, .edit-dialog'));
}

function hiddenRectFor(edge: HiddenEdge, visible: Rect, monitorX: number, monitorY: number, monitorWidth: number): Rect {
  if (edge === 'left') {
    return { x: monitorX, y: visible.y, width: STRIP_PX, height: visible.height };
  }
  if (edge === 'right') {
    return { x: monitorX + monitorWidth - STRIP_PX, y: visible.y, width: STRIP_PX, height: visible.height };
  }
  return { x: visible.x, y: monitorY, width: visible.width, height: STRIP_PX };
}

export function useEdgeSnap() {
  const enabled = useAppStore((state) => state.behavior.edgeAutoHide);
  const edgeHideDelaySeconds = useAppStore((state) => state.behavior.edgeHideDelaySeconds);
  const [hiddenClass, setHiddenClass] = useState<EdgeHiddenClass>('');
  const hiddenEdgeRef = useRef<HiddenEdge | null>(null);
  const visibleRectRef = useRef<Rect | null>(null);
  const lastRevealAtRef = useRef(0);
  const movingRef = useRef(false);
  const candidateRef = useRef<EdgeCandidate | null>(null);
  const pointerInsideRef = useRef(false);
  const keepOpenAfterRevealRef = useRef(false);
  const revealArmedRef = useRef(true);
  const pointerButtonDownRef = useRef(false);
  const lastPointerActivityAtRef = useRef(Date.now());
  const revealBlockedUntilRef = useRef(0);

  const reveal = useCallback(async () => {
    pointerInsideRef.current = true;
    lastPointerActivityAtRef.current = Date.now();

    // 关键：隐藏完成后，如果鼠标本来还停在 12px 触发条里，先不要自动展开。
    // 等鼠标真正离开触发条后再重新武装 reveal，避免“收起 -> 鼠标仍在条上 -> 立刻展开 -> 又收起”的闪烁循环。
    if (Date.now() < revealBlockedUntilRef.current) return;
    if (!revealArmedRef.current) return;

    const visibleRect = visibleRectRef.current;
    if (!hiddenEdgeRef.current || !visibleRect || movingRef.current) return;

    movingRef.current = true;
    try {
      const [position, size] = await Promise.all([
        getCurrentWindow().outerPosition(),
        getCurrentWindow().outerSize()
      ]);
      await animateWindowRect({ x: position.x, y: position.y, width: size.width, height: size.height }, visibleRect, SLIDE_DURATION_MS);
      hiddenEdgeRef.current = null;
      visibleRectRef.current = null;
      candidateRef.current = null;
      keepOpenAfterRevealRef.current = true;
      revealArmedRef.current = false;
      lastRevealAtRef.current = Date.now();
      setHiddenClass('');
    } catch (error) {
      console.warn('edge reveal failed', error);
      hiddenEdgeRef.current = null;
      visibleRectRef.current = null;
      candidateRef.current = null;
      keepOpenAfterRevealRef.current = false;
      revealArmedRef.current = true;
      setHiddenClass('');
    } finally {
      movingRef.current = false;
    }
  }, []);

  const markActivity = useCallback(() => {
    pointerInsideRef.current = true;
    lastPointerActivityAtRef.current = Date.now();
    if (hiddenEdgeRef.current && !movingRef.current && revealArmedRef.current) {
      void reveal();
    }
  }, [reveal]);

  const allowHide = useCallback(() => {
    pointerInsideRef.current = false;
    keepOpenAfterRevealRef.current = false;
    lastPointerActivityAtRef.current = Date.now();

    // 鼠标已经离开隐藏条 / 展开窗口，可以允许下次悬停触发展开。
    // 但隐藏 / 展开动画进行中产生的 mouseleave 要忽略，否则会重新武装 reveal 并导致闪烁。
    if (hiddenEdgeRef.current && !movingRef.current) {
      revealArmedRef.current = true;
    }

    candidateRef.current = null;
  }, []);

  useEffect(() => {
    const appWindow = getCurrentWindow();
    // 允许窗口真实收缩成贴边触发条。旧版只是把完整窗口滑到屏幕外，
    // WebView 仍会反复命中贴边检测，容易出现“展开后马上收回”。
    // 现在隐藏态本身就是一个 12px 的真实窗口条，动画和触发条都属于窗口界面的一部分。
    void appWindow.setMinSize(new PhysicalSize(MIN_WINDOW_SIZE_PX, MIN_WINDOW_SIZE_PX)).catch(() => undefined);
  }, []);

  useEffect(() => {
    const markDown = () => {
      pointerButtonDownRef.current = true;
      lastPointerActivityAtRef.current = Date.now();
    };
    const markUp = () => {
      pointerButtonDownRef.current = false;
      lastPointerActivityAtRef.current = Date.now();
    };

    window.addEventListener('pointerdown', markDown, true);
    window.addEventListener('pointerup', markUp, true);
    window.addEventListener('mouseup', markUp, true);
    window.addEventListener('blur', markUp, true);
    return () => {
      window.removeEventListener('pointerdown', markDown, true);
      window.removeEventListener('pointerup', markUp, true);
      window.removeEventListener('mouseup', markUp, true);
      window.removeEventListener('blur', markUp, true);
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      setHiddenClass('');
      hiddenEdgeRef.current = null;
      visibleRectRef.current = null;
      candidateRef.current = null;
      keepOpenAfterRevealRef.current = false;
      revealArmedRef.current = true;
      return;
    }

    let disposed = false;
    const appWindow = getCurrentWindow();
    const hideDelayMs = edgeHideDelaySeconds <= 0.05 ? 0 : Math.max(100, Math.round(edgeHideDelaySeconds * 1000));

    async function hide(edge: HiddenEdge, position: Point, size: Size, monitorX: number, monitorY: number, monitorWidth: number) {
      if (hiddenEdgeRef.current || movingRef.current) return;
      movingRef.current = true;
      const visibleRect: Rect = { x: position.x, y: position.y, width: size.width, height: size.height };
      const target = hiddenRectFor(edge, visibleRect, monitorX, monitorY, monitorWidth);
      visibleRectRef.current = visibleRect;
      hiddenEdgeRef.current = edge;
      keepOpenAfterRevealRef.current = false;
      // 如果隐藏是鼠标仍在窗口内触发的，必须先锁住 reveal，直到鼠标离开 12px 条。
      // 另外给隐藏动画一个短暂冷却，避免窗口缩成 12px 的过程中产生的 mouseleave/mousemove
      // 又把它立即展开，造成连续闪烁。
      revealArmedRef.current = !pointerInsideRef.current;
      revealBlockedUntilRef.current = Date.now() + REVEAL_AFTER_HIDE_BLOCK_MS;
      setHiddenClass(edge === 'left' ? 'edge-docked-left' : edge === 'right' ? 'edge-docked-right' : 'edge-docked-top');
      try {
        await animateWindowRect(visibleRect, target, SLIDE_DURATION_MS);
      } catch (error) {
        console.warn('edge hide failed', error);
        hiddenEdgeRef.current = null;
        visibleRectRef.current = null;
        keepOpenAfterRevealRef.current = false;
        revealArmedRef.current = true;
        setHiddenClass('');
      } finally {
        movingRef.current = false;
      }
    }

    async function refresh() {
      if (disposed || hiddenEdgeRef.current || movingRef.current) return;
      const nowMs = Date.now();
      if (pointerButtonDownRef.current) return;
      if (nowMs - lastPointerActivityAtRef.current < POINTER_IDLE_BEFORE_HIDE_MS) return;
      if (nowMs - lastRevealAtRef.current < REVEAL_GRACE_MS) return;
      if (hasBlockingUiOpen()) {
        candidateRef.current = null;
        return;
      }

      // 由隐藏条展开后，只要鼠标还在窗口内，就不要再次进入贴边隐藏流程。
      // 需要鼠标离开窗口后才重新开始倒计时。
      if (keepOpenAfterRevealRef.current && pointerInsideRef.current) {
        candidateRef.current = null;
        return;
      }

      try {
        const [position, size, monitor] = await Promise.all([
          appWindow.outerPosition(),
          appWindow.outerSize(),
          currentMonitor()
        ]);
        if (disposed || !monitor) return;
        const monitorX = monitor.position.x;
        const monitorY = monitor.position.y;
        const monitorWidth = monitor.size.width;
        const left = position.x <= monitorX + EDGE_TOLERANCE_PX;
        const top = position.y <= monitorY + EDGE_TOLERANCE_PX;
        const right = position.x + size.width >= monitorX + monitorWidth - EDGE_TOLERANCE_PX;
        const edge: HiddenEdge | null = left ? 'left' : right ? 'right' : top ? 'top' : null;

        if (!edge) {
          candidateRef.current = null;
          keepOpenAfterRevealRef.current = false;
          return;
        }

        if (hideDelayMs === 0) {
          candidateRef.current = null;
          await hide(edge, position, size, monitorX, monitorY, monitorWidth);
          return;
        }

        const now = Date.now();
        if (!candidateRef.current || candidateRef.current.edge !== edge) {
          candidateRef.current = { edge, since: now };
        }
        if (now - candidateRef.current.since < hideDelayMs) return;

        await hide(edge, position, size, monitorX, monitorY, monitorWidth);
      } catch (error) {
        console.warn('edge snap check failed', error);
      }
    }

    const timer = window.setInterval(refresh, hideDelayMs === 0 ? 80 : 180);
    refresh();
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [enabled, edgeHideDelaySeconds]);

  return { hiddenClass, reveal, allowHide, markActivity };
}
