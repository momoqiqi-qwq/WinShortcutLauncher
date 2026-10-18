# V125 网站图标获取 / 显示 / 延迟优化

本版本集中修复网站 favicon 经常抓到不可用图片、下载后 WebView 无法显示、子域名图标串用、以及新增网址时等待图标导致体感延迟的问题。

## 1. 获取链路

- favicon 响应不再只看扩展名或 Content-Type，改为检查真实文件签名。
- 支持 PNG/APNG、JPEG/JFIF、GIF、WebP、ICO、BMP、AVIF、SVG。
- 同时尝试网站根目录常见图标路径和 favicon 服务，单批最多 6 个并发请求。
- favicon 请求使用较短超时，避免单个失效来源把整条链路拖到数秒甚至更久。
- 网站自有图标与第三方来源同时成功时，给网站自有图标 160ms 优先窗口，降低抓到通用占位图的概率。
- 快速来源全部失败后，再读取页面 `<link rel="icon">` / `apple-touch-icon` / `mask-icon`，并支持相对地址、协议相对地址和 `data:image/...` 内联图标。
- 页面没有足够图标声明时，继续读取 Web App Manifest 的 `icons`。
- 已知通用占位 favicon（包括本次提供的 32x32 地球占位图）会被识别为无效结果并继续换源。
- 已落盘但内容损坏、格式不匹配或命中占位图的缓存会自动删除后重新获取。

## 2. 显示链路

- 本地图片路径识别新增 APNG / JFIF / BMP / AVIF。
- Rust 本地图片读取按真实字节判断 MIME，不再因为“AVIF 内容被保存成 .png”等扩展名错误导致 WebView 解码失败。
- `<img>` 解码失败时不再留下破图标，立即退回项目类型图标。
- URL 项目发生图片读取/解码失败时自动做一次 favicon 修复；修复复用后端 in-flight 去重，不重复轰炸同一站点。
- 自动修复如果复用了同一个本地文件路径，会主动清掉该路径的内存/持久图标缓存并重新读取新字节，避免“文件已经修好但界面仍显示旧破图”。
- 已缓存的通用地球占位图在本地读取阶段也会被拒绝，从而触发自动修复。
- 前端持久图标缓存从 v3 升到 v4，并清理旧 v3 键，避免旧的错误 MIME / 占位图 data URL 继续绕过新校验或占满 localStorage。

## 3. 子域名策略

V124 会把 `github.com`、`gist.github.com` 等全部压成同一主域名缓存。V125 只合并 `www.example.com` 与 `example.com`，真实子域名独立获取和缓存，避免 docs/app/gist 等子站误用主站 favicon。

## 4. 体感延迟

- 浏览器拖入网址：项目先用在线 provisional favicon 立即显示，后台再换成本地验证后的缓存。
- 手动添加网址：同样先创建项目，再异步落本地图标。
- 多账号批量生成：不再 `await` 所有 URL 的 favicon 后才创建项目；先批量生成，再后台按 URL 回填本地图标。
- 批次替换网址：先更新网址和 provisional favicon，再异步刷新本地图标。

## 5. 兼容与回归

V124 的标题缓存、HTTP Client 复用、title/favicon in-flight 去重、原 favicon 来源设置和手动强制刷新仍保留。
