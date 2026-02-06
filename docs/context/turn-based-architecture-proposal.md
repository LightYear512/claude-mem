# Turn-Based 记忆架构方案

> 本文档记录了 claude-mem 记忆系统架构重构的设计方案。
> 创建日期：2026-02-04

---

## 背景与问题

### 当前架构的问题

1. **数据分离**：`user_prompts` 和 `observations` 分开存储，缺乏统一的 session 视图
2. **高频 AI 调用**：每次 PostToolUse 都触发 AI 分析，成本高（一个会话可能 100+ 次）
3. **原始数据丢失**：只存储 AI 处理后的结果，原始 tool_input/tool_response 丢失
4. **平台耦合**：过度依赖特定平台的能力（如 Claude Code 的 transcript）

### 设计目标

1. **统一数据模型**：一个模型表达完整的会话历史
2. **降低成本**：从"每条消息分析"变为"每个会话/Turn 分析"
3. **保留原始数据**：支持重新分析、精确搜索
4. **平台无关**：适配不同平台的钩子能力差异

---

## 核心概念：Turn（轮次）

### 什么是 Turn？

Turn 是一轮完整的人机交互，包含：

```
Turn = 用户说了什么 + Claude 做了什么 + 结果是什么
```

示例：

```
Turn 1:
  User: "帮我分析这个文件"
  Tools: [Read /src/foo.ts, Read /src/bar.ts]
  Assistant: "这两个文件是..."

Turn 2:
  User: "那帮我重构"
  Tools: [Edit /src/foo.ts, Edit /src/bar.ts]
  Assistant: "已完成重构..."
```

### 为什么以 Turn 为核心？

| 对比维度 | 以"事件类型"为核心 | 以"Turn"为核心 |
|----------|-------------------|----------------|
| 划分依据 | 钩子类型 | 用户意图边界 |
| 查询需求 | 不清晰 | 明确（查找某轮交互） |
| AI 分析单元 | 单条消息 | 完整交互上下文 |
| 符合直觉 | ❌ | ✅ |

---

## 数据模型

### 表结构

```sql
-- 会话表（元数据）
CREATE TABLE sessions (
  id INTEGER PRIMARY KEY,
  session_id TEXT UNIQUE NOT NULL,  -- content_session_id
  platform TEXT NOT NULL,           -- 'claude-code' | 'cursor' | ...
  project TEXT,
  created_at_epoch INTEGER NOT NULL,
  last_activity_epoch INTEGER
);

-- Turn 表（一轮完整交互）
CREATE TABLE turns (
  id INTEGER PRIMARY KEY,
  session_id TEXT NOT NULL,
  turn_number INTEGER NOT NULL,     -- 轮次号（会话内递增）

  -- 用户输入
  user_prompt TEXT,

  -- 工具调用（JSON 数组）
  tool_calls TEXT,                  -- [{name, input, response}, ...]

  -- AI 回复
  assistant_response TEXT,

  -- 元数据
  status TEXT DEFAULT 'active',     -- 'active' | 'completed'
  created_at_epoch INTEGER NOT NULL,
  completed_at_epoch INTEGER,

  UNIQUE(session_id, turn_number),
  FOREIGN KEY(session_id) REFERENCES sessions(session_id)
);

-- AI 分析结果表
CREATE TABLE turn_analyses (
  id INTEGER PRIMARY KEY,
  session_id TEXT NOT NULL,
  turn_range_start INTEGER,         -- 分析的 turn 范围
  turn_range_end INTEGER,

  -- AI 生成的内容
  summary TEXT,
  key_insights TEXT,                -- JSON array
  files_touched TEXT,               -- JSON array

  created_at_epoch INTEGER NOT NULL,

  FOREIGN KEY(session_id) REFERENCES sessions(session_id)
);

-- FTS5 全文搜索
CREATE VIRTUAL TABLE turns_fts USING fts5(
  user_prompt,
  tool_calls,
  assistant_response,
  content='turns',
  content_rowid='id'
);
```

### tool_calls JSON 格式

