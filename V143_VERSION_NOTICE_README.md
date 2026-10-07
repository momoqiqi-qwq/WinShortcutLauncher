# V143 版本说明：版本更新提示

版本号 0.1.142 → 0.1.143。本版新增「版本更新后提示当前版本」的行为。

## 行为

应用启动时对比两个版本号：

- **当前构建版本** —— 从 `package.json` 读（`src/lib/appVersion.ts` 导出的 `APP_PACKAGE_VERSION`）
- **上次运行记录的版本** —— 配置里的 `experience.lastSeenVersion`

两者不一致时（含首次运行、以及回退到旧版本），弹出提示 **「当前版本是 v0.1.143」**，
随后把本次版本写回配置。**同版本重复启动不再提示**。

## 实现

| 文件 | 改动 |
| --- | --- |
| `src/lib/appVersion.ts` | 新增：统一导出 `APP_PACKAGE_VERSION`（版本号唯一来源） |
| `src/components/Settings/AboutSettingsSection.tsx` | 改为复用 `lib/appVersion` 的常量，不再各自读一份 `package.json` |
| `src/types.ts` | `ExperienceSettings` 新增 `lastSeenVersion: string` |
| `src/lib/experienceSettings.ts` | 默认值 `''` + 归一化（非字符串一律回落到空串） |
| `src/stores/appStore/persistence.ts` | `APP_STORE_VERSION` 23 → 24 |
| `src/App.tsx` | 启动时检查 + 提示 + 记录本次版本 |

## 两个容易踩的点

1. **effect 声明顺序**：`showLauncherNotice` 是**同步**派发 `launcher-show-notice` 事件，
   所以检查用的 `useEffect` 必须排在注册监听器的那个 effect **之后** —— 顺序错了提示会静默丢失。
2. **不订阅 store**：检查逻辑用 `useAppStore.getState()` 直接读，而不是把 `experience`
   放进依赖数组 —— 否则 `updateExperience` 写回配置会触发重渲染、反复命中判断。

## 提示形式

复用项目既有的 toast 机制（`showLauncherNotice`），时长固定 **4000ms**（比默认 2400ms 长，
便于看清版本号），不受 `display.toastDurationMs` 影响。

## 验证

- `npm run typecheck` ✅
- `npm run test` ✅ 34 文件 / 162 用例全过（`experienceSettings.test.ts` 新增 1 例覆盖归一化）
- `node scripts/verify-source-fixes.mjs` ✅
- 旧配置升级路径：`APP_STORE_VERSION` 变更触发 `migrate` → `normalizeExperience`
  把缺失的 `lastSeenVersion` 补成 `''`，因此升级后**第一次启动一定会看到提示**（符合预期）。
