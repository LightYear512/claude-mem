# Claude-mem 消息存储机制

本文档详细描述 claude-mem 如何捕获和存储 Claude Code 会话中的消息。

---

## 🚧 新存储架构设计（进行中）

> 本节记录正在进行的架构重设计讨论。这是一个全新的方案，不受现有架构约束。

### 核心问题

当前架构存在以下问题：
1. `user_prompts` 和 `observations` 分开存储，缺乏统一的 session 概念
2. AI 分析按每条消息触发，成本高
3. 原始数据（tool_input/tool_response）在 AI 处理后丢失
4. 架构与特定平台（Claude Code）耦合过紧

### 设计原则

1. **Turn 是展示层概念，不是存储层概念**
   - Turn（用户提示 + 工具调用 + 助手回复）的边界在展示时动态计算
   - 存储层只保存事件流，不强制分组

2. **存储有价值的信息，而非全部信息**
   - `tool_response` 大多数情况下不需要存储
   - 对记忆有价值的是：用户意图、Claude 操作、最终结论
   - 对记忆无价值的是：中间产物（Read 的文件内容、Grep 的搜索结果等）

3. **平台无关的数据抽象**
   - 存储层只关心 `NormalizedEvent[]`，不关心数据从何而来
   - 平台适配器负责将平台特定输入转换为统一事件
   - 不同平台可以有完全不同的数据获取方式（transcript、hooks、websocket 等）

### 已确定的设计决策

#### 事件捕获策略（Claude Code）

> **注意**：本节描述的是 Claude Code 特定的事件捕获策略。其他平台可能使用不同策略。

**结论**：废弃 PostToolUse，统一从 Stop hook 的 transcript 提取。

**Hook 职责**：

| Hook | 行为 | 说明 |
|------|------|------|
| SessionStart | 启动 worker，注入上下文 | 保留 |
| UserPromptSubmit | 不存储 | 从 transcript 获取 |
| PostToolUse | **废弃** | 从 transcript 获取 |
| Stop | 从 transcript 提取全部内容，批量存储 | **核心** |

**为什么废弃 PostToolUse（Claude Code 特定）？**

1. **数据冗余**：transcript 已包含所有 tool_call 信息
2. **一致性问题**：两个数据源可能不一致
3. **时间戳问题**：PostToolUse 的时间戳是 hook 触发时间，不是实际执行时间
4. **不需要实时查询**：产品不需要会话中实时查询最近操作

**Transcript 文件可靠性分析**：

- Stop hook 触发时，transcript **一定存在**（Claude Code 还在运行）
- Stop hook 中**同步读取** transcript，提取内容后发送到 worker
- 之后 transcript 是否存在无所谓（内容已提取）

**代价**：

- Stop 不触发时丢失整个 session（崩溃、强制关闭）
- 可接受的风险，边缘情况

**其他平台**：

- **Cursor**：没有 transcript 文件，继续使用 PostToolUse/UserPromptSubmit hooks
- **未来平台**：根据平台特性选择最佳数据获取方式

#### 逐条推送平台的处理策略（如 Cursor）

对于没有 transcript 的平台，事件是逐条推送的，需要不同的处理策略。

**Session 管理**：
- 首次收到事件时创建 session（基于 platformSessionId）
- 后续事件关联到已有 session
- session 的 `last_event_at` 随每次事件更新

**AI 分析触发**：
- 不能依赖 Stop hook（可能不触发）
- 改用**超时触发**：session 空闲超过阈值（如 30 分钟）后触发分析
- 可选：累计事件数达到阈值时触发

**逐条事件处理流程**：
```typescript
// 共享的事件处理核心逻辑
async function processEvents(
  platform: string,
  events: NormalizedEvent[],
  options: { triggerAnalysis: boolean }
): Promise<void> {
  if (events.length === 0) return;

  const firstEvent = events[0];

  // 1. 获取或创建 session（首次创建时初始化 first_event_at）
  const session = await getOrCreateSession({
    platform,
    platformSessionId: firstEvent.platformSessionId,
    projectId: firstEvent.projectId,
    projectDisplay: firstEvent.projectDisplay,
    firstEventTimestamp: firstEvent.timestamp,  // 用于初始化 first_event_at
  });

  // 2. 存储事件（单个或批量）
  await storeEvents(session.id, events);

  // 3. 更新 session 的 last_event_at（由 storeEvents 内部处理）

  // 4. 可选：触发分析
  if (options.triggerAnalysis) {
    await triggerAnalysis(session.id);
  }
}

/**
 * 获取或创建 session
 *
 * - 首次创建时：使用 firstEventTimestamp 初始化 first_event_at 和 last_event_at
 * - 已存在时：返回现有 session（last_event_at 由 storeEvents 更新）
 */
async function getOrCreateSession(params: {
  platform: string;
  platformSessionId: string;
  projectId: string;
  projectDisplay: string;
  firstEventTimestamp: number;
}): Promise<Session> {
  const db = getDatabase();

  // 尝试查找现有 session
  const existing = await db.get<Session>(
    'SELECT * FROM sessions WHERE platform = ? AND platform_session_id = ?',
    [params.platform, params.platformSessionId]
  );

  if (existing) {
    return existing;
  }

  // 创建新 session
  const result = await db.run(
    `INSERT INTO sessions (
      platform, platform_session_id, project_id, project_display,
      first_event_at, last_event_at
    ) VALUES (?, ?, ?, ?, ?, ?)`,
    [
      params.platform,
      params.platformSessionId,
      params.projectId,
      params.projectDisplay,
      params.firstEventTimestamp,  // first_event_at
      params.firstEventTimestamp,  // last_event_at（初始值相同）
    ]
  );

  return {
    id: result.lastInsertRowid,
    ...params,
    first_event_at: params.firstEventTimestamp,
    last_event_at: params.firstEventTimestamp,
  };
}

// 逐条推送入口（Cursor 等平台）
async function handleIncrementalEvent(platform: string, adapterInput: unknown) {
  const adapter = getAdapter(platform);
  const events = adapter.handlePlatformInput(adapterInput);

  // 不立即触发分析（由定时任务处理）
  await processEvents(platform, events, { triggerAnalysis: false });
}

// 定时任务：检查空闲 session 并触发分析
async function analyzeIdleSessions() {
  const idleThreshold = 30 * 60 * 1000;  // 30 分钟
  const now = Date.now();

  const sessions = await getSessionsNeedingAnalysis({
    lastEventBefore: now - idleThreshold,
    hasUnanalyzedEvents: true,
  });

  for (const session of sessions) {
    await triggerAnalysis(session.id);
  }
}
```

**调度机制**：

由 Worker 服务内部的 `setInterval` 调度，不依赖外部 cron。

```typescript
// Worker 启动时注册定时任务
class WorkerService {
  private analysisTimer: NodeJS.Timeout | null = null;

  async start() {
    // ... 其他初始化

    // 注册空闲分析定时任务
    this.analysisTimer = setInterval(
      () => this.runScheduledTasks(),
      5 * 60 * 1000  // 每 5 分钟检查一次
    );
  }

  async stop() {
    if (this.analysisTimer) {
      clearInterval(this.analysisTimer);
      this.analysisTimer = null;
    }
  }

  private async runScheduledTasks() {
    // 使用锁防止并发执行（单 worker 情况下可选）
    const lock = await tryAcquireLock('scheduled-analysis');
    if (!lock) return;

    try {
      await analyzeIdleSessions();
      await syncPendingFactsToChroma();  // 同时处理向量同步重试
    } finally {
      await releaseLock(lock);
    }
  }
}
```

