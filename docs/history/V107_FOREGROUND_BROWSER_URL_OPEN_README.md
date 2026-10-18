# v0.1.107 - 网址打开浏览器模式

## 本版新增

在“设置 → 操作行为 → 启动与关闭”中新增“网址打开浏览器”：

- 系统默认浏览器（默认值）
- 前台浏览器（检测不到时自动回退系统默认浏览器）

## 前台浏览器模式的行为

只有当用户选择“前台浏览器”时，打开 `http://` / `https://` 网址才会执行浏览器检测。

Windows 端会：

1. 先检查当前最前窗口。
2. 如果最前窗口是 Yue launcher 自己，则沿窗口 Z 顺序继续向后寻找最靠前的可见、非最小化浏览器窗口。
3. 找到支持的浏览器后，使用该浏览器的实际可执行文件打开网址。
4. 如果没有找到支持的浏览器，或该浏览器启动网址失败，则自动回退 Windows 系统默认浏览器。

因此，从浏览器切到 Yue launcher 再点击网址时，仍能尽量使用刚才位于前面的浏览器。

## 当前识别的常见浏览器

- Microsoft Edge
- Google Chrome
- Mozilla Firefox
- Brave
- Vivaldi
- Opera / Opera GX
- Arc
- Zen Browser
- Floorp
- Thorium
- Catsxp
- 360 极速浏览器 / 360 安全浏览器
- QQ 浏览器
- 搜狗浏览器
- Naver Whale

无法识别的浏览器不会导致网址打不开，而是直接回退系统默认浏览器。

## 设置 UX

选择“前台浏览器”后会显示“测试当前前台浏览器”按钮。检测只在：

- 真正打开网址时；或
- 用户主动点击测试按钮时

发生，不会在后台持续检测。

## 配置兼容

新增配置字段：

```ts
behavior.urlOpenMode: 'default' | 'foreground-browser'
```

旧配置没有该字段时自动迁移为 `default`，因此升级后不会改变原来的网址打开习惯。

## 代码改动位置

- `src/types.ts`
- `src/stores/appStore/defaults.ts`
- `src/stores/appStore/normalizers.ts`
- `src/lib/launchShortcut.ts`
- `src/components/Settings/BehaviorSettingsSection.tsx`
- `src/lib/settingsSearchIndex.ts`
- `src-tauri/src/commands.rs`
- `src-tauri/src/lib.rs`
- `src-tauri/Cargo.toml`

另外更新了中转站和图片浏览器对 `launch_item` 的调用参数，保持 Tauri 命令兼容。
