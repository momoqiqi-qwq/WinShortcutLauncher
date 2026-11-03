/**
 * v192: 「配置文件」列表的行布局偏好。
 *
 * 面板右上角那个「多行」按钮就是切这个状态：
 * - `compact`（默认）= 单行紧凑，名称超长时省略号截断，和 V191 之前完全一样；
 * - `multiline` = 多行显示，名称完整换行、来源与更新时间各占一行、操作按钮独占一行。
 *
 * 存的是纯字符串，读不出来的值一律回落到 `compact`，老用户升级后看到的面板不变。
 */
export type ProfileListLayout = 'compact' | 'multiline';

export const PROFILE_LIST_LAYOUT_KEY = 'yue-launcher-config-profiles-layout-v1';

const MULTILINE_VALUE = 'multiline';

export function parseProfileListLayout(raw: string | null | undefined): ProfileListLayout {
  return (raw ?? '').trim().toLowerCase() === MULTILINE_VALUE ? 'multiline' : 'compact';
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function readProfileListLayout(): ProfileListLayout {
  const storage = safeStorage();
  if (!storage) return 'compact';
  try {
    return parseProfileListLayout(storage.getItem(PROFILE_LIST_LAYOUT_KEY));
  } catch {
    return 'compact';
  }
}

export function writeProfileListLayout(layout: ProfileListLayout): void {
  const storage = safeStorage();
  if (!storage) return;
  try {
    if (layout === 'multiline') storage.setItem(PROFILE_LIST_LAYOUT_KEY, MULTILINE_VALUE);
    else storage.removeItem(PROFILE_LIST_LAYOUT_KEY);
  } catch {
    // 隐私模式 / 配额满时写不进去也不影响这次使用，下次打开回落到单行。
  }
}