**调度参数**：

| 参数 | 值 | 说明 |
|------|-----|------|
| 检查间隔 | 5 分钟 | 定期检查空闲 session |
| 空闲阈值 | 30 分钟 | session 无新事件超过此时间触发分析 |
| 并发控制 | 单任务锁 | 防止同一 worker 并发执行 |

**多 Worker 部署**：当前设计假设单 worker，多 worker 需要分布式锁（如 Redis）或数据库行锁。

**事件去重**：

去重策略根据平台特性选择，**两种策略互斥，不同时使用**：

| 策略 | 适用场景 | 优点 | 缺点 |
|------|---------|------|------|
| 平台事件 ID | 平台提供唯一 ID | 精确、简单 | 依赖平台支持 |
| 复合字段 | 平台无唯一 ID | 通用 | 可能误判（同秒相同操作） |

**策略选择逻辑**：
```typescript
function shouldStoreEvent(event: NormalizedEvent, sessionId: number): boolean {
  // 优先使用平台事件 ID（如果有）
  if (event.platformEventId) {
    return !await existsByPlatformEventId(sessionId, event.platformEventId);
  }

  // 回退到复合字段去重
  return !await existsByCompositeKey(sessionId, event);
}
```

**推荐：平台事件 ID**（首选）：
```sql
-- 当平台提供事件 ID 时使用此索引
CREATE UNIQUE INDEX idx_events_platform_id ON events(session_id, platform_event_id)
  WHERE platform_event_id IS NOT NULL;
```

**回退：复合字段去重**（无平台 ID 时）：
```sql
-- 注意：此索引仅在平台不提供事件 ID 时作为回退方案
-- 不要与 idx_events_platform_id 同时依赖
CREATE UNIQUE INDEX idx_events_dedup ON events(
  session_id,
  event_type,
  timestamp,
  COALESCE(tool_name, ''),
  COALESCE(substr(prompt_text, 1, 100), '')
);
```

**实际部署建议**：只创建 `idx_events_platform_id`，在应用层处理无 ID 的情况。

#### tool_response 存储策略

**结论**：大多数工具的 `tool_response` 不需要存储。

| 工具 | response 内容 | 存储？ | 理由 |
|------|--------------|--------|------|
| Read | 文件内容 | ❌ | 文件本身不是记忆，"读了什么文件"才是 |
| Edit | 修改确认 | ✅ | 通常很短，有价值 |
| Grep | 匹配结果 | ❌ | 结果不是记忆，"搜索了什么"才是 |
| Bash | 命令输出 | ❌ | 大多数不需要 |
| Write | 写入确认 | ✅ | 通常很短 |

**存储策略配置**：
```typescript
interface EventStoragePolicy {
  storeToolInput: boolean;      // 通常是：工具名+输入（小）
  storeToolResponse: boolean;   // 通常否：工具输出（大且无价值）
}

const defaultPolicy: EventStoragePolicy = {
  storeToolInput: true,
  storeToolResponse: false
};

const policyOverrides: Record<string, Partial<EventStoragePolicy>> = {
  'Edit': { storeToolResponse: true },
  'Write': { storeToolResponse: true },
};
```

**策略应用位置**：**存储层**（不是适配器层）。

**原因**：
- 存储策略是全局配置，不应由各适配器重复实现
- 适配器只负责提取原始数据，存储层决定保留哪些字段
- 便于统一修改策略而不需要改动所有适配器

**实现**：
```typescript
// StorableEvent 是 NormalizedEvent 应用存储策略后的结果
// 区别：某些字段可能被置为 null（根据策略决定不存储）
type StorableEvent = Omit<NormalizedEvent, 'toolInput'> & {
  toolInput: unknown | null;  // 可能被策略置为 null
};

// 存储层应用策略
function applyStoragePolicy(event: NormalizedEvent): StorableEvent {
  if (event.eventType !== 'tool_call') {
    return event;
  }

  const policy = policyOverrides[event.toolName] ?? defaultPolicy;

  return {
    ...event,
    toolInput: policy.storeToolInput ? event.toolInput : null,
    // tool_response 本身就不在 NormalizedEvent 中（适配器层已过滤）
  };
}
```

**AI 分析不需要 tool_response**：
- AI 可以从 tool_input 推断发生了什么
- 例如：`tool_name: "Read", tool_input: "/src/foo.ts"` → "Claude 读取了 /src/foo.ts 文件"

### 已确定的设计决策（续）

#### Session 管理

**结论**：存储层不需要关心 Session 是否"关闭"。

- Session 管理是**被动的**（平台告诉我们 session_id，我们只负责存储）
- Session "关闭"是运行时概念，不是存储概念
- 存储层只记录 `first_event_at` 和 `last_event_at`，不记录"关闭"状态

```sql
CREATE TABLE sessions (
  id INTEGER PRIMARY KEY,
  platform TEXT NOT NULL,
  platform_session_id TEXT NOT NULL,
  project_id TEXT NOT NULL,           -- 统一的 hash，用于匹配
  project_display TEXT,               -- 可读名称，用于展示
  first_event_at INTEGER NOT NULL,
  last_event_at INTEGER NOT NULL,     -- 只是最后活动时间，不是"关闭"标记
  last_analyzed_at INTEGER,           -- 上次 AI 分析时间（用于增量分析）

  UNIQUE(platform, platform_session_id)
);

CREATE INDEX idx_sessions_project ON sessions(project_id);
```

**`last_event_at` 更新机制**：

由 `storeEvents` 函数在应用层更新（不使用触发器）。

```typescript
async function storeEvents(sessionId: number, events: NormalizedEvent[]): Promise<void> {
  const db = getDatabase();

  await db.transaction(async () => {
    // 1. 插入事件
    for (const event of events) {
      await insertEvent(sessionId, event);
    }

    // 2. 更新 session 的 last_event_at
    const maxTimestamp = Math.max(...events.map(e => e.timestamp));
    await db.run(
      'UPDATE sessions SET last_event_at = MAX(last_event_at, ?) WHERE id = ?',
      [maxTimestamp, sessionId]
    );
  });
}
```

**为什么不用触发器？**
- 应用层更新更可控，便于批量优化
- 触发器在每次 INSERT 时执行，批量插入时性能差
- 便于测试和调试

**`insertEvent` 实现**：

```typescript
/**
 * 插入单个事件到 events 表
 * 将 NormalizedEvent 映射到数据库字段
 */
async function insertEvent(sessionId: number, event: NormalizedEvent): Promise<number> {
  const db = getDatabase();

  const result = await db.run(
    `INSERT INTO events (
      session_id, event_type,
      prompt_text, tool_name, tool_input, assistant_text, file_path,
      raw_data, platform, timestamp, platform_event_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      sessionId,
      event.eventType,
      event.promptText ?? null,
      event.toolName ?? null,
      event.toolInput ? JSON.stringify(event.toolInput) : null,
      event.assistantText ?? null,
      event.filePath ?? null,
      JSON.stringify(event.rawData),
      event.platform,  // 直接使用 NormalizedEvent 中的 platform 字段
      event.timestamp,
      event.platformEventId ?? null,
    ]
  );

  return result.lastInsertRowid;
}

#### 项目标识（Project ID）

**问题**：如何界定"这个项目"？

**需求分析**：
- 用户在不同目录 clone 同一代码库，应该共享项目记忆
- 用户移动项目目录后，应该保留关联
- 非 git 项目也需要支持

**解决方案**：统一 hash + 可读名称

