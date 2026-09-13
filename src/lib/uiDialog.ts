import type { BrowserRouteOverride, ItemClickAction } from '../types';
export type UiDialogType = 'alert' | 'confirm' | 'prompt' | 'website-name-choice';

export type WebsiteNameChoiceSource = 'title' | 'address';

export type WebsiteNameChoiceResult = {
  source: WebsiteNameChoiceSource;
  name: string;
  browserRoute: BrowserRouteOverride;
  singleClickAction?: ItemClickAction;
  doubleClickAction?: ItemClickAction;
};

export interface WebsiteNameChoiceOptions {
  url?: string;
  browserRoute?: BrowserRouteOverride;
  singleClickAction?: ItemClickAction;
  doubleClickAction?: ItemClickAction;
}

export interface UiDialogRequest {
  id: number;
  type: UiDialogType;
  title: string;
  message: string;
  defaultValue?: string;
  placeholder?: string;
  confirmText?: string;
  cancelText?: string;
  websiteTitleName?: string;
  websiteAddressName?: string;
  websiteTitleLoader?: () => Promise<string>;
  websiteDialogShown?: () => void;
  websiteUrl?: string;
  websiteBrowserRoute?: BrowserRouteOverride;
  websiteSingleClickAction?: ItemClickAction;
  websiteDoubleClickAction?: ItemClickAction;
  resolve: (value: string | boolean | WebsiteNameChoiceResult | null | undefined) => void;
}

let nextDialogId = 1;

function dispatchDialog(request: Omit<UiDialogRequest, 'id' | 'resolve'>) {
  return new Promise<string | boolean | WebsiteNameChoiceResult | null | undefined>((resolve) => {
    const detail: UiDialogRequest = { ...request, id: nextDialogId++, resolve };
    window.dispatchEvent(new CustomEvent<UiDialogRequest>('launcher-ui-dialog', { detail }));
  });
}

export async function uiAlert(message: unknown, title = '提示') {
  await dispatchDialog({
    type: 'alert',
    title,
    message: String(message ?? ''),
    confirmText: '确定',
  });
}

export async function uiConfirm(message: unknown, title = '确认') {
  const result = await dispatchDialog({
    type: 'confirm',
    title,
    message: String(message ?? ''),
    confirmText: '确定',
    cancelText: '取消',
  });
  return result === true;
}

export async function uiPrompt(message: unknown, defaultValue = '', title = '输入') {
  const result = await dispatchDialog({
    type: 'prompt',
    title,
    message: String(message ?? ''),
    defaultValue,
    confirmText: '确定',
    cancelText: '取消',
  });
  return typeof result === 'string' ? result : null;
}

export async function uiWebsiteNameChoice(
  websiteTitleName: string,
  websiteAddressName: string,
  websiteTitleLoader?: () => Promise<string>,
  websiteDialogShown?: () => void,
  options: WebsiteNameChoiceOptions = {},
) {
  const result = await dispatchDialog({
    type: 'website-name-choice',
    title: '新建网站项目',
    message: '',
    websiteTitleName,
    websiteAddressName,
    websiteTitleLoader,
    websiteDialogShown,
    websiteUrl: options.url,
    websiteBrowserRoute: options.browserRoute ?? { mode: 'inherit' },
    websiteSingleClickAction: options.singleClickAction ?? 'inherit',
    websiteDoubleClickAction: options.doubleClickAction ?? 'inherit',
    confirmText: '创建项目',
    cancelText: '取消',
  });
  if (!result || typeof result !== 'object' || !('source' in result) || !('name' in result)) return null;
  return result as WebsiteNameChoiceResult;
}
