import packageInfo from '../../package.json';

/**
 * 当前构建的版本号。
 *
 * 唯一来源是项目根目录的 `package.json` —— 它由 `AGENTS.md` 的版本号铁律与
 * `src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`、`README.md` 首行保持完全一致，
 * 所以这里读到的就是构建产物（exe / 安装包）的版本。
 *
 * 需要显示或比较版本的地方统一从这里取，不要各自去读 package.json。
 */
export const APP_PACKAGE_VERSION: string = packageInfo.version;