**存储结构**：
```sql
CREATE TABLE sessions (
  ...
  project_id TEXT NOT NULL,       -- 统一的 hash，用于匹配
  project_display TEXT,           -- 可读名称，用于展示
  ...
);
```

**接口定义**：
```typescript
interface ProjectIdentifier {
  id: string;           // 统一的 hash（用于匹配）
  display: string;      // 可读名称（用于展示）
  source: 'config' | 'git' | 'path';  // 来源（仅用于调试）
}

function resolveProject(cwd: string): ProjectIdentifier {
  // 1. 优先：用户显式配置
  const config = tryReadConfig(cwd, '.claude-mem.json');
  if (config?.project_id) {
    return {
      id: hash(config.project_id),
      display: config.project_name || config.project_id,
      source: 'config'
    };
  }

  // 2. 次选：Git 首次提交 hash（稳定且跨目录）
  const gitRoot = tryGetGitRoot(cwd);
  if (gitRoot) {
    const firstCommit = tryGetFirstCommitHash(gitRoot);
    if (firstCommit) {
      return {
        id: hash(firstCommit),
        display: path.basename(gitRoot),
        source: 'git'
      };
    }
  }

  // 3. 兜底：标准化路径（接受移动后会丢失关联）
  const normalized = normalizePath(cwd);
  return {
    id: hash(normalized),
    display: path.basename(normalized),
    source: 'path'
  };
}
```

**策略优先级**：

| 优先级 | 策略 | 稳定性 | 适用场景 |
|--------|------|--------|----------|
| 1 | 用户配置 `.claude-mem.json` | 最稳定 | 特殊需求、非 git 项目 |
| 2 | Git 首次提交 hash | 高 | 大多数项目 |
| 3 | 标准化路径 | 低 | 兜底方案 |

**统一点**：
- `project_id` 永远是 hash，格式统一
- 匹配逻辑只看 `project_id`
- 展示用 `project_display`

**设计原则**：宁可漏掉关联，不要猜错关联。

#### Facts 表完整定义

**Facts 表结构**（统一定义）：

```sql
CREATE TABLE facts (
  id INTEGER PRIMARY KEY,
  content TEXT NOT NULL,

  -- 作用域（AI 分析时判断）
  scope TEXT NOT NULL,              -- 'project' | 'user'
  scope_project_id TEXT,            -- scope='project' 时有值

  -- 时态字段
  valid_from INTEGER NOT NULL,      -- 事实开始有效
  valid_until INTEGER,              -- 事实失效（NULL = 当前有效）
  superseded_by INTEGER,            -- 关联到替代它的新事实（便于追溯）

  -- 来源
  source_session_id INTEGER NOT NULL,
  recorded_at INTEGER NOT NULL,

  -- 标签（JSON 内嵌，读取时无需 JOIN）
  tags_json TEXT,                   -- [{"type":"file","value":"src/foo.ts"},...]

  FOREIGN KEY(source_session_id) REFERENCES sessions(id),
  FOREIGN KEY(superseded_by) REFERENCES facts(id)
);

CREATE INDEX idx_facts_scope ON facts(scope, scope_project_id);
CREATE INDEX idx_facts_valid ON facts(valid_until);

-- Facts 全文搜索虚拟表
CREATE VIRTUAL TABLE facts_fts USING fts5(
  content,
  content='facts',
  content_rowid='id'
);

-- Facts FTS 同步触发器
CREATE TRIGGER facts_ai AFTER INSERT ON facts BEGIN
  INSERT INTO facts_fts(rowid, content) VALUES (new.id, new.content);
END;
CREATE TRIGGER facts_ad AFTER DELETE ON facts BEGIN
  INSERT INTO facts_fts(facts_fts, rowid, content) VALUES('delete', old.id, old.content);
END;
CREATE TRIGGER facts_au AFTER UPDATE ON facts BEGIN
  INSERT INTO facts_fts(facts_fts, rowid, content) VALUES('delete', old.id, old.content);
  INSERT INTO facts_fts(rowid, content) VALUES (new.id, new.content);
END;

-- Events 全文搜索虚拟表（支持搜索用户提示和助手回复）
CREATE VIRTUAL TABLE events_fts USING fts5(
  prompt_text,
  assistant_text,
  content='events',
  content_rowid='id'
);

-- Events FTS 同步触发器
CREATE TRIGGER events_fts_ai AFTER INSERT ON events BEGIN
  INSERT INTO events_fts(rowid, prompt_text, assistant_text)
  VALUES (new.id, new.prompt_text, new.assistant_text);
END;
CREATE TRIGGER events_fts_ad AFTER DELETE ON events BEGIN
  INSERT INTO events_fts(events_fts, rowid, prompt_text, assistant_text)
  VALUES('delete', old.id, old.prompt_text, old.assistant_text);
END;
CREATE TRIGGER events_fts_au AFTER UPDATE ON events BEGIN
  INSERT INTO events_fts(events_fts, rowid, prompt_text, assistant_text)
  VALUES('delete', old.id, old.prompt_text, old.assistant_text);
  INSERT INTO events_fts(rowid, prompt_text, assistant_text)
  VALUES (new.id, new.prompt_text, new.assistant_text);
END;

-- Sessions 全文搜索虚拟表（支持按项目名搜索）
CREATE VIRTUAL TABLE sessions_fts USING fts5(
  project_display,
  content='sessions',
  content_rowid='id'
);

-- Sessions FTS 同步触发器
CREATE TRIGGER sessions_fts_ai AFTER INSERT ON sessions BEGIN
  INSERT INTO sessions_fts(rowid, project_display) VALUES (new.id, new.project_display);
END;
CREATE TRIGGER sessions_fts_ad AFTER DELETE ON sessions BEGIN
  INSERT INTO sessions_fts(sessions_fts, rowid, project_display)
  VALUES('delete', old.id, old.project_display);
END;
CREATE TRIGGER sessions_fts_au AFTER UPDATE ON sessions BEGIN
  INSERT INTO sessions_fts(sessions_fts, rowid, project_display)
  VALUES('delete', old.id, old.project_display);
  INSERT INTO sessions_fts(rowid, project_display) VALUES (new.id, new.project_display);
END;

-- 标签索引表（用于按标签查询）
CREATE TABLE fact_tag_index (
  id INTEGER PRIMARY KEY,            -- 添加主键
  fact_id INTEGER NOT NULL,
  tag_type TEXT NOT NULL,
  tag_value TEXT NOT NULL,
  FOREIGN KEY(fact_id) REFERENCES facts(id) ON DELETE CASCADE,
  UNIQUE(fact_id, tag_type, tag_value)  -- 防止重复插入
);

CREATE INDEX idx_tag_lookup ON fact_tag_index(tag_type, tag_value);
```

#### 事实作用域（Fact Scope）

**问题**：事实应该隔离到项目，还是跨项目共享？

**洞察**：这取决于事实的类型：

| 事实类型 | 示例 | 应该共享？ |
|---------|------|-----------|
| 项目决策 | "这个项目用 TCP 通信" | ❌ 仅当前项目 |
| 用户偏好 | "用户偏好 pnpm" | ✅ 跨所有项目 |
| 工作习惯 | "用户喜欢先写测试" | ✅ 跨所有项目 |

**解决方案**：事实本身携带作用域（`scope` 字段）。

**AI 分析时的 prompt 指导**：
```
提取事实时，判断其作用域：
- project: 仅适用于当前项目的决策（如"用 PostgreSQL 作为数据库"）
- user: 用户的个人偏好和习惯（如"偏好函数式风格"）
```

