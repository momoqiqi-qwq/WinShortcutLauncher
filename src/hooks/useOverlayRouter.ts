import { useCallback, useEffect, useState } from 'react';
import { useAppStore } from '../stores/appStore';
import { showLauncherNotice } from '../lib/notify';

type OverlayRouterOptions = {
  pauseAfterClose: (ms?: number) => void;
};

export function useOverlayRouter({ pauseAfterClose }: OverlayRouterOptions) {
  const globalSearchSettings = useAppStore((state) => state.globalSearch);
  const transferStationSettings = useAppStore((state) => state.transferStation);
  const imageBrowserSettings = useAppStore((state) => state.imageBrowser);
  const settingsOpen = useAppStore((state) => state.settingsOpen);
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [transferStationOpen, setTransferStationOpen] = useState(false);
  const [imageBrowserOpen, setImageBrowserOpen] = useState(false);

  const transferStationActive = transferStationOpen && transferStationSettings.enabled !== false;
  const imageBrowserActive = imageBrowserOpen && imageBrowserSettings.enabled !== false;

  useEffect(() => {
    if (!globalSearchSettings.enabled) setGlobalSearchOpen(false);
  }, [globalSearchSettings.enabled]);
  useEffect(() => {
    if (!transferStationSettings.enabled) setTransferStationOpen(false);
  }, [transferStationSettings.enabled]);
  useEffect(() => {
    if (!imageBrowserSettings.enabled) setImageBrowserOpen(false);
  }, [imageBrowserSettings.enabled]);

  const openGlobalSearch = useCallback(() => {
    if (globalSearchSettings.enabled) setGlobalSearchOpen(true);
    else showLauncherNotice('全局搜索已在“设置 → 搜索”中关闭');
  }, [globalSearchSettings.enabled]);
  const openTransferStation = useCallback(() => {
    if (transferStationSettings.enabled !== false) setTransferStationOpen(true);
    else showLauncherNotice('文件中转站已在“设置 → 文件中转”中关闭');
  }, [transferStationSettings.enabled]);
  const openImageBrowser = useCallback(() => {
    if (imageBrowserSettings.enabled !== false) setImageBrowserOpen(true);
    else showLauncherNotice('图片浏览器已在“设置 → 图片预览”中关闭');
  }, [imageBrowserSettings.enabled]);

  const closeGlobalSearch = useCallback(() => {
    pauseAfterClose();
    setGlobalSearchOpen(false);
  }, [pauseAfterClose]);
  const closeTransferStation = useCallback(() => {
    pauseAfterClose();
    setTransferStationOpen(false);
  }, [pauseAfterClose]);
  const closeImageBrowser = useCallback(() => {
    pauseAfterClose();
    setImageBrowserOpen(false);
  }, [pauseAfterClose]);

  const closeTopOverlay = useCallback(() => {
    if (globalSearchOpen) setGlobalSearchOpen(false);
    else if (transferStationActive) setTransferStationOpen(false);
    else if (imageBrowserActive) setImageBrowserOpen(false);
    else if (settingsOpen) setSettingsOpen(false);
    else return false;
    pauseAfterClose(900);
    return true;
  }, [globalSearchOpen, transferStationActive, imageBrowserActive, settingsOpen, setSettingsOpen, pauseAfterClose]);

  const closeFloatingPanelsFromMainClick = useCallback((target: HTMLElement) => {
    if (!globalSearchOpen && !transferStationActive && !imageBrowserActive && !settingsOpen) return false;
    if (target.closest('.global-search-modal, .transfer-station-panel, .image-browser-panel, .floating-settings-panel, .modal-card, .menu-surface, .edit-dialog, input, textarea, select')) {
      return false;
    }
    if (globalSearchOpen) setGlobalSearchOpen(false);
    if (transferStationActive) setTransferStationOpen(false);
    if (imageBrowserActive) setImageBrowserOpen(false);
    if (settingsOpen) setSettingsOpen(false);
    pauseAfterClose(900);
    return true;
  }, [globalSearchOpen, transferStationActive, imageBrowserActive, settingsOpen, setSettingsOpen, pauseAfterClose]);

  return {
    globalSearchOpen,
    transferStationActive,
    imageBrowserActive,
    settingsOpen,
    setSettingsOpen,
    openGlobalSearch,
    openTransferStation,
    openImageBrowser,
    closeGlobalSearch,
    closeTransferStation,
    closeImageBrowser,
    closeTopOverlay,
    closeFloatingPanelsFromMainClick,
  };
}
