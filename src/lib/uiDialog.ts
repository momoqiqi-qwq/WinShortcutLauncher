export type UiDialogType = 'alert' | 'confirm' | 'prompt';

export interface UiDialogRequest {
  id: number;
  type: UiDialogType;
  title: string;
  message: string;
  defaultValue?: string;
  placeholder?: string;
  confirmText?: string;
  cancelText?: string;
  resolve: (value: string | boolean | null | undefined) => void;
}

let nextDialogId = 1;

function dispatchDialog(request: Omit<UiDialogRequest, 'id' | 'resolve'>) {
  return new Promise<string | boolean | null | undefined>((resolve) => {
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
