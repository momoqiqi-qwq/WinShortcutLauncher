import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { BrowserRouteOverride, ItemClickAction } from '../../types';
import type { UiDialogRequest, WebsiteNameChoiceResult, WebsiteNameChoiceSource } from '../../lib/uiDialog';
import { useAppStore } from '../../stores/appStore';
import { useBrowserCatalog } from '../../hooks/useBrowserCatalog';
import { BrowserRoutePicker } from '../Settings/BrowserRoutePicker';
import { ItemClickActionPicker } from '../ItemInteraction/ItemClickActionPicker';
import './UiDialogHost.css';

export function UiDialogHost() {
  const [dialog, setDialog] = useState<UiDialogRequest | null>(null);
  const [draft, setDraft] = useState('');
  const [websiteTitleDraft, setWebsiteTitleDraft] = useState('');
  const [websiteAddressDraft, setWebsiteAddressDraft] = useState('');
  const [websiteNameDraft, setWebsiteNameDraft] = useState('');
  const [websiteNameSource, setWebsiteNameSource] = useState<WebsiteNameChoiceSource>('title');
  const [websiteBrowserRoute, setWebsiteBrowserRoute] = useState<BrowserRouteOverride>({ mode: 'inherit' });
  const [websiteSingleClickAction, setWebsiteSingleClickAction] = useState<ItemClickAction>('inherit');
  const [websiteDoubleClickAction, setWebsiteDoubleClickAction] = useState<ItemClickAction>('inherit');
  const [websiteTitleLoading, setWebsiteTitleLoading] = useState(false);
  const queueRef = useRef<UiDialogRequest[]>([]);
  const websiteNameEditedRef = useRef(false);
  const websiteNameSourceRef = useRef<WebsiteNameChoiceSource>('title');
  const activeDialogIdRef = useRef<number | null>(null);
  const browserRouter = useAppStore((state) => state.browserRouter);
  const globalLaunchMode = useAppStore((state) => state.behavior.launchMode);
  const { catalog: browserCatalog, busy: browserCatalogBusy } = useBrowserCatalog(browserRouter.customBrowsers, dialog?.type === 'website-name-choice');

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
    activeDialogIdRef.current = dialog?.id ?? null;
    websiteNameEditedRef.current = false;
    websiteNameSourceRef.current = 'title';
    setDraft(dialog?.defaultValue ?? '');
    const title = dialog?.websiteTitleName ?? '';
    const address = dialog?.websiteAddressName ?? '';
    setWebsiteTitleDraft(title);
    setWebsiteAddressDraft(address);
    setWebsiteNameSource('title');
    setWebsiteNameDraft(title || address);
    setWebsiteBrowserRoute(dialog?.websiteBrowserRoute ?? { mode: 'inherit' });
    setWebsiteSingleClickAction(dialog?.websiteSingleClickAction ?? 'inherit');
    setWebsiteDoubleClickAction(dialog?.websiteDoubleClickAction ?? 'inherit');
    setWebsiteTitleLoading(false);
  }, [dialog?.id]);

  useEffect(() => {
    if (dialog?.type !== 'website-name-choice') return;

    let cancelled = false;
    const dialogId = dialog.id;
    const frame = window.requestAnimationFrame(() => {
      dialog.websiteDialogShown?.();
      if (!dialog.websiteTitleLoader) return;
      setWebsiteTitleLoading(true);
      void dialog.websiteTitleLoader().then((title) => {
        const cleanTitle = title.trim();
        if (cancelled || activeDialogIdRef.current !== dialogId) return;
        if (cleanTitle) {
          setWebsiteTitleDraft(cleanTitle);
          if (websiteNameSourceRef.current === 'title' && !websiteNameEditedRef.current) {
            setWebsiteNameDraft(cleanTitle);
          }
        }
      }).catch(() => undefined).finally(() => {
        if (!cancelled && activeDialogIdRef.current === dialogId) setWebsiteTitleLoading(false);
      });
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [dialog?.id, dialog?.type, dialog?.websiteTitleLoader, dialog?.websiteDialogShown]);

  useEffect(() => {
    if (dialog) document.body.dataset.uiDialogOpen = 'true';
    else delete document.body.dataset.uiDialogOpen;
    return () => {
      delete document.body.dataset.uiDialogOpen;
    };
  }, [dialog]);

  function finish(value: string | boolean | WebsiteNameChoiceResult | null | undefined) {
    const current = activeDialogIdRef.current == null ? null : dialog;
    if (!current) return;
    const resolver = current.resolve;
    activeDialogIdRef.current = null;
    setDialog(null);
    resolver(value);
    window.setTimeout(() => {
      setDialog((next) => next ?? queueRef.current.shift() ?? null);
    }, 0);
  }

  useEffect(() => {
    if (!dialog) return;
    const current = dialog;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        const resolver = current.resolve;
        activeDialogIdRef.current = null;
        setDialog(null);
        resolver(current.type === 'alert' ? undefined : null);
        window.setTimeout(() => {
          setDialog((next) => next ?? queueRef.current.shift() ?? null);
        }, 0);
      }
    }
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [dialog]);

  if (!dialog) return null;
  const activeDialog = dialog;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (activeDialog.type === 'prompt') finish(draft);
    else if (activeDialog.type === 'confirm') finish(true);
    else if (activeDialog.type === 'alert') finish(undefined);
  }

  function chooseWebsiteSource(source: WebsiteNameChoiceSource) {
    websiteNameSourceRef.current = source;
    setWebsiteNameSource(source);
    websiteNameEditedRef.current = false;
    const value = source === 'title' ? websiteTitleDraft : websiteAddressDraft;
    if (value.trim()) setWebsiteNameDraft(value.trim());
  }

  function submitWebsite() {
    const name = websiteNameDraft.trim();
    if (!name) return;
    finish({
      source: websiteNameSource,
      name,
      browserRoute: websiteBrowserRoute,
      singleClickAction: websiteSingleClickAction,
      doubleClickAction: websiteDoubleClickAction,
    });
  }

  function handleWebsiteNameKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
    event.preventDefault();
    submitWebsite();
  }

  if (activeDialog.type === 'website-name-choice') {
    return (
      <div
        className="ui-dialog-backdrop"
        data-no-drag
        onMouseDown={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.preventDefault()}
      >
        <div className="ui-dialog-card ui-dialog-card-website-name" role="dialog" aria-modal="true" aria-labelledby={`ui-dialog-title-${activeDialog.id}`} onMouseDown={(event) => event.stopPropagation()}>
          <div className="ui-dialog-website-header">
            <div className="ui-dialog-title" id={`ui-dialog-title-${activeDialog.id}`}>{activeDialog.title}</div>
            {activeDialog.websiteUrl && <div className="ui-dialog-website-url" title={activeDialog.websiteUrl}>{activeDialog.websiteUrl}</div>}
          </div>

          <section className="ui-dialog-website-section primary">
            <label className="ui-dialog-website-label" htmlFor={`website-project-name-${activeDialog.id}`}>项目名称</label>
            <input
              id={`website-project-name-${activeDialog.id}`}
              autoFocus
              className="ui-dialog-name-option-input ui-dialog-project-name-input"
              value={websiteNameDraft}
              onChange={(event) => {
                websiteNameEditedRef.current = true;
                setWebsiteNameDraft(event.target.value);
              }}
              onKeyDown={handleWebsiteNameKeyDown}
              spellCheck={false}
            />
            <div className="ui-dialog-name-source-switch" role="group" aria-label="命名来源">
              <button
                type="button"
                className={websiteNameSource === 'title' ? 'active' : ''}
                onClick={() => chooseWebsiteSource('title')}
                title={websiteTitleDraft}
              >
                <span>标签页标题</span>
                <small>{websiteTitleLoading ? '正在获取标题…' : websiteTitleDraft || '暂无标题'}</small>
              </button>
              <button
                type="button"
                className={websiteNameSource === 'address' ? 'active' : ''}
                onClick={() => chooseWebsiteSource('address')}
                title={websiteAddressDraft}
              >
                <span>网站地址</span>
                <small>{websiteAddressDraft || '按网址生成'}</small>
              </button>
            </div>
          </section>

          <section className="ui-dialog-website-section">
            <div className="ui-dialog-section-heading">
              <strong>浏览器打开方式</strong>
              <span>{browserCatalogBusy ? '正在扫描浏览器…' : '可继承，也可单独指定'}</span>
            </div>
            <BrowserRoutePicker
              value={websiteBrowserRoute}
              onChange={setWebsiteBrowserRoute}
              catalog={browserCatalog}
              router={browserRouter}
              compact
            />
            <p className="ui-dialog-section-hint">“继承上一级”会先使用父目录规则，再使用全局浏览器路由；指定浏览器时还能选择对应 Profile。</p>
          </section>

          <section className="ui-dialog-website-section">
            <div className="ui-dialog-section-heading">
              <strong>项目点击动作</strong>
              <span>单击 / 双击互相独立</span>
            </div>
            <div className="ui-dialog-click-action-grid">
              <label>
                <span>左键单击</span>
                <ItemClickActionPicker
                  value={websiteSingleClickAction}
                  interaction="single"
                  itemType="url"
                  globalLaunchMode={globalLaunchMode}
                  onChange={setWebsiteSingleClickAction}
                />
              </label>
              <label>
                <span>左键双击</span>
                <ItemClickActionPicker
                  value={websiteDoubleClickAction}
                  interaction="double"
                  itemType="url"
                  globalLaunchMode={globalLaunchMode}
                  onChange={setWebsiteDoubleClickAction}
                />
              </label>
            </div>
            <p className="ui-dialog-section-hint">可以把单击和双击分别设置成复制名称、复制网址、复制“名称 + 网址”或打开项目；两者都有动作时会按 Windows 双击时间自动区分。</p>
          </section>

          <div className="ui-dialog-actions ui-dialog-website-actions">
            <button type="button" className="ghost" onClick={() => finish(null)}>{activeDialog.cancelText ?? '取消'}</button>
            <button type="button" disabled={!websiteNameDraft.trim()} onClick={submitWebsite}>{activeDialog.confirmText ?? '创建项目'}</button>
          </div>
        </div>
      </div>
    );
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
