# v71 本页缺失图标补齐 / 同站 favicon 复用

## 修改内容

1. “刷新本页图标”只处理当前页面中没有图标的项目。
   - 已经有图标的项目不会重新获取，也不会被覆盖。
   - 当前页面全部已有图标时会提示无需补齐。

2. 项目右键“刷新当前项目图标”仍然是单项目强制刷新。
   - 只刷新右键选中的项目。
   - 网站项目会替换对应主域名的本地 favicon 缓存。

3. 同一网站主域名及子域名复用 favicon。
   - 例如 github.com、www.github.com、gist.github.com 使用同一个 github.com 缓存。
   - 如果以前版本已经下载过同站图标，会扫描并优先复用旧缓存。
   - 常见多级域名后缀（如 com.cn、co.uk、com.au）会保留正确的主域名层级。

4. 版本更新为 v71 / 0.1.71。

## 验证

- 已执行 npm ci。
- 已执行 npm run build，TypeScript/Vite 前端构建通过。
- 当前环境没有 Cargo，Windows Rust 原生命令需在 Windows 本机完成最终编译验证。
