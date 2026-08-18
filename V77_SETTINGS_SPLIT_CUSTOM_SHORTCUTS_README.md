# v77 设置页安全拆分与自定义快捷键

## 设置页安全拆分

原来的 `SettingsPanel.tsx` 约 1326 行，同时包含窗口移动、设置导航、操作、拖动、窗口、图标、数据、帮助和赞助等逻辑。v77 将其缩减到约 203 行，只负责：

- 设置浮窗位置和大小
- 左侧分类导航与搜索
- 当前分类切换
- 各独立设置组件的装配

新增或独立的设置组件包括：

- `BehaviorSettingsSection.tsx`
- `DragSettingsSection.tsx`
- `WindowBehaviorSettingsSection.tsx`
- `InterfaceSettingsSection.tsx`
- `IconSettingsSection.tsx`
- `ShortcutSettingsSection.tsx`
- `DataSettingsSection.tsx`
- `HelpSettingsSection.tsx`
- `SponsorSettingsSection.tsx`
- `SettingsPrimitives.tsx`

以后增加设置项时，不需要在一个超大型文件里修改，减少覆盖旧功能和产生重复声明的风险。

## 自定义快捷键

新增“设置 - 快捷键”，支持以下动作：

1. 打开设置
2. 打开全局搜索
3. 打开文件中转
4. 打开图片预览
5. 切换窗口置顶
6. 搜索当前页/设置
7. 全选当前页项目
8. 启动选中项目
9. 删除选中内容
10. 关闭浮层/清空搜索

每个动作支持：

- 点击后直接录制新组合键
- 清空快捷键以禁用该动作
- 单独恢复默认
- 全部恢复默认
- 检测重复组合键并拒绝保存
- 拦截容易影响正常输入的单独字母、数字和符号

快捷键使用 `shortcuts` 配置字段保存，可随 JSON 导入导出，并通过 Zustand 持久化自动迁移旧配置。

## 默认快捷键

- 打开设置：`Ctrl+,`
- 全局搜索：`Ctrl+K`
- 文件中转：`Ctrl+Shift+V`
- 图片预览：`Ctrl+Shift+I`
- 切换置顶：`Ctrl+Shift+P`
- 搜索当前页：`Ctrl+F`
- 全选项目：`Ctrl+A`
- 启动选中项目：`Enter`
- 删除选中内容：`Delete`
- 关闭浮层：`Escape`

## 兼容性

- 原有配置会自动补齐默认快捷键。
- 配置持久化版本更新为 8。
- 原有 `useAppStore` API 和项目数据结构保持兼容。
- 旧的快捷键默认行为保持不变。
