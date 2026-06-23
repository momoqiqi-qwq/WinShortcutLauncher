import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { UiDialogRequest } from '../../lib/uiDialog';
import './UiDialogHost.css';

export function UiDialogHost() {
  const [dialog, setDialog] = useState<UiDialogRequest | null>(null);
  const [draft, setDraft] = useState('');
  const queueRef = useRef<UiDialogRequest[]>([]);

  useEffect(() => {
    function showNext() {
      setDialog((current) => current ?? queueRef.current.shift() ?? null);
    }

    function handle(event: Event) {
      const request = (event as CustomEvent<UiDialogRequest>).detail;
      if (!request) return;
      queueRef.current.push(request);
      showNext();
    }

    window.addEventListener('launcher-ui-dialog', handle as EventListener);
    return () => window.removeEventListener('launcher-ui-dialog', handle as EventListener);
  }, []);

  useEffect(() => {
    setDraft(dialog?.defaultValue ?? '');
  }, [dialog?.id]);

  useEffect(() => {
    if (!dialog) return;
    const current = dialog;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        finish(current.type === 'alert' ? undefined : null);
      }
    }
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [dialog]);

  if (!dialog) return null;

  const activeDialog = dialog;

  function finish(value: string | boolean | null | undefined) {
    const resolver = activeDialog.resolve;
    setDialog(null);
    resolver(value);
    window.setTimeout(() => {
      setDialog((current) => current ?? queueRef.current.shift() ?? null);
    }, 0);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (activeDialog.type === 'prompt') finish(draft);
    else if (activeDialog.type === 'confirm') finish(true);
    else finish(undefined);
  }

  return (
    <div
      className="ui-dialog-backdrop"
      data-no-drag
      onMouseDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <form className="ui-dialog-card" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        <div className="ui-dialog-title">{activeDialog.title}</div>
        <div className="ui-dialog-message">{activeDialog.message}</div>
        {activeDialog.type === 'prompt' && (
          <input
            autoFocus
            className="ui-dialog-input"
            value={draft}
            placeholder={activeDialog.placeholder}
            onChange={(event) => setDraft(event.target.value)}
          />
        )}
        <div className="ui-dialog-actions">
          {activeDialog.type !== 'alert' && (
            <button type="button" className="ghost" onClick={() => finish(null)}>{activeDialog.cancelText ?? '取消'}</button>
          )}
          <button type="submit">{activeDialog.confirmText ?? '确定'}</button>
        </div>
      </form>
    </div>
  );
}
