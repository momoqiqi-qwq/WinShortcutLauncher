import { Check, Copy, Download, ExternalLink, FolderOpen, Loader2, RefreshCw, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { showLauncherNotice } from '../../lib/notify';
import { uiConfirm } from '../../lib/uiDialog';
import { APP_PACKAGE_VERSION } from '../../lib/appVersion';
import { useAppStore } from '../../stores/appStore';
import {
  checkUpdate,
  describeDownloadSource,
  downloadInstaller,
  formatBytes,
  getUpdateLocations,
  launchInstaller,
  listenDownloadProgress,
  pickInstallerAsset,
  revealInExplorer,
  type DownloadProgress,
  type UpdateInfo,
  type UpdateLocations,
} from '../../lib/updater';

export { APP_PACKAGE_VERSION };
export const PROJECT_URL = 'https://github.com/momoqiqi-qwq/WinShortcutLauncher';

export function AboutSettingsSection() {
  const [copied, setCopied] = useState(false);
  const installerDownloadDir = useAppStore((state) => state.experience.installerDownloadDir);
  const updateExperience = useAppStore((state) => state.updateExperience);

  const [locations, setLocations] = useState<UpdateLocations | null>(null);
  const [downloadDir, setDownloadDir] = useState('');
  const [checking, setChecking] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [errorHint, setErrorHint] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [savedInstaller, setSavedInstaller] = useState('');

  async function copyProjectUrl() {
    try {
      await navigator.clipboard.writeText(PROJECT_URL);
      setCopied(true);
      showLauncherNotice('项目地址已复制');
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      showLauncherNotice('复制失败，请手动复制项目地址');
    }
  }

  // 打开关于页就先自动检测一次：软件装在哪、更新包该默认下到哪（纯本地，不联网）。
  useEffect(() => {
    let cancelled = false;
    getUpdateLocations(installerDownloadDir)
      .then((result) => {
        if (cancelled) return;
        setLocations(result);
        setDownloadDir(result.defaultDownloadDir);
      })
      .catch((error) => {
        if (!cancelled) setErrorHint(`检测程序位置失败：${String(error)}`);
      });
    return () => {
      cancelled = true;
    };
  }, [installerDownloadDir]);

  // 下载进度由后端推事件，这里只负责显示。
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    listenDownloadProgress((payload) => setProgress(payload))
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  const installerAsset = useMemo(() => pickInstallerAsset(updateInfo?.assets), [updateInfo]);

  const rememberDir = useCallback(
    (dir: string) => {
      const trimmed = dir.trim();
      if (!trimmed || trimmed === installerDownloadDir) return;
      updateExperience({ installerDownloadDir: trimmed });
    },
    [installerDownloadDir, updateExperience],
  );

  async function handleCheckUpdate() {
    setChecking(true);
    setErrorHint('');
    setSavedInstaller('');
    setProgress(null);
    try {
      const result = await checkUpdate(APP_PACKAGE_VERSION);
      setUpdateInfo(result);
      if (result.hasUpdate) showLauncherNotice(`发现新版本 v${result.latestVersion}`);
      else showLauncherNotice(`已是最新版本 v${result.latestVersion}`);
    } catch (error) {
      setUpdateInfo(null);
      setErrorHint(`检查更新失败：${String(error)}`);
    } finally {
      setChecking(false);
    }
  }

  async function chooseDownloadDir() {
    try {
      const chosen = await open({
        directory: true,
        multiple: false,
        title: '选择更新安装包的下载位置',
        defaultPath: downloadDir || locations?.defaultDownloadDir || undefined,
      });
      if (typeof chosen !== 'string' || !chosen.trim()) return;
      setDownloadDir(chosen);
      // 记住这次选的位置，下次更新默认还下到这里。
      rememberDir(chosen);
      showLauncherNotice('已记住更新包下载位置');
    } catch (error) {
      showLauncherNotice(`选择目录失败：${String(error)}`);
    }
  }

  async function handleDownload() {
    if (!installerAsset) return;
    const targetDir = (downloadDir || locations?.defaultDownloadDir || '').trim();
    if (!targetDir) {
      showLauncherNotice('请先选择更新包下载位置');
      return;
    }
    setDownloading(true);
    setErrorHint('');
    setProgress(null);
    try {
      const saved = await downloadInstaller({
        url: installerAsset.downloadUrl,
        directory: targetDir,
        fileName: installerAsset.name,
      });
      setSavedInstaller(saved);
      rememberDir(targetDir);
      showLauncherNotice('更新包下载完成');
    } catch (error) {
      setErrorHint(`下载更新包失败：${String(error)}`);
    } finally {
      setDownloading(false);
    }
  }

  async function handleRunInstaller() {
    if (!savedInstaller) return;
    const confirmed = await uiConfirm(
      `即将退出 Yue launcher 并运行更新安装包：\n${savedInstaller}\n安装目录默认沿用当前程序所在位置：\n${locations?.appDir ?? ''}`,
      '运行更新安装包',
    );
    if (!confirmed) return;
    try {
      await launchInstaller({
        installerPath: savedInstaller,
        installDir: locations?.appDir ?? null,
        silent: false,
        exitAfter: true,
      });
    } catch (error) {
      setErrorHint(`运行安装包失败：${String(error)}`);
    }
  }

  const downloadSourceHint = locations
    ? describeDownloadSource(locations.defaultDownloadSource, downloadDir || locations.defaultDownloadDir)
    : '正在检测更新包默认下载位置…';
  const percent = progress?.percent ?? 0;

  return (
    <section className="settings-section narrow-section about-settings-section">
      <h3>关于</h3>
      <dl className="about-info-grid">
        <div>
          <dt>版本</dt>
          <dd>v{APP_PACKAGE_VERSION}</dd>
        </div>
        <div>
          <dt>作者</dt>
          <dd>momoni_yile</dd>
        </div>
        <div>
          <dt>框架</dt>
          <dd>Tauri 2 · React 18 · TypeScript · Vite</dd>
        </div>
        <div className="about-project-row">
          <dt>项目地址</dt>
          <dd>
            <a href={PROJECT_URL} target="_blank" rel="noreferrer" title="打开项目地址">
              <span>{PROJECT_URL}</span>
              <ExternalLink size={14} />
            </a>
            <button type="button" className="about-copy-button" onClick={copyProjectUrl} title="复制项目地址">
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? '已复制' : '复制'}
            </button>
          </dd>
        </div>
      </dl>

      <div className="about-update-block">
        <div className="about-update-head">
          <h4>更新</h4>
          <button
            type="button"
            className="btn-secondary btn-compact about-update-check"
            onClick={handleCheckUpdate}
            disabled={checking}
          >
            {checking ? <Loader2 size={14} className="about-spin" /> : <RefreshCw size={14} />}
            {checking ? '检查中…' : '检查更新'}
          </button>
        </div>

        <div className="about-update-row">
          <span className="about-update-label">更新包位置</span>
          <span className="about-update-path" title={downloadDir || locations?.defaultDownloadDir || ''}>
            {downloadDir || locations?.defaultDownloadDir || '检测中…'}
          </span>
        </div>
        <p className="settings-hint about-update-hint">{downloadSourceHint}</p>

        {locations ? (
          <p className="settings-hint about-update-hint">
            当前程序：{locations.appExe}
            {locations.isInstalledBuild ? '（安装版，更新会沿用该目录）' : '（便携版，更新包默认下到程序旁边）'}
          </p>
        ) : null}

        <div className="button-row about-update-actions">
          <button type="button" className="btn-secondary btn-compact" onClick={chooseDownloadDir}>
            <FolderOpen size={14} />
            更改下载位置
          </button>
          <button
            type="button"
            className="btn-secondary btn-compact"
            onClick={() => revealInExplorer(downloadDir || locations?.defaultDownloadDir || '')}
            disabled={!(downloadDir || locations?.defaultDownloadDir)}
          >
            <FolderOpen size={14} />
            打开所在文件夹
          </button>
          {installerDownloadDir ? (
            <button
              type="button"
              className="btn-secondary btn-compact"
              onClick={() => {
                updateExperience({ installerDownloadDir: '' });
                showLauncherNotice('已恢复为自动检测下载位置');
              }}
              title="忘记上次记住的目录，重新按「程序所在目录」自动检测"
            >
              <RotateCcw size={14} />
              恢复自动检测
            </button>
          ) : null}
        </div>

        {errorHint ? <p className="about-update-error">{errorHint}</p> : null}

        {updateInfo ? (
          updateInfo.hasUpdate ? (
            <div className="about-update-card">
              <div className="about-update-card-title">
                发现新版本 v{updateInfo.latestVersion}（当前 v{updateInfo.currentVersion}）
              </div>
              {installerAsset ? (
                <div className="about-update-asset">
                  {installerAsset.name}
                  {installerAsset.size > 0 ? ` · ${formatBytes(installerAsset.size)}` : ''}
                </div>
              ) : (
                <div className="about-update-asset">该版本没有可下载的安装包，请到 Release 页面手动下载</div>
              )}

              {downloading ? (
                <div className="about-update-progress" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
                  <div className="about-update-progress-bar" style={{ width: `${percent}%` }} />
                  <span className="about-update-progress-text">
                    {progress ? `${percent}% · ${formatBytes(progress.received)} / ${progress.total > 0 ? formatBytes(progress.total) : '未知大小'}` : '准备下载…'}
                  </span>
                </div>
              ) : null}

              <div className="button-row">
                <button
                  type="button"
                  className="btn-primary btn-compact"
                  onClick={handleDownload}
                  disabled={downloading || !installerAsset}
                >
                  <Download size={14} />
                  {savedInstaller ? '重新下载' : '下载更新包'}
                </button>
                <a className="btn-secondary btn-compact" href={updateInfo.releaseUrl} target="_blank" rel="noreferrer">
                  <ExternalLink size={14} />
                  查看发布页面
                </a>
              </div>

              {savedInstaller ? (
                <div className="about-update-saved">
                  <div className="about-update-saved-path" title={savedInstaller}>
                    已保存：{savedInstaller}
                  </div>
                  <div className="button-row">
                    <button type="button" className="btn-primary btn-compact" onClick={handleRunInstaller}>
                      运行安装包并退出
                    </button>
                    <button type="button" className="btn-secondary btn-compact" onClick={() => revealInExplorer(savedInstaller)}>
                      <FolderOpen size={14} />
                      打开所在文件夹
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="settings-hint about-update-hint">
              已是最新版本 v{updateInfo.latestVersion}，无需更新。
            </p>
          )
        ) : null}
      </div>
    </section>
  );
}
