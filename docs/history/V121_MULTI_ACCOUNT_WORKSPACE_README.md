# Yue Launcher v0.1.121 - 多账号工作区增强

v0.1.121 在 v120 的“一个网址 × 多账号”基础上，把多账号功能升级为可重复使用、可维护的工作区。

## 1. 多账号模板

多账号窗口新增“模板”页。模板会保存：

- 批量网址列表；
- 批次名称；
- 项目公共前缀；
- 命名顺序与分隔符；
- 账号名是否只保留字母；
- 是否把浏览器名加入账号名；
- 当前/指定/新建子目录策略；
- 选中的浏览器 Profile；
- 跳过重复、自动图标、固定项目、生成后切换目录等选项。

模板支持“应用 / 用当前设置覆盖 / 删除”。Profile 已不存在时，模板页会显示缺失数量，但不会擅自删除用户模板。

## 2. 批量网址 × 批量账号

网址输入升级为多行，一行一个网址：

```text
https://mail.google.com
YouTube | https://youtube.com
ChatGPT | https://chatgpt.com
```

可选语法 `名称 | URL` 用于给网址指定简短名称。生成数量为：

`有效网址数 × 已选择账号/Profile 数`

每个项目仍写入独立的 `browserRoute.mode = specified`、`browserId` 和 `profileId`，不会退化成系统默认浏览器。

多网址时，项目名称会自动带站点名称，避免 Gmail / YouTube / ChatGPT 在同一账号下发生同名冲突。单网址模式继续兼容 v120 的命名习惯。

网站图标按“不同网址”各获取一次，再复用到该网址的全部 Profile，避免 N×N 重复网络请求。

## 3. 账号别名

多账号浏览器列表中，每个 Profile 旁边新增别名输入框，例如：

- 张三
- 工作
- 公司
- 测试

别名没有创建第二套数据，而是直接复用 Browser Router 已有的 `profileOverrides.name`。因此：

- 在多账号窗口改别名，浏览器路由设置同步生效；
- 在浏览器路由设置改 Profile 显示名，多账号窗口同步显示；
- 生成项目时优先使用别名；
- 开启“账号名只保留字母”后，仍会在生成项目名称时去除数字和符号。

## 4. 批量项目管理

v121 为新生成项目增加轻量 `multiAccountBatch` 元数据：

- `batchId`
- `batchName`
- `createdAt`
- `sourceUrl`
- `sourceLabel`
- `targetKey`

多账号窗口新增“批次管理”页，可：

1. 查看某一批生成的所有项目和所在父目录/子目录；
2. 重命名批次；
3. 选择批次中的某个原 URL，并把该 URL 对应的所有账号项目一次替换为新 URL；
4. 选择某个旧 Profile，把这一批里所有网址对应的该 Profile 项目一次迁移到新 Profile；
5. 检查批次引用的 Profile 是否已经从浏览器中消失；
6. 删除整个批次的全部项目。

“Profile 已不存在”只表示当前扫描目录中找不到原 Profile；项目不会自动删除，用户可以选择迁移到新的 Chrome/Floorp Profile。

## 5. 手工复制与批次的关系

移动一个项目到其他子目录时，它仍属于原批次，因为还是同一个项目。

但以下操作会主动清除 `multiAccountBatch`：

- 复制项目到其他目录；
- 创建项目副本；
- Ctrl+C / Ctrl+V 粘贴产生的新项目。

这样批次管理里的“删除整批 / 修改整批”不会意外影响用户后来手工复制出来的独立项目。

## 6. 兼容性

- v120 配置只有单个 `url` 时，v121 的 `urlsText` 会自动回退使用旧 URL，不要求用户迁移配置。
- 旧项目没有 `multiAccountBatch` 时保持普通项目，不会被批次管理误识别。
- v119 的 Medium Integrity / Floorp 拖放策略未修改。
- v120 的复制/粘贴项目能力继续保留。

## 7. 构建防回退

`scripts/verify-source-fixes.mjs` 与 `src-tauri/build.rs` 新增 v121 检查，覆盖：

- MultiAccountTemplate 数据模型；
- MultiAccountBatchMeta 数据模型；
- 多行 URL 解析；
- 模板 UI；
- 账号别名复用 profileOverrides；
- 批次 URL 替换；
- 批次 Profile 迁移；
- 批次删除；
- 批次元数据持久化归一化；
- 批量项目安全删除动作。

如果以后改版把关键链路删除，预构建检查会直接失败。
