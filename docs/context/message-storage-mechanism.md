# Claude-mem 消息存储机制

本文档详细描述 claude-mem 如何捕获和存储 Claude Code 会话中的消息。

---

## 概述

Claude-mem 通过 Claude Code 的钩子系统捕获会话数据，主要存储两类信息：
1. **用户提示 (User Prompts)** - 用户输入的问题和指令
2. **工具观察 (Tool Observations)** - Claude 使用的工具及其输入/输出

---

## 存储的内容

### 1. 用户提示 (Prompts)

**捕获时机**: `UserPromptSubmit` 钩子
**存储位置**: `prompts` 表
**API 端点**: `POST /api/sessions/init`

存储字段：
| 字段 | 说明 |
|------|------|
| `content_session_id` | Claude Code 会话 ID |
| `prompt_number` | 提示序号（同一会话内递增） |
| `prompt_text` | 用户提示内容 |
| `project` | 项目路径 |
| `created_at_epoch` | 创建时间戳 |

**代码位置**: `src/services/worker/http/routes/SessionRoutes.ts:546-618`

### 2. 工具观察 (Observations)

**捕获时机**: `PostToolUse` 钩子
**存储位置**: `observations` 表
**API 端点**: `POST /api/sessions/observations`

存储字段：
| 字段 | 说明 |
|------|------|
| `tool_name` | 工具名称（如 Read, Bash, Edit） |
| `tool_input` | 工具输入参数（JSON） |
| `tool_response` | 工具输出结果（JSON） |
| `prompt_number` | 所属提示编号 |
| `cwd` | 执行时的工作目录 |
| `created_at_epoch` | 创建时间戳 |

**代码位置**: `src/services/worker/http/routes/SessionRoutes.ts:404-487`

---

## 跳过规则

### 1. Skip Tools（跳过的工具）

通过设置 `CLAUDE_MEM_SKIP_TOOLS` 配置，以下工具默认不存储：

```
ListMcpResourcesTool, SlashCommand, Skill, TodoWrite, AskUserQuestion
```

**配置位置**: `~/.claude-mem/settings.json`

```json
{
  "CLAUDE_MEM_SKIP_TOOLS": "ListMcpResourcesTool,SlashCommand,Skill,TodoWrite,AskUserQuestion"
}
```

**代码位置**: `src/services/worker/http/routes/SessionRoutes.ts:411-419`

```typescript
// Load skip tools from settings
const settings = SettingsDefaultsManager.loadFromFile(USER_SETTINGS_PATH);
const skipTools = new Set(settings.CLAUDE_MEM_SKIP_TOOLS.split(',').map(t => t.trim()).filter(Boolean));

// Skip low-value or meta tools
if (skipTools.has(tool_name)) {
  logger.debug('SESSION', 'Skipping observation for tool', { tool_name });
  res.json({ status: 'skipped', reason: 'tool_excluded' });
  return;
}
```

### 2. Session-memory 文件操作

对 `session-memory` 目录下文件的操作会被跳过，防止产生元观察（观察自身的观察）。

适用工具：`Edit`, `Write`, `Read`, `NotebookEdit`

**代码位置**: `src/services/worker/http/routes/SessionRoutes.ts:422-434`

```typescript
// Skip meta-observations: file operations on session-memory files
const fileOperationTools = new Set(['Edit', 'Write', 'Read', 'NotebookEdit']);
if (fileOperationTools.has(tool_name) && tool_input) {
  const filePath = tool_input.file_path || tool_input.notebook_path;
  if (filePath && filePath.includes('session-memory')) {
    logger.debug('SESSION', 'Skipping meta-observation for session-memory file', {
      tool_name,
      file_path: filePath
    });
    res.json({ status: 'skipped', reason: 'session_memory_meta' });
    return;
  }
}
```

### 3. 隐私标签

用户可以使用 `<private>内容</private>` 标签保护敏感内容不被存储。

**行为**:
- 标签内的内容会在存储前被剥离
- 如果整个提示都被 `<private>` 标签包裹，该提示及其所有后续观察都不会存储

**代码位置**: `src/utils/tag-stripping.ts`

---

## 会被存储的工具

以下是常见的会被存储的工具：