**查询时**：
```sql
-- 注入上下文时：当前项目的事实 + 用户级别的事实
SELECT * FROM facts
WHERE valid_until IS NULL
  AND (
    (scope = 'project' AND scope_project_id = ?)
    OR scope = 'user'
  );
```

**优点**：
- 项目决策自然隔离
- 用户偏好自动共享
- 不需要用户手动配置
- Project ID 的精确性要求降低（只影响 project scope 的事实）

#### Facts 来源追溯

**结论**：不需要 `source_event_range_start/end`。

- `source_session_id` + `recorded_at` 足够定位到大致范围
- 如果需要精确追溯，可以通过时间戳在 events 中查询

#### 事实的时态管理

**结论**：使用时态数据库模型，而非传统"版本管理"。

**为什么不用版本管理？**
- 事实不是"同一实体的不同版本"
- "用 TCP" 和 "用 UDP" 是两个不同的事实，只是后者替代了前者

**查询示例**：
```sql
-- 当前有效的事实
SELECT * FROM facts WHERE valid_until IS NULL;

-- 某项目在某时刻的事实快照
SELECT * FROM facts
WHERE scope = 'project' AND scope_project_id = ?
  AND valid_from <= ?
  AND (valid_until IS NULL OR valid_until > ?);
```

**事实演进示例**：
```
T1: 用户决定用 TCP
    → 创建 fact#1: content="使用TCP", valid_from=T1, valid_until=NULL

T2: 用户改用 UDP
    → 创建 fact#2: content="改用UDP", valid_from=T2, valid_until=NULL
    → 更新 fact#1: valid_until=T2, superseded_by=2
```

#### 标签存储结构

**结论**：混合方案（JSON 内嵌 + 索引表）。

**优点**：
- 读取事实时直接获取完整标签（无需 JOIN）
- 按标签查询有索引支持
- 写入时同时写入两处（事务保证一致性）
- 删除事实时自动清理索引（ON DELETE CASCADE）

#### AI 分析触发时机

**问题**：何时触发 AI 分析？如何确定分析范围？

**结论**：Stop hook 时批量存储 + 触发分析。

**触发时机**：

| 触发点 | 说明 |
|--------|------|
| Stop hook | 用户执行 `/clear` 或关闭终端时 |
| 超时 | Session 空闲超过阈值（如 30 分钟）|
| 手动触发 | 用户显式请求分析 |

**Stop Hook 处理流程**（存储层，平台无关）：

```typescript
// 批量推送入口（Claude Code 等平台）
async function handleStop(platform: string, adapterInput: unknown) {
  const adapter = getAdapter(platform);
  const events = adapter.handlePlatformInput(adapterInput);

  // 批量存储并立即触发分析
  await processEvents(platform, events, { triggerAnalysis: true });
}
```

**Claude Code 适配器内部实现**（平台特定）：

```typescript
class ClaudeCodeAdapter implements PlatformAdapter {
  platform = 'claude-code';

  handlePlatformInput(input: {
    transcriptPath: string;
    sessionId: string;      // 平台原始 session ID
    cwd: string;            // 工作目录，用于解析项目
  }): NormalizedEvent[] {
    const { transcriptPath, sessionId, cwd } = input;

    // 1. 解析项目标识
    const project = resolveProject(cwd);

    // 2. 读取并解析 transcript
    const transcript = this.parseTranscript(transcriptPath);

    // 3. 提取事件
    const events: NormalizedEvent[] = [];

    for (const entry of transcript) {
      const baseEvent = {
        platform: this.platform,        // 添加 platform 字段
        platformSessionId: sessionId,
        projectId: project.id,
        projectDisplay: project.display,
        timestamp: entry.timestamp,
      };

      if (entry.type === 'user') {  // 注意：是 'user' 不是 'human'
        events.push({
          ...baseEvent,
          eventType: 'user_prompt',
          promptText: entry.message.content,
          rawData: entry,
        });
      } else if (entry.type === 'assistant') {
        // 分离 text 和 tool_use
        for (const content of entry.message.content) {
          if (content.type === 'text') {
            events.push({
              ...baseEvent,
              eventType: 'assistant_response',
              assistantText: content.text,
              rawData: { entry, content },
            });
          } else if (content.type === 'tool_use') {
            events.push({
              ...baseEvent,
              eventType: 'tool_call',
              toolName: content.name,
              toolInput: content.input,
              filePath: this.extractFilePath(content.name, content.input),
              rawData: { entry, content },
            });
          }
        }
      }
    }

    return events;
  }

  private extractFilePath(toolName: string, input: unknown): string | undefined {
    // 从 tool_input 提取文件路径（如 Read, Edit, Write 等工具）
    if (typeof input === 'object' && input !== null) {
      return (input as any).file_path || (input as any).path;
    }
    return undefined;
  }
}
```

**AI 分析流程**：

