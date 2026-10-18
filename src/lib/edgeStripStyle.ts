import { getTheme } from '../themes';

/**
 * v158: 贴边触发条（edge-strip 窗口）的外观。
 *
 * 以前触发条每 250ms 从 localStorage 读出并 JSON.parse 整份配置（含全部分组与项目），
 * 只为拿这 4 个值。现在由主窗口在主题 / 触发条设置变化时通过 Tauri 事件推送，
 * 触发条只在收到事件（或启动时读一次）时更新。两端共用这里的同一套换算，保证结果一致。
 */
export const EDGE_STRIP_STYLE_EVENT = 'edge-strip-style';
/** 触发条窗口挂好监听后发出，主窗口收到就补发一次当前外观（触发条可能比主窗口晚创建）。 */
export const EDGE_STRIP_READY_EVENT = 'edge-strip-ready';

export interface EdgeStripStyleSource {
  theme?: string;
  behavior?: {
    edgeStripSize?: number;
    edgeStripOpacity?: number;
    edgeStripUseThemeColor?: boolean;
    edgeStripColor?: string;
  };
}

export interface EdgeStripStyle {
  accent: string;
  color: string;
  opacity: number;
  size: number;
}

export function resolveEdgeStripStyle(source: EdgeStripStyleSource | undefined): EdgeStripStyle {
  const behavior = source?.behavior ?? {};
  const theme = getTheme(source?.theme ?? 'claude');
  const accent = theme.variables['--accent'] ?? '#C36A2D';
  const useThemeColor = behavior.edgeStripUseThemeColor !== false;
  return {
    accent,
    color: useThemeColor ? accent : (behavior.edgeStripColor || accent),
    opacity: behavior.edgeStripOpacity ?? 0.88,
    size: behavior.edgeStripSize ?? 10,
  };
}

export function sameEdgeStripStyle(left: EdgeStripStyle | null | undefined, right: EdgeStripStyle) {
  return Boolean(left)
    && left!.accent === right.accent
    && left!.color === right.color
    && left!.opacity === right.opacity
    && left!.size === right.size;
}

export function applyEdgeStripStyle(style: EdgeStripStyle, root: HTMLElement = document.documentElement) {
  root.style.setProperty('--accent', style.accent);
  root.style.setProperty('--edge-strip-color', style.color);
  root.style.setProperty('--edge-strip-opacity', String(style.opacity));
  root.style.setProperty('--edge-strip-size', `${style.size}px`);
}
