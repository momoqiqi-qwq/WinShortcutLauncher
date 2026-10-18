# V38 图片截取跟手与统一 UI 弹窗修复

## 本次修改

1. 图片预览截取跟手修复
   - 截取模式新增可视化十字准线，鼠标移动时实时跟随。
   - 拖选时使用 pointer capture，减少鼠标快速移动或移出图片区域后的丢帧。
   - 截图框使用 border-box，对齐右下角位置，避免右下角偏离十字中线。

2. 图片截取框右下角对齐
   - 拖动时同步更新十字准线和截图框。
   - 截图框右下角按同一套坐标计算，避免方框右下角落后或偏移。

3. 替换 tauri.localhost 原生弹窗
   - 新增软件内 UiDialogHost。
   - 替换 window.alert / window.confirm / window.prompt，避免再显示 `tauri.localhost 显示`。
   - 统一弹窗跟随当前主题颜色、面板、边框、强调色。

## 构建

已执行：

```bash
npm run build
```

前端构建通过。当前环境未执行 Cargo/Tauri 原生编译。