```typescript
async function triggerAnalysis(sessionId: number): Promise<void> {
  // 1. 获取待分析的事件
  const events = await getUnanalyzedEvents(sessionId);
  if (events.length === 0) return;

  // 2. 准备分析输入（包含相关历史事实）
  const input = await prepareAnalysisInput(sessionId, events);

  // 3. 调用 AI 提取事实
  const analysisResult = await extractFacts(input);

  // 4. 补充系统上下文（projectId, validFrom）
  const enrichedFacts = enrichFacts(analysisResult.newFacts, {
    projectId: input.projectId,
    timestamp: Date.now(),
  });

  // 5. 处理事实替代关系（返回 newFactContent -> oldFactId 的映射）
  const supersessionMap = await processFactSupersession(
    analysisResult.supersededFacts
  );

  // 6. 存储新事实（SQLite + 向量索引）
  await storeFacts(sessionId, enrichedFacts, supersessionMap);

  // 7. 标记事件已分析
  await markEventsAnalyzed(events);

  // 8. 更新 session 的 last_analyzed_at
  await updateSessionAnalyzedAt(sessionId);
}

/**
 * 更新 session 的最后分析时间
 */
async function updateSessionAnalyzedAt(sessionId: number): Promise<void> {
  const db = getDatabase();
  await db.run(
    'UPDATE sessions SET last_analyzed_at = ? WHERE id = ?',
    [Date.now(), sessionId]
  );
}

/**
 * AI 分析返回的事实结构
 *
 * 职责划分：
 * - AI 决定：content, scope, tags（语义层面的判断）
 * - 系统提供：scopeProjectId, validFrom, sessionId（运行时上下文）
 *
 * AI 只需判断事实是 'project' 还是 'user' 级别，
 * 具体的 projectId 由系统根据当前 session 的 project_id 填充。
 */
interface AnalysisResult {
  newFacts: AIExtractedFact[];         // AI 提取的事实（不含系统上下文）
  supersededFacts: SupersessionInfo[]; // 被替代的事实信息
}

/**
 * AI 返回的事实（仅包含 AI 判断的字段）
 */
interface AIExtractedFact {
  content: string;                     // 事实内容
  scope: 'project' | 'user';           // 作用域（AI 判断）
  tags?: Array<{ type: string; value: string }>;  // 可选标签（AI 判断）
}

/**
 * 存储前的完整事实（AI 返回 + 系统补充）
 */
interface ExtractedFact {
  content: string;                     // 事实内容（来自 AI）
  scope: 'project' | 'user';           // 作用域（来自 AI）
  scopeProjectId?: string;             // 项目 ID（系统补充，scope='project' 时）
  validFrom: number;                   // 生效时间（系统补充）
  tags?: Array<{ type: string; value: string }>;  // 可选标签（来自 AI）
}

/**
 * 将 AI 返回的事实补充系统上下文
 */
function enrichFacts(
  aiFacts: AIExtractedFact[],
  context: { projectId: string; timestamp: number }
): ExtractedFact[] {
  return aiFacts.map(fact => ({
    ...fact,
    scopeProjectId: fact.scope === 'project' ? context.projectId : undefined,
    validFrom: context.timestamp,
  }));
}

interface SupersessionInfo {
  oldFactId: number;                   // 被替代的事实 ID
  newFactContent: string;              // 新事实内容（用于关联）
  reason: string;                      // 替代原因（供审计）
}

/**
 * AI 分析的输入结构
 */
interface AnalysisInput {
  sessionId: number;                   // 当前 session ID
  projectId: string;                   // 项目 ID（用于作用域判断）
  newEvents: StoredEvent[];            // 待分析的事件
  relatedFacts: StoredFact[];          // 相关的历史事实（向量搜索结果）
}

// 从数据库读取的事件结构
interface StoredEvent {
  id: number;
  session_id: number;
  event_type: string;
  prompt_text?: string;
  tool_name?: string;
  tool_input?: string;                 // JSON 字符串
  assistant_text?: string;
  file_path?: string;
  timestamp: number;
}

// 从数据库读取的事实结构
interface StoredFact {
  id: number;
  content: string;
  scope: string;
  scope_project_id?: string;
  valid_from: number;
  valid_until?: number;
  tags_json?: string;
}

/**
 * 处理事实替代关系
 *
 * AI 分析时会识别出哪些历史事实被当前对话的新决策替代。
 * 例如："用户之前决定用 TCP，现在改用 UDP"
 *
 * @returns Map<newFactContent, oldFactId> - 用于在 storeFacts 时设置 superseded_by
 */
async function processFactSupersession(
  supersessions: SupersessionInfo[]
): Promise<Map<string, number>> {
  const db = getDatabase();
  const now = Date.now();

  // 构建 newFactContent -> oldFactId 的映射
  const supersessionMap = new Map<string, number>();

  for (const info of supersessions) {
    // 1. 标记旧事实失效（valid_until）
    await db.run(
      'UPDATE facts SET valid_until = ? WHERE id = ? AND valid_until IS NULL',
      [now, info.oldFactId]
    );

    // 2. 记录映射，供 storeFacts 使用
    supersessionMap.set(info.newFactContent, info.oldFactId);
  }

  return supersessionMap;
}

/**
 * 存储事实：SQLite + 向量索引
 *
 * 向量索引更新策略：**同步写入，异步重试**
 * - 正常情况：事务中同时写入 SQLite 和 Chroma
 * - Chroma 失败：SQLite 写入成功，标记待同步，后台重试
 *
 * @param sessionId - 来源 session ID（必需，用于设置 source_session_id）
 * @param facts - 要存储的事实列表
 * @param supersessionMap - newFactContent -> oldFactId 的映射（用于设置 superseded_by）
 */
async function storeFacts(
  sessionId: number,
  facts: ExtractedFact[],
  supersessionMap: Map<string, number> = new Map()
): Promise<void> {
  const db = getDatabase();
  const chroma = getChromaClient();
  const now = Date.now();

  for (const fact of facts) {
    await db.transaction(async () => {
      // 1. 检查是否替代了某个旧事实
      const oldFactId = supersessionMap.get(fact.content);

      // 2. 写入 SQLite
      const result = await db.run(
        `INSERT INTO facts (
          content, scope, scope_project_id,
          valid_from, valid_until, superseded_by,
          source_session_id, recorded_at, tags_json, pending_sync
        ) VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, ?, 0)`,
        [
          fact.content,
          fact.scope,
          fact.scopeProjectId ?? null,
          fact.validFrom,
          sessionId,           // source_session_id
          now,                 // recorded_at
          fact.tags ? JSON.stringify(fact.tags) : null,
        ]
      );
      const factId = result.lastInsertRowid;

      // 3. 如果替代了旧事实，更新旧事实的 superseded_by
      if (oldFactId) {
        await db.run(
          'UPDATE facts SET superseded_by = ? WHERE id = ?',
          [factId, oldFactId]
        );
      }

      // 4. 写入标签索引表
      if (fact.tags && fact.tags.length > 0) {
        for (const tag of fact.tags) {
          await db.run(
            'INSERT INTO fact_tag_index (fact_id, tag_type, tag_value) VALUES (?, ?, ?)',
            [factId, tag.type, tag.value]
          );
        }
      }

      // 5. 尝试写入 Chroma（可失败）
      try {
        await chroma.upsert({
          ids: [String(factId)],
          documents: [fact.content],
          metadatas: [{
            scope: fact.scope,
            scopeProjectId: fact.scopeProjectId ?? null,
            validFrom: fact.validFrom,
          }],
        });
      } catch (error) {
        // Chroma 失败不回滚 SQLite，标记待同步
        await markFactPendingSync(factId);
        logger.warn('STORAGE', 'Chroma write failed, marked for retry', { factId, error });
      }
    });
  }
}

/**
 * 后台任务：重试失败的向量同步
 */
async function syncPendingFactsToChroma(): Promise<void> {
  const pendingFacts = await getFactsPendingSync();

  for (const fact of pendingFacts) {
    try {
      await chroma.upsert({
        ids: [String(fact.id)],
        documents: [fact.content],
        metadatas: [{ scope: fact.scope, /* ... */ }],
      });
      await clearFactPendingSync(fact.id);
    } catch (error) {
      logger.warn('SYNC', 'Chroma retry failed', { factId: fact.id });
    }
  }
}

// ==========================================
// pending_sync 辅助函数
// ==========================================

/**
 * 标记事实待同步到 Chroma
 */
async function markFactPendingSync(factId: number): Promise<void> {
  const db = getDatabase();
  await db.run(
    'UPDATE facts SET pending_sync = 1 WHERE id = ?',
    [factId]
  );
}

/**
 * 清除事实的待同步标记
 */
async function clearFactPendingSync(factId: number): Promise<void> {
  const db = getDatabase();
  await db.run(
    'UPDATE facts SET pending_sync = 0 WHERE id = ?',
    [factId]
  );
}

/**
 * 获取所有待同步的事实
 */
async function getFactsPendingSync(): Promise<StoredFact[]> {
  const db = getDatabase();
  return db.all<StoredFact>(
    'SELECT * FROM facts WHERE pending_sync = 1'
  );
}

// ==========================================
// 事件分析辅助函数
// ==========================================

/**
 * 获取 session 中未分析的事件
 */
async function getUnanalyzedEvents(sessionId: number): Promise<StoredEvent[]> {
  const db = getDatabase();
  return db.all<StoredEvent>(
    `SELECT * FROM events
     WHERE session_id = ? AND analyzed_at IS NULL
     ORDER BY timestamp ASC`,
    [sessionId]
  );
}

/**
 * 标记事件已分析
 */
async function markEventsAnalyzed(events: StoredEvent[]): Promise<void> {
  if (events.length === 0) return;

  const db = getDatabase();
  const now = Date.now();
  const eventIds = events.map(e => e.id);
  const placeholders = eventIds.map(() => '?').join(',');

  await db.run(
    `UPDATE events SET analyzed_at = ? WHERE id IN (${placeholders})`,
    [now, ...eventIds]
  );
}

/**
 * 获取 session 信息
 */
async function getSession(sessionId: number): Promise<Session> {
  const db = getDatabase();
  const session = await db.get<Session>(
    'SELECT * FROM sessions WHERE id = ?',
    [sessionId]
  );

  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  return session;
}

// Session 类型定义
interface Session {
  id: number;
  platform: string;
  platform_session_id: string;
  project_id: string;
  project_display?: string;
  first_event_at: number;
  last_event_at: number;
  last_analyzed_at?: number;
}
```

