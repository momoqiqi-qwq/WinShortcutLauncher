# V150 便签拖入（网址 / 文字）说明

> 版本：0.1.150 ｜ 主题：便签子目录可以直接接收拖入的网址与文字，新内容自动隔一行。

## 需求

在便签子目录（`Directory.kind === 'notes'`）里，把网站链接或一段文字（微信 / QQ 会话内容等）拖进来时：

1. 网址、文字都要**落进便签正文**（不是生成快捷方式，也不弹「添加快捷项目」）；
2. 每次拖入的新内容与已有正文之间**自动隔一行**。

## 行为规则

| 场景 | 结果 |
| --- | --- |
| 拖网址到便签（浏览器地址栏 / 网页链接） | 网址按原样追加成一行（可复制） |
| 拖文字到便签（微信 / QQ 会话文本） | 原文追加，保留内部换行 |
| 便签原本是空的 | 直接落内容，前面不留空行 |
| 便签已有正文 | 尾部空白收干净后，空一行再追加 |
| 拖入内容是空白 | 什么都不写，正文保持不变 |
| 单次拖入超长（> 20000 字符） | 截断到 20000 字符 |
| 拖 `.url` / `.website` 快捷方式文件到便签 | 读出里面的网址后追加 |
| 拖文件（非网址类）到便签 | 仍走原来的「添加快捷项目」导入对话框 |

判定顺序：先看拖拽落点是不是便签（侧栏便签项、内容区便签编辑区都有 `data-directory-id`），是便签才走追加；否则维持 V149 及以前的行为。

## 数据流

```
Windows 原生拖拽（微信 / QQ / 浏览器 / 资源管理器）
  └─ src-tauri/src/native_browser_drop.rs
       ├─ extract_url_and_title()  → url / title
       ├─ extract_plain_text()     → text（CF_UNICODETEXT → text/unicode → text/plain
       │                                    → text/x-moz-text-internal → CF_TEXT 兜底）
       └─ emit "native-external-drop" { url, title, text, paths, formats, x, y }
            └─ useWebsiteDropController（便签目标）
                 ├─ flushActiveNoteDraft()        ← 先把打开中的便签草稿落盘
                 └─ appendDirectoryNote(id, text) ← 追加（自动隔一行）

WebView 内拖拽（HTML5 DataTransfer 路径）
  └─ browserDrop.extractDroppedPlainText / …Async
       （text/unicode、text/plain、text/x-moz-text-internal、text/x-moz-url-desc，
         只有 HTML 时先剥标签；多来源取最长的一段）
       └─ 同上
```

## 涉及文件

| 文件 | 改动 |
| --- | --- |
| `src-tauri/src/native_browser_drop.rs` | 拖拽载荷新增 `text` 字段；新增 `extract_plain_text()` |
| `src/lib/nativeExternalDrop.ts` | `NativeExternalDropPayload` 增加 `text` |
| `src/lib/browserDrop.ts` | 新增 `extractDroppedPlainText()` / `extractDroppedPlainTextAsync()` / `stripHtmlToText()` |
| `src/lib/noteDrop.ts` | 新增：`normalizeDroppedNoteText()` / `appendNoteText()`（自动隔一行的核心） |
| `src/lib/noteDraftBridge.ts` | 新增：便签草稿落盘桥（`registerActiveNoteFlush` / `flushActiveNoteDraft`） |
| `src/hooks/useWebsiteDropController.ts` | 便签纳入可接收目标；便签目标判定与文本追加（原生 / HTML 两条路径） |
| `src/stores/appStore/slices/settingsSlice.ts` | 新增 action `appendDirectoryNote()` |
| `src/stores/appStore/types.ts` | `SettingsSlice` 声明 `appendDirectoryNote()` |
| `src/components/ContentArea/ContentArea.tsx` | 便签区域挂 `data-directory-id` |
| `src/components/ContentArea/NoteEditor/useNoteEditorController.ts` | 注册草稿落盘；外部写入同步回草稿（避免自动保存覆盖） |

## 为什么需要草稿桥

便签编辑器为性能把输入先留在本地草稿，空闲 450ms（`notes.autosaveDelayMs`）才写回 store。拖拽是直接写 store 的，如果先不落盘，定时器到点就会用旧草稿把追加内容**覆盖掉**。所以顺序固定为：

1. `flushActiveNoteDraft()` —— 立刻把当前草稿写回 store；
2. `appendDirectoryNote()` —— 在最新的正文后面追加；
3. 编辑器 effect 发现 `directory.note` 与上次提交值不同 → 采纳为新草稿并清掉待执行的自动保存。

## 验证

```bash
npx tsc --noEmit                 # 0 错误
npx vitest run                   # 38 文件 / 196 用例全过
npx vitest run src/lib/__tests__/noteDrop.test.ts   # 本版新增 6 用例
```

`src/lib/__tests__/noteDrop.test.ts` 覆盖：换行归一与空白清理、空内容判定、空便签直接落内容、已有正文自动隔一行（含尾部多余空行）、空白内容不写入、超长截断到 20000。

## 手动验收步骤

1. 建一个便签子目录，随便写两行字；
2. 从浏览器地址栏把网址拖进去 → 便签里出现该网址，前面空一行；
3. 从微信 / QQ 里选中一段聊天记录拖进去 → 原文出现在便签末尾，前面空一行；
4. 连续拖两次 → 两段之间只有一行空行；
5. 在便签里正打字时立刻拖入文字 → 打字内容不丢，且拖入内容不会被自动保存覆盖。
