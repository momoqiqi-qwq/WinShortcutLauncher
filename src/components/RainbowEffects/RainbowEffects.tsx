import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { RainbowSettings } from '../../types';

type TrailDot = { id: number; x: number; y: number; color: string; createdAt: number };

function colorAt(colors: string[], index: number) {
  return colors.length ? colors[index % colors.length] : '#ffffff';
}

function gradient(colors: string[]) {
  const safe = colors.length ? colors : ['#ff3b30', '#ffcc00', '#34c759', '#007aff', '#af52de'];
  return safe.join(', ');
}

export function RainbowEffects({ rainbow }: { rainbow: RainbowSettings }) {
  const [trails, setTrails] = useState<TrailDot[]>([]);
  const cursorRef = useRef<HTMLSpanElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const pendingPointRef = useRef<{ x: number; y: number } | null>(null);
  const cursorGradient = useMemo(() => gradient(rainbow.cursorColors), [rainbow.cursorColors]);
  const enabled = rainbow.enabled && (rainbow.cursorEnabled || rainbow.trailEnabled);

  useEffect(() => {
    if (!enabled) {
      setTrails([]);
      return;
    }

    let sequence = 0;
    let lastTrailAt = 0;
    let cleanupInterval = 0;

    const commitPointerFrame = () => {
      frameRef.current = null;
      const point = pendingPointRef.current;
      if (!point) return;

      const cursor = cursorRef.current;
      if (cursor && rainbow.cursorEnabled) {
        cursor.style.left = `${point.x}px`;
        cursor.style.top = `${point.y}px`;
        cursor.style.visibility = 'visible';
      }

      if (!rainbow.trailEnabled || rainbow.trailCount <= 0) return;
      const now = performance.now();
      if (now - lastTrailAt < 16) return;
      lastTrailAt = now;
      const id = sequence++;
      setTrails((current) => [
        ...current,
        {
          id,
          x: point.x,
          y: point.y,
          color: colorAt(rainbow.cursorColors, id),
          createdAt: Date.now(),
        },
      ].slice(-rainbow.trailCount));
    };

    function handleMove(event: MouseEvent) {
      pendingPointRef.current = { x: event.clientX, y: event.clientY };
      if (frameRef.current === null) frameRef.current = window.requestAnimationFrame(commitPointerFrame);
    }

    function handleLeave() {
      pendingPointRef.current = null;
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      if (cursorRef.current) cursorRef.current.style.visibility = 'hidden';
      if (rainbow.trailEnabled) setTrails([]);
    }

    if (rainbow.trailEnabled) {
      cleanupInterval = window.setInterval(() => {
        const now = Date.now();
        setTrails((current) => current.filter((dot) => now - dot.createdAt < rainbow.trailDurationMs).slice(-rainbow.trailCount));
      }, 140);
    }

    window.addEventListener('mousemove', handleMove, { passive: true });
    document.documentElement.addEventListener('mouseleave', handleLeave);
    window.addEventListener('blur', handleLeave);
    return () => {
      if (cleanupInterval) window.clearInterval(cleanupInterval);
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      pendingPointRef.current = null;
      window.removeEventListener('mousemove', handleMove);
      document.documentElement.removeEventListener('mouseleave', handleLeave);
      window.removeEventListener('blur', handleLeave);
    };
  }, [enabled, rainbow.cursorEnabled, rainbow.trailEnabled, rainbow.trailCount, rainbow.trailDurationMs, rainbow.cursorColors]);

  if (!enabled) return null;

  const cursorStyle = {
    left: -100,
    top: -100,
    visibility: 'hidden',
    width: rainbow.cursorSize,
    height: rainbow.cursorSize,
    '--rainbow-cursor-gradient': cursorGradient,
    '--rainbow-cursor-size': `${rainbow.cursorSize}px`,
  } as CSSProperties;

  return (
    <div className="rainbow-effects-layer" aria-hidden="true">
      {trails.map((dot) => {
        const age = Date.now() - dot.createdAt;
        const opacity = Math.max(0, 1 - age / rainbow.trailDurationMs) * rainbow.trailBrightness;
        return (
          <span
            key={dot.id}
            className="rainbow-trail-dot"
            style={{
              left: dot.x,
              top: dot.y,
              width: rainbow.trailSize,
              height: rainbow.trailSize,
              background: dot.color,
              opacity,
            } as CSSProperties}
          />
        );
      })}
      {rainbow.cursorEnabled && (
        <span ref={cursorRef} className={`rainbow-cursor rainbow-cursor-${rainbow.cursorStyle}`} style={cursorStyle}>
          {(rainbow.cursorStyle === 'windows-outline' || rainbow.cursorStyle === 'windows-full' || rainbow.cursorStyle === 'windows-inside') && (
            <svg viewBox="0 0 32 32" width="100%" height="100%" focusable="false">
              <path className="rainbow-cursor-arrow-fill" d="M6 3 L25 18 L16 20 L21 29 L16 31 L11 22 L5 29 Z" />
              <path className="rainbow-cursor-arrow-stroke" d="M6 3 L25 18 L16 20 L21 29 L16 31 L11 22 L5 29 Z" />
            </svg>
          )}
        </span>
      )}
    </div>
  );
}
