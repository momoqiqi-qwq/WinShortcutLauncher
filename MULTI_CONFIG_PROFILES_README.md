# 多配置功能说明

## 已实现

- 主界面右上角新增“多配置”按钮，可跟随原有窗口按钮一起拖动排序、显示/隐藏。
- 点击后直接打开配置下拉菜单，显示所有已保存配置，并用“当前”标签标记正在使用的配置。
- 支持一次选择并导入多个 JSON / Maye JDB / Lucy DB 配置；导入后只保存到配置库，不会自动合并，也不会改变当前配置。
- 任意时刻 Zustand 主 Store 只加载一个配置。切换时先把当前配置保存到配置库，再读取并加载目标配置。
- 支持新建默认配置、切换、重命名、删除非当前配置、手动保存当前并刷新列表。
- 第一次打开多配置菜单时，会把升级前正在使用的配置保存为 `default-release`，因此不会因为启用新功能而丢失原配置。

## 存储与性能

多配置数据使用 IndexedDB，并拆成两个 object store：

- `profiles`：只保存轻量元数据（名称、ID、更新时间、来源文件名）。
- `profile-configs`：按 ID 保存完整 AppConfig。

这样打开菜单和刷新列表时不会读取所有完整配置；只有切换到某个配置时才读取那一份。当前工作配置仍沿用 v104 已优化的 Zustand + 140ms 合并 localStorage 持久化，不把多份配置塞进主 Store。

批量导入采用顺序处理，避免多个带大量图标/图片数据的配置同时进入内存并发解析造成峰值内存和 I/O 抖动。

## 兼容性

- 旧配置的 `windowControlOrder` 会由现有 normalizer 自动补上新的 `profiles` 按钮。
- 原“设置 -> 数据 -> 导入中心”的单配置预览/合并功能保持不变；读取文件的公共逻辑已抽到 `src/lib/importFile.ts`，避免两套解析实现重复。
- 多配置的“切换”不走导入中心的合并/回滚流程，避免每次切换都额外创建完整导入快照。

## 主要文件

- `src/lib/configProfiles.ts`：IndexedDB 配置库与元数据操作。
- `src/components/TopBar/ConfigProfilesMenu.tsx`：多配置菜单和批量导入/切换交互。
- `src/components/TopBar/ConfigProfilesMenu.css`：下拉菜单样式。
- `src/lib/importFile.ts`：共享的配置文件读取/适配入口。
- `src/components/TopBar/TopBar.tsx`：新增右上角多配置按钮和菜单定位。
- `src/types.ts` / `src/stores/appStore/defaults.ts`：新增 `profiles` 窗口控制 ID。

## 验证

- 使用 TypeScript 5.8 `transpileModule` 对 `src` 下 144 个 `.ts/.tsx` 文件做了语法解析：通过。
- 多配置名称清洗/去重辅助逻辑做了直接运行检查：通过。
- 已增加 Vitest 测试：`src/lib/__tests__/configProfiles.test.ts`，并在 normalizer 测试中增加旧按钮布局自动补 `profiles` 的回归用例。
- 当前执行环境无法完成 `npm ci`：离线缓存缺少 `zustand-5.0.14.tgz`，因此无法在本环境执行完整 `npm run typecheck/test/build`。这与项目代码错误无关，完整依赖环境中仍建议执行 `npm run verify`。
