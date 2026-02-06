# Claude-mem 新存储架构设计

> **版本**: 1.0
> **状态**: 设计完成，待实现
> **最后更新**: 2025-11

本文档是新存储架构的精简版，用于指导实现。完整讨论和设计决策记录见 `message-storage-mechanism.md`。

---

## 1. 架构概览

### 1.1 核心理念

1. **事件流统一存储** - `user_prompt`、`tool_call`、`assistant_response` 统一为 `events` 表
2. **事实时态管理** - Facts 使用 `valid_from/valid_until` 而非版本号
3. **平台无关抽象** - 存储层只关心 `NormalizedEvent[]`，适配器负责转换
4. **按需存储** - `tool_response` 大多数情况不存储

### 1.2 数据流

```
平台数据源 → Platform Adapter → NormalizedEvent[] → Events 表
                                                         ↓
                                                    AI 分析
                                                         ↓
                                                    Facts 表 → Chroma 向量
```

---

## 2. 数据库表结构

### 2.1 Sessions 表

```sql
CREATE TABLE sessions (
  id INTEGER PRIMARY KEY,
  platform TEXT NOT NULL,              -- 'claude-code' | 'cursor' | ...
  platform_session_id TEXT NOT NULL,   -- 平台原始 session ID
  project_id TEXT NOT NULL,            -- 统一的项目 hash
  project_display TEXT,                -- 可读的项目名称
  first_event_at INTEGER NOT NULL,
  last_event_at INTEGER NOT NULL,
  last_analyzed_at INTEGER,            -- 上次 AI 分析时间

  UNIQUE(platform, platform_session_id)
);

CREATE INDEX idx_sessions_project ON sessions(project_id);

-- 全文搜索
CREATE VIRTUAL TABLE sessions_fts USING fts5(
  project_display, content='sessions', content_rowid='id'
);
```

### 2.2 Events 表

```sql
CREATE TABLE events (
  id INTEGER PRIMARY KEY,
  session_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,            -- 'user_prompt' | 'tool_call' | 'assistant_response'

  -- 统一字段
  prompt_text TEXT,
  tool_name TEXT,
  tool_input TEXT,                     -- JSON
  assistant_text TEXT,
  file_path TEXT,                      -- 从 tool_input 提取

  -- 原始数据
  raw_data TEXT NOT NULL,              -- 完整保留（隐私内容替换为 [REDACTED]）

  -- 元数据
  platform TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  analyzed_at INTEGER,                 -- AI 分析时间（NULL = 未分析）
  platform_event_id TEXT,              -- 平台事件 ID（用于去重）

  FOREIGN KEY(session_id) REFERENCES sessions(id)
);

CREATE INDEX idx_events_session ON events(session_id, timestamp);
CREATE INDEX idx_events_tool ON events(tool_name);
CREATE INDEX idx_events_file ON events(file_path);
CREATE INDEX idx_events_unanalyzed ON events(session_id, analyzed_at) WHERE analyzed_at IS NULL;
CREATE UNIQUE INDEX idx_events_platform_id ON events(session_id, platform_event_id)
  WHERE platform_event_id IS NOT NULL;

-- 全文搜索
CREATE VIRTUAL TABLE events_fts USING fts5(
  prompt_text, assistant_text, content='events', content_rowid='id'
);
```

### 2.3 Facts 表

```sql
CREATE TABLE facts (
  id INTEGER PRIMARY KEY,
  content TEXT NOT NULL,

  -- 作用域
  scope TEXT NOT NULL,                 -- 'project' | 'user'
  scope_project_id TEXT,               -- scope='project' 时有值

  -- 时态字段
  valid_from INTEGER NOT NULL,
  valid_until INTEGER,                 -- NULL = 当前有效
  superseded_by INTEGER,               -- 关联到替代它的新事实

  -- 来源
  source_session_id INTEGER NOT NULL,
  recorded_at INTEGER NOT NULL,

  -- 标签
  tags_json TEXT,                      -- [{"type":"file","value":"src/foo.ts"},...]

  -- 向量同步状态
  pending_sync INTEGER DEFAULT 0,      -- 0=已同步, 1=待同步到 Chroma

  FOREIGN KEY(source_session_id) REFERENCES sessions(id),
  FOREIGN KEY(superseded_by) REFERENCES facts(id)
);

CREATE INDEX idx_facts_scope ON facts(scope, scope_project_id);
CREATE INDEX idx_facts_valid ON facts(valid_until);
CREATE INDEX idx_facts_pending_sync ON facts(pending_sync) WHERE pending_sync = 1;

-- 全文搜索
CREATE VIRTUAL TABLE facts_fts USING fts5(
  content, content='facts', content_rowid='id'
);
```

