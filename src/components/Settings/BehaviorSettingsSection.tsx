import { invoke } from '@tauri-apps/api/core';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useAppStore } from '../../stores/appStore';
import type { EdgeAnimationStyle } from '../../types';
import { uiAlert } from '../../lib/uiDialog';
import { showLauncherNotice } from '../../lib/notify';
import {
  formatManualWindowState,
  getWindowPersistenceSettings,
  type ManualWindowStateSummary,
  type WindowPersistenceSettingsPayload,
  type WindowPersistenceStatus,
} from '../../lib/windowPersistence';
import { SliderRow } from './SettingsPrimitives';
import { formatShortcut } from '../../lib/keyboardShortcuts';
import { BrowserRouterSettingsSection } from './BrowserRouterSettingsSection';

type BehaviorSectionId = 'edgeAutoHide' | 'edgeTrigger' | 'windowState' | 'launchClose';
const BEHAVIOR_SECTION_IDS: BehaviorSectionId[] = ['edgeAutoHide', 'edgeTrigger', 'windowState', 'launchClose'];
const DEFAULT_BEHAVIOR_COLLAPSED_SECTIONS = new Set<BehaviorSectionId>(BEHAVIOR_SECTION_IDS);
const STORAGE_KEY = 'settings.behavior';

function readBool(key: string, fallback = false) {
  try { const raw = localStorage.getItem(key); return raw === '1' ? true : raw === '0' ? false : fallback; } catch { return fallback; }
}
function readSections(key: string) {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return new Set(DEFAULT_BEHAVIOR_COLLAPSED_SECTIONS);
    const next = new Set(parsed.filter((id): id is BehaviorSectionId => BEHAVIOR_SECTION_IDS.includes(id as BehaviorSectionId)));
    return next.size ? next : new Set(DEFAULT_BEHAVIOR_COLLAPSED_SECTIONS);
  } catch { return new Set(DEFAULT_BEHAVIOR_COLLAPSED_SECTIONS); }
}
function useBehaviorCollapse() {
  const rememberKey = `${STORAGE_KEY}:remember`;
  const collapsedKey = `${STORAGE_KEY}:collapsed`;
  const [rememberBehaviorCollapseState, setRememberValue] = useState(() => readBool(rememberKey));
  const [collapsedBehaviorSections, setCollapsed] = useState<Set<BehaviorSectionId>>(() => readBool(rememberKey) ? readSections(collapsedKey) : new Set(DEFAULT_BEHAVIOR_COLLAPSED_SECTIONS));
  function persist(next: Set<BehaviorSectionId>, remember = rememberBehaviorCollapseState) { if (remember) try { localStorage.setItem(collapsedKey, JSON.stringify([...next])); } catch {} }
  function setRememberBehaviorCollapseState(enabled: boolean) {
    setRememberValue(enabled);
    try { localStorage.setItem(rememberKey, enabled ? '1' : '0'); } catch {}
    if (enabled) persist(collapsedBehaviorSections, true); else setCollapsed(new Set(DEFAULT_BEHAVIOR_COLLAPSED_SECTIONS));
  }
  function applyBehaviorCollapsedSections(next: Set<BehaviorSectionId>) { setCollapsed(next); persist(next); }
  function toggleBehaviorSection(id: BehaviorSectionId) { setCollapsed((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); persist(next); return next; }); }
  return { rememberBehaviorCollapseState, collapsedBehaviorSections, setRememberBehaviorCollapseState, applyBehaviorCollapsedSections, toggleBehaviorSection };
}
function CollapseBlock({ id, title, hint, collapsed, onToggle, children }: { id: BehaviorSectionId; title: string; hint?: string; collapsed: boolean; onToggle: (id: BehaviorSectionId) => void; children: ReactNode }) {
  return <div className="settings-collapse-block" data-settings-section={id}><button type="button" className="settings-collapse-header" aria-expanded={!collapsed} onClick={() => onToggle(id)}><span className="settings-collapse-arrow" aria-hidden="true">{collapsed ? '▸' : '▾'}</span><span className="settings-collapse-title">{title}</span>{hint && <span className="settings-collapse-hint">{hint}</span>}</button>{!collapsed && <div className="settings-collapse-content">{children}</div>}</div>;
}

