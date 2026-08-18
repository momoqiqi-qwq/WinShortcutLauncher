# v0.1.108 Browser Router / 浏览器路由中心

本版本把 v107 的“系统默认浏览器 / 前台浏览器”升级为完整的网址路由体系，并加入浏览器 Profile、父目录继承和单网址覆盖。

## 1. 全局三种网址打开模式

位置：`设置 -> 操作行为 -> 启动与关闭 -> 浏览器路由中心`

- **系统默认浏览器**：继续交给 Windows 默认浏览器打开。
- **前台浏览器**：点击网址时才检测最靠前的可识别浏览器；检测不到或打开失败时回退系统默认浏览器。
- **指定浏览器 / Profile**：固定用某个浏览器及可选 Profile 打开；指定目标失效或启动失败时回退系统默认浏览器。

## 2. 自动扫描浏览器

Windows 端会扫描：

- Google Chrome
- Microsoft Edge
- Mozilla Firefox
- Floorp

扫描会组合常见安装目录和 Windows App Paths；非标准安装、便携版或其他浏览器可以在设置中通过“添加 EXE”手动加入。

## 3. 自动读取 Profile / 账号环境

### Chrome / Edge

- 读取浏览器 `User Data/Local State` 中的 Profile 信息。
- 如果无法读取 Local State，会回退扫描 `Default` 和 `Profile *` 目录。
- 启动指定 Profile 时使用浏览器 User Data 根目录和 Profile Directory。

### Firefox / Floorp

- 优先读取 `profiles.ini`。
- 无法读取时扫描 `Profiles` 目录。
- 启动时优先按 Profile 的实际目录启动，因此比只记 Profile 显示名称更稳定。

### 便携版 / 自定义浏览器

添加浏览器 EXE 后可以手动指定：

- 浏览器引擎：Chromium / Firefox-Gecko / 通用
- Profile / User Data 根目录

这适合 Floorp Portable、Firefox Portable、其他 Chromium 分支等非标准目录结构。

## 4. Profile 重命名和颜色

在“已发现浏览器与 Profile”中：

- 可以给 Profile 设置启动器内部显示名称，例如“AI”“工作”“私人”。
- 可以设置颜色，方便快速区分账号环境。
- 改名和颜色只保存在启动器配置里，不会修改浏览器自身 Profile 数据。
- 可一键恢复某个 Profile 的默认名称和颜色。

## 5. 路由优先级

实际打开网址时使用以下优先级：

1. **单个网址自己的设置**
2. **网址所在父目录的设置**
3. **全局浏览器路由中心设置**
4. 若指定启动失败，则最终回退 **Windows 系统默认浏览器**

例如：

- 父目录 `AI` -> `Floorp · AI`
- 父目录 `工作` -> `Edge · Work`
- 父目录 `钱` -> `Chrome · Personal`

如果 `AI` 目录里的某个网址单独指定 `Chrome · AI`，这个网址会覆盖父目录设置；其余网址仍走 `Floorp · AI`。

## 6. 父目录默认浏览器 / Profile

位置：`设置 -> 导航 -> 父目录默认浏览器 / Profile`

每个父目录都支持：

- 继承全局
- 系统默认浏览器
- 前台浏览器
- 指定浏览器 / Profile

原有父目录颜色仍保留，可以把视觉分组和账号路由结合起来。

## 7. 每个网址单独指定浏览器 / Profile

右键网址 -> 编辑快捷项目 -> `网址浏览器 / Profile`

支持：

- 继承上一级
- 系统默认浏览器
- 前台浏览器
- 指定浏览器 / Profile

“继承上一级”会先读取父目录设置，再读取全局设置。

## 8. 测试功能

浏览器路由中心加入：

- **测试当前前台浏览器**
- **测试浏览器**
- **测试浏览器 / Profile**
- 每个已扫描 Profile 都有独立“测试”按钮
- **重新扫描**浏览器和 Profile

Profile 测试会打开空白页，用来确认浏览器和账号环境是否正确。

## 9. 失败回退

无论是：

- 指定浏览器 EXE 被移动/删除
- Profile 不存在
- 自定义浏览器配置错误
- 前台浏览器无法识别
- 指定浏览器启动失败

网址最终都会尝试交给系统默认浏览器打开，避免“智能路由失败 = 网址打不开”。

## 10. v107 配置兼容

- v107 `behavior.urlOpenMode = default` 会迁移为 Browser Router 的“系统默认浏览器”。
- v107 `behavior.urlOpenMode = foreground-browser` 会迁移为“前台浏览器”。
- 新字段缺失时统一使用安全默认值。
- `behavior.urlOpenMode` 继续保留为兼容字段，但 v108 以后 Browser Router 配置是主要数据来源。

持久化 Store 版本已升级到 `20`。

## 11. 主要代码结构

新增：

- `src/lib/browserRouter.ts`：路由标准化、继承优先级、Profile 显示信息
- `src/lib/browserLaunchTarget.ts`：浏览器/Profile 测试目标构建
- `src/hooks/useBrowserCatalog.ts`：浏览器目录扫描与前端缓存
- `src/components/Settings/BrowserRouterSettingsSection.tsx`
- `src/components/Settings/BrowserRoutePicker.tsx`
- `src/components/Settings/ParentGroupBrowserRoutingSettings.tsx`
- `src/lib/__tests__/browserRouter.test.ts`

Rust / Tauri 新增：

- `scan_browsers`
- `test_browser_target`
- `launch_item` 增加指定浏览器/Profile 参数和回退逻辑

## 12. 当前限制

- “前台浏览器”模式当前可靠识别浏览器进程，但**不会尝试猜测前台窗口具体使用哪个 Profile**。这是故意设计的：窗口标题并不能稳定提供 Profile ID，强行猜测容易把网址开到错误账号。
- Floorp / Firefox / Chromium 各分支的便携版目录差异很大，非标准目录建议使用“自定义浏览器 + Profile 根目录”。
- 此交付环境没有 Rust/Cargo 工具链，因此 Rust 端无法在这里执行 `cargo check` 或 Windows WebView2 实机启动测试；需要在 Windows 开发环境做最终原生回归。