### 2.4 Fact Tag Index 表

```sql
CREATE TABLE fact_tag_index (
  id INTEGER PRIMARY KEY,
  fact_id INTEGER NOT NULL,
  tag_type TEXT NOT NULL,
  tag_value TEXT NOT NULL,

  FOREIGN KEY(fact_id) REFERENCES facts(id) ON DELETE CASCADE,
  UNIQUE(fact_id, tag_type, tag_value)
);

CREATE INDEX idx_tag_lookup ON fact_tag_index(tag_type, tag_value);
```

---

## 3. 核心接口定义

### 3.1 NormalizedEvent

```typescript
interface NormalizedEvent {
  eventType: 'user_prompt' | 'tool_call' | 'assistant_response';

  // 统一字段
  promptText?: string;
  toolName?: string;
  toolInput?: unknown;
  assistantText?: string;
  filePath?: string;

  // 元数据
  platform: string;
  platformSessionId: string;
  projectId: string;
  projectDisplay: string;
  timestamp: number;

  // 去重标识（可选）
  platformEventId?: string;

  // 原始数据
  rawData: unknown;
}
```

### 3.2 PlatformAdapter

```typescript
interface PlatformAdapter {
  platform: string;
  handlePlatformInput(input: unknown): NormalizedEvent[];
  capabilities?: {
    canCaptureUserPrompt: boolean;
    canCaptureToolCall: boolean;
    canCaptureAssistantResponse: boolean;
  };
}
```

### 3.3 AI 分析相关类型

```typescript
// AI 返回的事实（仅 AI 判断的字段）
interface AIExtractedFact {
  content: string;
  scope: 'project' | 'user';
  tags?: Array<{ type: string; value: string }>;
}

// 存储前的完整事实（AI 返回 + 系统补充）
interface ExtractedFact {
  content: string;
  scope: 'project' | 'user';
  scopeProjectId?: string;    // 系统补充
  validFrom: number;          // 系统补充
  tags?: Array<{ type: string; value: string }>;
}

// AI 分析结果
interface AnalysisResult {
  newFacts: AIExtractedFact[];
  supersededFacts: SupersessionInfo[];
}

interface SupersessionInfo {
  oldFactId: number;
  newFactContent: string;
  reason: string;
}
```

---

## 4. 平台策略

### 4.1 Claude Code（批量模式）

- **数据源**: Stop hook 时读取 transcript 文件
- **废弃**: PostToolUse hook
- **分析触发**: Stop hook 触发时立即分析

```typescript
// Stop hook 处理
async function handleStop(platform: string, adapterInput: unknown) {
  const adapter = getAdapter(platform);
  const events = adapter.handlePlatformInput(adapterInput);
  await processEvents(platform, events, { triggerAnalysis: true });
}
```

### 4.2 Cursor（逐条模式）

- **数据源**: PostToolUse / UserPromptSubmit hooks
- **分析触发**: 空闲超时（30 分钟）

```typescript
// 逐条事件处理
async function handleIncrementalEvent(platform: string, adapterInput: unknown) {
  const adapter = getAdapter(platform);
  const events = adapter.handlePlatformInput(adapterInput);
  await processEvents(platform, events, { triggerAnalysis: false });
}

// 定时任务检查空闲 session
async function analyzeIdleSessions() {
  const idleThreshold = 30 * 60 * 1000;
  const sessions = await getSessionsNeedingAnalysis({
    lastEventBefore: Date.now() - idleThreshold,
    hasUnanalyzedEvents: true,
  });
  for (const session of sessions) {
    await triggerAnalysis(session.id);
  }
}
```

---

## 5. 核心流程

### 5.1 事件存储流程

```typescript
async function processEvents(
  platform: string,
  events: NormalizedEvent[],
  options: { triggerAnalysis: boolean }
): Promise<void> {
  if (events.length === 0) return;

  // 1. 获取或创建 session
  const session = await getOrCreateSession({
    platform,
    platformSessionId: events[0].platformSessionId,
    projectId: events[0].projectId,
    projectDisplay: events[0].projectDisplay,
    firstEventTimestamp: events[0].timestamp,
  });

  // 2. 存储事件（内部更新 last_event_at）
  await storeEvents(session.id, events);

  // 3. 可选：触发分析
  if (options.triggerAnalysis) {
    await triggerAnalysis(session.id);
  }
}
```

