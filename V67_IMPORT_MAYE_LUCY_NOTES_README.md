# v67 Maye/Maya JSON 与 Lucy DB 便签标签导入适配

本版在 v66 基础上继续修复导入体验：

1. Maye/Maya JSON 适配增强
   - 导入 JSON 时会先经过适配器，不再只按本软件内部配置格式解析。
   - 支持 Maye/Maya 的 `JDB.json.js` / JSON 结构。
   - 识别 `JDB.data` 分类和 `item` 项目，导入为 Yue launcher 的父目录与项目。
   - 识别 `note / noteContent / content / memo / remark / text` 等便签内容字段。
   - 如果导入标签是“空项目 + 有便签内容”，会直接导成便签标签。

2. Lucy DB 便签标签直接显示
   - 导入 Lucy `link.db` 时会读取 `Groups.Content`。
   - 对有内容但没有快捷项目的标签，直接导成 `notes` 便签类型。
   - 不再需要导入后手动右键空标签，再点击“空标签切换为便签”。

3. 通用导入兜底
   - 本软件 JSON 中如果有旧字段 `noteContent / content`，也会自动归一到 `note`。
   - 便签类型字段支持 `note / notes / sticky / memo / markdown / 便签 / 笔记 / 备忘`。

已执行：

```powershell
npm run build
```

通过。Rust / Cargo 原生编译需在 Windows 本机验证。
