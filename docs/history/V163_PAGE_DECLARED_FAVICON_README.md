# v0.1.163 网站自带图标优先

## 1. 问题

以 `https://treapgogo.github.io/deepseek-whale-girl/` 为例：页面在 `<head>` 里声明了自己的图标

```html
<link rel="icon" type="image/png" sizes="256x256" href="./assets/whale-girl-logo-dynamic.png" />
```

但快捷方式显示的是 GitHub 的图标。原因有两层：

1. **取图标时根本没用页面自己声明的图标**。旧顺序是 `quicker → favicon.im → … → direct`，全部按「域名」向第三方要图标，网页 HTML 从没被读过。
2. **域名被收敛过头**。`treapgogo.github.io` 被当成子域压成 `github.io`，于是无论向哪个来源请求，拿到的都是 `github.io` 这个「站点」的图标 —— 也就是 GitHub 的。

两个原因叠加：即使页面有专属 logo，也一定被平台通用图标顶掉。

## 2. 图标源顺序

`favicon_provider_order` 的 `auto` 顺序改为：

```
page → quicker → favicon.im → iowen → google → duckduckgo
     → clearbit → icon.horse → faviconkit → yandex → direct
```

`page` 是新来源，实现为 `fetch_page_declared_icon`：抓一次页面 HTML，按优先级收集候选地址

| 优先级 | 来源 | 说明 |
| --- | --- | --- |
| 1 | `<link rel="icon">` / `rel="shortcut icon"` | 主图标，`sizes` 有大尺寸时加权 |
| 2 | `<link rel="apple-touch-icon">` | 通常是高清方形图 |
| 3 | `<meta property="og:image">` | 分享图，作为兜底 |

同一条链里多个 `<link rel="icon">` 会全部作为候选，按 `sizes` 与声明顺序排序后逐个尝试，第一个能解码成图片的胜出。

地址处理：

- 相对路径按**页面 URL** 解析 —— `./assets/x.png` 在 `https://host/proj/` 下解析为 `https://host/proj/assets/x.png`，不是站点根。
- 支持 `data:image/...;base64,` 内联图标，直接解码使用（小于 32 字节的忽略）。
- `javascript:`、`#fragment`、`mailto:` 之类直接丢弃。
- 属性解析容忍单引号、双引号、无引号与大小写混写。

## 3. 缓存键

| 层级 | 文件名 | 适用 |
| --- | --- | --- |
| 页面级 | `page_<页面 URL 哈希>` | `page` 来源成功时 |
| 域名级 | `site_<缓存域名>` | 第三方来源成功时 |

页面级缓存**忽略 query**：`?from=bookmark` 与裸网址共用一个文件，同路径不同书签不会重复下载。同一主机下不同路径互不影响，`/deepseek-whale-girl/` 和 `/other-project/` 各存各的。

读取顺序也改了：`auto` / `page` 模式下先查页面级缓存，**不再先查域名级缓存**。旧版本按域名猜出来的图标（`site_github.io.png` → GitHub 图标）不会再短路掉页面自带图标。

## 4. 托管平台保留完整子域

`favicon_cache_domain`（Rust）与 `baseDomainFromHost`（前端）都新增托管后缀判断，下列后缀一律保留完整主机名：

```
github.io  gitlab.io  gitee.io  githubusercontent.com
netlify.app  vercel.app  pages.dev  workers.dev  web.app
firebaseapp.com  blogspot.com  neocities.org  surge.sh
onrender.com  deno.dev  replit.app  glitch.me  fly.dev
herokuapp.com  azurewebsites.net  cloudfront.net  s3.amazonaws.com
readthedocs.io  now.sh
```

普通站点维持原规则：`www.example.com` → `example.com`，`blog.example.com` → `example.com`，复合后缀按 `co.uk`、`com.cn` 一类三段处理。

## 5. 兼容与约束

- 设置里新增「页面自带图标」来源（直连组）。显式选它时只抓页面；勾了「失败时自动尝试其他来源」才会继续往下走。
- 关闭「自动获取网站 favicon 时保存到本地」时，前端在线地址对 `page` 自动退回 Quicker —— 浏览器跨域读不到别的站点的 HTML，不能拼出页面图标的直链。
- 页面抓取失败会记入 `page_icon_misses`，10 分钟内不再重复抓同一个网址，避免每次打开都白等一次 HTML。
- 已经保存过旧图标（`site_github.io.*`）的快捷方式不会自动重取，需要手动「重新获取图标」或删除图标后再取一次。
- 页面图标只认 `<head>` 里声明的；纯 JS 运行时注入的图标（例如某些 SPA 在挂载后才写 `<link>`）抓不到，会回落到第三方来源。

## 6. 验证

- Rust：`cargo test --release --lib website_metadata` —— 11 项通过，其中 8 项本次新增（托管平台保子域、候选排序、相对路径解析、页面缓存前缀、`auto` 顺序、标签属性解析、内联 `data:` 解码、失败记忆）。
- 前端：`npm test` —— 43 个文件 229 项通过，其中 `faviconProviders.test.ts` 新增 2 项（托管平台子域、`page` 回退到在线来源）。
- 类型与断言：`npm run typecheck`、`node scripts/verify-source-fixes.mjs` 均通过。
