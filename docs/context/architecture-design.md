# Claude-Mem 智能记忆分析系统 - 架构设计

**版本:** v2.0 (工业级)
**日期:** 2026-01-30
**作者:** Architecture Team
**状态:** 设计阶段

---

## 📋 目录

1. [概述](#概述)
2. [整体架构](#整体架构)
3. [核心组件设计](#核心组件设计)
4. [数据模型](#数据模型)
5. [AI分析引擎](#ai分析引擎)
6. [成本优化架构](#成本优化架构)
7. [可靠性保障](#可靠性保障)
8. [安全架构](#安全架构)
9. [监控和可观测性](#监控和可观测性)
10. [性能优化](#性能优化)
11. [API设计](#api设计)

---

## 概述

### 系统定位

Claude-Mem 智能记忆分析系统是一个**全 AI 驱动、工业级可靠**的开发辅助系统，通过自动分析开发过程中的观察数据，提供：

- **智能洞察:** 技术坑点、文档错误、API 误用识别
- **项目追踪:** 功能进度、里程碑、开发计划提取
- **知识沉淀:** 构建项目知识图谱，支持语义检索
- **经验积累:** 最佳实践、问题解决方案自动归档

### 设计原则

| 原则 | 描述 | 体现 |
|------|------|------|
| **增量智能** | 仅分析新增数据，避免重复计算 | 增量分析引擎 |
| **成本优先** | 严格控制 AI 成本在可接受范围 | 批处理 + 缓存 + 预算控制 |
| **工业可靠** | 99%+ 可用性，数据一致性保证 | 事务管理 + 错误恢复 |
| **安全合规** | 敏感信息保护，符合隐私法规 | 自动脱敏 + 加密存储 |
| **可观测** | 全链路追踪，快速故障定位 | 结构化日志 + 指标 + 追踪 |

### 技术栈

- **运行时:** Bun (Worker 管理) + Node.js 18+ (钩子执行)
- **数据库:** SQLite3 + FTS5 (关系型 + 全文搜索)
- **向量数据库:** ChromaDB (语义搜索)
- **AI 引擎:** Claude Agent SDK (Haiku 模型)
- **HTTP 服务:** Express.js (端口 37777)
- **前端:** React + TypeScript

---

## 整体架构

### 架构分层

```
┌─────────────────────────────────────────────────────────────────┐
│                      用户交互层 (Presentation)                    │
├─────────────────────────────────────────────────────────────────┤
│  Claude Code IDE  │  Web Viewer UI  │  RESTful API  │  CLI     │
└──────────────────┬──────────────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────────────┐
│                     数据采集层 (Collection)                       │
├─────────────────────────────────────────────────────────────────┤
│  Hook System: SessionStart │ UserPromptSubmit │ PostToolUse     │
│               Stop │ SessionEnd                                  │
│  → 捕获原始观察数据 → 安全扫描 → 批量缓冲                        │
└──────────────────┬──────────────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────────────┐
│                    智能分析层 (Analysis) ✨                      │
├─────────────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  1. 数据预处理管道 (Preprocessing Pipeline)              │  │
│  │  ├─ 安全扫描 (SecurityScanner)                           │  │
│  │  │  • 敏感信息检测 (API密钥/Token/密码)                 │  │
│  │  │  • 自动脱敏和标记                                    │  │
│  │  │  • PII 检测 (邮箱/手机/身份证)                       │  │
│  │  ├─ 数据清洗 (DataCleaner)                              │  │
│  │  │  • 去重 (基于语义哈希)                              │  │
│  │  │  • 过滤低价值观察 (cd/ls/pwd)                       │  │
│  │  │  • 格式标准化                                        │  │
│  │  └─ 批量缓冲 (BatchBuffer)                              │  │
│  │     • 积累 10 个观察或等待 60 秒                        │  │
│  │     • 有界队列 (最多 1000 个任务)                       │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  2. 智能调度器 (Smart Scheduler)                         │  │
│  │  ├─ 优先级队列 (PriorityQueue)                           │  │
│  │  │  • 用户请求: 1000 分                                  │  │
│  │  │  • 错误观察: 500 分                                   │  │
│  │  │  • 长输出: 100 分                                     │  │
│  │  ├─ 成本控制器 (BudgetController)                        │  │
│  │  │  • 每日预算: $1                                      │  │
│  │  │  • 月度预算: $20                                     │  │
│  │  │  • 实时成本追踪                                       │  │
│  │  ├─ 限流器 (RateLimiter)                                 │  │
│  │  │  • 全局: 10 次/分钟                                  │  │
│  │  │  • 项目: 50 次/小时                                  │  │
│  │  └─ 并发控制 (ConcurrencyController)                     │  │
│  │     • 最多 3 个并发 AI 调用                             │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  3. AI 分析引擎 (AI Analysis Engine)                     │  │
│  │  ┌─────────────────────────────────────────────────────┐ │  │
│  │  │  3.1 批量观察分析器 (Batch Analyzer)                │ │  │
│  │  │  • 输入: 1-10 个观察                                │ │  │
│  │  │  • 输出: 分类洞察 + 置信度                         │ │  │
│  │  │  • 模型: Claude Haiku                               │ │  │
│  │  └─────────────────────────────────────────────────────┘ │  │
│  │  ┌─────────────────────────────────────────────────────┐ │  │
│  │  │  3.2 对话线程分析器 (Conversation Analyzer)         │ │  │
│  │  │  • 重构完整对话                                     │ │  │
│  │  │  • 主题识别 (问题解决/功能开发/调试)               │ │  │
│  │  │  • 结果评估 (resolved/pending/failed)              │ │  │
│  │  └─────────────────────────────────────────────────────┘ │  │
│  │  ┌─────────────────────────────────────────────────────┐ │  │
│  │  │  3.3 知识提取器 (Knowledge Extractor)               │ │  │
│  │  │  • 实体识别 (文件/函数/类/API/概念)                │ │  │
│  │  │  • 关系提取 (依赖/调用/影响)                       │ │  │
│  │  │  • 知识图谱构建                                     │ │  │
│  │  └─────────────────────────────────────────────────────┘ │  │
│  │  ┌─────────────────────────────────────────────────────┐ │  │
│  │  │  3.4 多层摘要生成器 (Summarizer)                    │ │  │
│  │  │  • 会话摘要 (已有)                                  │ │  │
│  │  │  • 每日摘要 (新)                                    │ │  │
│  │  │  • 项目摘要 (新)                                    │ │  │
│  │  └─────────────────────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  4. 可靠性保障层 (Reliability)                           │  │
│  │  ├─ 事务管理器 (TransactionManager)                      │  │
│  │  │  • 悲观锁 (FOR UPDATE)                               │  │
│  │  │  • ACID 事务保证                                     │  │
│  │  ├─ 幂等性管理器 (IdempotencyManager)                    │  │
│  │  │  • 基于内容哈希的幂等键                              │  │
│  │  │  • 去重缓存                                          │  │
│  │  ├─ 死信队列 (DeadLetterQueue)                           │  │
│  │  │  • 失败任务重试 (3次)                               │  │
│  │  │  • 管理员手动恢复                                    │  │
│  │  └─ 熔断器 (CircuitBreaker)                              │  │
│  │     • 连续失败 5 次自动熔断                             │  │
│  │     • 1 分钟后尝试恢复                                  │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  5. 缓存层 (Cache)                                       │  │
│  │  ├─ 语义缓存 (SemanticCache)                             │  │
│  │  │  • LRU 策略 (1000 条)                                │  │
│  │  │  • 语义哈希 (移除变量部分)                           │  │
│  │  │  • 预期命中率: 30-50%                                │  │
│  │  └─ 结果缓存 (ResultCache)                               │  │
│  │     • 7 天 TTL                                           │  │
│  │     • 自动失效                                           │  │
│  └───────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     存储层 (Persistence)                         │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐ │
│  │  SQLite3 + FTS5  │  │    ChromaDB      │  │  Backup Store │ │
│  │  - 结构化数据     │  │  - 向量索引      │  │  - S3/本地    │ │
│  │  - 全文搜索       │  │  - 语义搜索      │  │  - 增量备份   │ │
│  │  - 8 个新增表     │  │                  │  │  - 每日快照   │ │
│  └──────────────────┘  └──────────────────┘  └───────────────┘ │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                  监控和运维层 (Operations)                       │
├─────────────────────────────────────────────────────────────────┤
│  • 结构化日志 (Winston/Pino)                                    │
│  • 指标收集 (Prometheus 格式)                                   │
│  • 分布式追踪 (OpenTelemetry)                                   │
│  • 健康检查 (HTTP /health)                                      │
│  • 告警系统 (Email/Webhook)                                     │
│  • 备份管理 (自动 + 手动)                                       │
└─────────────────────────────────────────────────────────────────┘
```

### 数据流

```
用户操作 → Hook 捕获 → 安全扫描 → 批量缓冲 → 调度器
                                               ↓
                                         优先级评分
                                               ↓
                                         预算检查
                                               ↓
                                         限流检查
                                               ↓
                                         缓存查询 ────┐
                                               ↓      │ 命中
                                         AI 分析     │
                                               ↓      │
                                         结果加密    │
                                               ↓      │
                                         事务写入 ←──┘
                                               ↓
                                         SSE 推送
                                               ↓
                                         用户界面
```

---

## 核心组件设计

### 1. 数据预处理管道

#### SecurityScanner - 安全扫描器

**职责:** 检测并脱敏敏感信息

```typescript
interface SecurityScanner {
  /**
   * 扫描并脱敏观察数据
   */
  scanAndRedact(observation: Observation): Promise<Observation>;

  /**
   * 检测敏感模式
   */
  detectSensitivePatterns(text: string): SensitiveMatch[];

  /**
   * 脱敏 PII 数据
   */
  redactPII(text: string): string;

  /**
   * 记录安全事件
   */
  logSecurityIncident(type: string, details: any): Promise<void>;
}

// 敏感模式库
const SENSITIVE_PATTERNS = [
  // API 密钥
  { pattern: /sk-[a-zA-Z0-9]{48}/g, type: 'api_key', severity: 'critical' },
  { pattern: /api[_-]?key[_-]?[:=]\s*['"]?([a-zA-Z0-9-_]{32,})['"]?/gi, type: 'api_key', severity: 'critical' },

  // AWS 凭证
  { pattern: /AKIA[0-9A-Z]{16}/g, type: 'aws_key', severity: 'critical' },

  // JWT Token
  { pattern: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g, type: 'jwt', severity: 'high' },

  // 数据库连接串
  { pattern: /mongodb:\/\/[^:]+:[^@]+@/g, type: 'db_credentials', severity: 'critical' },
  { pattern: /postgres:\/\/[^:]+:[^@]+@/g, type: 'db_credentials', severity: 'critical' },

  // 私钥
  { pattern: /-----BEGIN (RSA |EC |DSA )?PRIVATE KEY-----/g, type: 'private_key', severity: 'critical' },

  // 邮箱
  { pattern: /[\w.-]+@[\w.-]+\.\w+/g, type: 'email', severity: 'medium' },

  // 手机号 (中国)
  { pattern: /\b1[3-9]\d{9}\b/g, type: 'phone', severity: 'medium' },

  // IP 地址
  { pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, type: 'ip_address', severity: 'low' }
];
```

#### DataCleaner - 数据清洗器

**职责:** 去重、过滤、标准化

```typescript
interface DataCleaner {
  /**
   * 去重检查
   */
  isDuplicate(observation: Observation): Promise<boolean>;

  /**
   * 判断是否应该分析
   */
  shouldAnalyze(observation: Observation): boolean;

  /**
   * 标准化数据格式
   */
  normalize(observation: Observation): Observation;
}

// 过滤规则
const SKIP_RULES = {
  // 跳过简单命令
  skipTools: ['cd', 'ls', 'pwd', 'echo', 'clear'],

  // 跳过短输出
  minOutputLength: 50,

  // 跳过纯成功消息
  skipSuccessOnly: true,
  successPatterns: [
    /^(ok|success|done|completed)$/i,
    /^File saved$/i,
    /^Command executed successfully$/i
  ]
};
```

#### BatchBuffer - 批量缓冲器

**职责:** 积累观察后批量处理

```typescript
interface BatchBuffer {
  /**
   * 添加观察到缓冲区
   */
  add(observation: Observation): Promise<void>;

  /**
   * 判断是否应该刷新
   */
  shouldFlush(): boolean;

  /**
   * 刷新缓冲区
   */
  flush(): Promise<Observation[]>;
}

// 刷新策略
const FLUSH_POLICY = {
  // 批量大小
  batchSize: 10,

  // 超时时间 (毫秒)
  timeout: 60000,

  // 用户请求立即刷新
  immediateOnUserRequest: true
};
```

---

### 2. 智能调度器

#### PriorityScheduler - 优先级调度器

**职责:** 根据价值和成本智能调度任务

```typescript
interface PriorityScheduler {
  /**
   * 计算任务优先级
   */
  calculatePriority(task: AnalysisTask): number;

  /**
   * 调度下一个任务
   */
  scheduleNext(): Promise<AnalysisTask | null>;

  /**
   * 重新调度失败任务
   */
  reschedule(taskId: string, observations: Observation[]): Promise<void>;
}

// 优先级算法
function calculatePriority(task: AnalysisTask): number {
  let score = 0;

  // 1. 用户明确请求 (+1000)
  if (task.userRequested) score += 1000;

  // 2. 包含错误 (+500)
  if (containsError(task)) score += 500;

  // 3. 输出长度 (最多 +100)
  score += Math.min(task.outputLength / 100, 100);

  // 4. 时效性 (最多 +100)
  const ageHours = (Date.now() - task.createdAt) / 3600000;
  score += Math.max(0, 100 - ageHours);

  // 5. 成本惩罚 (-100 per $1)
  score -= task.estimatedCost * 100;

  return score;
}
```

#### BudgetController - 成本控制器

**职责:** 管理 AI 分析预算

**实现状态:** ✅ 已完成 (详见 `docs/context/budget-module-implementation.md`)

```typescript
class BudgetController {
  // 两阶段提交核心方法
  reserve(estimatedCost: number, provider: string, sessionDbId?: number): ReserveResult;
  commit(txId: string, adjustmentMicros?: number, actualCostUsd?: number, metadata?: object): boolean;
  rollback(txId: string, reason?: string): boolean;

  // 成本计算（使用配置的 preset）
  calculateCost(inputTokens: number, outputTokens: number, cacheCreation?: number, cacheRead?: number): number;
  estimateCost(estimatedInputTokens: number, outputRatio?: number): number;
  isTrackingEnabled(): boolean;

  // 配置和统计
  getConfig(): BudgetConfig;
  getCurrentPreset(): PricingPreset;
  getStatistics(): BudgetStatistics;
}

// 预算配置 (settings.json)
const BUDGET_CONFIG = {
  CLAUDE_MEM_BUDGET_ENABLED: true,
  CLAUDE_MEM_BUDGET_BILLING_TYPE: 'paid',       // 'free' | 'paid'
  CLAUDE_MEM_BUDGET_PRESET: 'claude-haiku',
  CLAUDE_MEM_BUDGET_DAILY_LIMIT_USD: 1.0,
  CLAUDE_MEM_BUDGET_MONTHLY_LIMIT_USD: 20.0,
  CLAUDE_MEM_BUDGET_ALERT_THRESHOLD: 0.8        // 80% 时告警
};
```

**关键设计:**
- **两阶段提交:** reserve → API call → commit/rollback
- **乐观锁 + 重试:** 并发安全，最多 3 次重试
- **集中化成本计算:** 所有 Agent 使用 BudgetController 的方法
- **Free Tier 支持:** `billingType === 'free'` 时完全跳过成本跟踪

#### RateLimiter - 限流器

**职责:** 防止过载和滥用

```typescript
interface RateLimiter {
  /**
   * 检查是否可以继续
   */
  canProceed(project: string, estimatedCost: number): Promise<boolean>;

  /**
   * 消耗配额
   */
  consume(tokens: number): Promise<void>;

  /**
   * 重置限流计数
   */
  reset(): Promise<void>;
}

// 限流配置
const RATE_LIMITS = {
  global: {
    tokensPerInterval: 10,
    interval: 60000  // 每分钟 10 次
  },
  perProject: {
    tokensPerInterval: 50,
    interval: 3600000  // 每小时 50 次
  }
};
```

---

### 3. 可靠性保障层

#### TransactionManager - 事务管理器

**职责:** 保证数据一致性

```typescript
interface TransactionManager {
  /**
   * 在事务中执行操作
   */
  executeInTransaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T>;

  /**
   * 悲观锁
   */
  lockRecords(ids: number[], tx: Transaction): Promise<any[]>;

  /**
   * 快照隔离
   */
  createSnapshot(sessionId: string): Promise<Snapshot>;
}

// 事务隔离级别
const TRANSACTION_CONFIG = {
  isolationLevel: 'SERIALIZABLE',
  timeout: 30000,  // 30 秒超时
  retryOnDeadlock: true,
  maxRetries: 3
};
```

#### IdempotencyManager - 幂等性管理器

**职责:** 防止重复处理

```typescript
interface IdempotencyManager {
  /**
   * 计算幂等键
   */
  computeKey(observations: Observation[]): string;

  /**
   * 检查是否已处理
   */
  check(key: string): Promise<AnalysisResult | null>;

  /**
   * 存储结果
   */
  store(key: string, result: AnalysisResult): Promise<void>;
}

// 幂等键算法
function computeIdempotencyKey(observations: Observation[]): string {
  const content = observations
    .map(o => `${o.id}:${o.created_at_epoch}`)
    .sort()
    .join('|');
  return crypto.createHash('sha256').update(content).digest('hex');
}
```

#### DeadLetterQueue - 死信队列

**职责:** 处理失败任务

```typescript
interface DeadLetterQueue {
  /**
   * 将失败任务移入死信队列
   */
  enqueue(taskId: string, observations: Observation[], error: Error): Promise<void>;

  /**
   * 获取死信队列
   */
  getAll(): Promise<FailedTask[]>;

  /**
   * 重试死信任务
   */
  retry(taskId: string): Promise<void>;

  /**
   * 清空死信队列
   */
  clear(): Promise<void>;
}

// 重试策略
const RETRY_POLICY = {
  maxRetries: 3,
  baseBackoffMs: 1000,
  maxBackoffMs: 30000,
  exponentialBackoff: true
};
```

#### CircuitBreaker - 熔断器

**职责:** 防止级联失败

```typescript
interface CircuitBreaker {
  /**
   * 执行受保护的操作
   */
  execute<T>(fn: () => Promise<T>): Promise<T>;

  /**
   * 获取当前状态
   */
  getState(): 'closed' | 'open' | 'half-open';

  /**
   * 手动打开/关闭
   */
  open(): void;
  close(): void;
}

// 熔断器配置
const CIRCUIT_BREAKER_CONFIG = {
  failureThreshold: 5,      // 连续失败 5 次后打开
  timeout: 30000,           // 30 秒超时
  resetTimeout: 60000,      // 1 分钟后尝试恢复
  monitoringPeriod: 10000   // 监控周期 10 秒
};
```

---

### 4. 缓存层

#### SemanticCache - 语义缓存

**职责:** 缓存相似观察的分析结果

```typescript
interface SemanticCache {
  /**
   * 获取缓存
   */
  get(observation: Observation): Promise<AnalysisResult | null>;

  /**
   * 设置缓存
   */
  set(observation: Observation, result: AnalysisResult): Promise<void>;

  /**
   * 计算语义哈希
   */
  computeSemanticHash(observation: Observation): string;

  /**
   * 清空缓存
   */
  clear(): Promise<void>;

  /**
   * 获取缓存统计
   */
  getStats(): CacheStats;
}

// 语义哈希算法
function computeSemanticHash(obs: Observation): string {
  let normalized = obs.tool_output;

  // 移除文件路径
  normalized = normalized.replace(/\/[\w\/.-]+\.(ts|js|py|java)/g, '<FILE>');

  // 移除行号
  normalized = normalized.replace(/:\d+:\d+/g, ':<LINE>');

  // 移除变量名
  normalized = normalized.replace(/['"`][\w-]+['"`]/g, '<VAR>');

  // 移除数字
  normalized = normalized.replace(/\b\d+\b/g, '<NUM>');

  // 移除时间戳
  normalized = normalized.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/g, '<TIME>');

  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

// 缓存配置
const CACHE_CONFIG = {
  maxSize: 1000,
  ttl: 168 * 3600 * 1000,  // 7 天
  strategy: 'LRU'
};
```

---

## 数据模型

### ER 图

```
┌─────────────────┐
│   sessions      │
│  (现有表)       │
└────────┬────────┘
         │
         │ 1:N
         ▼
┌─────────────────┐      ┌──────────────────┐
│  observations   │ 1:N  │ categorized      │
│  (现有表)       │◄─────│  insights        │
└─────────────────┘      └──────────────────┘
         │                         │
         │ 1:N                     │ M:N
         ▼                         ▼
┌─────────────────┐      ┌──────────────────┐
│ conversation_   │      │  knowledge_      │
│  threads        │      │   entities       │
└─────────────────┘      └────────┬─────────┘
         │                         │
         │ 1:N                     │ M:N
         ▼                         ▼
┌─────────────────┐      ┌──────────────────┐
│ project_        │      │  knowledge_      │
│  progress       │      │  relationships   │
└─────────────────┘      └──────────────────┘
         │
         │ 1:N
         ▼
┌─────────────────┐
│ daily_summaries │
└─────────────────┘
```

### 表结构详情

详细的表结构请参见 [开发实施方案](./implementation-plan.md#数据库Schema)

---

## AI 分析引擎

### 引擎架构

```
┌─────────────────────────────────────────────────────────────┐
│                    AI 分析引擎核心                           │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Prompt Engineering Layer (提示词工程层)               │ │
│  │  ├─ PromptBuilder: 动态构建提示词                     │ │
│  │  ├─ ContextManager: 管理上下文窗口                    │ │
│  │  ├─ FewShotLearning: 注入示例                         │ │
│  │  └─ PromptOptimizer: A/B 测试和优化                   │ │
│  └────────────────────────────────────────────────────────┘ │
│                         ↓                                     │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Claude Agent SDK Integration (SDK 集成层)            │ │
│  │  ├─ 模型: claude-3-5-haiku-20241022                   │ │
│  │  ├─ Temperature: 0.0 (确定性)                         │ │
│  │  ├─ Max Tokens: 4096                                  │ │
│  │  └─ Streaming: 支持                                   │ │
│  └────────────────────────────────────────────────────────┘ │
│                         ↓                                     │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Response Parsing Layer (响应解析层)                  │ │
│  │  ├─ JSONParser: 解析 JSON 响应                        │ │
│  │  ├─ SchemaValidator: 验证响应格式                     │ │
│  │  ├─ ConfidenceScorer: 评估置信度                      │ │
│  │  └─ ErrorHandler: 处理解析错误                        │ │
│  └────────────────────────────────────────────────────────┘ │
│                         ↓                                     │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Quality Assurance Layer (质量保证层)                 │ │
│  │  ├─ DuplicationDetector: 去重                         │ │
│  │  ├─ RelevanceFilter: 过滤无关结果                     │ │
│  │  ├─ ConsistencyChecker: 一致性检查                    │ │
│  │  └─ FeedbackLoop: 用户反馈学习                        │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 提示词策略

#### 批量观察分析提示词

详细提示词请参见 [开发实施方案](./implementation-plan.md#AI提示词设计)

**关键特性:**
- **结构化输出:** JSON 格式,易于解析
- **置信度评分:** 0-1 之间,表示确定性
- **多分类支持:** 一个观察可属于多个分类
- **可解释性:** 包含证据和推理过程
- **可操作性:** 提供解决方案建议

---

## 成本优化架构

### 成本模型

```
总成本 = 输入成本 + 输出成本

输入成本 = 输入Tokens × $0.25 / 1M
输出成本 = 输出Tokens × $1.25 / 1M

预期成本(中等活跃项目):
- 每日: $0.053 (~10 会话)
- 每月: $1.59

预期成本(高活跃项目):
- 每日: $0.431 (~50 会话)
- 每月: $12.93
```

### 优化策略

#### 1. 批处理优化

**收益:** 减少 50% API 调用次数

```
逐个分析:
  200 个观察 × 1 次调用 = 200 次调用

批量分析:
  200 个观察 / 10 = 20 批 × 1 次调用 = 20 次调用

减少: 90% 调用次数
```

#### 2. 语义缓存

**收益:** 缓存命中率 30-50%

```
无缓存:
  200 个观察 × $0.001 = $0.20/天

有缓存 (40% 命中率):
  120 个观察 × $0.001 = $0.12/天

节省: 40% 成本
```

#### 3. 过滤低价值观察

**收益:** 跳过 20-30% 无价值数据

```
无过滤:
  200 个观察

有过滤 (25% 跳过):
  150 个观察

节省: 25% 成本
```

#### 4. 优先级调度

**收益:** 确保有限预算用于高价值分析

```
随机调度:
  低价值观察可能耗尽预算

优先级调度:
  错误和重要观察优先分析

价值: 提升 ROI
```

### 总体收益

```
原始成本: $162/月 (无优化)
优化后成本: $1.59 - $12.93/月

成本降低: 92-99%
```

---

## 可靠性保障

### 可靠性指标

| 指标 | 目标 | 测量 |
|------|------|------|
| **可用性** | 99.5% | 健康检查 |
| **数据一致性** | 100% | 事务成功率 |
| **错误恢复** | < 5 分钟 | MTTR |
| **数据丢失** | 0 | 备份验证 |

### 故障场景和应对

#### 场景 1: AI API 超时

```
故障: Claude API 30 秒无响应
应对:
  1. 超时自动取消
  2. 指数退避重试 (1s, 2s, 4s)
  3. 3 次失败后移入死信队列
  4. 告警管理员
  5. 用户看到"分析延迟"提示
```

#### 场景 2: 数据库锁超时

```
故障: 事务死锁
应对:
  1. 自动检测死锁
  2. 回滚事务
  3. 随机延迟后重试
  4. 最多重试 3 次
  5. 失败后记录错误日志
```

#### 场景 3: 磁盘空间不足

```
故障: SQLite 写入失败
应对:
  1. 健康检查检测到磁盘空间 < 10%
  2. 自动触发数据归档
  3. 归档 6 个月前的数据到云存储
  4. 告警管理员
  5. 停止接受新任务
```

#### 场景 4: 内存泄漏

```
故障: Worker 进程内存持续增长
应对:
  1. 监控内存使用率
  2. 达到 1GB 时触发告警
  3. 达到 1.5GB 时优雅重启 Worker
  4. 保存未完成任务到磁盘
  5. 重启后恢复任务
```

---

## 安全架构

### 威胁模型

| 威胁 | 风险 | 缓解措施 |
|------|------|---------|
| **敏感信息泄露** | 高 | 自动脱敏 + 加密存储 |
| **注入攻击** | 中 | 参数化查询 + 输入验证 |
| **未授权访问** | 中 | API 认证 (计划中) |
| **数据窃取** | 低 | 本地存储 + 文件权限 |

### 安全措施

#### 1. 自动脱敏

```typescript
// 检测到敏感模式自动替换
"API Key: sk-abc123..." → "API Key: [REDACTED]"
"Password: secret123"  → "Password: [REDACTED]"
"Email: user@example.com" → "Email: [EMAIL]"
```

#### 2. 加密存储

```typescript
// 敏感字段加密
insights.context = encrypt(insights.context);
insights.solution = encrypt(insights.solution);

// 使用 AES-256-GCM
const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
```

#### 3. 访问控制

```typescript
// 文件权限
chmod 0600 ~/.claude-mem/claude-mem.db
chmod 0600 ~/.claude-mem/settings.json

// 进程隔离
运行在用户权限下,无 root 权限
```

#### 4. 审计日志

```typescript
// 记录所有敏感操作
auditLog.record({
  action: 'sensitive_data_detected',
  pattern: 'api_key',
  observation_id: 123,
  timestamp: Date.now(),
  redacted: true
});
```

---

## 监控和可观测性

### 监控架构

```
┌─────────────────────────────────────────────────────────┐
│                      应用层                              │
│  AnalysisService → MetricsCollector → Logger            │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│                    收集层                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Structured  │  │   Metrics    │  │    Traces    │  │
│  │     Logs     │  │ (Prometheus) │  │  (OpenTelemetry) │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│                    存储层                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  日志文件    │  │   时序数据库  │  │  追踪数据库  │  │
│  │  (Rotating)  │  │  (可选)       │  │  (可选)      │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│                  可视化层                                │
│  • Web Viewer UI (内置)                                 │
│  • Grafana (可选)                                       │
│  • Jaeger (可选)                                        │
└─────────────────────────────────────────────────────────┘
```

### 关键指标

#### 业务指标

```typescript
// 分析任务
metrics.counter('analysis.total', tags: { type, project });
metrics.histogram('analysis.duration', tags: { type });
metrics.gauge('analysis.cost', tags: { project });

// 洞察生成
metrics.counter('insights.generated', tags: { category, severity });
metrics.gauge('insights.confidence', tags: { category });

// 用户反馈
metrics.counter('insights.acknowledged', tags: { rating });
metrics.counter('insights.dismissed');
```

#### 技术指标

```typescript
// 缓存效率
metrics.counter('cache.hits');
metrics.counter('cache.misses');
metrics.gauge('cache.hit_rate');

// API 性能
metrics.histogram('api.latency', tags: { provider: 'claude' });
metrics.counter('api.tokens', tags: { type: 'input' | 'output' });
metrics.counter('api.errors', tags: { error_type });

// 队列状态
metrics.gauge('queue.depth');
metrics.gauge('queue.running_tasks');
metrics.histogram('queue.wait_time');

// 数据库
metrics.histogram('db.query_time', tags: { query_type });
metrics.counter('db.transactions', tags: { status: 'success' | 'failed' });
```

#### 系统指标

```typescript
// 资源使用
metrics.gauge('system.memory_usage');
metrics.gauge('system.cpu_usage');
metrics.gauge('system.disk_usage');

// 健康状态
metrics.gauge('health.status', tags: { component });
```

### 告警规则

| 告警 | 阈值 | 级别 | 通知 |
|------|------|------|------|
| **预算超限** | 80% | Warning | Email |
| **预算耗尽** | 100% | Critical | Email + Webhook |
| **队列积压** | > 1000 | Warning | Email |
| **分析失败率** | > 10% | Warning | Email |
| **API 错误率** | > 5% | Critical | Email + Webhook |
| **磁盘空间不足** | < 10% | Critical | Email + Webhook |
| **内存泄漏** | > 1.5GB | Warning | Email |

---

## 性能优化

### 性能目标

| 指标 | 目标 | 当前 |
|------|------|------|
| **API 响应时间** | < 200ms | TBD |
| **批量分析延迟** | < 30s | TBD |
| **查询延迟** | < 100ms | TBD |
| **并发处理能力** | 10,000 会话/月 | TBD |

### 优化策略

#### 1. 数据库优化

```sql
-- 覆盖索引
CREATE INDEX idx_insights_category_project_last_seen
  ON categorized_insights(category, project, last_seen)
  INCLUDE (title, severity, frequency);

-- 分区表 (未来)
-- 按月分区 categorized_insights

-- 定期 VACUUM
PRAGMA auto_vacuum = INCREMENTAL;
```

#### 2. 查询优化

```typescript
// 使用流式查询
async function* streamInsights(filters: any) {
  const BATCH_SIZE = 100;
  let offset = 0;

  while (true) {
    const batch = await db.all(
      'SELECT * FROM categorized_insights WHERE ... LIMIT ? OFFSET ?',
      [BATCH_SIZE, offset]
    );

    if (batch.length === 0) break;

    for (const insight of batch) {
      yield insight;
    }

    offset += BATCH_SIZE;
  }
}
```

#### 3. 数据归档

```typescript
// 自动归档旧数据
async function archiveOldData() {
  const sixMonthsAgo = Date.now() - 180 * 86400000;

  await db.transaction(async (tx) => {
    // 导出到归档表
    await tx.run(`
      INSERT INTO categorized_insights_archive
      SELECT * FROM categorized_insights
      WHERE last_seen < ?
    `, [sixMonthsAgo]);

    // 删除原表数据
    await tx.run(`
      DELETE FROM categorized_insights
      WHERE last_seen < ?
    `, [sixMonthsAgo]);

    // VACUUM 回收空间
    await tx.run('VACUUM');
  });
}
```

#### 4. 连接池管理

```typescript
// SQLite 连接池
const pool = new Pool({
  min: 1,
  max: 5,
  acquireTimeoutMillis: 30000,
  idleTimeoutMillis: 30000
});
```

---

## API 设计

详细的 API 设计请参见 [开发实施方案](./implementation-plan.md#API接口设计)

### API 原则

1. **RESTful:** 遵循 REST 原则
2. **版本控制:** `/api/v1/...`
3. **统一响应格式:**
```typescript
{
  success: boolean;
  data?: any;
  error?: {
    code: string;
    message: string;
  };
  meta?: {
    page: number;
    pageSize: number;
    total: number;
  };
}
```
4. **错误码标准:** HTTP 状态码 + 业务错误码
5. **分页:** 支持 limit/offset 和 cursor-based
6. **过滤和排序:** 查询参数灵活
7. **实时推送:** SSE 事件流

---

## 总结

本架构设计提供了一个**全 AI 驱动、工业级可靠、成本可控**的智能记忆分析系统。

### 核心特性

✅ **全 AI 分析:** 无需维护规则,强大的语义理解
✅ **成本优化:** 批处理 + 缓存 + 优先级,月均 $1.59-12.93
✅ **工业可靠:** 事务管理 + 错误恢复 + 幂等性保证
✅ **安全合规:** 自动脱敏 + 加密存储 + 审计日志
✅ **全面监控:** 结构化日志 + 指标 + 分布式追踪
✅ **高性能:** 流式处理 + 索引优化 + 自动归档

### 技术债务

- [ ] API 认证和授权(计划中)
- [ ] 多租户支持(计划中)
- [ ] 数据库分片(规模扩大后)
- [ ] 分布式部署(单机 → 集群)

### 扩展性

本架构支持:
- **水平扩展:** 增加 Worker 实例
- **垂直扩展:** 升级硬件配置
- **功能扩展:** 插件化设计,易于添加新分析器

---

**文档版本:** v2.0
**最后更新:** 2026-01-30
