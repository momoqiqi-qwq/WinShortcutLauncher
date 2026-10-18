# v57 Browser URL Drop Fix

- 修复从浏览器拖动网页/地址栏到 exe 时，被识别成 `.url` 文件并弹出“添加快捷项目”的问题。
- 拖入时会优先读取 `text/uri-list`、`text/x-moz-url`、`text/html`、`text/plain` 等网页 URL 数据。
- 即使浏览器同时带了虚拟 `.url` 文件，也会优先作为“网站”添加。
- 版本更新：0.1.57。
