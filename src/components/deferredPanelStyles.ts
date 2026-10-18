// v162: 设置面板 / 全局搜索 / 中转站 / 图片浏览器改成了按需加载（见 DeferredPanels.tsx），
// 但它们的样式仍然在这里静态引入，留在主 CSS 里，并保持和以前完全相同的先后顺序：
// 1) 主题和 index.css 里同优先级的覆盖规则依旧排在它们后面，外观不会变；
// 2) 第一次打开面板时不会出现样式晚到的闪烁。
// 顺序按 V0.1.161 打包结果里各文件出现的位置排列，调整时请保持。
import './Settings/ThemeGallerySection.css';
// BackgroundMedia 组件被设置页的主题区引用，它的样式原来就排在这里（组件本身仍在主包）。
import './BackgroundMedia/BackgroundMedia.css';
import './Settings/SettingsSurfaceAppearanceControls.css';
import './Settings/ParentGroupAppearanceControls.css';
import './Settings/ColorFrameAppearanceControls.css';
import './Settings/BrowserRouterSettingsSection.css';
import './Settings/ParentGroupColorSettings.css';
import './Settings/DirectoryItemColorSettings.css';
import './Settings/ImportCenterDialog.css';
import './Settings/SettingsSearchResults.css';
import './GlobalSearch/GlobalSearchModal.css';
import './TransferStation/TransferStation.css';
import './ImageBrowser/ImageBrowserPanel.css';
