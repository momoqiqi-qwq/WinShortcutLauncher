# v74 代码结构复查与下一步建议

## 本版已经完成

1. `ContentArea.tsx` 从约 650 行降到约 70 行。
2. 便签视图降到约 120 行，复杂状态移入独立 Hook。
3. `appStore.ts` 从约 1080 行降到约 75 行。
4. 默认值、归一化、迁移和五类业务动作已分文件。
5. 新增状态仓库组合测试，防止 slice 拆分后动作失联。
6. 新增便签纯函数测试，锁定补行和分界线插入行为。

## 当前仍值得优化的模块

### 1. `SettingsPanel.tsx` 约 1200 行

风险：新增设置时容易误删其他分类、重复声明状态或漏掉关键词搜索。

建议拆为：

- OperationSettingsSection
- DragSettingsSection
- WindowBehaviorSettingsSection
- IconSettingsSection
- DataSettingsSection
- HelpAndSponsorSection

风险等级：低到中。

### 2. `App.tsx` 约 710 行

当前同时负责：

- 全局快捷键
- 浏览器拖入网址
- 文件拖放
- 多种右键菜单
- 添加项目弹窗
- favicon 获取与刷新
- 托盘和窗口事件

建议拆为：

- `useGlobalShortcuts`
- `useBrowserUrlDrop`
- `useLauncherDialogs`
- `useItemIconActions`
- `ContextMenuHost`

风险等级：中。

### 3. 便签控制 Hook 约 420 行

已经比混在内容区安全，但还能继续拆为：

- `useNoteAutosave`
- `useNoteLineNumbers`
- `useNoteContextMenu`

风险等级：低到中。

### 4. `ImageBrowserPanel.tsx` 仍然偏大

建议把列表、预览、裁剪和重命名拆分，特别是裁剪坐标逻辑应增加纯函数测试。

风险等级：中。

### 5. 贴边隐藏逻辑仍分散

前端 hooks 和 Rust 原生代码共同控制贴边、回弹和任务栏唤醒。统一成状态机收益较高，但必须 Windows 实机测试。

风险等级：高。

## 推荐顺序

1. 设置页拆分
2. App 全局交互拆分
3. 图片预览拆分与裁剪测试
4. 便签 Hook 再拆分
5. 贴边隐藏状态机
