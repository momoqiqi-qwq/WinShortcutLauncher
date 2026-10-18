# V129 网站浏览器选择 + 项目单/双击复制

版本：`0.1.129`

## 本版目标

V129 把“添加网站时怎么打开”和“项目被单击/双击时做什么”放到项目本身配置中，避免只能依赖全局设置。

## 1. 添加网站时直接选择浏览器打开方式

网站创建/命名界面新增 **浏览器打开方式**：

- 继承上一级：先读取父目录浏览器规则，再读取全局浏览器路由。
- 系统默认浏览器。
- 当前前台浏览器。
- 指定浏览器 / Profile。

覆盖两个入口：

- 浏览器网址拖入后出现的“新建网站项目”命名界面。
- 内容区右键 -> “添加网址”的手动添加界面。

浏览器列表改为 **按需扫描**：只有网站添加/编辑相关界面真正打开时才扫描，不把浏览器扫描放到应用普通启动和无关菜单操作的关键路径上。

## 2. 每个项目独立定义左键单击 / 左键双击

每个 `ShortcutItem` 新增独立配置：

- `singleClickAction`
- `doubleClickAction`

目前每次点击都可以分别选择：

- 跟随全局。
- 打开项目。
- 复制名称。
- 复制网址 / 路径 / 命令（根据项目类型自动切换文案）。
- 复制“名称 + 网址/路径/命令”。
- 无动作。

因此可以实现例如：

- 左键单击：复制网址。
- 左键双击：复制名称。

也可以反过来，或者一边复制、一边打开。

除了新建网站时可直接配置，所有已有项目都可以通过：

`项目右键 -> 编辑 -> 点击动作`

重新修改。

## 3. 双击不会先误执行一次单击

这是本版重点处理的交互冲突。

当单击和双击都配置了动作时，如果直接监听普通 click + dblclick，Windows 双击通常会先产生第一次单击，导致：

1. 先执行单击复制；
2. 随后双击再执行另一份复制；
3. 剪贴板被覆盖，用户看到的是“像执行了两次”。

V129 改为读取 Windows 原生 `GetDoubleClickTime()`：

- 第一次单击动作先进入短暂等待。
- 如果等待期间形成双击，立即取消待执行的单击动作，只执行双击动作。
- 如果没有形成双击，再执行单击动作。

这样左键单击复制 A、左键双击复制 B 时，两套动作不会串台。

非 Windows 环境保留 420ms 回退值。

## 4. 与项目拖动排序兼容

项目只要配置了单击动作，就会继续使用原有的长按拖动保护：

- 快速单击 -> 执行项目单击动作。
- 按住达到“项目拖动长按时间” -> 才进入拖动排序。
- 指针移动超过容差时，不再当成复制/打开点击。

避免把“想拖动项目”误识别成“复制项目内容”。

## 5. 兼容旧配置

旧项目没有 `singleClickAction` / `doubleClickAction` 时，不改变原来的使用习惯：

- 全局启动方式为“单击” -> 旧项目仍单击打开。
- 全局启动方式为“双击” -> 旧项目仍双击打开。

`inherit` 也使用相同规则。

复制、粘贴、目录复制、跨配置复制和普通项目克隆继续通过对象克隆保留这两项新配置。

## 6. 界面优化

网站拖入后的原命名弹窗整合成一个创建面板：

1. 项目名称。
2. 标签页标题 / 网站地址命名来源。
3. 浏览器打开方式。
4. 左键单击动作。
5. 左键双击动作。
6. 创建项目。

手动“添加网址”也采用同样的配置逻辑，减少“先创建、再去设置里二次修改”的步骤。

设置 -> 行为中的全局“启动方式”说明也已改为：它只是 **未单独配置项目时的默认行为**。

## 7. 数据和版本

- 应用版本：`0.1.129`
- 配置存储版本：`APP_STORE_VERSION = 23`
- 新字段通过统一 normalizer 校验，非法动作值会被丢弃，不会直接进入 UI。

## 主要修改文件

- `src/types.ts`
- `src/lib/itemClickActions.ts`
- `src/lib/clipboardText.ts`
- `src/lib/doubleClickTiming.ts`
- `src/components/ItemInteraction/ItemClickActionPicker.tsx`
- `src/components/ContentArea/ItemCard.tsx`
- `src/components/ContextMenu/AreaContextMenu.tsx`
- `src/components/ContextMenu/ItemContextMenu.tsx`
- `src/components/UiDialog/UiDialogHost.tsx`
- `src/lib/uiDialog.ts`
- `src/hooks/useWebsiteDropController.ts`
- `src/hooks/useBrowserCatalog.ts`
- `src/stores/appStore/normalizers.ts`
- `src-tauri/src/commands.rs`
- `src-tauri/src/lib.rs`
- `scripts/verify-source-fixes.mjs`
- `src-tauri/build.rs`
