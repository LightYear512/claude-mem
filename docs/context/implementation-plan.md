# Claude-Mem 智能记忆分析系统 - 开发实施方案

**版本:** v2.0 (工业级)
**日期:** 2026-01-30
**作者:** Development Team
**状态:** 待实施

---

## 📋 目录

1. [项目概述](#项目概述)
2. [开发环境准备](#开发环境准备)
3. [数据库Schema](#数据库schema)
4. [AI提示词设计](#ai提示词设计)
5. [核心模块实现](#核心模块实现)
6. [API接口实现](#api接口实现)
7. [测试策略](#测试策略)
8. [实施计划](#实施计划)
9. [部署方案](#部署方案)
10. [运维手册](#运维手册)

---

## 项目概述

### 目标

基于现有 Claude-Mem 基础设施,扩展智能分析功能,实现:

1. **自动化洞察提取:** 技术坑点、文档错误、项目进度
2. **知识图谱构建:** 代码实体和关系
3. **多层摘要生成:** 会话 → 每日 → 项目
4. **工业级可靠性:** 99%+ 可用性,数据一致性保证
5. **成本可控:** 月均 $1.59-12.93 (vs 无优化 $162)

### 技术约束

- **兼容性:** 必须与现有 claude-mem 无缝集成
- **向后兼容:** 不破坏现有功能
- **数据迁移:** 平滑升级,无数据丢失
- **性能:** 不影响现有钩子系统性能

---

## 开发环境准备

### 前置要求

```bash
# 1. Node.js 18+
node --version  # >= v18.0.0

# 2. Bun (自动安装或手动)
curl -fsSL https://bun.sh/install | bash

# 3. Python 3.13 (用于 ChromaDB)
python3 --version  # >= 3.13

# 4. Git
git --version
```

### 克隆和安装

```bash
# 1. 克隆仓库
cd ~/.claude/plugins/marketplaces/thedotmack
git pull origin main

# 2. 安装依赖
npm install

# 3. 构建
npm run build

# 4. 运行测试
npm test
```

### 开发工具

```bash
# VS Code 扩展
- ESLint
- Prettier
- SQLite Viewer
- REST Client (测试 API)
- GitLens

# 推荐终端
- iTerm2 (Mac)
- Windows Terminal (Windows)
- Alacritty (Linux)
```

---

## 数据库Schema

### 数据库迁移系统

```typescript
// src/services/sqlite/migrations/016_analysis_tables.ts

export const migration_016 = {
  version: 16,
  name: 'Add analysis tables',
  up: (db: Database) => {
    // 执行所有建表语句
    db.exec(CREATE_ANALYSIS_TABLES_SQL);
  },
  down: (db: Database) => {
    // 回滚逻辑
    db.exec(DROP_ANALYSIS_TABLES_SQL);
  }
};
```

### 表结构定义

#### 1. categorized_insights

```sql
CREATE TABLE IF NOT EXISTS categorized_insights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- 分类
  category TEXT NOT NULL CHECK(category IN (
    'common_pitfall',      -- 常见技术坑
    'documentation_error', -- 文档错误
    'api_misuse',          -- API误用
    'project_milestone',   -- 项目里程碑
    'feature_progress',    -- 功能进度
    'development_plan',    -- 开发计划
    'best_practice',       -- 最佳实践
    'lesson_learned',      -- 经验教训
    'workaround'           -- 解决方案
  )),

  -- 内容
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  context TEXT,                    -- 原始对话上下文
  solution TEXT,                   -- 解决方案

  -- 元数据
  confidence REAL NOT NULL DEFAULT 0.8 CHECK(confidence >= 0 AND confidence <= 1),
  severity TEXT CHECK(severity IN ('low', 'medium', 'high')) DEFAULT 'medium',
  frequency INTEGER DEFAULT 1,    -- 出现次数

  -- 关联
  tags TEXT,                       -- JSON: ["react", "performance"]
  related_files TEXT,              -- JSON: ["src/main.ts"]
  related_sessions TEXT,           -- JSON: ["session-1", "session-2"]
  related_observations TEXT,       -- JSON: [123, 456]

  -- 时间
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),

  -- 项目
  project TEXT NOT NULL,

  -- 用户交互
  user_acknowledged BOOLEAN DEFAULT FALSE,
  user_rating INTEGER CHECK(user_rating >= 1 AND user_rating <= 5),

  -- 向量同步标记
  vector_synced BOOLEAN DEFAULT FALSE
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_insights_category
  ON categorized_insights(category);
CREATE INDEX IF NOT EXISTS idx_insights_project
  ON categorized_insights(project);
CREATE INDEX IF NOT EXISTS idx_insights_severity
  ON categorized_insights(severity);
CREATE INDEX IF NOT EXISTS idx_insights_last_seen
  ON categorized_insights(last_seen);
CREATE INDEX IF NOT EXISTS idx_insights_frequency
  ON categorized_insights(frequency DESC);

-- 复合索引 (查询优化)
CREATE INDEX IF NOT EXISTS idx_insights_category_project_severity
  ON categorized_insights(category, project, severity);

-- 全文搜索
CREATE VIRTUAL TABLE IF NOT EXISTS insights_fts USING fts5(
  title,
  description,
  context,
  solution,
  content=categorized_insights,
  content_rowid=id
);

-- 触发器: 同步 FTS
CREATE TRIGGER IF NOT EXISTS insights_fts_insert
AFTER INSERT ON categorized_insights BEGIN
  INSERT INTO insights_fts(rowid, title, description, context, solution)
  VALUES (new.id, new.title, new.description, new.context, new.solution);
END;

CREATE TRIGGER IF NOT EXISTS insights_fts_update
AFTER UPDATE ON categorized_insights BEGIN
  UPDATE insights_fts
  SET title = new.title,
      description = new.description,
      context = new.context,
      solution = new.solution
  WHERE rowid = new.id;
END;

CREATE TRIGGER IF NOT EXISTS insights_fts_delete
AFTER DELETE ON categorized_insights BEGIN
  DELETE FROM insights_fts WHERE rowid = old.id;
END;
```

#### 2. conversation_threads

```sql
CREATE TABLE IF NOT EXISTS conversation_threads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  thread_id TEXT UNIQUE NOT NULL,
  session_id TEXT NOT NULL,

  topic TEXT NOT NULL,
  intent TEXT CHECK(intent IN (
    'problem_solving',
    'feature_development',
    'debugging',
    'learning',
    'refactoring',
    'documentation'
  )),

  -- 消息存储 (JSON)
  user_messages TEXT NOT NULL,
  assistant_responses TEXT NOT NULL,
  tool_executions TEXT NOT NULL,

  outcome TEXT CHECK(outcome IN ('resolved', 'pending', 'failed', 'abandoned')),
  resolution_summary TEXT,

  start_time INTEGER NOT NULL,
  end_time INTEGER,
  duration_seconds INTEGER,

  project TEXT NOT NULL,
  token_count INTEGER DEFAULT 0,

  created_at INTEGER DEFAULT (unixepoch()),

  FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_threads_session
  ON conversation_threads(session_id);
CREATE INDEX IF NOT EXISTS idx_threads_project
  ON conversation_threads(project);
CREATE INDEX IF NOT EXISTS idx_threads_intent
  ON conversation_threads(intent);
CREATE INDEX IF NOT EXISTS idx_threads_outcome
  ON conversation_threads(outcome);
CREATE INDEX IF NOT EXISTS idx_threads_start_time
  ON conversation_threads(start_time DESC);
```

#### 3. project_progress

```sql
CREATE TABLE IF NOT EXISTS project_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  project TEXT NOT NULL,
  feature_name TEXT NOT NULL,
  feature_description TEXT,

  status TEXT CHECK(status IN (
    'planned',
    'in_progress',
    'testing',
    'completed',
    'blocked',
    'cancelled'
  )) DEFAULT 'planned',

  progress_percentage INTEGER DEFAULT 0
    CHECK(progress_percentage >= 0 AND progress_percentage <= 100),

  planned_at INTEGER,
  started_at INTEGER,
  completed_at INTEGER,

  related_sessions TEXT,
  related_files TEXT,
  blockers TEXT,

  notes TEXT,

  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),

  UNIQUE(project, feature_name)
);

CREATE INDEX IF NOT EXISTS idx_progress_project
  ON project_progress(project);
CREATE INDEX IF NOT EXISTS idx_progress_status
  ON project_progress(status);
CREATE INDEX IF NOT EXISTS idx_progress_percentage
  ON project_progress(progress_percentage DESC);
```

#### 4. knowledge_entities

```sql
CREATE TABLE IF NOT EXISTS knowledge_entities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  type TEXT NOT NULL CHECK(type IN (
    'file', 'function', 'class', 'api', 'concept', 'library'
  )),
  name TEXT NOT NULL,
  full_path TEXT,

  description TEXT,
  project TEXT NOT NULL,

  mention_count INTEGER DEFAULT 1,
  first_mentioned INTEGER NOT NULL,
  last_mentioned INTEGER NOT NULL,

  vector_synced BOOLEAN DEFAULT FALSE,

  created_at INTEGER DEFAULT (unixepoch()),

  UNIQUE(project, type, name, full_path)
);

CREATE INDEX IF NOT EXISTS idx_entities_project
  ON knowledge_entities(project);
CREATE INDEX IF NOT EXISTS idx_entities_type
  ON knowledge_entities(type);
CREATE INDEX IF NOT EXISTS idx_entities_mention_count
  ON knowledge_entities(mention_count DESC);
CREATE INDEX IF NOT EXISTS idx_entities_name
  ON knowledge_entities(name);
```

#### 5. knowledge_relationships

```sql
CREATE TABLE IF NOT EXISTS knowledge_relationships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  source_id INTEGER NOT NULL,
  target_id INTEGER NOT NULL,
  relationship_type TEXT NOT NULL CHECK(relationship_type IN (
    'depends_on',
    'implements',
    'calls',
    'imports',
    'related_to',
    'causes',
    'fixes'
  )),

  strength REAL DEFAULT 1.0 CHECK(strength >= 0 AND strength <= 1),
  evidence TEXT,

  created_at INTEGER DEFAULT (unixepoch()),

  FOREIGN KEY (source_id) REFERENCES knowledge_entities(id) ON DELETE CASCADE,
  FOREIGN KEY (target_id) REFERENCES knowledge_entities(id) ON DELETE CASCADE,

  UNIQUE(source_id, target_id, relationship_type)
);

CREATE INDEX IF NOT EXISTS idx_relationships_source
  ON knowledge_relationships(source_id);
CREATE INDEX IF NOT EXISTS idx_relationships_target
  ON knowledge_relationships(target_id);
CREATE INDEX IF NOT EXISTS idx_relationships_type
  ON knowledge_relationships(relationship_type);
CREATE INDEX IF NOT EXISTS idx_relationships_strength
  ON knowledge_relationships(strength DESC);
```

#### 6. daily_summaries

```sql
CREATE TABLE IF NOT EXISTS daily_summaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  date TEXT NOT NULL,
  project TEXT NOT NULL,

  overview TEXT NOT NULL,
  key_achievements TEXT,
  challenges_faced TEXT,
  lessons_learned TEXT,
  next_steps TEXT,

  sessions_count INTEGER DEFAULT 0,
  observations_count INTEGER DEFAULT 0,
  insights_count INTEGER DEFAULT 0,

  generated_at INTEGER NOT NULL,
  token_cost INTEGER DEFAULT 0,

  UNIQUE(date, project)
);

CREATE INDEX IF NOT EXISTS idx_daily_summaries_date
  ON daily_summaries(date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_summaries_project
  ON daily_summaries(project);
```

#### 7. analysis_tasks

```sql
CREATE TABLE IF NOT EXISTS analysis_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  task_id TEXT UNIQUE NOT NULL,
  idempotency_key TEXT UNIQUE,

  task_type TEXT NOT NULL CHECK(task_type IN (
    'observation_analysis',
    'conversation_analysis',
    'category_analysis',
    'knowledge_extraction',
    'daily_summary',
    'project_summary'
  )),

  session_id TEXT,
  observation_ids TEXT,

  status TEXT CHECK(status IN (
    'pending', 'running', 'completed', 'failed'
  )) DEFAULT 'pending',

  priority INTEGER DEFAULT 500,

  estimated_cost_usd REAL,
  actual_cost_usd REAL,

  created_at INTEGER DEFAULT (unixepoch()),
  started_at INTEGER,
  completed_at INTEGER,
  duration_ms INTEGER,

  result_summary TEXT,
  error_message TEXT,

  retry_count INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_tasks_status
  ON analysis_tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_created
  ON analysis_tasks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_priority
  ON analysis_tasks(priority DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_idempotency
  ON analysis_tasks(idempotency_key);
```

#### 8. analysis_costs

```sql
CREATE TABLE IF NOT EXISTS analysis_costs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  date TEXT NOT NULL,
  amount_usd REAL NOT NULL,
  task_type TEXT NOT NULL,
  task_count INTEGER DEFAULT 1,
  tokens_used INTEGER DEFAULT 0,

  created_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_costs_date
  ON analysis_costs(date DESC);
CREATE INDEX IF NOT EXISTS idx_costs_type
  ON analysis_costs(task_type);
```

#### 9. dead_letter_queue

```sql
CREATE TABLE IF NOT EXISTS dead_letter_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  task_id TEXT NOT NULL,
  observation_ids TEXT NOT NULL,
  error_message TEXT NOT NULL,
  error_stack TEXT,

  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,

  first_failed_at INTEGER NOT NULL,
  last_retry_at INTEGER,

  status TEXT CHECK(status IN ('pending', 'retrying', 'abandoned'))
    DEFAULT 'pending',

  created_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_dlq_status
  ON dead_letter_queue(status);
CREATE INDEX IF NOT EXISTS idx_dlq_task
  ON dead_letter_queue(task_id);
```

---

## AI提示词设计

### 1. 批量观察分析提示词

```typescript
// src/services/analysis/prompts/batch-analysis-prompt.ts

export const BATCH_ANALYSIS_PROMPT = `
你是一个专业的软件开发分析助手。分析以下开发过程中的观察记录,识别重要的模式和洞察。

## 项目上下文
项目名称: {{project}}
当前日期: {{date}}
分析批次: {{batch_number}}

## 待分析观察 ({{count}} 个)

{{observations}}

## 分析任务

对每个观察,执行以下分析:

### 1. 分类识别
判断观察属于哪些类别(可多选):

- **common_pitfall:** 频繁遇到的技术坑点
  - 重复出现的错误模式
  - 配置问题导致的失败
  - 环境不一致问题
  - 依赖冲突

- **documentation_error:** 文档错误或过时信息
  - 文档中的命令无法执行
  - API 参数与实际不符
  - 示例代码有误
  - 版本过时

- **api_misuse:** API/库的错误使用
  - 方法调用错误
  - 参数类型错误
  - 缺少必需配置
  - 异步处理错误

- **project_milestone:** 项目里程碑
  - 功能开发完成
  - 重要 bug 修复
  - 架构决策
  - 版本发布

- **feature_progress:** 功能开发进度
  - 实现某个功能的步骤
  - 功能部分完成
  - 遇到阻碍

- **development_plan:** 开发计划和待办事项
  - 用户明确提到的计划
  - 需要实现的功能列表
  - 技术债务

- **best_practice:** 最佳实践和优秀实现
  - 良好的代码结构
  - 高效的解决方案
  - 可维护的设计

- **lesson_learned:** 经验教训
  - 从错误中学到的经验
  - 避免问题的方法
  - 改进建议

- **workaround:** 临时解决方案
  - 绕过某个问题的方法
  - 待优化的临时代码

### 2. 核心信息提取

对识别出的每个分类,提取:

- **标题:** 简短描述(< 60 字符)
  - 清晰概括问题/进度/发现
  - 使用主动语态
  - 避免技术术语堆砌

- **描述:** 详细说明(100-300 字符)
  - 问题的具体表现
  - 上下文信息
  - 影响范围

- **严重程度:** low / medium / high
  - high: 阻碍开发,需立即处理
  - medium: 影响效率,建议处理
  - low: 可以延后处理

- **置信度:** 0.0 - 1.0
  - 1.0: 完全确定
  - 0.7-0.9: 较为确定
  - 0.5-0.7: 有一定不确定性
  - < 0.5: 不确定,可能误判

- **相关文件:** 提取文件路径
  - 完整路径: src/main.ts
  - 相对路径转绝对路径

- **标签:** 技术栈标签
  - 编程语言: typescript, python
  - 框架: react, express
  - 领域: frontend, backend, database

- **解决方案:** (如果是问题)
  - 具体的修复步骤
  - 代码示例(如果适用)
  - 避免该问题的建议

### 3. 知识提取

识别代码实体:
- **文件:** src/auth/jwt.ts
- **函数:** generateToken, verifyToken
- **类:** AuthService, UserController
- **API:** /api/auth/login
- **概念:** JWT authentication, token refresh
- **库:** jsonwebtoken, express

识别关系:
- A depends_on B: A 依赖 B
- A implements B: A 实现 B 的接口
- A calls B: A 调用 B 的方法
- A imports B: A 导入 B 模块

## 输出格式

返回 JSON 数组,每个观察对应一个元素:

\`\`\`json
[
  {
    "observation_id": 123,
    "categories": ["documentation_error", "common_pitfall"],
    "insights": [
      {
        "category": "documentation_error",
        "title": "npm 文档中 --legacy-peer-deps 参数已废弃",
        "description": "按照官方文档执行 npm install --legacy-peer-deps 时报错'unknown option',该参数在 npm 9+ 已移除,应使用 --force 替代。文档未更新导致用户困惑。",
        "confidence": 0.92,
        "severity": "medium",
        "solution": "将命令改为 npm install --force,或降级到 npm 8.x。建议向 npm 官方反馈文档更新。",
        "related_files": [],
        "tags": ["npm", "dependencies", "documentation"]
      }
    ],
    "entities": [
      {"type": "library", "name": "npm", "description": "Node.js 包管理器"},
      {"type": "concept", "name": "peer dependencies", "description": "对等依赖管理"}
    ],
    "relationships": []
  }
]
\`\`\`

## 重要规则

1. **准确性优先:** 不确定时降低置信度,不要猜测
2. **避免重复:** 相似的问题合并为一个洞察
3. **实用性:** 关注对开发者有实际价值的信息
4. **简洁性:** 标题清晰,描述简洁,避免冗余
5. **可操作性:** 尽可能提供具体的解决方案
6. **上下文:** 考虑项目历史和之前的观察

开始分析:
`;
```

### 2. 对话线程分析提示词

```typescript
// src/services/analysis/prompts/conversation-prompt.ts

export const CONVERSATION_ANALYSIS_PROMPT = `
你是一个对话分析专家。分析以下开发会话,重构对话线程并识别主题、意图和结果。

## 会话信息
会话ID: {{session_id}}
项目: {{project}}
开始时间: {{start_time}}
结束时间: {{end_time}}
持续时间: {{duration}}

## 对话记录

{{conversation_history}}

## 分析任务

### 1. 对话线程划分

将对话划分为多个连贯的线程,标准:
- 每个线程围绕一个明确的主题
- 线程内对话连贯,有因果关系
- 线程间相对独立

### 2. 主题和意图识别

对每个线程:

**主题:** 简短描述(< 50 字符)
- 例: "实现 JWT 认证功能"
- 例: "修复登录失败 bug"

**意图:**
- **problem_solving:** 解决具体技术问题
- **feature_development:** 开发新功能
- **debugging:** 调试错误
- **learning:** 学习新知识/技术
- **refactoring:** 重构代码
- **documentation:** 编写文档

### 3. 结果评估

**outcome:**
- **resolved:** 问题已解决/任务已完成
  - 有明确的成功标志
  - 用户表示满意

- **pending:** 仍在进行中
  - 对话未完成
  - 等待外部依赖

- **failed:** 尝试失败
  - 多次尝试无效
  - 遇到无法解决的阻碍

- **abandoned:** 放弃或转向
  - 用户决定换方案
  - 转向其他任务

**resolution_summary:** (如果 resolved)
- 简短描述最终如何解决
- 关键决策点
- 使用的方案

### 4. 提取关键信息

- **user_messages:** 用户的主要问题和请求
- **assistant_responses:** AI 的主要建议和指导
- **tool_executions:** 执行的关键操作
- **key_decisions:** 做出的重要决策
- **next_steps:** 下一步计划

## 输出格式

\`\`\`json
{
  "threads": [
    {
      "thread_id": "thread_1_auth_implementation",
      "topic": "实现 JWT 认证功能",
      "intent": "feature_development",
      "start_time": 1234567890,
      "end_time": 1234569000,
      "duration_seconds": 1110,
      "user_messages": [
        "我需要添加用户登录功能",
        "JWT token 应该存储在哪里?",
        "如何实现 token 刷新?"
      ],
      "assistant_responses": [
        "好的,我们来实现 JWT 认证...",
        "建议存储在 httpOnly cookie 中,更安全",
        "可以使用 refresh token 机制..."
      ],
      "tool_executions": [
        {"tool": "Write", "file": "src/auth/jwt.ts", "summary": "创建 JWT 工具函数"},
        {"tool": "Edit", "file": "src/middleware/auth.ts", "summary": "添加认证中间件"}
      ],
      "outcome": "resolved",
      "resolution_summary": "成功实现了完整的 JWT 认证系统,包括 token 生成、验证和刷新。使用 httpOnly cookie 存储,有效期 24 小时。",
      "key_decisions": [
        "使用 httpOnly cookie 而非 localStorage 存储 token",
        "token 有效期设为 24 小时",
        "实现 refresh token 机制"
      ]
    }
  ],
  "session_summary": {
    "main_goal": "实现完整的用户认证系统",
    "overall_outcome": "resolved",
    "achievements": [
      "✅ 实现 JWT 认证(生成、验证、刷新)",
      "✅ 添加认证中间件保护路由",
      "✅ 配置 httpOnly cookie"
    ],
    "challenges": [
      "🔴 token 刷新时机难以确定",
      "🟡 跨域请求的 cookie 配置"
    ],
    "next_steps": [
      "⏭️ 添加密码重置功能",
      "⏭️ 实现多设备管理",
      "⏭️ 编写单元测试"
    ]
  }
}
\`\`\`

开始分析:
`;
```

### 3. 知识提取提示词

```typescript
// src/services/analysis/prompts/knowledge-extraction-prompt.ts

export const KNOWLEDGE_EXTRACTION_PROMPT = `
你是一个知识图谱构建专家。从开发观察中提取代码实体和关系,构建项目知识图谱。

## 项目信息
项目: {{project}}
分析批次: {{batch_number}}

## 观察记录

{{observations}}

## 提取任务

### 1. 实体识别

识别以下类型的实体:

**file (文件):**
- 完整路径: src/auth/jwt.ts
- 描述文件用途

**function (函数/方法):**
- 格式: 文件:函数名
- 例: src/auth/jwt.ts:generateToken
- 描述功能

**class (类):**
- 格式: 文件:类名
- 例: src/services/AuthService.ts:AuthService
- 描述职责

**api (API端点):**
- 格式: HTTP方法 路径
- 例: POST /api/auth/login
- 描述功能

**concept (技术概念):**
- 例: JWT authentication, token refresh
- 描述含义

**library (第三方库):**
- 例: jsonwebtoken, express
- 描述用途

### 2. 关系识别

识别实体间的关系:

**depends_on (依赖):**
- A 的功能依赖 B
- 例: AuthService depends_on jwt.ts

**implements (实现):**
- A 实现 B 的接口/规范
- 例: JWTAuth implements AuthInterface

**calls (调用):**
- A 调用 B 的方法
- 例: loginController calls AuthService.login

**imports (导入):**
- A 导入 B 模块
- 例: auth.ts imports jsonwebtoken

**related_to (相关):**
- A 和 B 在功能上相关
- 例: login related_to authentication

**causes (导致):**
- A 导致 B (问题)
- 例: missing_env_var causes auth_failure

**fixes (修复):**
- A 修复 B (问题)
- 例: added_validation fixes auth_bypass

### 3. 关系强度评估

评估关系强度(0.0 - 1.0):

- **1.0:** 强依赖,核心功能
  - 例: AuthService 依赖 jwt.ts 生成 token

- **0.7:** 中等依赖,常用功能
  - 例: UserController 调用 AuthService 验证权限

- **0.3:** 弱依赖,偶尔使用
  - 例: LogService 记录认证事件

### 4. 提供证据

对每个关系,说明识别依据:
- 代码片段
- 工具输出
- 用户对话

## 输出格式

\`\`\`json
{
  "entities": [
    {
      "type": "file",
      "name": "src/auth/jwt.ts",
      "description": "JWT token 生成和验证工具函数"
    },
    {
      "type": "function",
      "name": "generateToken",
      "full_path": "src/auth/jwt.ts:generateToken",
      "description": "生成 JWT access token,有效期 24 小时"
    },
    {
      "type": "library",
      "name": "jsonwebtoken",
      "description": "JWT 签名和验证库"
    },
    {
      "type": "concept",
      "name": "JWT authentication",
      "description": "基于 JSON Web Token 的无状态认证机制"
    }
  ],
  "relationships": [
    {
      "source": "src/auth/jwt.ts:generateToken",
      "target": "jsonwebtoken",
      "type": "imports",
      "strength": 1.0,
      "evidence": "generateToken 函数使用 jsonwebtoken.sign() 生成 token"
    },
    {
      "source": "src/middleware/auth.ts",
      "target": "src/auth/jwt.ts",
      "type": "depends_on",
      "strength": 0.9,
      "evidence": "认证中间件调用 jwt.ts 中的 verifyToken 验证请求"
    },
    {
      "source": "src/controllers/AuthController.ts:login",
      "target": "src/auth/jwt.ts:generateToken",
      "type": "calls",
      "strength": 1.0,
      "evidence": "登录成功后调用 generateToken 生成 token 返回客户端"
    }
  ]
}
\`\`\`

开始提取:
`;
```

### 4. 每日摘要提示词

```typescript
// src/services/analysis/prompts/daily-summary-prompt.ts

export const DAILY_SUMMARY_PROMPT = `
你是一个项目进度总结专家。基于今天的所有开发活动,生成项目每日摘要。

## 项目信息
项目: {{project}}
日期: {{date}}

## 今日活动统计
- 会话数: {{session_count}}
- 观察数: {{observation_count}}
- 识别洞察: {{insight_count}}

## 今日会话摘要

{{session_summaries}}

## 今日识别的洞察

{{insights}}

## 摘要任务

生成一份简洁的每日摘要,包括:

### 1. 总览 (Overview)
2-3 句话概括今天的主要工作和整体进展。

### 2. 主要成就 (Key Achievements)
列出 3-5 项今天完成的重要内容:
- ✅ 使用勾选标记
- 简短描述 (1 行)
- 优先级: 功能完成 > bug修复 > 改进

### 3. 遇到的挑战 (Challenges Faced)
列出 2-4 项今天遇到的困难:
- 🔴 严重阻碍 (阻止开发)
- 🟡 中等问题 (影响效率)
- 🟢 轻微问题 (已解决)

### 4. 经验教训 (Lessons Learned)
列出 2-3 项今天学到的重要经验:
- 💡 使用灯泡图标
- 简短总结
- 可应用到其他场景

### 5. 明天的计划 (Next Steps)
列出 3-5 项明天应优先处理的任务:
- ⏭️ 使用前进图标
- 具体可执行
- 按优先级排序

## 输出格式

\`\`\`json
{
  "overview": "今天主要工作是实现用户认证系统,完成了 JWT 认证逻辑、中间件保护和单元测试。遇到 token 刷新的复杂性问题,但找到了优雅的解决方案。整体进展顺利,认证模块已基本完成。",
  "key_achievements": [
    "✅ 实现 JWT 认证(生成、验证、刷新)",
    "✅ 添加认证中间件保护敏感路由",
    "✅ 实现 token 自动刷新机制",
    "✅ 编写认证相关单元测试(覆盖率 85%)",
    "✅ 配置 CORS 和 httpOnly cookie"
  ],
  "challenges_faced": [
    "🔴 token 刷新时机难以确定,最初方案导致频繁刷新影响性能",
    "🟡 httpOnly cookie 在开发环境跨域问题,需配置 CORS",
    "🟡 测试 JWT 过期逻辑需要 mock 时间,花费较长时间"
  ],
  "lessons_learned": [
    "💡 httpOnly cookie 比 localStorage 更安全,应作为 token 存储的默认选择",
    "💡 JWT 刷新应使用独立的 refresh token 而非主 token",
    "💡 测试时间相关逻辑时使用 jest.useFakeTimers() 可以有效 mock 时间"
  ],
  "next_steps": [
    "⏭️ 实现密码重置功能(邮件验证码)",
    "⏭️ 添加登录失败次数限制(防暴力破解)",
    "⏭️ 实现多设备登录管理功能",
    "⏭️ 优化 token 存储策略(考虑安全性和用户体验)",
    "⏭️ 编写认证功能的集成测试"
  ]
}
\`\`\`

开始生成摘要:
`;
```

---

## 核心模块实现

### 目录结构

```
src/services/analysis/
├── index.ts                          # 主入口
├── IndustrialAnalysisService.ts      # 工业级服务
├── AIAnalyzer.ts                     # AI 分析器
├── BatchProcessor.ts                 # 批处理器
├── PriorityScheduler.ts              # 优先级调度
├── BudgetController.ts               # 成本控制
├── RateLimiter.ts                    # 限流器
├── TransactionManager.ts             # 事务管理
├── IdempotencyManager.ts             # 幂等性管理
├── DeadLetterQueue.ts                # 死信队列
├── CircuitBreaker.ts                 # 熔断器
├── SemanticCache.ts                  # 语义缓存
├── SecurityScanner.ts                # 安全扫描
├── MetricsCollector.ts               # 指标收集
├── BackupManager.ts                  # 备份管理
├── prompts/
│   ├── batch-analysis-prompt.ts
│   ├── conversation-prompt.ts
│   ├── knowledge-extraction-prompt.ts
│   └── daily-summary-prompt.ts
├── analyzers/
│   ├── ConversationAnalyzer.ts
│   ├── CategoryAnalyzer.ts
│   ├── KnowledgeExtractor.ts
│   └── Summarizer.ts
└── types.ts
```

### 实现优先级

#### Phase 1: 核心基础 (Week 1-2)

**Week 1: 数据库和基础架构**

```typescript
// 1. 数据库迁移
// src/services/sqlite/migrations/016_analysis_tables.ts

export const migration_016 = {
  version: 16,
  name: 'Add analysis tables',
  up: (db: Database) => {
    // 创建所有表
    db.exec(CREATE_ALL_TABLES_SQL);
  },
  down: (db: Database) => {
    // 回滚
    db.exec(DROP_ALL_TABLES_SQL);
  }
};
```

```typescript
// 2. DAO 层实现
// src/services/sqlite/InsightsDAO.ts

export class InsightsDAO {
  constructor(private db: Database) {}

  async create(insight: InsightInput): Promise<Insight> {
    const result = await this.db.run(`
      INSERT INTO categorized_insights (
        category, title, description, confidence, severity,
        tags, related_files, related_sessions, related_observations,
        first_seen, last_seen, project
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      insight.category,
      insight.title,
      insight.description,
      insight.confidence,
      insight.severity,
      JSON.stringify(insight.tags),
      JSON.stringify(insight.related_files),
      JSON.stringify(insight.related_sessions),
      JSON.stringify(insight.related_observations),
      insight.first_seen,
      insight.last_seen,
      insight.project
    ]);

    return this.findById(result.lastInsertRowid);
  }

  async findById(id: number): Promise<Insight | null> {
    return await this.db.get(
      'SELECT * FROM categorized_insights WHERE id = ?',
      [id]
    );
  }

  async search(filters: InsightFilters): Promise<Insight[]> {
    // 构建动态查询
    let query = 'SELECT * FROM categorized_insights WHERE 1=1';
    const params: any[] = [];

    if (filters.category) {
      query += ' AND category = ?';
      params.push(filters.category);
    }

    if (filters.project) {
      query += ' AND project = ?';
      params.push(filters.project);
    }

    // ... 更多过滤条件

    query += ' ORDER BY last_seen DESC LIMIT ? OFFSET ?';
    params.push(filters.limit || 20, filters.offset || 0);

    return await this.db.all(query, params);
  }

  async updateFrequency(id: number): Promise<void> {
    await this.db.run(`
      UPDATE categorized_insights
      SET frequency = frequency + 1,
          last_seen = ?,
          updated_at = ?
      WHERE id = ?
    `, [Date.now(), Date.now(), id]);
  }
}
```

**Week 2: 成本控制和调度**

```typescript
// 3. 成本控制器
// src/services/analysis/BudgetController.ts

export class BudgetController {
  constructor(
    private db: Database,
    private config: BudgetConfig
  ) {}

  async canAffordAnalysis(estimatedCost: number): Promise<boolean> {
    const todaySpent = await this.getTodaySpending();
    const monthSpent = await this.getMonthSpending();

    // 检查每日预算
    if (todaySpent + estimatedCost > this.config.dailyBudgetUsd) {
      logger.warn('BUDGET', 'Daily budget exceeded', {
        spent: todaySpent,
        budget: this.config.dailyBudgetUsd,
        requested: estimatedCost
      });
      return false;
    }

    // 检查月度预算
    if (monthSpent + estimatedCost > this.config.monthlyBudgetUsd) {
      logger.warn('BUDGET', 'Monthly budget exceeded', {
        spent: monthSpent,
        budget: this.config.monthlyBudgetUsd,
        requested: estimatedCost
      });
      return false;
    }

    // 告警阈值
    const monthlyUsage = monthSpent / this.config.monthlyBudgetUsd;
    if (monthlyUsage > this.config.alertThreshold) {
      await this.sendBudgetAlert(monthlyUsage);
    }

    return true;
  }

  async recordCost(actualCost: number, taskType: string): Promise<void> {
    const today = new Date().toISOString().split('T')[0];

    await this.db.run(`
      INSERT INTO analysis_costs (date, amount_usd, task_type, task_count)
      VALUES (?, ?, ?, 1)
      ON CONFLICT(date, task_type) DO UPDATE SET
        amount_usd = amount_usd + excluded.amount_usd,
        task_count = task_count + 1
    `, [today, actualCost, taskType]);
  }

  private async getTodaySpending(): Promise<number> {
    const today = new Date().toISOString().split('T')[0];
    const result = await this.db.get(
      'SELECT COALESCE(SUM(amount_usd), 0) as total FROM analysis_costs WHERE date = ?',
      [today]
    );
    return result?.total || 0;
  }

  private async getMonthSpending(): Promise<number> {
    const thisMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    const result = await this.db.get(
      'SELECT COALESCE(SUM(amount_usd), 0) as total FROM analysis_costs WHERE date LIKE ?',
      [thisMonth + '%']
    );
    return result?.total || 0;
  }
}
```

```typescript
// 4. 优先级调度器
// src/services/analysis/PriorityScheduler.ts

export class PriorityScheduler {
  private queue: AnalysisTask[] = [];

  calculatePriority(task: AnalysisTask): number {
    let score = 0;

    // 用户请求
    if (task.userRequested) score += 1000;

    // 包含错误
    if (this.containsError(task)) score += 500;

    // 输出长度
    score += Math.min(task.totalOutputLength / 100, 100);

    // 时效性
    const ageHours = (Date.now() - task.createdAt) / 3600000;
    score += Math.max(0, 100 - ageHours);

    // 成本惩罚
    score -= task.estimatedCost * 100;

    return score;
  }

  async scheduleNext(): Promise<AnalysisTask | null> {
    // 排序
    this.queue.sort((a, b) =>
      this.calculatePriority(b) - this.calculatePriority(a)
    );

    // 查找可负担的任务
    for (const task of this.queue) {
      if (await this.budgetController.canAffordAnalysis(task.estimatedCost)) {
        // 移除并返回
        this.queue.splice(this.queue.indexOf(task), 1);
        return task;
      }
    }

    return null; // 预算耗尽
  }

  async enqueue(task: AnalysisTask): Promise<void> {
    // 检查队列大小
    if (this.queue.length >= 1000) {
      logger.warn('SCHEDULER', 'Queue full, dropping oldest task');
      this.queue.shift();
    }

    this.queue.push(task);
  }
}
```

继续完成其他 Phase...

---

## API接口实现

### HTTP 路由

```typescript
// src/services/worker/http/routes/InsightsRoutes.ts

export class InsightsRoutes {
  constructor(
    private insightsDAO: InsightsDAO,
    private analysisService: IndustrialAnalysisService
  ) {}

  register(app: Express): void {
    // GET /api/insights
    app.get('/api/insights', async (req, res) => {
      try {
        const filters = this.parseFilters(req.query);
        const insights = await this.insightsDAO.search(filters);
        const total = await this.insightsDAO.count(filters);

        res.json({
          success: true,
          data: insights,
          meta: {
            total,
            page: filters.offset / filters.limit + 1,
            pageSize: filters.limit
          }
        });
      } catch (error) {
        this.handleError(res, error);
      }
    });

    // GET /api/insights/:id
    app.get('/api/insights/:id', async (req, res) => {
      try {
        const id = parseInt(req.params.id);
        const insight = await this.insightsDAO.findById(id);

        if (!insight) {
          return res.status(404).json({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Insight not found' }
          });
        }

        // 获取关联数据
        const relatedObservations = await this.getRelatedObservations(insight);
        const relatedSessions = await this.getRelatedSessions(insight);

        res.json({
          success: true,
          data: {
            insight,
            related_observations: relatedObservations,
            related_sessions: relatedSessions
          }
        });
      } catch (error) {
        this.handleError(res, error);
      }
    });

    // POST /api/insights/:id/acknowledge
    app.post('/api/insights/:id/acknowledge', async (req, res) => {
      try {
        const id = parseInt(req.params.id);
        const { rating, feedback } = req.body;

        await this.insightsDAO.acknowledge(id, rating, feedback);

        res.json({ success: true });
      } catch (error) {
        this.handleError(res, error);
      }
    });

    // POST /api/analysis/trigger
    app.post('/api/analysis/trigger', async (req, res) => {
      try {
        const { sessionId, analysisTypes, priority } = req.body;

        const taskId = await this.analysisService.triggerAnalysis({
          sessionId,
          analysisTypes,
          priority: priority || 'normal'
        });

        res.json({
          success: true,
          data: { taskId }
        });
      } catch (error) {
        this.handleError(res, error);
      }
    });
  }

  private parseFilters(query: any): InsightFilters {
    return {
      category: query.category,
      project: query.project,
      severity: query.severity,
      dateStart: query.dateStart,
      dateEnd: query.dateEnd,
      tags: query.tags ? query.tags.split(',') : undefined,
      limit: parseInt(query.limit) || 20,
      offset: parseInt(query.offset) || 0,
      sortBy: query.sortBy || 'last_seen',
      sortOrder: query.sortOrder || 'desc'
    };
  }

  private handleError(res: any, error: any): void {
    logger.error('API', 'Request failed', {}, error);

    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message
      }
    });
  }
}
```

---

## 测试策略

### 单元测试

```typescript
// tests/analysis/BudgetController.test.ts

describe('BudgetController', () => {
  let db: Database;
  let controller: BudgetController;

  beforeEach(() => {
    db = new Database(':memory:');
    // 创建表
    db.exec(CREATE_ANALYSIS_COSTS_TABLE);

    controller = new BudgetController(db, {
      dailyBudgetUsd: 1.0,
      monthlyBudgetUsd: 20.0,
      alertThreshold: 0.8,
      hardLimit: true
    });
  });

  afterEach(() => {
    db.close();
  });

  test('should allow analysis when under budget', async () => {
    const canAfford = await controller.canAffordAnalysis(0.5);
    expect(canAfford).toBe(true);
  });

  test('should reject analysis when daily budget exceeded', async () => {
    // 记录今日花费
    await controller.recordCost(0.8, 'test');

    const canAfford = await controller.canAffordAnalysis(0.3);
    expect(canAfford).toBe(false);
  });

  test('should calculate today spending correctly', async () => {
    await controller.recordCost(0.2, 'test1');
    await controller.recordCost(0.3, 'test2');

    const spending = await controller.getTodaySpending();
    expect(spending).toBe(0.5);
  });
});
```

### 集成测试

```typescript
// tests/integration/analysis-flow.test.ts

describe('Analysis Flow Integration', () => {
  let service: IndustrialAnalysisService;

  beforeAll(async () => {
    // 初始化服务
    service = new IndustrialAnalysisService(testConfig);
    await service.initialize();
  });

  afterAll(async () => {
    await service.shutdown();
  });

  test('should analyze observations end-to-end', async () => {
    // 1. 创建测试观察
    const observations = createTestObservations(5);

    // 2. 触发分析
    const result = await service.analyzeObservations(observations);

    // 3. 验证结果
    expect(result.insights.length).toBeGreaterThan(0);
    expect(result.cost).toBeGreaterThan(0);

    // 4. 验证数据库
    const storedInsights = await db.all(
      'SELECT * FROM categorized_insights'
    );
    expect(storedInsights.length).toBeGreaterThan(0);

    // 5. 验证成本记录
    const costs = await db.get(
      'SELECT SUM(amount_usd) as total FROM analysis_costs'
    );
    expect(costs.total).toBeCloseTo(result.cost, 2);
  });
});
```

---

## 实施计划

### Phase 1: 基础设施 (2周)

- [ ] Week 1: 数据库 Schema 和 DAO
- [ ] Week 2: 成本控制和调度器

### Phase 2: AI 分析引擎 (3周)

- [ ] Week 3: 提示词和 AIAnalyzer
- [ ] Week 4: 分类和对话分析器
- [ ] Week 5: 知识提取和摘要生成

### Phase 3: API 和 UI (2周)

- [ ] Week 6: HTTP API 实现
- [ ] Week 7: Web Viewer UI 扩展

### Phase 4: 工业级改进 (3周)

- [ ] Week 8: 事务管理和幂等性
- [ ] Week 9: 错误恢复和监控
- [ ] Week 10: 安全和性能优化

### Phase 5: 测试和发布 (2周)

- [ ] Week 11: 完整测试和 Bug 修复
- [ ] Week 12: 文档和发布

**总工期:** 12 周

---

## 部署方案

### 升级流程

```bash
# 1. 备份数据库
cp ~/.claude-mem/claude-mem.db ~/.claude-mem/backup/claude-mem-$(date +%Y%m%d).db

# 2. 拉取最新代码
cd ~/.claude/plugins/marketplaces/thedotmack
git pull origin main

# 3. 安装依赖
npm install

# 4. 构建
npm run build

# 5. 同步到安装位置
npm run sync-marketplace

# 6. 重启 Worker
npm run worker:restart

# 7. 验证
npm run worker:status
curl http://localhost:37777/api/health
```

### 回滚流程

```bash
# 1. 停止 Worker
npm run worker:stop

# 2. 恢复备份
cp ~/.claude-mem/backup/claude-mem-YYYYMMDD.db ~/.claude-mem/claude-mem.db

# 3. 切换到旧版本
git checkout v1.x.x

# 4. 重新构建
npm run build
npm run sync-marketplace

# 5. 启动 Worker
npm run worker:start
```

---

## 运维手册

### 日常监控

```bash
# 检查 Worker 状态
npm run worker:status

# 查看日志
npm run worker:logs

# 检查成本
curl http://localhost:37777/api/costs/month | jq

# 检查队列
curl http://localhost:37777/api/analysis/queue | jq
```

### 常见问题

#### 问题 1: 分析任务堆积

```bash
# 检查队列深度
curl http://localhost:37777/api/analysis/queue

# 如果队列 > 100:
# 1. 检查 Worker 是否运行
npm run worker:status

# 2. 检查预算是否耗尽
curl http://localhost:37777/api/costs/today

# 3. 手动处理队列
npm run queue:process
```

#### 问题 2: 成本超预算

```bash
# 查看成本明细
curl http://localhost:37777/api/costs/month

# 调整预算配置
nano ~/.claude-mem/settings.json
# 修改 analysis.costControl.monthlyBudgetUsd

# 重启 Worker
npm run worker:restart
```

---

**文档版本:** v2.0
**最后更新:** 2026-01-30
