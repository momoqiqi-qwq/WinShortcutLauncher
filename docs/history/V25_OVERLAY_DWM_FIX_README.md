# V25 Overlay Close + DWM Ghost Line Fix

本版改动：

1. 打开图片浏览时，点击主界面区域会关闭图片浏览；点击图片浏览器内部不会关闭。
2. 打开文件中转站时，点击主界面区域会关闭文件中转站；点击中转站内部不会关闭。
3. 打开设置时，点击主界面区域会关闭设置；点击设置面板内部不会关闭。
4. 修复透明窗口边缘可能出现的 1px DWM 残线：
   - `src-tauri/Cargo.toml` 的 `windows-sys` features 新增 `Win32_Graphics_Dwm`。
   - `src-tauri/src/lib.rs` 新增 `remove_dwm_ghost_line()`，在 setup 阶段调用 `DwmExtendFrameIntoClientArea`，四边 margin 全部设为 0。

前端构建验证：

```powershell
npm run build
```

Rust / Windows 原生窗口部分需在 Windows 上运行：

```powershell
npm run tauri:dev
npm run tauri:build
```
