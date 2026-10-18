# V135 版本说明：添加了更多动画

版本号 0.1.134 → 0.1.135。本版为动画增强，不改动数据结构与持久化格式。

## 新增动画

为多个二级面板补齐了统一的“背景层淡入 + 面板上滑淡入 + 内容分级上滑”入场动画，让面板出现时更有层次，不再硬切：

- **设置面板**：`settings-layer-enter` / `settings-panel-enter`，以及分类切换时的 `settings-tab-enter`。
- **全局搜索**：`global-search-backdrop-in` / `global-search-modal-in` / `global-search-content-in`。
- **文件中转站**：`transfer-station-enter` / `transfer-station-content-enter`。
- **图片浏览器**：`image-browser-enter` / `image-browser-content-enter`。
- **多账号批量生成**：`multi-account-backdrop-enter` / `multi-account-dialog-enter`。

## 兼容与约束

- 全部动画仍受「设置 → 体验 → 减少动画」总开关约束，开启后会跳过过渡直接显示。
- 动画只使用 `opacity` 与 `transform`，避免触发布局重排，不影响面板打开速度与窗口贴边逻辑。
- 未新增运行时依赖，未改变 store 版本（`APP_STORE_VERSION` 不变）。

## 验证与构建

- `npx tsc --noEmit` 通过；`npm run test` 全部通过。
- `npm run tauri:build` 构建通过，产物版本 0.1.135。
