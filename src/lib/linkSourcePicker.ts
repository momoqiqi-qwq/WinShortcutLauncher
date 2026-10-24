import type { DirectoryLinkRef } from '../types';

/**
 * v169: 「选择链接源」弹窗的调用入口。
 *
 * 和 `uiDialog.ts` 同一套路数：一个 CustomEvent 把请求递给 <LinkSourcePicker /> 宿主，
 * 宿主渲染选择器，用户选完把结果 resolve 回来。取消返回 null。
 */
export type LinkSourcePickerMode = 'directory' | 'group';

export interface LinkSourcePickerRequest {
  id: number;
  mode: LinkSourcePickerMode;
  title: string;
  /** 预先选中一个源（「更换链接源」时用）。 */
  initial?: DirectoryLinkRef;
  resolve: (value: DirectoryLinkRef | null) => void;
}

export const LINK_SOURCE_PICKER_EVENT = 'launcher-link-source-picker';

let nextPickerId = 1;

export function uiPickLinkSource(
  mode: LinkSourcePickerMode,
  title: string,
  initial?: DirectoryLinkRef,
): Promise<DirectoryLinkRef | null> {
  return new Promise<DirectoryLinkRef | null>((resolve) => {
    const detail: LinkSourcePickerRequest = { id: nextPickerId++, mode, title, initial, resolve };
    window.dispatchEvent(new CustomEvent<LinkSourcePickerRequest>(LINK_SOURCE_PICKER_EVENT, { detail }));
  });
}