**为什么不实时分析？**
- 成本高：每次工具调用都触发 AI 分析
- 上下文不完整：单条事件缺乏前后文
- 批量分析能看到完整的用户意图和操作序列

**增量分析**：
- 记录 `last_analyzed_at` 时间戳
- 下次分析只处理新增事件
- 相关历史通过向量搜索获取，不重复分析

#### 相关历史的界定

**结论**：向量搜索 + 阈值控制 + prompt 明确指导。

**"相关"的界定**：基于向量相似度，设置阈值过滤。

**确保不影响分析**：在 prompt 中明确指导 AI：
```
以下历史事实可能与当前对话相关，但需要你判断：
- 如果当前对话明确修改了某个历史事实，标记它为被替代
- 如果不确定是否相关，不要建立关联
- 宁可漏掉关联，也不要错误关联
```

**实现**：
```typescript
async function prepareAnalysisInput(sessionId: number, newEvents: StoredEvent[]): Promise<AnalysisInput> {
  // 1. 从 newEvents 提取文本内容
  const eventTexts = newEvents.map(e => extractTextFromEvent(e)).join('\n');

  // 2. 获取当前 session 的 projectId
  const session = await getSession(sessionId);
  const projectId = session.project_id;

  // 3. 向量搜索相关事实（设置相似度阈值）
  // 搜索范围：当前项目的事实 + 用户级别的事实
  const relatedFacts = await vectorSearchFacts(eventTexts, {
    projectId,
    threshold: 0.7,            // 相似度阈值
    limit: 10                  // 最多返回 10 条
  });

  return { sessionId, newEvents, relatedFacts, projectId };
}

/**
 * 从存储的事件中提取用于向量搜索的文本
 */
function extractTextFromEvent(event: StoredEvent): string {
  switch (event.event_type) {
    case 'user_prompt':
      return event.prompt_text || '';
    case 'tool_call':
      // 工具名 + 关键参数（如文件路径）
      const toolInfo = event.tool_name || 'unknown';
      const filePath = event.file_path ? ` on ${event.file_path}` : '';
      return `${toolInfo}${filePath}`;
    case 'assistant_response':
      return event.assistant_text || '';
    default:
      return '';
  }
}

/**
 * 向量搜索事实（封装 Chroma 查询）
 *
 * 注意：Chroma 不直接支持 NULL 过滤，需要在应用层处理 validOnly
 */
async function vectorSearchFacts(
  queryText: string,
  options: {
    projectId: string;
    threshold: number;
    limit: number;
  }
): Promise<StoredFact[]> {
  const chroma = getChromaClient();
  const db = getDatabase();

  // 1. 从 Chroma 查询相似事实（按作用域过滤，包含距离分数）
  const chromaResults = await chroma.query({
    queryTexts: [queryText],
    nResults: options.limit * 2,  // 多查一些，因为后面要过滤
    include: ['distances'],       // 请求返回距离分数
    where: {
      $or: [
        { scope: 'user' },
        { $and: [{ scope: 'project' }, { scopeProjectId: options.projectId }] }
      ]
    },
  });

  if (!chromaResults.ids[0] || chromaResults.ids[0].length === 0) {
    return [];
  }

  // 2. 根据相似度阈值过滤（Chroma 返回的是距离，越小越相似）
  // 将距离转换为相似度：similarity = 1 - distance（假设使用余弦距离）
  const filteredIds: string[] = [];
  const distances = chromaResults.distances?.[0] || [];

  for (let i = 0; i < chromaResults.ids[0].length; i++) {
    const distance = distances[i] ?? 1;
    const similarity = 1 - distance;
    if (similarity >= options.threshold) {
      filteredIds.push(chromaResults.ids[0][i]);
    }
  }

  if (filteredIds.length === 0) {
    return [];
  }

  // 3. 从 SQLite 获取完整事实数据，同时过滤失效的（valid_until IS NULL）
  const placeholders = filteredIds.map(() => '?').join(',');

  const facts = await db.all<StoredFact>(
    `SELECT * FROM facts
     WHERE id IN (${placeholders})
       AND valid_until IS NULL
     LIMIT ?`,
    [...filteredIds, options.limit]
  );

  return facts;
}
```

### 存储架构总览

```
┌─────────────────────────────────────────────────────────────┐
│                      数据流架构                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              平台特定数据源                          │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌───────────┐ │    │
│  │  │ Claude Code  │  │    Cursor    │  │  Future   │ │    │
│  │  │ (transcript) │  │   (hooks)    │  │ (unknown) │ │    │
│  │  └──────┬───────┘  └──────┬───────┘  └─────┬─────┘ │    │
│  └─────────┼─────────────────┼────────────────┼───────┘    │
│            │                 │                │             │
│            ▼                 ▼                ▼             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Platform Adapter Layer                 │    │
│  │      handlePlatformInput(input) → NormalizedEvent[] │    │
│  └──────────────────────┬──────────────────────────────┘    │
│                         │                                   │
│                         │ 统一事件流                         │
│                         ▼                                   │
│  ┌─────────────┐                                            │
│  │   Events    │  原始数据，永久保留                         │
│  │  (events)   │  - user_prompt                             │
│  └──────┬──────┘  - tool_call (不存 tool_response)          │
│         │         - assistant_response                      │
│         │                                                   │
│         │ AI 分析                                           │
│         ▼                                                   │
│  ┌─────────────┐                                            │
│  │   Facts     │  提取的事实，时态管理                       │
│  │  (facts)    │  - 自然语言描述                            │
│  └──────┬──────┘  - valid_from/valid_until                  │
│         │         - 可选标签                                │
│         │                                                   │
│         │ 向量化                                            │
│         ▼                                                   │
│  ┌─────────────┐                                            │
│  │ Embeddings  │  语义搜索                                  │
│  │  (Chroma)   │  - 支持相关历史查询                        │
│  └─────────────┘  - 支持上下文注入                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### 平台适配器的职责

**结论**：混合方案（统一结构 + 保留原始）。

**为什么不用纯原始存储？**
- 查询效率：`json_extract(raw_data, '$.tool_name')` 无法索引
- AI 分析稳定性：依赖 AI 理解不同平台 JSON 格式不够可靠
- 下游一致性：搜索、分析、展示都需要处理差异

**Events 表结构**：
```sql
CREATE TABLE events (
  id INTEGER PRIMARY KEY,
  session_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,

  -- 统一的结构化字段（适配器提取）
  prompt_text TEXT,                -- user_prompt 时有值
  tool_name TEXT,                  -- tool_call 时有值
  tool_input TEXT,                 -- tool_call 时有值（JSON）
  assistant_text TEXT,             -- assistant_response 时有值

  -- 提取的高频查询字段
  file_path TEXT,                  -- 从 tool_input 提取（如果有）

  -- 原始数据（完整保留）
  raw_data TEXT NOT NULL,

  -- 元数据
  platform TEXT NOT NULL,
  timestamp INTEGER NOT NULL,

  -- 分析状态
  analyzed_at INTEGER,             -- AI 分析时间（NULL = 未分析）

  -- 去重标识（可选，平台提供时使用）
  platform_event_id TEXT,          -- 平台特定的事件 ID

  FOREIGN KEY(session_id) REFERENCES sessions(id)
);

