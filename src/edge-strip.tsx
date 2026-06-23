import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { emit, listen } from '@tauri-apps/api/event';
import { getTheme } from './themes';
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

function installStripStyle() {
  const state = readPersistedConfig();
  const behavior = state?.behavior ?? {};
  const theme = getTheme(state?.theme ?? 'claude');
  const themeAccent = theme.variables['--accent'] ?? '#C36A2D';
  const useThemeColor = behavior.edgeStripUseThemeColor !== false;
  const color = useThemeColor ? themeAccent : (behavior.edgeStripColor || themeAccent);
  const opacity = behavior.edgeStripOpacity ?? 0.88;
  const size = behavior.edgeStripSize ?? 10;
  document.documentElement.style.setProperty('--accent', themeAccent);
  document.documentElement.style.setProperty('--edge-strip-color', color);
  document.documentElement.style.setProperty('--edge-strip-opacity', String(opacity));
  document.documentElement.style.setProperty('--edge-strip-size', `${size}px`);
}

function EdgeStrip() {
  const [edge, setEdge] = useState<Edge>('left');
  const armedRef = useRef(false);
  const visibleOnceRef = useRef(false);

  useEffect(() => {
    installStripStyle();
    const timer = window.setInterval(installStripStyle, 250);
    window.addEventListener('storage', installStripStyle);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('storage', installStripStyle);
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
