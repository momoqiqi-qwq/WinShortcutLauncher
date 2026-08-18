# v73 代码结构审查与后续优化建议

## 本次已经安全处理

1. 关键业务规则从 React 组件中抽离为可测试纯函数。
2. 自动化测试覆盖 favicon、导入、排序、窗口恢复、配置迁移和自检。
3. 一键构建在生成 EXE 前必须通过回归测试。
4. 新增 Linux 前端 CI 与 Windows Rust `cargo check`。
5. 新增配置自检页面，用户可以在软件内发现常见数据问题。

## 当前仍然偏大的模块

- `SettingsPanel.tsx`：约 1200 行。
- `appStore.ts`：约 1080 行。
- `App.tsx`：约 710 行。
- `ContentArea.tsx`：约 650 行。
- `ImageBrowserPanel.tsx`：约 680 行。
- `src-tauri/src/edge_dock_native.rs`：约 1220 行。

## 推荐的下一步

### A. 设置页安全拆分（低风险，优先推荐）

把以下内容从 `SettingsPanel.tsx` 拆成独立组件：

- 操作与开机启动
- 拖动设置
- 窗口行为
- 图标与 favicon 测速
- 数据导入导出
- 说明与赞助

不会改变配置格式和界面行为，主要降低以后新增设置时误删其他功能的概率。

### B. 状态仓库切片（中等风险）

把 `appStore.ts` 拆成：

- settings slice
- navigation slice
- items slice
- notes slice
- media slice

保持同一个 Zustand 持久化入口，但把逻辑分文件维护。需要大量回归测试配合。

### C. 内容区拆分（中低风险）

把 `ContentArea.tsx` 拆成：

- ShortcutGrid
- NoteEditor
- PageSearchBar
- SelectionController

便签行号、右键插入分界线和项目拖动将更容易分别维护。

### D. 贴边隐藏状态机统一（高风险）

把前端 hooks 与 Rust 中的贴边状态统一为：

`显示 → 贴边 → 隐藏 → 边缘触发 → 展开 → 鼠标离开 → 收回`

可以进一步解决底部抖动、任务栏唤醒和多窗口时序问题，但需要 Windows 实机测试，不建议和普通功能更新混在同一版。

### E. 更完整的端到端测试（中等风险）

后续可增加：

- Tauri WebDriver/Playwright 界面测试。
- 真实 Maye/Lucy 样本导入测试。
- Windows 贴边隐藏与任务栏唤醒测试。
- EXE 首次启动默认配置测试。

## 建议顺序

优先建议：A → C → B → E → D。

A 和 C 最容易降低后续版本“旧功能被覆盖”的概率；D 的收益很高，但窗口时序风险也最高。
