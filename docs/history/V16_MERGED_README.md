# V16 合并完成说明

本版本基于 `tauri-shortcut-launcher-topbar-search-transfer-merge-v15` 合并了 V16 功能：

1. 全局搜索结果左侧显示项目图标，支持缓存、异步提取系统图标。
2. 设置面板新增“搜索/中转”分类，可调节全局搜索和文件中转站行为。
3. 文件中转站支持拖入文件/文件夹，也支持把中转站项目拖到本应用里的“文件夹”快捷项目上复制/移动。
4. 新增更多主题，并在主题选择区加入主题图库。
5. Rust 后端新增 `transfer_station` 命令：`copy_transfer_paths_to_folder`、`get_path_kind`。

前端已通过：

```powershell
npm run build
```

当前生成环境没有 Windows Cargo，因此 Rust 部分请在 Windows 上验证：

```powershell
npm install
npm run tauri:dev
npm run tauri:build
```