| 工具 | 说明 |
|------|------|
| `Bash` | 命令执行 |
| `Read` | 文件读取 |
| `Write` | 文件写入 |
| `Edit` | 文件编辑 |
| `Grep` | 内容搜索 |
| `Glob` | 文件模式搜索 |
| `WebFetch` | 网页获取 |
| `Task` | 子代理任务 |
| `NotebookEdit` | Jupyter Notebook 编辑 |
| `LSP` | 语言服务器操作 |
| MCP 工具 | 各种 MCP 服务器提供的工具 |

---

## 数据流程图

```
Claude Code 会话
    │
    ├─ [UserPromptSubmit 钩子]
    │       │
    │       ▼
    │   POST /api/sessions/init
    │       │
    │       ├─ 剥离 <private> 标签
    │       ├─ 检查是否完全私有 → 跳过
    │       │
    │       └─ 存入 prompts 表
    │
    └─ [PostToolUse 钩子] (每次工具调用)
            │
            ▼
        POST /api/sessions/observations
            │
            ├─ 检查 skip tools → 跳过
            ├─ 检查 session-memory 文件 → 跳过
            ├─ 隐私检查（用户提示是否私有）→ 跳过
            ├─ 剥离 <private> 标签
            │
            └─ 存入 observations 表
                    │
                    ▼
            [AI Agent 处理]
                    │
                    ├─ 生成语义摘要
                    ├─ 提取关键信息
                    │
                    └─ 存入 session_summaries 表
                            │
                            ▼
                    [向量索引 - Chroma]
```

---

## 数据库表结构

### prompts 表

```sql
CREATE TABLE prompts (
  id INTEGER PRIMARY KEY,
  content_session_id TEXT NOT NULL,
  memory_session_id TEXT,
  project TEXT,
  prompt_number INTEGER,
  prompt_text TEXT,
  created_at_epoch INTEGER
);
```

### observations 表

```sql
CREATE TABLE observations (
  id INTEGER PRIMARY KEY,
  session_id INTEGER,
  content_session_id TEXT,
  tool_name TEXT,
  tool_input TEXT,
  tool_output TEXT,
  prompt_number INTEGER,
  cwd TEXT,
  created_at_epoch INTEGER
);
```

### session_summaries 表

```sql
CREATE TABLE session_summaries (
  id INTEGER PRIMARY KEY,
  session_id INTEGER,
  content_session_id TEXT,
  summary_text TEXT,
  observation_type TEXT,
  observation_concepts TEXT,
  title TEXT,
  narrative TEXT,
  file_path TEXT,
  created_at_epoch INTEGER
);
```

---

## 配置选项

### 相关设置项

| 设置 | 说明 | 默认值 |
|------|------|--------|
| `CLAUDE_MEM_SKIP_TOOLS` | 跳过的工具列表（逗号分隔） | `ListMcpResourcesTool,SlashCommand,Skill,TodoWrite,AskUserQuestion` |
| `CLAUDE_MEM_DATA_DIR` | 数据目录 | `~/.claude-mem` |
| `CLAUDE_MEM_LOG_LEVEL` | 日志级别 | `INFO` |

### 修改 Skip Tools

编辑 `~/.claude-mem/settings.json`:

```json
{
  "CLAUDE_MEM_SKIP_TOOLS": "ListMcpResourcesTool,SlashCommand,Skill,TodoWrite,AskUserQuestion,Glob"
}
```

修改后需要重启 worker：

```bash
npm run worker:restart
```

---

## 调试

### 查看存储的提示

```bash
sqlite3 ~/.claude-mem/claude-mem.db "SELECT id, prompt_number, substr(prompt_text, 1, 50) FROM prompts ORDER BY id DESC LIMIT 10;"
```

### 查看存储的观察

```bash
sqlite3 ~/.claude-mem/claude-mem.db "SELECT id, tool_name, created_at_epoch FROM observations ORDER BY id DESC LIMIT 10;"
```

### 查看跳过日志

```bash
npm run worker:logs | grep "Skipping"
```

---

## 参考文件

- 钩子入口: `src/cli/handlers/observation.ts`
- 路由处理: `src/services/worker/http/routes/SessionRoutes.ts`
- 隐私处理: `src/utils/tag-stripping.ts`
- 设置管理: `src/shared/SettingsDefaultsManager.ts`
- 数据库迁移: `src/services/sqlite/migrations.ts`