### 5.2 AI 分析流程

```typescript
async function triggerAnalysis(sessionId: number): Promise<void> {
  // 1. 获取待分析事件
  const events = await getUnanalyzedEvents(sessionId);
  if (events.length === 0) return;

  // 2. 准备分析输入（包含向量搜索的相关历史事实）
  const input = await prepareAnalysisInput(sessionId, events);

  // 3. AI 提取事实
  const analysisResult = await extractFacts(input);

  // 4. 补充系统上下文
  const enrichedFacts = enrichFacts(analysisResult.newFacts, {
    projectId: input.projectId,
    timestamp: Date.now(),
  });

  // 5. 处理事实替代关系
  const supersessionMap = await processFactSupersession(analysisResult.supersededFacts);

  // 6. 存储事实（SQLite + Chroma）
  await storeFacts(sessionId, enrichedFacts, supersessionMap);

  // 7. 标记事件已分析
  await markEventsAnalyzed(events);

  // 8. 更新 session 的 last_analyzed_at
  await updateSessionAnalyzedAt(sessionId);
}
```

### 5.3 事实存储策略

- **SQLite**: 同步写入，必须成功
- **Chroma**: 同步尝试，失败则标记 `pending_sync=1`
- **后台重试**: 定时任务处理 `pending_sync=1` 的记录

---

## 6. 项目标识策略

优先级从高到低：

| 优先级 | 策略 | 说明 |
|--------|------|------|
| 1 | `.claude-mem.json` 配置 | 用户显式配置 |
| 2 | Git 首次提交 hash | 跨目录稳定 |
| 3 | 标准化路径 | 兜底方案 |

```typescript
interface ProjectIdentifier {
  id: string;       // 统一 hash
  display: string;  // 可读名称
  source: 'config' | 'git' | 'path';
}
```

---

## 7. 隐私处理

- **处理时机**: 适配器层（`handlePlatformInput` 时）
- **完全私有**: 整个事件不存储
- **部分私有**: 私有内容替换为 `[REDACTED]`
- **rawData**: 也要处理隐私（不能泄露）

---

## 8. 查询示例

### 当前有效的事实

```sql
SELECT * FROM facts WHERE valid_until IS NULL;
```

### 当前项目 + 用户级事实

```sql
SELECT * FROM facts
WHERE valid_until IS NULL
  AND (
    (scope = 'project' AND scope_project_id = ?)
    OR scope = 'user'
  );
```

### 某时刻的事实快照

```sql
SELECT * FROM facts
WHERE scope = 'project' AND scope_project_id = ?
  AND valid_from <= ?
  AND (valid_until IS NULL OR valid_until > ?);
```

### 未分析的事件

```sql
SELECT * FROM events
WHERE session_id = ? AND analyzed_at IS NULL
ORDER BY timestamp ASC;
```

---

## 9. 调度参数

| 参数 | 值 | 说明 |
|------|-----|------|
| 检查间隔 | 5 分钟 | 定期检查空闲 session |
| 空闲阈值 | 30 分钟 | 触发分析的空闲时间 |
| 向量搜索阈值 | 0.7 | 相似度过滤 |
| 向量搜索数量 | 10 | 最多返回条数 |

---

## 10. 与旧架构对照

| 旧架构 | 新架构 |
|--------|--------|
| `prompts` 表 | `events` (event_type='user_prompt') |
| `observations` 表 | `events` (event_type='tool_call') |
| `session_summaries` 表 | `facts` 表 |
| 无 | `sessions` 表 |
| 无 | `fact_tag_index` 表 |

---

## 11. 实现检查清单

- [ ] 数据库迁移脚本（新建表 + FTS + 触发器）
- [ ] `PlatformAdapter` 接口实现
- [ ] `ClaudeCodeAdapter` 实现
- [ ] `CursorAdapter` 实现
- [ ] `processEvents` 核心流程
- [ ] `triggerAnalysis` AI 分析流程
- [ ] `storeFacts` 事实存储（含 Chroma）
- [ ] `vectorSearchFacts` 向量搜索
- [ ] 隐私处理工具函数
- [ ] 项目标识解析 `resolveProject`
- [ ] Worker 定时任务（空闲分析 + Chroma 重试）
- [ ] FTS 触发器
- [ ] 单元测试
- [ ] 集成测试
