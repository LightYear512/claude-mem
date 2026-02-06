# Claude-Mem 记忆系统架构分析

**版本:** v1.0
**日期:** 2026-02-04
**状态:** 分析文档

---

## 目录

1. [概述](#概述)
2. [消息存储架构](#消息存储架构)
3. [搜索系统架构](#搜索系统架构)
4. [记忆使用场景](#记忆使用场景)
5. [当前架构局限性](#当前架构局限性)
6. [改进方向](#改进方向)

---

## 概述

本文档分析 Claude-Mem 的记忆系统架构，包括消息如何存储、如何搜索、以及在何时被使用。

### 核心数据流

```
Claude Code → Hooks → Worker HTTP API → SQLite + Chroma
                                              ↓
                                        记忆使用场景
                                              ↓
                              SessionStart / MCP / CLAUDE.md / Web UI
```

---

## 消息存储架构

### 数据库表关系

```
┌─────────────────────────────┐
│ sdk_sessions                │ ← 1:1 映射 Claude Code 会话
│ (content_session_id 唯一)   │
└──────────────┬──────────────┘
               │
       ┌───────┴────────┐
       │                │
       ▼                ▼
┌──────────────┐  ┌──────────────┐
│ user_prompts │  │ observations │
│ (1:N)        │  │ (1:N)        │
│ prompt_number│  │ via memory   │
│ = 会话内递增  │  │ _session_id  │
└──────────────┘  └──────────────┘
                         │
                         ▼
               ┌──────────────────┐
               │ session_summaries│
               │ (1:1 per session)│
               └──────────────────┘
```

### 核心表结构

| 表名 | 用途 | 关键字段 |
|------|------|---------|
| `sdk_sessions` | 会话跟踪 | content_session_id, memory_session_id, status |
| `user_prompts` | 用户提示历史 | content_session_id, prompt_number, prompt_text |
| `observations` | 观察记录 | memory_session_id, type, title, facts, concepts |
| `session_summaries` | 会话摘要 | memory_session_id, request, investigated, learned |
| `pending_messages` | 待处理队列 | session_db_id, status, retry_count |
| `observations_fts` | 全文索引 | FTS5 虚拟表 |
| `budget_state` | 预算跟踪 | spent_today_micros, spent_month_micros |

### 双会话 ID 设计

| ID 类型 | 来源 | 用途 |
|---------|------|------|
| **content_session_id** | Claude Code | 用户界面的会话标识 |
| **memory_session_id** | SDK Agent | 内部观察会话，用于 SDK resume |

**分离原因**: 防止 SDK 代理的内存消息注入到用户的对话中。

### 消息处理流程

```
┌─ Claude Code 中的用户交互
├─ [ PostToolUse 钩子 ]
│  Input (stdin): {
│    "session_id": "claude-abc123",
│    "tool_name": "Read",
│    "tool_input": {...},
│    "tool_response": {...}
│  }
│
├─ [ observation 钩子处理 ]
│  1. 清理隐私标签 (stripMemoryTagsFromJson)
│  2. POST /api/sessions/observations
│
├─ [ SessionRoutes.handleObservationsByClaudeId ]
│  1. 检查 skip tools → 跳过
│  2. 检查 session-memory 文件 → 跳过
│  3. 创建 SDK 会话 (INSERT OR IGNORE)
│  4. 隐私检查 → 跳过
│  5. 入队 pending_messages
│  6. 触发 SDK Agent
│
├─ [ SDK Agent 处理 ]
│  1. 从队列获取消息
│  2. 调用 Claude Agent SDK
│  3. 解析响应生成 observation/summary
│  4. 存入数据库
│
└─ [ 自动触发 ]
   - observations_fts 更新 (触发器)
   - Chroma 向量索引 (ChromaSync)
```

### 关键设计决策

| 决策 | 实现 | 原因 |
|------|------|------|
| **幂等性** | INSERT OR IGNORE | 重复调用返回相同结果 |
| **异步处理** | pending_messages 队列 | 不阻塞钩子返回 |
| **FTS 同步** | 数据库触发器 | 保证一致性 |
| **预算追踪** | 三表模式 + 两阶段提交 | 成本精确控制 |

---

## 搜索系统架构

### 三种搜索策略

```
┌─────────────────────────────────────────────────────────────┐
│                   SearchOrchestrator                         │
│                   (策略选择 + 降级处理)                       │
└─────────────────────────────────────────────────────────────┘
                           │
           ┌───────────────┼───────────────┐
           │               │               │
           ▼               ▼               ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ ChromaSearch    │ │ HybridSearch    │ │ SQLiteSearch    │
│ Strategy        │ │ Strategy        │ │ Strategy        │
├─────────────────┤ ├─────────────────┤ ├─────────────────┤
│ ✨ 向量语义搜索  │ │ 元数据过滤 +    │ │ FTS5 全文搜索   │
│ ChromaDB        │ │ 语义排序        │ │ 仅过滤(无query) │
│ Embedding 相似度│ │                 │ │                 │
└─────────────────┘ └─────────────────┘ └─────────────────┘
```

### 策略选择逻辑

| 条件 | 使用策略 | 说明 |
|------|---------|------|
| `query` 为空 | **SQLite** | 纯过滤查询（按时间、项目等） |
| `query` + Chroma 可用 | **Chroma** | 向量语义搜索 |
| `query` + Chroma 失败 | **SQLite (降级)** | 降级到过滤查询 |
| `findByConcept` | **Hybrid** | 元数据过滤 + 语义排序 |
| `findByType` | **Hybrid** | 元数据过滤 + 语义排序 |

### Chroma 语义搜索流程

```typescript
// ChromaSearchStrategy.search()
1. 向量查询 Chroma
   chromaSync.queryChroma(query, batchSize, whereFilter)
   ↓
2. 按时间过滤 (90天窗口)
   filterByRecency(chromaResults)
   ↓
3. 按文档类型分类
   categorize by doc_type: observation | session | prompt | ai_analysis
   ↓
4. 从 SQLite 补全完整数据
   hydrate from SQLite (Chroma 只存 embedding + metadata)
```

### 时序查询能力

当前架构**已支持**时间范围查询：

```typescript
// MCP 搜索工具参数
search({
  query: "xxx模块设计",
  dateStart: "2025-01-27",  // 需手动指定
  dateEnd: "2025-02-02",
  project: "my-project"
})

// Timeline 查询
getTimelineAroundTimestamp(db, anchorEpoch, depthBefore, depthAfter, project)
getTimelineAroundObservation(db, anchorObservationId, anchorEpoch, ...)
```

### 搜索类型对比

| 搜索类型 | 是否 AI | 说明 |
|---------|--------|------|
| **Chroma 语义搜索** | ✅ 是 | 基于 Embedding 向量相似度 |
| **Hybrid 混合搜索** | ✅ 部分 | 元数据过滤 + 语义排序 |
| **SQLite FTS5** | ❌ 否 | 传统全文搜索（关键词匹配） |

---

## 记忆使用场景

### 场景概览

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        记忆使用场景                                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  场景 1: 会话启动时自动注入 (被动/自动)                                   │
│  ────────────────────────────────────────────────────────────────────    │
│  触发: SessionStart 钩子                                                 │
│  时机: 每次新会话开始                                                    │
│  内容: 最近的观察 + 摘要 (按配置数量)                                    │
│  格式: Markdown 表格注入到 system prompt                                 │
│                                                                          │
│  场景 2: MCP 搜索工具 (主动/手动)                                         │
│  ────────────────────────────────────────────────────────────────────    │
│  触发: Claude 调用 MCP 工具                                               │
│  时机: 用户提问或 Claude 主动搜索                                         │
│  工具: search → timeline → get_observations                              │
│  能力: 语义搜索 + 时间过滤 + ID 查询                                     │
│                                                                          │
│  场景 3: CLAUDE.md 注入 (被动/自动)                                       │
│  ────────────────────────────────────────────────────────────────────    │
│  触发: Claude Code 读取 CLAUDE.md                                         │
│  时机: 会话启动 + 进入目录                                                │
│  内容: <claude-mem-context> 标签内的最近活动                             │
│  格式: 嵌入在 CLAUDE.md 文件中                                            │
│                                                                          │
│  场景 4: Web Viewer UI (用户查看)                                         │
│  ────────────────────────────────────────────────────────────────────    │
│  触发: 用户访问 http://localhost:37777                                   │
│  时机: 用户主动查看                                                       │
│  功能: 浏览、搜索、过滤观察记录                                           │
│  特点: 实时 SSE 更新                                                      │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 场景 1: SessionStart 自动注入

**触发路径**: `SessionStart Hook → /api/context/inject`

**配置参数** (`~/.claude-mem/settings.json`):

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `CLAUDE_MEM_CONTEXT_OBSERVATIONS` | 总观察数量 | 50 |
| `CLAUDE_MEM_CONTEXT_FULL_COUNT` | 完整显示数量 | 3 |
| `CLAUDE_MEM_CONTEXT_SESSION_COUNT` | 会话摘要数量 | 5 |
| `CLAUDE_MEM_CONTEXT_OBSERVATION_TYPES` | 过滤的类型 | 全部 |
| `CLAUDE_MEM_CONTEXT_SHOW_LAST_SUMMARY` | 是否显示最近摘要 | true |

**注入内容示例**:

```markdown
# [claude-mem] recent context, 2026-02-04 2:09pm GMT+8

**Context Index:** (titles, types, files, tokens)

### Feb 4, 2026
| ID | Time | T | Title | Read | Work |
|----|------|---|-------|------|------|
| #117 | 2:18 PM | 🔵 | 消息存储架构... | ~254 | 🔍 3,322 |
| #116 | 2:15 PM | ✅ | 完成xxx功能... | ~180 | 🛠️ 1,200 |

**#S26** 分析Claude-Mem项目的消息存储架构... (会话摘要)
```

**代码位置**:
- 钩子: `src/cli/handlers/context.ts`
- 构建器: `src/services/context/ContextBuilder.ts`
- 配置: `src/services/context/ContextConfigLoader.ts`

### 场景 2: MCP 搜索工具

**3层工作流**:

```
1. search(query, dateStart, dateEnd, project, type, obs_type)
   → 返回 ID 索引列表 (~50-100 tokens/结果)

2. timeline(anchor=ID, depth_before, depth_after)
   → 返回 ID 周围的时间线上下文

3. get_observations(ids=[...])
   → 返回完整观察详情 (~500-1000 tokens/结果)
```

**代码位置**:
- MCP 服务器: `src/servers/mcp-server.ts`
- 搜索编排: `src/services/worker/search/SearchOrchestrator.ts`
- 搜索策略: `src/services/worker/search/strategies/`

### 场景 3: CLAUDE.md 注入

**格式**:

```markdown
<claude-mem-context>
# Recent Activity

### Feb 4, 2026
| ID | Time | T | Title | Read |
|----|------|---|-------|------|
| #117 | 2:18 PM | 🔵 | 消息存储架构... | ~254 |
</claude-mem-context>
```

### 场景 4: Web Viewer UI

**访问地址**: `http://localhost:37777`

**功能**:
- 浏览观察记录
- 搜索和过滤
- 实时 SSE 更新
- 项目切换

---

## 当前架构局限性

### 记忆使用触发点分析

```
时间线:
────────────────────────────────────────────────────────────────────────────
会话开始              会话进行中                                 会话结束
    │                     │                                        │
    ▼                     ▼                                        ▼
┌────────┐           ┌────────┐                              ┌────────┐
│自动注入│           │  ???   │                              │生成摘要│
│上下文  │           │        │                              │        │
└────────┘           └────────┘                              └────────┘
    ✅                   ❌                                       ✅
 (有记忆)            (无自动触发)                             (存记忆)
```

**问题**: 会话进行中，Claude **不会主动**使用记忆，除非用户明确要求搜索。

### 缺失的使用场景

| 场景 | 当前状态 | 说明 |
|------|---------|------|
| **会话中主动召回** | ❌ 需手动调用 MCP | Claude 不会自动搜索记忆 |
| **自然语言时间查询** | ❌ 不支持 | "上周" 需手动转换日期 |
| **上下文理解查询** | ❌ 不支持 | 不理解 "如何设计的" 意图 |
| **自动关联** | ❌ 不支持 | 不会自动关联相关记忆 |
| **对话中触发** | ❌ 不支持 | 只在会话开始注入 |

### 搜索能力局限

**问题 1: 语义理解不足**

用户查询: *"上周我做的 xxx 模块是如何设计的"*

当前系统需要用户**手动转换**:
```
"上周" → dateStart="2025-01-27", dateEnd="2025-02-02"
"xxx模块设计" → query="xxx模块 设计 架构"
```

**问题 2: 缺少自然语言时间解析**

```
❌ "上周"、"三天前"、"上个月" → 不支持
✅ "2025-01-27" → 支持
```

**问题 3: 缺少关联上下文重建**

查询返回的是**独立的观察记录**，缺少:
- 相关会话的完整上下文
- 设计决策的演进历程
- 相关文件的修改时间线

### 时序查询能力评估

| 能力 | 状态 | 说明 |
|------|------|------|
| 按时间范围过滤 | ✅ | 需手动指定日期 |
| 按关键词搜索 | ✅ | FTS5 全文搜索 |
| 按项目过滤 | ✅ | project 参数 |
| 自然语言时间 | ❌ | 不支持 "上周" |
| 上下文重建 | ⚠️ | 返回独立记录，需手动关联 |
| 设计决策追溯 | ⚠️ | 需依赖 observation.type = 'decision' |

---

## 改进方向

### 方向 1: AI 查询理解层

```
┌─────────────────────────────────────────────────────────────┐
│              🆕 AI Query Understanding Layer                 │
├─────────────────────────────────────────────────────────────┤
│  输入: "上周我做的 xxx 模块是如何设计的"                     │
│                         ↓                                    │
│  AI 解析:                                                    │
│    - 时间: last_week → dateStart/dateEnd                    │
│    - 主题: "xxx模块" → query keywords                       │
│    - 意图: "如何设计" → type: decision, feature             │
│    - 期望: 设计决策和架构说明                                │
│                         ↓                                    │
│  生成结构化查询:                                             │
│    {                                                         │
│      dateStart: "2025-01-27",                               │
│      dateEnd: "2025-02-02",                                 │
│      query: "xxx模块",                                       │
│      obsType: ["decision", "feature", "refactor"]           │
│    }                                                         │
└─────────────────────────────────────────────────────────────┘
                           ↓
              现有 SearchOrchestrator
                           ↓
┌─────────────────────────────────────────────────────────────┐
│              🆕 AI Response Synthesis Layer                  │
├─────────────────────────────────────────────────────────────┤
│  输入: 10 条 observation 记录                                │
│                         ↓                                    │
│  AI 总结:                                                    │
│    "上周你在 xxx 模块上做了以下设计决策:                     │
│     1. 采用了 Y 架构模式...                                  │
│     2. 关键接口设计为...                                     │
│     3. 数据流设计..."                                        │
└─────────────────────────────────────────────────────────────┘
```

### 方向 2: 会话中主动召回

在 `UserPromptSubmit` 钩子中分析用户意图，自动搜索相关记忆：

```typescript
// 伪代码
async function analyzeUserIntent(prompt: string) {
  // 1. 检测是否涉及过去的工作
  if (containsTemporalReference(prompt) || containsRecallIntent(prompt)) {
    // 2. 解析时间和主题
    const { timeRange, topic, intent } = await parseIntent(prompt);

    // 3. 自动搜索记忆
    const memories = await searchMemories(timeRange, topic, intent);

    // 4. 注入到上下文
    return { additionalContext: formatMemories(memories) };
  }
}
```

### 方向 3: 自然语言时间解析

```typescript
// 时间引用解析器
parseTimeReference("上周") → { start: "2025-01-27", end: "2025-02-02" }
parseTimeReference("三天前") → { start: "2025-02-01", end: "2025-02-01" }
parseTimeReference("上个月") → { start: "2025-01-01", end: "2025-01-31" }
```

### 方向 4: 增加聚合视图

```sql
-- 新增: 设计决策时间线表
CREATE TABLE design_timeline (
  id INTEGER PRIMARY KEY,
  module_name TEXT,           -- 模块名称
  decision_type TEXT,         -- 架构决策类型
  observation_ids TEXT,       -- 关联的观察 ID 列表
  summary TEXT,               -- AI 生成的设计摘要
  date_range_start INTEGER,
  date_range_end INTEGER,
  created_at_epoch INTEGER
);
```

---

## 参考文件

### 消息存储

| 组件 | 文件位置 |
|------|---------|
| 数据库迁移 | `src/services/sqlite/migrations.ts` |
| 会话创建 | `src/services/sqlite/sessions/create.ts` |
| 观察存储 | `src/services/sqlite/observations/store.ts` |
| 摘要存储 | `src/services/sqlite/summaries/store.ts` |
| 会话路由 | `src/services/worker/http/routes/SessionRoutes.ts` |
| SDK 代理 | `src/services/worker/SDKAgent.ts` |

### 搜索系统

| 组件 | 文件位置 |
|------|---------|
| 搜索编排 | `src/services/worker/search/SearchOrchestrator.ts` |
| Chroma 策略 | `src/services/worker/search/strategies/ChromaSearchStrategy.ts` |
| SQLite 策略 | `src/services/worker/search/strategies/SQLiteSearchStrategy.ts` |
| 混合策略 | `src/services/worker/search/strategies/HybridSearchStrategy.ts` |
| MCP 服务器 | `src/servers/mcp-server.ts` |

### 上下文生成

| 组件 | 文件位置 |
|------|---------|
| 上下文钩子 | `src/cli/handlers/context.ts` |
| 上下文构建 | `src/services/context/ContextBuilder.ts` |
| 配置加载 | `src/services/context/ContextConfigLoader.ts` |
| 时间线查询 | `src/services/sqlite/timeline/queries.ts` |

---

**文档版本:** v1.0
**最后更新:** 2026-02-04
