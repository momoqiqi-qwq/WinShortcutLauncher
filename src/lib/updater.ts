import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

/**
 * 「用 setup exe 更新」这套流程的前端入口。
 *
 * 目录决策在后端（`src-tauri/src/updater.rs` 的 `pick_installer_dir`）：先记住上次下载目录，
 * 再自动检测当前程序所在目录，然后系统下载目录，最后临时目录兜底。
 * 这里的纯函数只负责展示和兜底判断，方便单测。
 */

export interface UpdateAsset {
  name: string;
  size: number;
  downloadUrl: string;
}

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  releaseUrl: string;
  releaseNotes: string;
  publishedAt: string;
  assets: UpdateAsset[];
}

/** 默认下载目录是怎么定下来的。 */
export type DownloadSource = 'remembered' | 'app' | 'downloads' | 'temp';

export interface UpdateLocations {
  /** 当前程序所在目录（「软件装在哪」）。 */
  appDir: string;
  appExe: string;
  /** 目录里有 uninstall.exe，说明是安装版。 */
  isInstalledBuild: boolean;
  defaultDownloadDir: string;
  defaultDownloadSource: DownloadSource;
  rememberedDirUsable: boolean;
}

export interface DownloadProgress {
  fileName: string;
  received: number;
  total: number;
  percent: number;
}

export const UPDATE_DOWNLOAD_PROGRESS_EVENT = 'updater-download-progress';

export function parseVersion(raw: string): [number, number, number] | null {
  const trimmed = String(raw ?? '').trim().replace(/^[vV]/, '');
  if (!trimmed) return null;
  const core = trimmed.split(/[-+]/)[0] ?? '';
  if (!core) return null;
  const parts = core.split('.');
  const numbers: number[] = [];
  for (let index = 0; index < 3; index += 1) {
    const piece = parts[index];
    if (piece === undefined || piece === '') {
      numbers.push(0);
      continue;
    }
    const value = Number.parseInt(piece, 10);
    if (!Number.isFinite(value) || value < 0) return null;
    numbers.push(value);
  }
  return [numbers[0], numbers[1], numbers[2]];
}

export function isNewerVersion(latest: string, current: string): boolean {
  const next = parseVersion(latest);
  if (!next) return false;
  const now = parseVersion(current);
  if (!now) return true;
  for (let index = 0; index < 3; index += 1) {
    if (next[index] !== now[index]) return next[index] > now[index];
  }
  return false;
}

/** 从附件里挑安装包：优先带 setup 的 exe，其次任意 exe，最后退回第一个附件。 */
export function pickInstallerAsset(assets: UpdateAsset[] | undefined | null): UpdateAsset | null {
  const list = Array.isArray(assets) ? assets : [];
  const exeAssets = list.filter((asset) => asset.name.toLowerCase().endsWith('.exe'));
  const setup = exeAssets.find((asset) => asset.name.toLowerCase().includes('setup'));
  return setup ?? exeAssets[0] ?? list[0] ?? null;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const digits = unitIndex === 0 ? 0 : value >= 100 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[unitIndex]}`;
}

/** 把「默认下载目录是哪来的」翻成中文说明，让用户知道为什么默认在这里。 */
export function describeDownloadSource(source: DownloadSource | undefined, fallbackDir: string): string {
  switch (source) {
    case 'remembered':
      return '沿用上次下载更新安装包的位置';
    case 'app':
      return '自动检测到软件所在目录，更新包默认下到程序旁边';
    case 'downloads':
      return '未检测到可写目录，使用系统下载文件夹';
    case 'temp':
      return fallbackDir ? '使用系统临时目录兜底' : '使用系统临时目录';
    default:
      return '更新包默认下载位置';
  }
}

export function checkUpdate(currentVersion: string): Promise<UpdateInfo> {
  return invoke<UpdateInfo>('check_update', { currentVersion });
}

export function getUpdateLocations(preferredDir?: string | null): Promise<UpdateLocations> {
  return invoke<UpdateLocations>('get_update_locations', { preferredDir: preferredDir ?? null });
}

export function downloadInstaller(payload: {
  url: string;
  directory: string;
  fileName: string;
}): Promise<string> {
  return invoke<string>('download_installer', {
    url: payload.url,
    directory: payload.directory,
    fileName: payload.fileName,
  });
}

export function launchInstaller(payload: {
  installerPath: string;
  installDir?: string | null;
  silent?: boolean;
  exitAfter?: boolean;
}): Promise<void> {
  return invoke<void>('launch_installer', {
    installerPath: payload.installerPath,
    installDir: payload.installDir ?? null,
    silent: payload.silent ?? false,
    exitAfter: payload.exitAfter ?? false,
  });
}

export function listenDownloadProgress(
  handler: (progress: DownloadProgress) => void,
): Promise<UnlistenFn> {
  return listen<DownloadProgress>(UPDATE_DOWNLOAD_PROGRESS_EVENT, (event) => handler(event.payload));
}

/** 打开某个文件所在的文件夹（复用后端已有的 explorer /select）。 */
export function revealInExplorer(path: string): Promise<void> {
  return invoke<void>('open_file_location', { path });
}