```json
[
  {
    "name": "Read",
    "input": {"file_path": "/src/foo.ts"},
    "response": "1→import React from 'react';\n2→...",
    "timestamp": 1770123456789
  },
  {
    "name": "Edit",
    "input": {"file_path": "/src/foo.ts", "old_string": "...", "new_string": "..."},
    "response": "File edited successfully",
    "timestamp": 1770123456800
  }
]
```

---

## 数据流

### 整体流程

```
┌─────────────────────────────────────────────────────────────┐
│                    实时数据采集                              │
│                                                             │
│  UserPromptSubmit ────► 创建新 Turn                         │
│                         turn_number++                       │
│                         user_prompt = 用户输入               │
│                                                             │
│  PostToolUse ─────────► 追加到当前 Turn 的 tool_calls        │
│  (可能多次)              [{name, input, response}, ...]     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Turn 完成触发                             │
│                                                             │
│  触发条件：                                                  │
│    - Stop 钩子触发                                          │
│    - 下一个 UserPromptSubmit 到来                           │
│    - 超时（可配置）                                          │
│                                                             │
│  完成动作：                                                  │
│    1. 补全 assistant_response（如果平台支持）                │
│       - 有 transcript → 解析获取                            │
│       - 无 transcript → 使用 last_assistant_message 或留空  │
│    2. 标记 Turn 状态为 completed                            │
│    3. (可选) 触发 AI 分析                                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    AI 批量分析（可选）                        │
│                                                             │
│  触发条件：                                                  │
│    - Stop 钩子触发                                          │
│    - 累积 N 个未分析的 Turn                                  │
│    - 定时任务                                                │
│                                                             │
│  输入：一个或多个完整的 Turn                                  │
│  输出：turn_analyses 记录                                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Turn 生命周期

```
                    ┌──────────────────┐
                    │                  │
UserPromptSubmit ──►│  Turn (active)   │
                    │                  │
                    └────────┬─────────┘
                             │
              PostToolUse ───┤ (追加 tool_calls)
              PostToolUse ───┤
              PostToolUse ───┤
                             │
                    ┌────────▼─────────┐
Stop / 下一个      │                  │
UserPromptSubmit ──►│ Turn (completed) │──► 可选：触发 AI 分析
                    │                  │
                    └──────────────────┘
```

---

## 平台适配设计

### 核心思路

适配器不需要映射"事件类型"，只需要回答：**这个钩子影响 Turn 的哪个字段？**

### 接口定义

```typescript
interface PlatformAdapter {
  platform: string;

  // 这个钩子影响 Turn 的哪个字段？
  getFieldUpdater(hookName: string): TurnFieldUpdater | null;

  // 平台能力声明
  capabilities: {
    canCaptureUserPrompt: boolean;
    canCaptureToolCalls: boolean;
    canCaptureAssistantResponse: boolean;
  };
}

type TurnFieldUpdater =
  | { field: 'user_prompt', extract: (raw: any) => string }
  | { field: 'tool_calls', extract: (raw: any) => ToolCall }
  | { field: 'complete_turn', extract: (raw: any) => { assistantResponse?: string } };

interface ToolCall {
  name: string;
  input: any;
  response: any;
  timestamp?: number;
}
```

### Claude Code 适配器示例

```typescript
const claudeCodeAdapter: PlatformAdapter = {
  platform: 'claude-code',

  getFieldUpdater(hookName) {
    switch(hookName) {
      case 'UserPromptSubmit':
        return {
          field: 'user_prompt',
          extract: (r) => r.prompt
        };

      case 'PostToolUse':
        return {
          field: 'tool_calls',
          extract: (r) => ({
            name: r.tool_name,
            input: r.tool_input,
            response: r.tool_response,
            timestamp: Date.now(),
          })
        };

      case 'Stop':
        return {
          field: 'complete_turn',
          extract: (r) => ({
            // 从 transcript 解析 assistant_response
            assistantResponse: parseTranscript(r.transcript_path),
          })
        };

      default:
        return null;
    }
  },

  capabilities: {
    canCaptureUserPrompt: true,
    canCaptureToolCalls: true,
    canCaptureAssistantResponse: true,  // 通过 transcript
  },
};
```

### Cursor 适配器示例

```typescript
const cursorAdapter: PlatformAdapter = {
  platform: 'cursor',

  getFieldUpdater(hookName) {
    switch(hookName) {
      case 'onToolUse':  // 假设的钩子名
        return {
          field: 'tool_calls',
          extract: (r) => ({
            name: r.tool_name || 'Bash',
            input: r.command ? { command: r.command } : r.tool_input,
            response: r.output || r.result_json,
            timestamp: Date.now(),
          })
        };

      case 'afterFileEdit':
        return {
          field: 'tool_calls',
          extract: (r) => ({
            name: 'Edit',
            input: { file_path: r.file_path, edits: r.edits },
            response: 'File edited',
            timestamp: Date.now(),
          })
        };

      default:
        return null;
    }
  },

  capabilities: {
    canCaptureUserPrompt: false,        // Cursor 可能没有这个钩子
    canCaptureToolCalls: true,
    canCaptureAssistantResponse: false, // 没有 transcript
  },
};
```

---

## 优势分析

### 1. 统一数据模型

```sql
-- 查询某个会话的完整历史
SELECT * FROM turns WHERE session_id = ? ORDER BY turn_number;

