# ObservationCard 增强开发计划

> 目标：让 ObservationCard 在 Feed 时间线中始终展示关键元数据（concepts、files 摘要、module），
> 无需点击 Facts 按钮即可获得观察记录的上下文全貌。

## 背景

worktree `memory-search` 新增了 context-aware search re-ranking 功能，其核心信号维度为：
- **files** (权重 40%) — `files_read` + `files_modified`
- **modules** (权重 30%) — 从文件路径推断的模块前缀
- **concepts** (权重 20%) — 概念标签
- **sameSession** (权重 10%) — 是否同一会话

但在 viewer UI 中，这些信息被藏在 Facts 折叠面板里，用户必须手动展开才能看到。
modules 则完全不展示。这使得用户无法直观理解"为什么记忆系统认为某些观察更相关"。

## 当前 ObservationCard 结构

```
┌─────────────────────────────────────────────┐
│ [type badge]  project          [Facts] [Doc] │  header
│                                              │
│ Title text                                   │  始终显示
│ Subtitle (默认) / Facts list / Narrative     │  三选一
│                                              │
│ #123 • 2025-12-01                            │  footer (始终)
│ [concept1] [concept2]                        │  仅 Facts 展开
│ Read: file1.ts, file2.ts                     │  仅 Facts 展开
│ Modified: file3.ts                           │  仅 Facts 展开
└─────────────────────────────────────────────┘
```

## 目标 ObservationCard 结构

```
┌─────────────────────────────────────────────┐
│ [type badge]  project          [Facts] [Doc] │  header
│                                              │
│ Title text                                   │  始终显示
│ Subtitle (默认) / Facts list / Narrative     │  三选一
│                                              │
│ [concept1] [concept2] [concept3]             │  ← 新：始终可见
│                                              │
│ #123 • 2025-12-01 • 📁 3 files (worker/)    │  ← 新：文件摘要
│ Read: file1.ts, file2.ts                     │  仅 Facts 展开
│ Modified: file3.ts                           │  仅 Facts 展开
└─────────────────────────────────────────────┘
```

---

## 变更清单

### Phase 1：Concepts 标签始终可见

**涉及文件：**
- `src/ui/viewer/components/ObservationCard.tsx`

**变更内容：**

1. 将 concepts 渲染从 `showFacts` 条件块中移出，放到 `card-meta` 区域之前（或紧邻 title/subtitle 下方）
2. concepts 标签样式保持不变（已有 inline style），只是去掉 `showFacts &&` 守卫条件
3. 当 concepts 为空时不渲染任何内容（零占位）

**具体改动点：**

当前代码 `ObservationCard.tsx:120-133`：
```tsx
{showFacts && (concepts.length > 0 || filesRead.length > 0 || filesModified.length > 0) && (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
    {concepts.map((concept: string, i: number) => (
      <span key={i} style={{...}}>
        {concept}
      </span>
    ))}
    ...files...
  </div>
)}
```

改为：将 concepts 渲染拆出，放到 `card-meta` 之前作为独立区域，始终渲染（有 concepts 时）。
files 展示保留在 `showFacts` 条件内不变。

---

### Phase 2：文件摘要行

**涉及文件：**
- `src/ui/viewer/components/ObservationCard.tsx`

**变更内容：**

1. 在 footer 的 `#id • date` 行后面追加文件摘要信息
2. 格式：`📁 {totalFiles} files ({commonPrefix})` — 例如 `📁 3 files (services/worker/)`
3. 计算逻辑：
   - `totalFiles` = `filesRead.length + filesModified.length`（去重后）
   - `commonPrefix` = 所有文件路径的最长公共目录前缀（2-3 级）
   - 如果只有 1 个文件，直接显示文件名
   - 如果没有文件，不渲染
4. 始终可见（不需要展开 Facts）

**辅助函数：**
```typescript
function getFilesSummary(filesRead: string[], filesModified: string[]): string | null {
  const allFiles = [...new Set([...filesRead, ...filesModified])];
  if (allFiles.length === 0) return null;
  if (allFiles.length === 1) return allFiles[0];
  // 计算公共前缀
  const prefix = longestCommonPrefix(allFiles.map(f => f.split('/')));
  const prefixStr = prefix.length > 0 ? prefix.join('/') + '/' : '';
  return `${allFiles.length} files${prefixStr ? ` (${prefixStr})` : ''}`;
}
```

---

### Phase 3：Module 推断标签（可选增强）

**涉及文件：**
- `src/ui/viewer/components/ObservationCard.tsx`

**变更内容：**

1. 复用 `module-inference.ts` 中的 `inferModules()` 逻辑
   - 注意：viewer 打包为独立 HTML，不能直接 import 后端代码
   - 需要在 ObservationCard 内内联一个简化版的 module inference
   - 或直接从 `commonPrefix` 提取模块名（与 Phase 2 的文件摘要合并）
2. 在 concepts 标签旁显示 module 标签，用不同样式区分
3. 例如：`[worker/search] [sqlite]` — 使用稍暗的颜色或带前缀图标

**考虑因素：**
- module 推断是从文件路径的前 2-3 级目录提取的，例如 `src/services/worker/` → `services/worker/`
- 对于大多数观察记录，module 信息和文件路径已经有一定重叠
- 如果 Phase 2 的文件摘要已经展示了公共前缀，module 标签可能冗余
- **建议**：先实现 Phase 1 + Phase 2，观察效果后再决定是否需要 Phase 3

---

### Phase 4：i18n 更新

**涉及文件：**
- `src/ui/viewer/locale/en.ts`
- `src/ui/viewer/locale/zh-CN.ts`

**新增 key：**

```typescript
// en.ts
'observation.files': '{count} files',
'observation.filesIn': '{count} files ({prefix})',
'observation.file': '1 file',

// zh-CN.ts
'observation.files': '{count} 个文件',
'observation.filesIn': '{count} 个文件 ({prefix})',
'observation.file': '1 个文件',
```

---

## 不做的事情

1. **不添加搜索 UI** — viewer 是时间线展示工具，搜索通过 MCP skill 进行
2. **不暴露 affinity score** — Feed 模式下没有搜索排名的概念
3. **不修改后端 API** — 所有数据（concepts, files_read, files_modified）已经在现有 API 响应中
4. **不新增 API 端点** — 纯前端展示层改动
5. **不修改 Feed/App 组件** — ObservationCard 的 props 接口 `Observation` 不变

## 实现顺序

```
Phase 1 (concepts 始终可见)  →  Phase 2 (文件摘要)  →  Phase 4 (i18n)
                                                      ↓
                                              Phase 3 (module, 可选)
```

Phase 1 + 2 + 4 是核心，预计改动量：
- `ObservationCard.tsx`：~30 行修改
- `en.ts` + `zh-CN.ts`：各 ~3 行新增

Phase 3 视效果决定是否实施。

## 构建验证

```bash
npm run build          # 确认 viewer 打包成功
# 在浏览器中打开 http://localhost:37777 验证 ObservationCard 渲染
```