CREATE INDEX idx_events_session ON events(session_id, timestamp);
CREATE INDEX idx_events_tool ON events(tool_name);
CREATE INDEX idx_events_file ON events(file_path);
CREATE INDEX idx_events_unanalyzed ON events(session_id, analyzed_at) WHERE analyzed_at IS NULL;

-- 去重索引（当平台提供事件 ID 时使用）
CREATE UNIQUE INDEX idx_events_platform_id ON events(session_id, platform_event_id)
  WHERE platform_event_id IS NOT NULL;
```

**适配器接口**：
```typescript
interface PlatformAdapter {
  platform: string;

  /**
   * 处理平台特定输入，返回要存储的事件
   * 输入是什么、如何获取，由实现决定
   */
  handlePlatformInput(input: unknown): NormalizedEvent[];

  /**
   * 能力声明（可选，用于优雅降级）
   */
  capabilities?: {
    canCaptureUserPrompt: boolean;
    canCaptureToolCall: boolean;
    canCaptureAssistantResponse: boolean;
  };
}

interface NormalizedEvent {
  eventType: 'user_prompt' | 'tool_call' | 'assistant_response';

  // 统一字段（适配器负责提取和映射）
  promptText?: string;
  toolName?: string;
  toolInput?: unknown;
  assistantText?: string;
  filePath?: string;              // 从 toolInput 提取

  // 元数据
  platform: string;               // 平台标识（'claude-code' | 'cursor' | ...）
  platformSessionId: string;      // 平台原始 session ID
  projectId: string;              // 统一的项目 hash
  projectDisplay: string;         // 可读的项目名称
  timestamp: number;

  // 去重标识（可选，平台提供时使用）
  platformEventId?: string;       // 平台特定的事件 ID，用于去重

  // 原始数据（完整保留）
  rawData: unknown;
}
```

**平台适配器实现示例**：

**Claude Code 适配器**（从 transcript 提取）：
```typescript
class ClaudeCodeAdapter implements PlatformAdapter {
  platform = 'claude-code';

  capabilities = {
    canCaptureUserPrompt: true,
    canCaptureToolCall: true,
    canCaptureAssistantResponse: true,
  };

  // 注意：完整实现见"Claude Code 适配器内部实现"章节
  handlePlatformInput(input: {
    transcriptPath: string;
    sessionId: string;      // 平台原始 session ID
    cwd: string;            // 工作目录，用于解析项目
  }): NormalizedEvent[] {
    // 从 transcript 文件提取所有事件
    const project = resolveProject(input.cwd);
    const transcript = this.parseTranscript(input.transcriptPath);
    return this.extractEvents(transcript, input.sessionId, project);
  }

  private parseTranscript(path: string): TranscriptEntry[] { ... }
  private extractEvents(
    transcript: TranscriptEntry[],
    sessionId: string,
    project: ProjectIdentifier
  ): NormalizedEvent[] { ... }
}
```

**Cursor 适配器**（从单个 hook 获取）：
```typescript
class CursorAdapter implements PlatformAdapter {
  platform = 'cursor';

  capabilities = {
    canCaptureUserPrompt: true,
    canCaptureToolCall: true,
    canCaptureAssistantResponse: false,  // Cursor 不支持捕获助手回复
  };

  handlePlatformInput(input: {
    hookName: string;
    payload: unknown;
    sessionId: string;      // Cursor 会话 ID（由 hook 提供）
    cwd: string;            // 工作目录，用于解析项目
  }): NormalizedEvent[] {
    const { hookName, payload, sessionId, cwd } = input;

    // 解析项目标识
    const project = resolveProject(cwd);

    const baseEvent = {
      platform: this.platform,        // 添加 platform 字段
      platformSessionId: sessionId,
      projectId: project.id,
      projectDisplay: project.display,
      timestamp: Date.now(),  // Cursor hook 不提供时间戳，使用当前时间
    };

    // 根据 hook 类型处理
    switch (hookName) {
      case 'PostToolUse':
        return [this.normalizeToolCall(payload, baseEvent)];
      case 'UserPromptSubmit':
        return [this.normalizeUserPrompt(payload, baseEvent)];
      default:
        return [];
    }
  }

  private normalizeToolCall(payload: unknown, baseEvent: BaseEventFields): NormalizedEvent { ... }
  private normalizeUserPrompt(payload: unknown, baseEvent: BaseEventFields): NormalizedEvent { ... }
}

// 共享类型定义：事件的基础元数据字段
interface BaseEventFields {
  platformSessionId: string;
  projectId: string;
  projectDisplay: string;
  timestamp: number;
}
```

**假设的未来适配器**（从 WebSocket 获取）：
```typescript
class FuturePlatformAdapter implements PlatformAdapter {
  platform = 'future-platform';

  handlePlatformInput(input: { websocketMessages: Message[] }): NormalizedEvent[] {
    // 从 WebSocket 消息批量提取
    return input.websocketMessages.flatMap(msg => this.parseMessage(msg));
  }
}
```

**适配器职责**：
1. 决定从何处获取数据（transcript、hook、websocket、API 等）
2. 提取元数据（platformSessionId, projectId, projectDisplay, timestamp）
3. 映射到统一事件类型（user_prompt, tool_call, assistant_response）
4. 提取统一字段（promptText, toolName, toolInput, assistantText）
5. 提取高频查询字段（filePath）
6. 保留原始数据（rawData）

**设计优点**：
- **平台无关**：存储层不需要知道数据从哪里来
- **扩展性强**：新平台只需实现 `handlePlatformInput`
- **灵活性高**：每个适配器可以选择最适合的数据获取方式
- **查询效率**：`WHERE tool_name = 'Edit'` 可索引
- **数据完整性**：rawData 保留完整原始数据

### 隐私处理

**结论**：新架构保留 `<private>` 标签机制，在适配器层处理。

**处理时机**：平台适配器在 `handlePlatformInput()` 时处理隐私标签。

**处理逻辑**：
```typescript
interface PrivacyResult {
  content: string;           // 剥离 <private> 标签后的内容
  isFullyPrivate: boolean;   // 整个内容是否都是私有的
  hasPrivateContent: boolean; // 是否包含私有内容
}

function processPrivacy(text: string): PrivacyResult {
  // 1. 检查是否完全私有
  const trimmed = text.trim();
  if (trimmed.startsWith('<private>') && trimmed.endsWith('</private>')) {
    return { content: '', isFullyPrivate: true, hasPrivateContent: true };
  }

  // 2. 剥离 <private>...</private> 标签内容
  const stripped = text.replace(/<private>[\s\S]*?<\/private>/g, '[REDACTED]');
  const hasPrivate = stripped !== text;

  return { content: stripped, isFullyPrivate: false, hasPrivateContent: hasPrivate };
}
```

**Events 存储策略**：
- 完全私有的事件：不存储（返回 `null`）
- 部分私有的事件：存储剥离后的内容

**关于 `rawData` 的澄清**：

`rawData` 的定义是**"适配器接收到的原始数据的处理后版本"**，不是"未经任何处理的原始数据"。

| 场景 | `rawData` 内容 |
|------|---------------|
| 无隐私内容 | 完整的原始数据 |
| 部分私有 | 私有部分替换为 `[REDACTED]` |
| 完全私有 | 不存储（整个事件被跳过） |

**设计理由**：
- 隐私保护是硬性要求，`rawData` 不能泄露私有内容
- "原始数据"的价值在于保留平台格式，便于调试和追溯
- `[REDACTED]` 足以表明"此处有内容但被隐藏"

**如果需要真正的原始数据**：在调试模式下，可以单独记录到加密的本地日志，不进入常规存储流程。

**Facts 继承**：
- 从完全私有事件提取的 session 不会产生 facts
- AI 分析时只看到剥离后的内容

### 新架构完整表结构汇总

```sql
-- ==========================================
-- 新存储架构完整表结构
-- ==========================================

