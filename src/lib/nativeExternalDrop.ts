export const NATIVE_EXTERNAL_DROP_EVENT = 'native-external-drop';
export const NATIVE_EXTERNAL_DRAG_STATE_EVENT = 'native-external-drag-state';

export interface NativeExternalDropPayload {
  url?: string | null;
  title?: string | null;
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
