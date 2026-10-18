import { useEffect, useMemo, useRef } from 'react';
import { emit, listen } from '@tauri-apps/api/event';
import { useAppStore } from '../stores/appStore';
import {
  EDGE_STRIP_READY_EVENT,
  EDGE_STRIP_STYLE_EVENT,
  resolveEdgeStripStyle,
  type EdgeStripStyle,
} from '../lib/edgeStripStyle';

function pushEdgeStripStyle(style: EdgeStripStyle) {
  void emit(EDGE_STRIP_STYLE_EVENT, style).catch(() => undefined);
}

/**
 * v158: 主窗口把贴边触发条的外观推给 edge-strip 窗口。
 * 只订阅相关的 5 个字段，值不变就不发事件；触发条启动后发 ready，这里补发一次当前值。
 */
export function useEdgeStripStyleSync() {
  const theme = useAppStore((state) => state.theme);
  const edgeStripSize = useAppStore((state) => state.behavior.edgeStripSize);
  const edgeStripOpacity = useAppStore((state) => state.behavior.edgeStripOpacity);
  const edgeStripUseThemeColor = useAppStore((state) => state.behavior.edgeStripUseThemeColor);
  const edgeStripColor = useAppStore((state) => state.behavior.edgeStripColor);

  const style = useMemo(
    () => resolveEdgeStripStyle({
      theme,
      behavior: { edgeStripSize, edgeStripOpacity, edgeStripUseThemeColor, edgeStripColor },
    }),
    [theme, edgeStripSize, edgeStripOpacity, edgeStripUseThemeColor, edgeStripColor],
  );
  const styleRef = useRef(style);
  styleRef.current = style;

  useEffect(() => {
    pushEdgeStripStyle(style);
  }, [style]);

  useEffect(() => {
    const unlisten = listen(EDGE_STRIP_READY_EVENT, () => pushEdgeStripStyle(styleRef.current));
    return () => {
      void unlisten.then((un) => un());
    };
  }, []);
}
