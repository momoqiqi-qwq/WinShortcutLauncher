# V151 版本说明：启动恢复路径去掉重复的全树规范化

> 纯内部性能修复，不改任何界面与交互。承接 V145 / V146 的同一条判据 —— **启动路径上不该有的重复工作量**。
> 这一轮的对象是 `getFirstDirectory()`：它只需要读两个 id，却把整棵分组树重新规范化了一遍。

## 一、问题

`src/stores/appStore/normalizers.ts` 的 `getFirstDirectory(groups)` 想要的东西很少 ——
「第一个分组 → 该分组第一个子目录」的两个 id。但它的实现是：

```ts
const sortedGroups = normalizeGroups(groups);   // ← 整棵树重新规范化
const group = sortedGroups[0];
const dir = group.directories[0];
return { groupId: group.id, directoryId: dir.id };
```

`normalizeGroups` 会对每个分组、每个子目录、每个快捷项逐个做字段清洗、
id 去重、`sort(byOrder)` 与 `reindex`。四千个快捷项的配置跑一次约 **3–7 ms**。

问题在于：它六个调用点里有**四个传进去的本来就是 `normalizeGroups(...)` 的输出**：

| 调用点 | 传参来源 |
| --- | --- |
| `persistence.ts:170`（启动恢复） | `normalizeGroups(saved.groups, fallbackGroups)` |
| `navigationSlice.ts:120`（`deleteGroup`） | `normalizeGroups(state.groups.filter(...))` |
| `navigationSlice.ts:361`（`moveDirectoryToGroup`） | `normalizeGroups(state.groups.filter(...).map(...))` |
| `configSlice.ts:39`（`importConfig`） | `normalizeGroups(config.groups, cloneConfig().groups)` |

也就是说，**同一份数据被连续规范化了两次**：第一次的结果刚算出来，第二次只是照着它再算一遍，
只为了读 `[0].id` 和 `[0].directories[0].id`。

## 二、改动

`getFirstDirectory` 增加一个**显式可选**的快速路径：

```ts
export function getFirstDirectory(
  groups: unknown,
  options?: { normalized?: boolean },
): { groupId: string; directoryId: string } {
  if (options?.normalized) {
    const list = Array.isArray(groups) ? groups as Group[] : [];
    const group = list[0];
    const directory = group?.directories?.[0];
    if (group?.id && directory?.id) return { groupId: group.id, directoryId: directory.id };
  }
  const sortedGroups = normalizeGroups(groups);
  // …原有防御路径不变
}
```

上表四处调用点改传 `{ normalized: true }`，其余两处（`appStore.ts:45` 模块初始化、
`configSlice.ts:93` `resetAll`）传的是 `cloneConfig()` 的产物、只有 49 个默认项且各执行一次，
**保持原样不动**。

### 为什么等价

`normalizeGroups` 的最后一行是 `return reindex(normalized.sort(byOrder))`：
先按 `order` 排序，再由 `reindex` 把 `order` 重置成 `0..n-1`。所以**输出必定有序，下标 `0` 就是第一项**。
`reindex` 与 `sort(byOrder)` 都是幂等的（`Array.prototype.sort` 自 ES2019 起规范要求稳定），
所以对已规范化的数据再规范化一次不会改变首项 —— 快速路径取的 id 与慢路径完全一致。

顺带一个旁证：同一处的 `navigationSlice.ts:360` 本来就在写
`nextTarget?.directories[0]?.id` —— 代码自己已经在用「下标 0 即首项」这个前提。

### 为什么用显式标志位而不是自动探测

自动探测只能靠「数组是否已有序」判断，代价是一次 O(n) 扫描，省不掉多少；而**误判的后果是静默取错分组**。
显式标志位把前提写在调用点，读代码的人一眼能看到「这里的数据已经规范化过了」。
为此专门加了一条契约测试，把「对着未排序原始数据传这个标志位会取到错的那个分组」钉下来（见回归护栏）。

## 三、实测数据

载荷：8 分组 × 10 子目录 × 50 快捷项 = **4000 项**，20 次平均，`performance.now()` 计时。

| 项 | 改动前 | 改动后 |
| --- | --- | --- |
| `normalizeGroups` 单次 | 3.916 ms | 5.276 ms（机器负载不同，见下） |
| `getFirstDirectory` | 2.975 ms（走规范化） | **0.004 ms**（快速路径） |
| `restorePersistedState` 全程 | 7.006 ms | **4.377 ms** |
| restore / normalize 比值 | 1.79x | **0.83x** |
| `getFirstDirectory` 占 restore | 42.5% | ≈ 0 |

**怎么读这张表**：这台机器上绝对耗时随负载漂移很大（同一份代码重跑，`normalizeGroups` 从 3.9 一路涨到 7.4 ms）。
所以真正可靠的信号是两个**比值**：

1. 快速路径 vs 防御路径：**0.002–0.004 ms vs 4.1–6.6 ms**，约 **1000–4000 倍**；
2. `restorePersistedState` / `normalizeGroups`：从 **1.79x 降到 0.83–1.12x** ——
   即启动恢复的开销**几乎只剩那唯一一次 `normalizeGroups`**，重复的那一半被彻底去掉。

