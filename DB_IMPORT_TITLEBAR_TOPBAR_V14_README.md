# V14 修复说明

本版在 V13 基础上修复：

1. 右上角 `-` / `X` 点击无效
   - 为 Tauri v2 增加 `core:window:allow-minimize` / `core:window:allow-close` 权限。
   - 窗口按钮增加 `data-no-drag` 和 `pointerdown` 阻止拖动冒泡，避免被无边框窗口拖拽区域吞掉点击。

2. 父目录等宽显示时新增分组不自动增加一行
   - `TopBar` 新增 ResizeObserver 实时测量标签行数。
   - 新增 `--topbar-visible-rows`，1～3 行自适应高度。
   - 点击 `+` 新增父目录后会立即重新计算顶部栏高度。

3. 导入数据支持 `.db`
   - 设置 → 数据 → 导入配置 现在支持 JSON 和 Lucy/Maye 的 `link.db`。
   - 如果同目录存在 `icon.db`，会自动读取 `Cache` 表并把图标写入项目配置的 `data:image/png;base64,...`。
   - 也可以选择 `icon.db`，程序会自动查找同目录的 `link.db`。

前端已执行：

```powershell
npm run build
```

通过。

注意：Rust / Cargo 构建需要在 Windows 本机验证。
