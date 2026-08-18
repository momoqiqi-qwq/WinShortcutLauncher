# V21 图标加载与性能重构

本版完成：

- 设置 → 搜索/中转：新增“全局搜索图标解析方式 / 并发数”。
- 设置 → 搜索/中转：新增“快捷项目图标解析方式 / 并发数”。
- ItemCard 统一通过 `resolveCommand()` 选择图标命令，避免缓存 key 不一致。
- ItemCard 减少 Zustand store 订阅，display / behavior / transferStation 改由 ContentArea 传入。
- 图标并发默认从 3 提升到 6，可在设置中调节 1～8。
- `writePersistentIcon()` 增加 2MB 大小守卫，避免超大图标反复触发 localStorage 配额驱逐。
- `preloadIconDataUrls()` 预加载前跳过已缓存项目。
- 全局搜索图标解析也支持自动 / 直接读取图片 / Windows 提取图标三种模式。
- `useStableEdgeDock` 合并重复配置 effect，缩小 MutationObserver 范围，减少图标加载和拖拽时的贴边控制器重配置。
- `sortItems()` / `sortForDisplay()` 合并到 `src/lib/sort.ts`。
- 启动防抖改为 500ms，适配 Windows 较慢双击间隔。

建议：

- 快捷项目图标解析方式：自动判断。
- 图标并发：6，机器性能好可以调到 8。
- 如果自定义图标主要是 png/ico/svg，可以把全局搜索图标解析方式设为“直接读取图片文件”。
