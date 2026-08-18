import type { BrowserRouterSettings, DetectedBrowser, DetectedBrowserProfile } from '../types';
import { getBrowserProfileDisplayName } from './browserRouter';

export interface BrowserLaunchTargetPayload {
  browserId?: string;
  browserName?: string;
  executable: string;
  engine: string;
  profileId?: string;
  profileName?: string;
  profilePath?: string;
  profileKey?: string;
  profileRoot?: string;
}

export function buildBrowserLaunchTarget(
  browser: DetectedBrowser | undefined,
  profile: DetectedBrowserProfile | undefined,
  router: BrowserRouterSettings,
): BrowserLaunchTargetPayload | undefined {
  if (!browser?.executable) return undefined;
  return {
    browserId: browser.id,
    browserName: browser.name,
    executable: browser.executable,
    engine: browser.engine,
    profileId: profile?.id,
    profileName: profile ? getBrowserProfileDisplayName(router, browser.id, profile) : undefined,
    profilePath: profile?.path,
    profileKey: profile?.profileKey,
    profileRoot: browser.profileRoot,
  };
}