改动前的 42.5% 是省下来的份额；改动后 `getFirstDirectory` 已经小到测不出（0.002 ms 量级，
低于计时器在这段代码上的可用分辨率）。

## 四、兼容与约束

- **无行为变化**：不传 `options` 时行为与改动前**逐字节相同**（仍先 `normalizeGroups`，
  兼容任意未规范化的原始持久化数据）。所有改动点都是「已规范化数据」这一前提成立的调用点。
- **无接口破坏**：`options` 是可选参数，签名对既有调用方向后兼容；返回结构 `{ groupId, directoryId }` 不变。
- **持久化格式不动**：不涉及配置文件结构、字段、迁移。
- **不碰 `cloneConfig()` 的浅拷贝问题**：该问题（`defaults.ts` 共享模块级对象引用）本轮**未改** ——
  已逐个扫描确认当前没有任何地方对这些共享常量做就地 mutate，属潜在隐患而非现存 bug，留给后续单独评估。

## 五、关键文件

- `src/stores/appStore/normalizers.ts`：`getFirstDirectory` 新增 `options` 快速路径（第 482–508 行）
- `src/stores/appStore/persistence.ts:170`：启动恢复改走快速路径
- `src/stores/appStore/slices/navigationSlice.ts:120`、`:361`：`deleteGroup` / `moveDirectoryToGroup`
- `src/stores/appStore/slices/configSlice.ts:39`：`importConfig`
- `src/stores/appStore/__tests__/perfBaseline.test.ts`：回归护栏 + 基准
- 版本号同步：`package.json` / `src-tauri/tauri.conf.json` / `src-tauri/Cargo.toml` / `src-tauri/Cargo.lock` / `README.md`（首行标题与末尾「当前程序版本」，后者此前停留在 `0.1.149`，一并修正）

## 六、回归护栏

`src/stores/appStore/__tests__/perfBaseline.test.ts` 四条用例（5 个断言组）：

1. **等价性**：对三组载荷（8×10×50、3×4×2、1×1×1），
   `getFirstDirectory(normalized, { normalized: true })` 与 `getFirstDirectory(normalized)` 结果全等。
2. **按 `order` 而非数组位置取首项**：构造「数组第一个是 order 9、第二个是 order 0」的输入，
   断言规范化后 `[0]` 是 order-0 那条，且快速路径与慢路径都指向它。
3. **畸形输入兜底**：`undefined` / `null` / 字符串 / 数字 / `{}` / `[]` / `[{}]` /
   只有 group 没有 directories / 只有 directory 没有 group —— 快速路径必须**不抛异常**且返回非空 id
   （不设防的快速路径会在这里抛 TypeError 或返回 `undefined`）。
   附带钉住一条性质：**缺 id 的条目每次 `normalizeGroups` 都会新铸一个 id**，所以对匿名输入不能用
   deep-equal 比较（这正是这条用例第一版写错的原因）。
4. **契约**：对未排序的原始数据传 `{ normalized: true }` 会取到**错的分组**，
   而防御路径会取到正确的（order 0）那个 —— 把这个前提钉死，防止将来有人在原始数据上误用该标志位。

另有 `expect(restoreMs).toBeLessThan(normalizeMs * 4)` 做粗粒度哨兵：改动后实测比值 0.83–1.12x，
留了约 4 倍余量，不会因 CI 负载抖动误报。

## 七、验证与构建

- `node scripts/verify-source-fixes.mjs` → `Persistent Windows/Rust source fixes: OK`（exit 0）
  （该脚本对 `navigationSlice.ts`、`appStore.ts` 有 require 断言，本次改动未触碰其匹配内容）
- `npx tsc --noEmit` → 0 错误
- `npx vitest run` → **39 文件 / 201 用例全过**（改动前 38 文件 / 196 用例，本次新增 1 文件 5 用例）

## 八、说明与限制

1. **基准的计时噪声**：`timeIt` 用 `performance.now()` 做单次循环平均，未做 GC 隔离与多次取样。
   在这台机器上同一份代码的 `normalizeGroups` 耗时可以在两次相邻运行间从 3.9 ms 漂到 7.4 ms
   （与本次全量测试套件并行运行有关）。**绝对值不可跨机比较，比值可用**。
2. **未一并处理的相邻项（已知，未改）**：
   - `App.tsx:44-56` 整订阅 `behavior` / `display` / `groups` / `rainbow` / `experience` 五个大切片，
     第 178–229 行每次渲染重建 52 个 CSS 变量 —— 属渲染层优化，与本次的 store 层重复计算是两件事。
   - `vitest.config.ts:6` 的 `include: ['src/**/*.test.ts']` **不匹配 `.test.tsx`**，
     组件层测试会被静默忽略；`environment: 'node'` 且未安装任何 DOM 测试依赖。
     这意味着**组件层目前没有测试覆盖**，本轮新增的用例也因此只能落在 `.test.ts` 的纯逻辑层。
   - `defaults.ts::cloneConfig()` 的浅拷贝共享引用（见第四节）。
3. 本次改的是前端 store 层，**不涉及 Rust 侧**，所以没有原生基准工程；数据全部来自 vitest 内的基准用例，
   可用 `npx vitest run src/stores/appStore/__tests__/perfBaseline.test.ts` 随时复现。