-- 一条记录 = 一轮完整交互
```

### 2. 降低 AI 成本

| 方案 | AI 调用次数 | 上下文质量 |
|------|-------------|-----------|
| 当前（每条消息） | 100+/会话 | 单条消息，缺乏上下文 |
| Turn-Based | 1-5/会话 | 完整 Turn，上下文完整 |

预计成本降低 **90%+**。

### 3. 保留原始数据

- `tool_calls` 存储原始 input/response
- 支持重新分析、精确搜索
- 不依赖 AI 处理结果

### 4. 平台无关

- 核心逻辑只操作 Turn
- 适配器负责字段映射
- 能力差异通过 `capabilities` 声明
- 有能力就用，没有也不影响基础功能

### 5. 渐进增强

| 平台能力 | 结果 |
|----------|------|
| 有 user_prompt | Turn.user_prompt 有值 |
| 有 tool_calls | Turn.tool_calls 有值 |
| 有 assistant_response | Turn.assistant_response 有值 |
| 都没有 | Turn 仍然可以创建，只是字段为空 |

---

## 迁移考虑

### 与现有数据的兼容

现有表：
- `user_prompts`: 133 条
- `observations`: 118 条（AI 处理后，原始数据已丢失）

迁移策略：
1. **保留旧表**：不删除，保持向后兼容
2. **新数据写入新表**：新架构只写入 turns 表
3. **搜索合并**：搜索时同时查询新旧表

### 渐进式迁移

```
阶段 1：实现新架构，新数据写入 turns 表
阶段 2：运行一段时间，验证稳定性
阶段 3：(可选) 将旧数据迁移到新表
阶段 4：(可选) 废弃旧表
```

---

## 开放问题

### 1. tool_calls JSON 搜索效率

**问题**：tool_calls 是 JSON 数组，FTS5 搜索效率如何？

**可能方案**：
- FTS5 可以搜索 JSON 文本
- 如需精确搜索，可建立辅助表 `turn_tool_calls`

### 2. Turn 完成时机

**问题**：如何判断一个 Turn 已经完成？

**方案**：
- 下一个 `UserPromptSubmit` 到来 → 上一个 Turn 完成
- `Stop` 钩子触发 → 当前 Turn 完成
- 超时（如 5 分钟无活动）→ 自动完成

### 3. 大文件内容处理

**问题**：tool_response 可能很大（如 Read 整个文件）

**可能方案**：
- 截断超长内容（如 > 10KB）
- 只存储摘要或引用
- 分开存储大内容

### 4. assistant_response 补全

**问题**：不是所有平台都能捕获 assistant_response

**方案**：
- 有 transcript → 解析获取
- 有 last_assistant_message → 使用
- 都没有 → 字段为空，不影响其他功能

---

## 下一步

1. [ ] 详细设计数据库迁移方案
2. [ ] 实现 TurnManager 核心逻辑
3. [ ] 重构 Claude Code 适配器
4. [ ] 实现 transcript 解析器
5. [ ] 调整 AI 分析触发策略
6. [ ] 更新搜索功能以支持新表
7. [ ] 编写测试用例
