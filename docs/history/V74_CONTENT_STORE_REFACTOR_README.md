# v74 内容区与 Zustand 仓库拆分

## B：内容区与便签编辑器拆分

原 `ContentArea.tsx` 约 650 行，同时负责：

- 当前目录判断
- 项目搜索
- 项目图标预加载
- 拖动排序
- 空状态
- 便签输入与自动保存
- 行号测量与跳转
- 分界线插入
- 便签右键菜单

本版拆分为：

- `ContentArea.tsx`：只负责选择当前内容类型、空白区域事件和布局变量。
- `ShortcutGrid/ShortcutGrid.tsx`：负责页面搜索、项目列表、图标预加载和拖动排序。
- `NoteEditor/NoteEditor.tsx`：只负责便签界面渲染。
- `NoteEditor/useNoteEditorController.ts`：负责便签草稿、自动保存、行号和右键菜单状态。
- `lib/noteEditor.ts`：负责行数、行起点、补空行和分界线插入等纯规则。

体验改进：

- 切换子目录时自动清空当前页面搜索词，避免误以为新目录没有项目。
- 便签显示“等待保存 / 已保存”，减少用户对自动保存状态的不确定。
- 便签输入不会再触发项目网格内部状态更新。
- 项目网格的搜索和图标预加载不会参与便签编辑器渲染。

## C：Zustand 状态仓库拆分

原 `appStore.ts` 约 1080 行，默认值、归一化、业务动作、持久化和选择器集中在一个文件。

本版拆分为：

- `defaults.ts`：默认配置和首次启动数据。
- `normalizers.ts`：旧配置兼容、数值范围限制、导入数据归一化。
- `persistence.ts`：localStorage、迁移、合并和持久化字段。
- `types.ts`：仓库状态、动作和 slice 类型。
- `navigationSlice.ts`：父目录、子目录、导航和合并操作。
- `itemSlice.ts`：项目增删改、排序、选择、复制、移动和使用统计。
- `settingsSlice.ts`：显示、窗口、便签、彩虹、体验等设置。
- `mediaSlice.ts`：中转站和图片预览数据。
- `configSlice.ts`：导入、导出、重置。
- `appStore.ts`：仅负责组合各 slice 和导出兼容 API。

兼容性：

- 原来的 `useAppStore` 导入路径不变。
- 原来的 action 名称和调用方式不变。
- localStorage 名称仍为 `win-launcher-config`。
- 持久化版本从 4 更新为 5，旧配置自动归一化后恢复。
- JSON 导入导出字段保持不变。

## 新增测试

新增：

- `noteEditor.test.ts`：5 项便签规则测试。
- `appStoreSlices.test.ts`：5 项仓库组合测试。

总测试数从 25 项增加到 35 项。
