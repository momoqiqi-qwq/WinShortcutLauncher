export interface SettingsPanelRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface SettingsViewportSize {
  width: number;
  height: number;
}

export interface SettingsPanelViewportState {
  constrained: boolean;
  needsHorizontalScroll: boolean;
  needsVerticalScroll: boolean;
}

/**
 * Minimum unscaled content size used by the adaptive settings panel. When the
 * main window is smaller than this size the panel keeps the content usable and
 * lets the browser expose horizontal/vertical scrollbars instead of clipping it.
 */
export const SETTINGS_PANEL_MIN_CONTENT_SIZE = {
  width: 560,
  height: 390,
} as const;

/**
 * Returns an unscaled panel rectangle. The caller may apply CSS zoom, so the
 * available viewport is divided by the zoom factor before assigning width and height.
 */
export function getAdaptiveSettingsPanelRect(
  viewport: SettingsViewportSize,
  uiScale = 1,
): SettingsPanelRect {
  const safeWidth = Math.max(1, Math.round(Number(viewport.width) || 1));
  const safeHeight = Math.max(1, Math.round(Number(viewport.height) || 1));
  const scale = Math.max(0.1, Math.min(2, Number(uiScale) || 1));
  const visualMargin = safeWidth < 560 || safeHeight < 440 ? 8 : 18;
  const viewportWidth = safeWidth / scale;
  const viewportHeight = safeHeight / scale;
  const margin = visualMargin / scale;
  const width = Math.max(180, Math.floor(viewportWidth - margin * 2));
  const height = Math.max(180, Math.floor(viewportHeight - margin * 2));
  return {
    left: Math.round((viewportWidth - width) / 2),
    top: Math.round((viewportHeight - height) / 2),
    width,
    height,
  };
}

/**
 * Calculates whether the adaptive panel should use its compact presentation and
 * whether its outer safety scrollbars are expected to appear.
 */
export function getSettingsPanelViewportState(
  rect: Pick<SettingsPanelRect, 'width' | 'height'>,
  uiScale = 1,
  minimum = SETTINGS_PANEL_MIN_CONTENT_SIZE,
): SettingsPanelViewportState {
  const scale = Math.max(0.1, Math.min(2, Number(uiScale) || 1));
  const width = Math.max(0, Number(rect.width) || 0);
  const height = Math.max(0, Number(rect.height) || 0);
  const visibleWidth = width * scale;
  const visibleHeight = height * scale;

  return {
    constrained: visibleWidth < 780 || visibleHeight < 600,
    needsHorizontalScroll: width < minimum.width,
    needsVerticalScroll: height < minimum.height,
  };
}