-- 1. Sessions 表：会话管理
CREATE TABLE sessions (
  id INTEGER PRIMARY KEY,
  platform TEXT NOT NULL,
  platform_session_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  project_display TEXT,
  first_event_at INTEGER NOT NULL,
  last_event_at INTEGER NOT NULL,
  last_analyzed_at INTEGER,

  UNIQUE(platform, platform_session_id)
);

CREATE INDEX idx_sessions_project ON sessions(project_id);

-- Sessions 全文搜索
CREATE VIRTUAL TABLE sessions_fts USING fts5(
  project_display,
  content='sessions',
  content_rowid='id'
);

-- 2. Events 表：原始事件流
CREATE TABLE events (
  id INTEGER PRIMARY KEY,
  session_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,       -- 'user_prompt' | 'tool_call' | 'assistant_response'

  -- 统一字段
  prompt_text TEXT,
  tool_name TEXT,
  tool_input TEXT,
  assistant_text TEXT,
  file_path TEXT,

  -- 原始数据
  raw_data TEXT NOT NULL,

  -- 元数据
  platform TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  analyzed_at INTEGER,

  -- 去重标识（可选，平台提供时使用）
  platform_event_id TEXT,

  FOREIGN KEY(session_id) REFERENCES sessions(id)
);

CREATE INDEX idx_events_session ON events(session_id, timestamp);
CREATE INDEX idx_events_tool ON events(tool_name);
CREATE INDEX idx_events_file ON events(file_path);
CREATE INDEX idx_events_unanalyzed ON events(session_id, analyzed_at) WHERE analyzed_at IS NULL;

-- 去重索引（当平台提供事件 ID 时使用）
CREATE UNIQUE INDEX idx_events_platform_id ON events(session_id, platform_event_id)
  WHERE platform_event_id IS NOT NULL;

-- Events 全文搜索
CREATE VIRTUAL TABLE events_fts USING fts5(
  prompt_text,
  assistant_text,
  content='events',
  content_rowid='id'
);

-- 3. Facts 表：提取的事实（时态管理）
CREATE TABLE facts (
  id INTEGER PRIMARY KEY,
  content TEXT NOT NULL,

  -- 作用域
  scope TEXT NOT NULL,            -- 'project' | 'user'
  scope_project_id TEXT,

  -- 时态字段
  valid_from INTEGER NOT NULL,
  valid_until INTEGER,
  superseded_by INTEGER,

  -- 来源
  source_session_id INTEGER NOT NULL,
  recorded_at INTEGER NOT NULL,

  -- 标签
  tags_json TEXT,

  -- 向量同步状态
  pending_sync INTEGER DEFAULT 0,    -- 0=已同步, 1=待同步到 Chroma

  FOREIGN KEY(source_session_id) REFERENCES sessions(id),
  FOREIGN KEY(superseded_by) REFERENCES facts(id)
);

CREATE INDEX idx_facts_scope ON facts(scope, scope_project_id);
CREATE INDEX idx_facts_valid ON facts(valid_until);
CREATE INDEX idx_facts_pending_sync ON facts(pending_sync) WHERE pending_sync = 1;

-- Facts 全文搜索虚拟表
CREATE VIRTUAL TABLE facts_fts USING fts5(
  content,
  content='facts',
  content_rowid='id'
);

-- Facts FTS 同步触发器
CREATE TRIGGER facts_ai AFTER INSERT ON facts BEGIN
  INSERT INTO facts_fts(rowid, content) VALUES (new.id, new.content);
END;
CREATE TRIGGER facts_ad AFTER DELETE ON facts BEGIN
  INSERT INTO facts_fts(facts_fts, rowid, content) VALUES('delete', old.id, old.content);
END;
CREATE TRIGGER facts_au AFTER UPDATE ON facts BEGIN
  INSERT INTO facts_fts(facts_fts, rowid, content) VALUES('delete', old.id, old.content);
  INSERT INTO facts_fts(rowid, content) VALUES (new.id, new.content);
END;

-- Events FTS 同步触发器
CREATE TRIGGER events_fts_ai AFTER INSERT ON events BEGIN
  INSERT INTO events_fts(rowid, prompt_text, assistant_text)
  VALUES (new.id, new.prompt_text, new.assistant_text);
END;
CREATE TRIGGER events_fts_ad AFTER DELETE ON events BEGIN
  INSERT INTO events_fts(events_fts, rowid, prompt_text, assistant_text)
  VALUES('delete', old.id, old.prompt_text, old.assistant_text);
END;
CREATE TRIGGER events_fts_au AFTER UPDATE ON events BEGIN
  INSERT INTO events_fts(events_fts, rowid, prompt_text, assistant_text)
  VALUES('delete', old.id, old.prompt_text, old.assistant_text);
  INSERT INTO events_fts(rowid, prompt_text, assistant_text)
  VALUES (new.id, new.prompt_text, new.assistant_text);
END;

-- Sessions FTS 同步触发器
CREATE TRIGGER sessions_fts_ai AFTER INSERT ON sessions BEGIN
  INSERT INTO sessions_fts(rowid, project_display) VALUES (new.id, new.project_display);
END;
CREATE TRIGGER sessions_fts_ad AFTER DELETE ON sessions BEGIN
  INSERT INTO sessions_fts(sessions_fts, rowid, project_display)
  VALUES('delete', old.id, old.project_display);
END;
CREATE TRIGGER sessions_fts_au AFTER UPDATE ON sessions BEGIN
  INSERT INTO sessions_fts(sessions_fts, rowid, project_display)
  VALUES('delete', old.id, old.project_display);
  INSERT INTO sessions_fts(rowid, project_display) VALUES (new.id, new.project_display);
END;

-- 4. Fact Tag Index 表：标签索引
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

### 待讨论的问题

（暂无）

---

## ⚠️ 旧架构（已废弃）

> **注意**：以下内容描述的是 claude-mem 当前的存储架构，将在新版本中被上述新架构完全替代。
> 新项目不考虑数据迁移，这是一个全新的分叉。

### 旧架构与新架构对照

| 旧架构 | 新架构 | 说明 |
|--------|--------|------|
| `prompts` 表 | `events` 表 (event_type='user_prompt') | 统一为事件流 |
| `observations` 表 | `events` 表 (event_type='tool_call') | 统一为事件流 |
| `session_summaries` 表 | `facts` 表 | 改为时态管理的事实 |
| 无 | `sessions` 表 | 新增统一会话管理 |
| 无 | `fact_tag_index` 表 | 新增标签索引 |

---

## 概述（旧架构）

Claude-mem 通过 Claude Code 的钩子系统捕获会话数据，主要存储两类信息：
1. **用户提示 (User Prompts)** - 用户输入的问题和指令
2. **工具观察 (Tool Observations)** - Claude 使用的工具及其输入/输出

---

## 存储的内容（旧架构）

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

## 数据库表结构（旧架构）

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

## 配置选项（旧架构）

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

## 调试（旧架构）

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

## 参考文件（旧架构）

- 钩子入口: `src/cli/handlers/observation.ts`
- 路由处理: `src/services/worker/http/routes/SessionRoutes.ts`
- 隐私处理: `src/utils/tag-stripping.ts`
- 设置管理: `src/shared/SettingsDefaultsManager.ts`
- 数据库迁移: `src/services/sqlite/migrations.ts`
