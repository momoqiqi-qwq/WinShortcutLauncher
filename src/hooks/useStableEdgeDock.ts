import { useEffect, useRef } from 'react';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { invoke } from '@tauri-apps/api/core';
import { PhysicalPosition, PhysicalSize } from '@tauri-apps/api/dpi';
import { listen } from '@tauri-apps/api/event';

export type StableEdgeDockOptions = {
  enabled: boolean;
  dockAutoHide?: boolean;
  paused?: boolean;
  hideDelayMs: number;
  stripSize?: number;
  edgeTolerance?: number;
  animationMs?: number;
  animationStyle?: import('../types').EdgeAnimationStyle;
  autoEdgeHide?: boolean;
  autoEdgeBounce?: boolean;
  autoEdgeHideDelay?: number;
  edgeVisiblePixels?: number;
  ghostFrameFix?: boolean;
  mouseLeaveHideMs?: number;
  useMainWindowStrip?: boolean;
};

type NativeEdgeOptions = {
  enabled: boolean;
  paused: boolean;
  hideDelayMs: number;
  stripSize: number;
  edgeTolerance: number;
  animationMs: number;
  animationStyle: string;
  dockAutoHide: boolean;
  autoEdgeHide: boolean;
  autoEdgeBounce: boolean;
  autoEdgeHideDelay: number;
  edgeVisiblePixels: number;
  ghostFrameFix: boolean;
  mouseLeaveHideMs: number;
  useMainWindowStrip: boolean;
};

const EDGE_STRIP_LABEL = 'edge-strip';

async function ensureStripWindow(stripSize: number) {
  let strip = await WebviewWindow.getByLabel(EDGE_STRIP_LABEL);
  if (!strip) {
    strip = new WebviewWindow(EDGE_STRIP_LABEL, {
      url: 'edge-strip.html',
      title: 'edge-strip',
      x: 0,
      y: 0,
      width: stripSize,
      height: 220,
      decorations: false,
      transparent: true,
      shadow: false,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      visible: false,
      focus: false,
    });
    await new Promise((resolve) => window.setTimeout(resolve, 200));
  }
  await strip.setSize(new PhysicalSize(Math.max(8, Math.round(stripSize)), 220));
  await strip.setPosition(new PhysicalPosition(0, 0));
  await strip.hide();
  return strip;
}

function setDockMode(mode: 'native' | 'disabled') {
  document.documentElement.dataset.edgeDockMode = mode;
}

function hasBlockingOverlay() {
  return Boolean(document.querySelector('.menu-surface, .modal-backdrop, .edit-dialog, .settings-floating-layer, .image-browser-panel'));
}

function buildEdgeOptions(opts: StableEdgeDockOptions, override: Partial<NativeEdgeOptions> = {}): NativeEdgeOptions {
  return {
    enabled: opts.enabled,
    paused: Boolean(opts.paused),
    hideDelayMs: Math.max(0, Math.round(opts.hideDelayMs)),
    stripSize: opts.stripSize ?? 12,
    edgeTolerance: opts.edgeTolerance ?? 24,
    animationMs: opts.animationMs ?? 90,
    animationStyle: opts.animationStyle ?? 'animate-window',
    dockAutoHide: opts.dockAutoHide ?? opts.enabled,
    autoEdgeHide: opts.autoEdgeHide ?? false,
    autoEdgeBounce: opts.autoEdgeBounce ?? true,
    autoEdgeHideDelay: opts.autoEdgeHideDelay ?? 1000,
    edgeVisiblePixels: opts.edgeVisiblePixels ?? 5,
    ghostFrameFix: opts.ghostFrameFix ?? true,
    mouseLeaveHideMs: opts.mouseLeaveHideMs ?? opts.animationMs ?? 90,
    useMainWindowStrip: opts.useMainWindowStrip ?? true,
    ...override,
  };
}

export function useStableEdgeDock(options: StableEdgeDockOptions) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    let disposed = false;
    let configureTimer: number | null = null;
    const stripSize = options.stripSize ?? 12;

    async function configure(override: Partial<NativeEdgeOptions> = {}) {
      const current = optionsRef.current;
      try {
        await ensureStripWindow(current.stripSize ?? stripSize);
        if (disposed) return;
        await invoke('edge_native_configure', {
          options: buildEdgeOptions(current, {
            paused: Boolean(current.paused) || hasBlockingOverlay(),
            ...override,
          }),
        });
        setDockMode(current.enabled ? 'native' : 'disabled');
      } catch (error) {
        console.warn('native edge dock configure failed', error);
      }
    }

    function scheduleConfigure() {
      if (configureTimer !== null) window.clearTimeout(configureTimer);
      configureTimer = window.setTimeout(() => void configure(), 40);
    }

    scheduleConfigure();

    const unlistenForce = listen('edge-force-show', () => {
      void invoke('edge_native_force_show').catch(() => undefined);
    });

    // Only watch direct modal/menu mount/unmount. Avoid subtree/style observation because icon loads
    // and drag transforms can otherwise trigger repeated native reconfiguration.
    const observer = new MutationObserver(() => scheduleConfigure());
    observer.observe(document.body, {
      childList: true,
      subtree: false,
      attributes: false,
    });

    return () => {
      disposed = true;
      if (configureTimer !== null) window.clearTimeout(configureTimer);
      observer.disconnect();
      void unlistenForce.then((un) => un());
      setDockMode('disabled');
      void invoke('edge_native_configure', {
        options: buildEdgeOptions(optionsRef.current, { enabled: false, paused: false }),
      }).catch(() => undefined);
    };
  }, [
    options.enabled,
    options.dockAutoHide,
    options.paused,
    options.hideDelayMs,
    options.stripSize,
    options.edgeTolerance,
    options.animationMs,
    options.animationStyle,
    options.autoEdgeHide,
    options.autoEdgeBounce,
    options.autoEdgeHideDelay,
    options.edgeVisiblePixels,
    options.ghostFrameFix,
    options.mouseLeaveHideMs,
    options.useMainWindowStrip,
  ]);
}
