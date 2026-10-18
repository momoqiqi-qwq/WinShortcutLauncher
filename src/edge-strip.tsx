import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { emit, listen } from '@tauri-apps/api/event';
import {
  EDGE_STRIP_READY_EVENT,
  EDGE_STRIP_STYLE_EVENT,
  applyEdgeStripStyle,
  resolveEdgeStripStyle,
  sameEdgeStripStyle,
  type EdgeStripStyle,
} from './lib/edgeStripStyle';
import './edge-strip.css';

type Edge = 'left' | 'right' | 'top';

type PersistedConfig = {
  state?: {
    theme?: string;
    behavior?: {
      edgeStripSize?: number;
      edgeStripOpacity?: number;
      edgeStripUseThemeColor?: boolean;
      edgeStripColor?: string;
    };
  };
};

function readPersistedConfig(): PersistedConfig['state'] {
  try {
    const raw = localStorage.getItem('win-launcher-config');
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as PersistedConfig;
    return parsed.state;
  } catch {
    return undefined;
  }
}


function EdgeStrip() {
  const [edge, setEdge] = useState<Edge>('left');
  const armedRef = useRef(false);
  const visibleOnceRef = useRef(false);

  useEffect(() => {
    // v158: 不再每 250ms 读出并解析整份配置。启动时读一次 localStorage 打底，
    // 之后由主窗口在主题 / 触发条设置变化时推送 edge-strip-style 事件；storage 事件保留兜底。
    let current: EdgeStripStyle | null = null;
    const apply = (next: EdgeStripStyle) => {
      if (sameEdgeStripStyle(current, next)) return;
      current = next;
      applyEdgeStripStyle(next);
    };
    apply(resolveEdgeStripStyle(readPersistedConfig()));

    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === 'win-launcher-config') {
        apply(resolveEdgeStripStyle(readPersistedConfig()));
      }
    };
    window.addEventListener('storage', onStorage);

    let disposed = false;
    let unlisten: (() => void) | null = null;
    listen<EdgeStripStyle>(EDGE_STRIP_STYLE_EVENT, (event) => apply(event.payload)).then((un) => {
      if (disposed) {
        un();
        return;
      }
      unlisten = un;
      // 监听挂好后再通知主窗口补发当前外观，避免错过主窗口在本窗口创建前发出的那次推送。
      void emit(EDGE_STRIP_READY_EVENT).catch(() => undefined);
    });

    return () => {
      disposed = true;
      window.removeEventListener('storage', onStorage);
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    const unsubs: Array<() => void> = [];
    listen<{ edge: Edge }>('edge-strip-config', (event) => {
      setEdge(event.payload.edge);
    }).then((un) => unsubs.push(un));

    listen('edge-strip-sleep', () => {
      // 主窗口刚隐藏时，鼠标通常还压在触发条上。
      // 这里必须禁用第一次 mouseenter，等鼠标离开触发条后才允许再次唤醒。
      armedRef.current = false;
      visibleOnceRef.current = true;
    }).then((un) => unsubs.push(un));

    return () => unsubs.forEach((un) => un());
  }, []);

  const arm = () => {
    if (visibleOnceRef.current) armedRef.current = true;
  };

  const wake = () => {
    if (!armedRef.current) return;
    armedRef.current = false;
    void emit('edge-strip-hover');
  };

  return (
    <div
      className={`edge-strip edge-strip-${edge}`}
      onMouseLeave={arm}
      onMouseEnter={wake}
      onMouseMove={wake}
      title="悬停展开快捷启动器"
    >
      <div className="edge-strip-glow" />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<EdgeStrip />);
