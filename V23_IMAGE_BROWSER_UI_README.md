# V23 图片浏览器与右上角按钮优化

本版完成：

1. 图片浏览器右上角新增“设置”按钮，可在图片浏览面板内直接调整：
   - 面板宽度
   - 左侧缩略图区宽度
   - 缩略图宽度
   - 预览留白
   - 图片圆角
   - 面板不透明度
   - 预览背景色
   - 预览显示方式
   - 是否显示缩略图文件名 / 图片路径信息 / 拖拽提示 / 允许拖入

2. 图片浏览器左边缘可拖动调整整个图片浏览面板宽度。

3. 图片浏览器缩略图区和预览区之间新增分割拖拽条，可单独调整左侧缩略图区宽度。

4. 主界面右上角按钮支持拖动排序，排序会保存到配置中。可拖动：
   - 全局搜索
   - 文件中转站
   - 图片浏览
   - 新增父目录
   - 设置
   - 最小化
   - 关闭

5. 新增配置字段：
   - `display.windowControlOrder`
   - `imageBrowser.thumbnailPaneWidth`
   - `imageBrowser.previewBackground`
   - `imageBrowser.previewPadding`
   - `imageBrowser.previewRadius`
   - `imageBrowser.panelOpacity`
   - `imageBrowser.showHint`
   - `imageBrowser.showImageMeta`

已执行前端构建测试：

```powershell
npm run build
```