export function BehaviorSettingsSection() {
  const behavior = useAppStore((state) => state.behavior);
  const updateBehavior = useAppStore((state) => state.updateBehavior);
  const behaviorCollapse = useBehaviorCollapse();
  const shortcuts = useAppStore((state) => state.shortcuts);
  const [autoStartBusy, setAutoStartBusy] = useState(false);
  const [windowStateBusy, setWindowStateBusy] = useState(false);
  const [windowPersistenceStatus, setWindowPersistenceStatus] = useState<WindowPersistenceStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    invoke<boolean>('get_auto_start').then((enabled) => { if (!cancelled && enabled !== behavior.autoStart) updateBehavior({ autoStart: enabled }); }).catch(() => undefined);
    void refreshWindowPersistenceStatus();
    return () => { cancelled = true; };
  }, []);

  async function refreshWindowPersistenceStatus() {
    try { setWindowPersistenceStatus(await invoke<WindowPersistenceStatus>('get_window_persistence_status')); } catch { setWindowPersistenceStatus(null); }
  }
  async function updateWindowPersistenceSetting(patch: Partial<WindowPersistenceSettingsPayload>) {
    const next = { ...getWindowPersistenceSettings(behavior), ...patch };
    updateBehavior({ manualWindowStateEnabled: next.manualWindowStateEnabled, restoreWindowStateOnLaunch: next.restoreWindowStateOnLaunch, saveWindowStateOnExit: next.saveWindowStateOnExit, rememberMainWindowBounds: next.restoreWindowStateOnLaunch || next.saveWindowStateOnExit });
    try { await invoke('set_window_persistence_settings', { settings: next }); setWindowPersistenceStatus((current) => current ? { ...current, settings: next } : current); } catch (error) { void uiAlert(`窗口状态设置保存失败：${String(error || '未知错误')}`); }
  }
  async function saveCurrentMainWindowState() {
    if (windowStateBusy) return;
    setWindowStateBusy(true);
    try {
      if (!behavior.manualWindowStateEnabled) await updateWindowPersistenceSetting({ manualWindowStateEnabled: true });
      const saved = await invoke<ManualWindowStateSummary>('save_manual_main_window_state');
      setWindowPersistenceStatus((current) => current ? { ...current, manualState: saved, settings: { ...current.settings, manualWindowStateEnabled: true } } : current);
      showLauncherNotice(`已手动保存窗口：${saved.width} × ${saved.height}`);
    } catch (error) { void uiAlert(`保存当前窗口大小失败：${String(error || '未知错误')}`); } finally { setWindowStateBusy(false); void refreshWindowPersistenceStatus(); }
  }
  async function clearManualMainWindowState() {
    if (windowStateBusy) return;
    setWindowStateBusy(true);
    try { await invoke('clear_manual_main_window_state'); setWindowPersistenceStatus((current) => current ? { ...current, manualState: null } : current); showLauncherNotice('已清除手动保存的窗口大小'); } catch (error) { void uiAlert(`清除手动窗口大小失败：${String(error || '未知错误')}`); } finally { setWindowStateBusy(false); }
  }
  async function handleAutoStartChange(enabled: boolean) {
    if (autoStartBusy) return;
    setAutoStartBusy(true);
    const previous = behavior.autoStart;
    updateBehavior({ autoStart: enabled });
    try { await invoke('set_auto_start', { enabled }); const actual = await invoke<boolean>('get_auto_start').catch(() => enabled); updateBehavior({ autoStart: actual }); if (actual !== enabled) void uiAlert('开机自启动状态没有成功写入系统启动项，请检查权限或安全软件拦截。'); } catch (error) { updateBehavior({ autoStart: previous }); void uiAlert(`开机自启动设置失败：${String(error || '未知错误')}`); } finally { setAutoStartBusy(false); }
  }

  return (
<section className="settings-section settings-section-stack narrow-section">
                <div className="settings-section-title-row">
                  <h3>操作行为</h3>
                  <span className="settings-hint">贴边隐藏、触发条、启动与关闭</span>
                </div>
                <div className="settings-collapse-tools settings-collapse-tools-spread">
                  <label className="settings-inline-switch" title="开启后会记住操作设置页每个分组的展开/收起状态；关闭后每次进入都默认全部收起。">
                    <input
                      type="checkbox"
                      checked={behaviorCollapse.rememberBehaviorCollapseState}
                      onChange={(event) => behaviorCollapse.setRememberBehaviorCollapseState(event.target.checked)}
                    />
                    记住展开/收起状态
                  </label>
                  <span className="settings-collapse-actions">
                    <button className="btn-secondary btn-compact" onClick={() => behaviorCollapse.applyBehaviorCollapsedSections(new Set(BEHAVIOR_SECTION_IDS))}>全部收起</button>
                    <button className="btn-secondary btn-compact" onClick={() => behaviorCollapse.applyBehaviorCollapsedSections(new Set())}>全部展开</button>
                  </span>
                </div>

                <CollapseBlock
                  id="edgeAutoHide"
                  title="贴边隐藏与动画"
                  hint="自动隐藏、速度、残影修复"
                  collapsed={behaviorCollapse.collapsedBehaviorSections.has('edgeAutoHide')}
                  onToggle={behaviorCollapse.toggleBehaviorSection}
                >
                  <label className="check-row" data-settings-target="edge-dock" data-settings-focus="自动贴边隐藏">
                    <input
                      type="checkbox"
                      checked={behavior.edgeAutoHide}
                      onChange={(event) => updateBehavior({ edgeAutoHide: event.target.checked })}
                    />
                    自动贴边隐藏
                  </label>
                  <p className="settings-hint">鼠标停留在主界面内或正在点击操作时保持展开；鼠标真正移出主界面后，才开始计算贴边隐藏延迟。</p>
                  <div className="field-row">
                    <label>贴边隐藏延迟：{behavior.edgeHideDelaySeconds === 0 ? '立即' : `${behavior.edgeHideDelaySeconds.toFixed(1)} 秒`}</label>
                    <div className="delay-row">
                      <button
                        className={behavior.edgeHideDelaySeconds === 0 ? 'btn-primary' : 'btn-secondary'}
                        onClick={() => updateBehavior({ edgeHideDelaySeconds: 0 })}
                      >
                        立即
                      </button>
                      <input
                        type="range"
                        min={0.5}
                        max={10}
                        step={0.5}
                        value={behavior.edgeHideDelaySeconds === 0 ? 0.5 : behavior.edgeHideDelaySeconds}
                        onChange={(event) => updateBehavior({ edgeHideDelaySeconds: Number(event.target.value) })}
                      />
                    </div>
                  </div>
                  <div className="field-row">
                    <label>贴边动画速度：{behavior.edgeAnimationStyle === 'instant' ? '无动画' : `${behavior.edgeAnimationMs ?? 90} ms`}</label>
                    <input
                      type="range"
                      min={0}
                      max={220}
                      step={5}
                      value={behavior.edgeAnimationMs ?? 90}
                      disabled={behavior.edgeAnimationStyle === 'instant'}
                      onChange={(event) => updateBehavior({ edgeAnimationMs: Number(event.target.value) })}
                    />
                    <small>推荐 70～100ms；选择“无动画”时速度滑块会停用。</small>
                  </div>
                  <div className="field-row">
                    <label>鼠标移出主界面后隐藏速度：{behavior.edgeMouseLeaveHideMs ?? behavior.edgeAnimationMs ?? 90} ms</label>
                    <input
                      type="range"
                      min={0}
                      max={260}
                      step={5}
                      value={behavior.edgeMouseLeaveHideMs ?? behavior.edgeAnimationMs ?? 90}
                      disabled={behavior.edgeAnimationStyle === 'instant'}
                      onChange={(event) => updateBehavior({ edgeMouseLeaveHideMs: Number(event.target.value) })}
                    />
                    <small>窗口从触发条展开后，鼠标移出主界面时使用这个速度收回。0ms 表示鼠标离开后立即收回。</small>
                  </div>
                  <div className="field-row">
                    <label>动画方式</label>
                    <select
                      className="soft-input"
                      value={behavior.edgeAnimationStyle ?? 'animate-window'}
                      onChange={(event) => updateBehavior({ edgeAnimationStyle: event.target.value as EdgeAnimationStyle })}
                    >
                      <option value="animate-window">AnimateWindow 系统滑动（硬件加速，部分透明窗口有残影）</option>
                      <option value="setwindowpos">SetWindowPos 无残影滑动（推荐，EaseOutQuint）</option>
                      <option value="setwindowpos-cubic">SetWindowPos 柔和滑动（EaseOutCubic）</option>
                      <option value="setwindowpos-linear">SetWindowPos 匀速滑动</option>
                      <option value="setwindowpos-back">SetWindowPos 回弹滑动</option>
                      <option value="fade-slide">位置滑动 + 淡入淡出</option>
                      <option value="fade">淡入淡出（AW_BLEND）</option>
                      <option value="instant">无动画（瞬间切换）</option>
                    </select>
                    <small>如果看到透明框残影，切到“SetWindowPos 无残影滑动”；如果想更柔和，可以试“柔和滑动”或“位置滑动 + 淡入淡出”。</small>
                  </div>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={behavior.edgeGhostFrameFix !== false}
                      onChange={(event) => updateBehavior({ edgeGhostFrameFix: event.target.checked })}
                    />
                    隐藏后强制清理透明框残影
                  </label>
                  <p className="settings-hint">开启后，隐藏动画结束会强制隐藏并停放主窗口，减少透明 WebView / AnimateWindow 偶发留下的小透明框。若影响动画手感，可以关闭后对比。</p>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={behavior.edgeUseMainWindowStrip !== false}
                      onChange={(event) => updateBehavior({ edgeUseMainWindowStrip: event.target.checked })}
                    />
                    隐藏后直接保留主窗口边缘（解决透明触发框）
                  </label>
                  <p className="settings-hint">开启后不再显示独立 edge-strip 触发窗，而是把主窗口滑出屏幕并保留一条边缘；如果你看到隐藏后有透明框，优先开启这个开关。关闭后恢复旧的独立触发条方式。</p>
                </CollapseBlock>

                <CollapseBlock
                  id="edgeTrigger"
                  title="贴边触发条显示"
                  hint="宽度、透明度、颜色"
                  collapsed={behaviorCollapse.collapsedBehaviorSections.has('edgeTrigger')}
                  onToggle={behaviorCollapse.toggleBehaviorSection}
                >
                  <SliderRow label="触发条宽度" min={4} max={32} step={1} value={behavior.edgeStripSize ?? 10} unit="px" onChange={(value) => updateBehavior({ edgeStripSize: value })} />
                  <SliderRow label="触发条透明度" min={0.25} max={1} step={0.05} value={behavior.edgeStripOpacity ?? 0.88} unit="" onChange={(value) => updateBehavior({ edgeStripOpacity: Math.round(value * 100) / 100 })} />
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={behavior.edgeStripUseThemeColor !== false}
                      onChange={(event) => updateBehavior({ edgeStripUseThemeColor: event.target.checked })}
                    />
                    触发条颜色跟随当前主题 accent
                  </label>
                  <div className="field-row">
                    <label>自定义触发条颜色</label>
                    <div className="color-pick-row">
                      <input
                        type="color"
                        value={behavior.edgeStripColor || '#C36A2D'}
                        disabled={behavior.edgeStripUseThemeColor !== false}
                        onChange={(event) => updateBehavior({ edgeStripColor: event.target.value, edgeStripUseThemeColor: false })}
                      />
                      <span className="settings-hint">关闭“跟随主题”后生效</span>
                    </div>
                    <div
                      className="edge-strip-preview"
                      style={{
                        '--preview-edge-color': behavior.edgeStripUseThemeColor !== false ? 'var(--accent)' : (behavior.edgeStripColor || '#C36A2D'),
                        '--preview-edge-opacity': behavior.edgeStripOpacity ?? 0.88,
                        '--preview-edge-size': `${behavior.edgeStripSize ?? 10}px`
                      } as CSSProperties}
                    />
                  </div>
                </CollapseBlock>

                <CollapseBlock
                  id="windowState"
                  title="窗口大小保存与恢复"
                  hint="手动保存优先、启动恢复、关机保存"
                  collapsed={behaviorCollapse.collapsedBehaviorSections.has('windowState')}
                  onToggle={behaviorCollapse.toggleBehaviorSection}
                >
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={behavior.manualWindowStateEnabled === true}
                      onChange={(event) => void updateWindowPersistenceSetting({ manualWindowStateEnabled: event.target.checked })}
                    />
                    使用手动保存的当前界面大小
                  </label>
                  <p className="settings-hint">开启后，点击下面的“保存当前大小和位置”会建立手动快照；以后启动时优先使用这个快照。</p>
                  <div className="settings-action-row settings-action-row-wrap">
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={windowStateBusy}
                      onClick={() => void saveCurrentMainWindowState()}
                    >
                      {windowStateBusy ? '处理中...' : '保存当前大小和位置'}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={windowStateBusy || !windowPersistenceStatus?.manualState}
                      onClick={() => void clearManualMainWindowState()}
                    >
                      清除手动保存
                    </button>
                  </div>
                  <p className="settings-hint">手动快照：{formatManualWindowState(windowPersistenceStatus?.manualState)}</p>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={behavior.restoreWindowStateOnLaunch !== false}
                      onChange={(event) => void updateWindowPersistenceSetting({ restoreWindowStateOnLaunch: event.target.checked })}
                    />
                    启动应用时自动恢复保存的大小
                  </label>
                  <p className="settings-hint">关闭后，每次启动都使用默认 1180 × 880，不读取手动快照或关机保存状态。</p>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={behavior.saveWindowStateOnExit !== false}
                      onChange={(event) => void updateWindowPersistenceSetting({ saveWindowStateOnExit: event.target.checked })}
                    />
                    退出应用或系统关机时自动保存
                  </label>
                  <p className="settings-hint">使用官方 tauri-plugin-window-state 保存大小、位置和最大化状态。托盘隐藏不算退出，不会覆盖关机快照。</p>
                  <div className="window-state-priority-card">
                    <strong>启动恢复优先级</strong>
                    <span>手动保存 → 退出/关机保存 → 默认 1180 × 880</span>
                    {windowPersistenceStatus?.automaticStateAvailable && <em>已有退出/关机自动快照</em>}
                  </div>
                </CollapseBlock>

                <CollapseBlock
                  id="launchClose"
                  title="启动与关闭"
                  hint="单/双击、网址浏览器、托盘、自启动、快捷键"
                  collapsed={behaviorCollapse.collapsedBehaviorSections.has('launchClose')}
                  onToggle={behaviorCollapse.toggleBehaviorSection}
                >
                  <div className="field-row" data-settings-target="launch-mode" data-settings-focus="启动方式">
                    <label>启动方式</label>
                    <select
                      className="soft-input"
                      value={behavior.launchMode}
                      onChange={(event) => {
                        const launchMode = event.target.value as 'single' | 'double';
                        updateBehavior({ launchMode });
                        showLauncherNotice(launchMode === 'single' ? '已切换：左键单击直接启动' : '已切换：左键双击启动');
                      }}
                    >
                      <option value="single">单击启动</option>
                      <option value="double">双击启动</option>
                    </select>
                  </div>
                  <p className="settings-hint">左键不再用于选中：{behavior.launchMode === 'single' ? '单击立即启动，长按后拖动排序' : '单击无动作，双击启动；直接拖动可排序'}。右键用于管理，Ctrl + 右键用于多选。</p>
                  <BrowserRouterSettingsSection />
                  <div className="field-row">
                    <label>关闭按钮行为</label>
                    <select
                      className="soft-input"
                      value={behavior.closeAction ?? 'tray'}
                      onChange={(event) => updateBehavior({ closeAction: event.target.value as 'tray' | 'exit' })}
                    >
                      <option value="tray">隐藏到系统托盘</option>
                      <option value="exit">直接退出应用</option>
                    </select>
                  </div>
                  <label className="check-row" data-settings-target="autostart" data-settings-focus="开机自启动">
                    <input
                      type="checkbox"
                      checked={behavior.autoStart}
                      disabled={autoStartBusy}
                      onChange={(event) => void handleAutoStartChange(event.target.checked)}
                    />
                    开机自启动
                  </label>
                  <p className="settings-hint">开启后会写入 Windows 当前用户启动项，电脑开机登录后自动启动 Yue launcher；关闭会从启动项移除。</p>
                  <p className="settings-hint">多选：Ctrl + 右键；{formatShortcut(shortcuts.selectAllItems) || '未设置快捷键'} 选中当前页；{formatShortcut(shortcuts.deleteSelection) || '未设置快捷键'} 删除选中项目或当前目录。</p>
                </CollapseBlock>
              </section>
  );
}
