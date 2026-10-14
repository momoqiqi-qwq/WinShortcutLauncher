export const NATIVE_EXTERNAL_DROP_EVENT = 'native-external-drop';
export const NATIVE_EXTERNAL_DRAG_STATE_EVENT = 'native-external-drag-state';

export interface NativeExternalDropPayload {
  url?: string | null;
  title?: string | null;
  /** v150: 原始拖入文字（微信/QQ 会话文本等），便签目录直接落进便签。 */
  text?: string | null;
  paths?: string[];
  formats?: string[];
  x?: number;
  y?: number;
}

export interface NativeExternalDragStatePayload {
  hovering: boolean;
  x?: number;
  y?: number;
}
