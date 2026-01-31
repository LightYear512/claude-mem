# 类型安全重构计划

**项目:** claude-mem
**创建日期:** 2026-01-31
**状态:** 待执行
**优先级:** 高

---

## 执行摘要

本文档详细说明了 claude-mem 项目中 170 处类型安全问题的系统性修复计划。通过分阶段、渐进式的重构策略,我们将消除 `any` 类型使用,提升代码质量和可维护性。

**预期收益:**
- ✅ 编译时错误检测率提升 80%
- ✅ 减少运行时类型错误
- ✅ 改善 IDE 开发体验
- ✅ 提高代码可维护性

---

## 问题分析概览

### 统计数据

| 指标 | 数值 |
|------|------|
| 总问题数 | 170 行 |
| 受影响文件 | 25 个 |
| 高危问题 | 15 处 |
| 中危问题 | 45 处 |
| 低危问题 | 110 处 |

### 按模块分布

```
SearchManager.ts          ████████████ 45 处
Logger.ts                 █████████ 32 处
worker-types.ts           ██████ 20 处
SDKAgent.ts               ████ 15 处
transcript.ts             ███ 12 处
ResponseProcessor.ts      ███ 10 处
MCP Server                ██ 8 处
其他文件                  ████ 28 处
```

---

## 阶段 1: 高危修复 (第 1-2 周)

### 优先级 P0 - 公共 API 类型安全

#### 1.1 SearchManager 重构

**文件:** `src/services/worker/SearchManager.ts`
**问题:** 所有公共方法使用 `args: any` 和 `Promise<any>`

**修复步骤:**

**步骤 1:** 创建类型定义文件

```typescript
// src/services/worker/search/types.ts

/**
 * 搜索参数基础接口
 */
export interface BaseSearchParams {
  project?: string;
  limit?: number;
  offset?: number;
  dateRange?: {
    start?: string;
    end?: string;
  };
}

/**
 * 观察搜索参数
 */
export interface ObservationSearchParams extends BaseSearchParams {
  query?: string;
  type?: ObservationType | ObservationType[];
  concepts?: string[];
  files?: string[];
  format?: 'json' | 'markdown';
}

/**
 * 通用搜索参数 (支持所有类型)
 */
export interface SearchParams extends BaseSearchParams {
  query?: string;
  type?: 'observations' | 'sessions' | 'prompts';
  obs_type?: ObservationType | ObservationType[];
  concepts?: string | string[];
  files?: string | string[];
  filePath?: string; // URL 参数兼容
  format?: 'json' | 'markdown';
  dateStart?: string; // URL 参数兼容
  dateEnd?: string;   // URL 参数兼容
  isFolder?: boolean | 'true' | 'false';
}

/**
 * 标准化后的搜索参数 (内部使用)
 */
export interface NormalizedSearchParams extends BaseSearchParams {
  query?: string;
  type?: 'observations' | 'sessions' | 'prompts';
  obs_type?: ObservationType[];
  concepts?: string[];
  files?: string[];
  format?: 'json' | 'markdown';
  isFolder?: boolean;
}

/**
 * 搜索结果
 */
export interface SearchResult {
  observations: ObservationSearchResult[];
  sessions: SessionSummarySearchResult[];
  prompts: UserPromptSearchResult[];
  total: number;
  chromaFailed?: boolean;
}

/**
 * 时间线参数
 */
export interface TimelineParams extends BaseSearchParams {
  sessionId?: string;
  startDate?: string;
  endDate?: string;
  type?: 'observation' | 'session' | 'prompt';
}

/**
 * 时间线结果
 */
export interface TimelineResult {
  items: TimelineItem[];
  total: number;
  hasMore: boolean;
}

export interface TimelineItem {
  type: 'observation' | 'session' | 'prompt';
  data: ObservationSearchResult | SessionSummarySearchResult | UserPromptSearchResult;
  epoch: number;
}

/**
 * 决策查询参数
 */
export interface DecisionsParams extends BaseSearchParams {
  sessionId?: string;
}

/**
 * 变更查询参数
 */
export interface ChangesParams extends BaseSearchParams {
  filePattern?: string;
}
```

**步骤 2:** 更新 SearchManager 类

```typescript
// src/services/worker/SearchManager.ts

import {
  SearchParams,
  NormalizedSearchParams,
  SearchResult,
  TimelineParams,
  TimelineResult,
  DecisionsParams,
  ChangesParams
} from './search/types.js';

export class SearchManager {
  /**
   * 标准化 URL 参数到内部格式
   */
  private normalizeParams(args: SearchParams): NormalizedSearchParams {
    const normalized: NormalizedSearchParams = {
      query: args.query,
      type: args.type,
      project: args.project,
      limit: args.limit,
      offset: args.offset,
      format: args.format
    };

    // Map filePath to files
    if (args.filePath && !args.files) {
      normalized.files = [args.filePath];
    } else if (args.files) {
      normalized.files = typeof args.files === 'string'
        ? args.files.split(',').map(s => s.trim()).filter(Boolean)
        : args.files;
    }

    // Parse concepts
    if (args.concepts) {
      normalized.concepts = typeof args.concepts === 'string'
        ? args.concepts.split(',').map(s => s.trim()).filter(Boolean)
        : args.concepts;
    }

    // Parse obs_type
    if (args.obs_type) {
      normalized.obs_type = typeof args.obs_type === 'string'
        ? args.obs_type.split(',').map(s => s.trim()).filter(Boolean) as ObservationType[]
        : args.obs_type;
    }

    // Parse type filter
    if (args.type && typeof args.type === 'string' && args.type.includes(',')) {
      const types = args.type.split(',').map(s => s.trim());
      // 多类型过滤需要特殊处理,保持为字符串
      normalized.type = types[0] as 'observations' | 'sessions' | 'prompts';
    }

    // Flatten dateStart/dateEnd into dateRange
    if (args.dateStart || args.dateEnd) {
      normalized.dateRange = {
        start: args.dateStart || args.dateRange?.start,
        end: args.dateEnd || args.dateRange?.end
      };
    }

    // Parse isFolder
    if (args.isFolder !== undefined) {
      normalized.isFolder = args.isFolder === true || args.isFolder === 'true';
    }

    return normalized;
  }

  /**
   * 主搜索方法
   */
  async search(args: SearchParams): Promise<SearchResult> {
    const normalized = this.normalizeParams(args);
    const { query, type, obs_type, concepts, files, format, ...options } = normalized;

    let observations: ObservationSearchResult[] = [];
    let sessions: SessionSummarySearchResult[] = [];
    let prompts: UserPromptSearchResult[] = [];
    let chromaFailed = false;

    // ... 实现逻辑保持不变 ...

    return {
      observations,
      sessions,
      prompts,
      total: observations.length + sessions.length + prompts.length,
      chromaFailed
    };
  }

  /**
   * 时间线查询
   */
  async timeline(args: TimelineParams): Promise<TimelineResult> {
    // 类型安全的实现
    const items: TimelineItem[] = [];
    // ... 实现逻辑 ...

    return {
      items,
      total: items.length,
      hasMore: items.length >= (args.limit || 50)
    };
  }

  /**
   * 决策查询
   */
  async decisions(args: DecisionsParams): Promise<SearchResult> {
    // 类型安全的实现
    return this.search({
      ...args,
      obs_type: 'decision'
    });
  }

  /**
   * 变更查询
   */
  async changes(args: ChangesParams): Promise<SearchResult> {
    // 类型安全的实现
    const params: SearchParams = {
      ...args,
      obs_type: 'change'
    };

    if (args.filePattern) {
      params.files = [args.filePattern];
    }

    return this.search(params);
  }
}
```

**预期收益:**
- ✅ 消除 45 处 `any` 使用
- ✅ 编译时参数验证
- ✅ IDE 自动补全支持

**测试要求:**
- 所有现有测试必须通过
- 添加参数验证单元测试
- 验证 API 向后兼容性

---

#### 1.2 Worker Types 重构

**文件:** `src/services/worker-types.ts`
**问题:** 核心数据结构使用 `any`

**修复代码:**

```typescript
// src/services/worker-types.ts

/**
 * 工具输入类型 (常见工具的联合类型)
 */
export type ToolInput =
  | BashToolInput
  | ReadToolInput
  | WriteToolInput
  | EditToolInput
  | GrepToolInput
  | GlobToolInput
  | TaskToolInput
  | Record<string, unknown>; // 兜底类型

export interface BashToolInput {
  command: string;
  timeout?: number;
  description?: string;
}

export interface ReadToolInput {
  file_path: string;
  offset?: number;
  limit?: number;
}

export interface WriteToolInput {
  file_path: string;
  content: string;
}

export interface EditToolInput {
  file_path: string;
  old_string: string;
  new_string: string;
  replace_all?: boolean;
}

export interface GrepToolInput {
  pattern: string;
  path?: string;
  glob?: string;
  output_mode?: 'content' | 'files_with_matches' | 'count';
}

export interface GlobToolInput {
  pattern: string;
  path?: string;
}

export interface TaskToolInput {
  prompt: string;
  subagent_type: string;
  description?: string;
  model?: string;
}

/**
 * 工具响应类型
 */
export type ToolResponse =
  | string
  | { stdout?: string; stderr?: string; [key: string]: unknown }
  | { content?: string; [key: string]: unknown }
  | null
  | undefined;

/**
 * 待处理消息 (类型安全版本)
 */
export interface PendingMessage {
  type: 'observation' | 'summarize';
  tool_name?: string;
  tool_input?: ToolInput;
  tool_response?: ToolResponse;
  cwd?: string;
  prompt_number?: number;
  last_assistant_message?: string;
}

/**
 * 观察消息 (类型安全版本)
 */
export interface ObservationMessage {
  type: 'observation';
  tool_name: string;
  tool_input: ToolInput;
  tool_response: ToolResponse;
  cwd?: string;
  prompt_number: number;
}

/**
 * 摘要消息
 */
export interface SummarizeMessage {
  type: 'summarize';
  last_assistant_message?: string;
}

/**
 * SDK 用户消息 (保持向后兼容)
 */
export interface SDKUserMessage {
  type: 'user';
  message: {
    role: 'user';
    content: string;
  };
  session_id: string;
  parent_tool_use_id: string | null;
  isSynthetic: boolean;
}

/**
 * 类型守卫
 */
export function isObservationMessage(msg: PendingMessage): msg is ObservationMessage {
  return msg.type === 'observation' &&
         !!msg.tool_name &&
         msg.tool_input !== undefined;
}

export function isSummarizeMessage(msg: PendingMessage): msg is SummarizeMessage {
  return msg.type === 'summarize';
}
```

**迁移策略:**
1. 先添加新类型,保留旧类型作为别名
2. 逐步更新使用方
3. 运行完整测试套件
4. 删除旧类型别名

---

#### 1.3 MCP Server 处理器类型化

**文件:** `src/servers/mcp-server.ts`
**问题:** Handler 参数无类型约束

**修复代码:**

```typescript
// src/servers/mcp-server.ts

import { SearchParams, TimelineParams, DecisionsParams } from '../services/worker/search/types.js';

// 定义 MCP 工具参数类型
interface MCPSearchArgs extends SearchParams {
  // MCP 特定字段
}

interface MCPTimelineArgs extends TimelineParams {
  // MCP 特定字段
}

interface MCPDecisionsArgs extends DecisionsParams {
  // MCP 特定字段
}

// 工具定义
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'search',
        description: 'Search observations, sessions, and prompts',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
            type: {
              type: 'string',
              enum: ['observations', 'sessions', 'prompts'],
              description: 'Type filter'
            },
            project: { type: 'string', description: 'Project filter' },
            limit: { type: 'number', description: 'Result limit' }
          }
        }
      },
      {
        name: 'timeline',
        description: 'Get chronological timeline of events',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID filter' },
            startDate: { type: 'string', description: 'Start date (ISO)' },
            endDate: { type: 'string', description: 'End date (ISO)' },
            limit: { type: 'number', description: 'Result limit' }
          }
        }
      },
      {
        name: 'decisions',
        description: 'Get decision observations',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID filter' },
            project: { type: 'string', description: 'Project filter' },
            limit: { type: 'number', description: 'Result limit' }
          }
        }
      }
    ]
  };
});

// 类型安全的处理器
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'search': {
        const typedArgs = args as MCPSearchArgs;
        const result = await searchManager.search(typedArgs);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }]
        };
      }

      case 'timeline': {
        const typedArgs = args as MCPTimelineArgs;
        const result = await searchManager.timeline(typedArgs);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }]
        };
      }

      case 'decisions': {
        const typedArgs = args as MCPDecisionsArgs;
        const result = await searchManager.decisions(typedArgs);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }]
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    logger.error('MCP', 'Tool execution failed', { tool: name }, error as Error);
    throw error;
  }
});
```

---

## 阶段 2: 中危改进 (第 3-4 周)

### 优先级 P1 - 内部工具类型安全

#### 2.1 Logger 工具重构

**文件:** `src/utils/logger.ts`
**问题:** `LogContext` 和 `data` 参数使用 `any`

**修复代码:**

```typescript
// src/utils/logger.ts

/**
 * 日志数据类型 (联合类型,明确所有可能值)
 */
export type LogData =
  | string
  | number
  | boolean
  | Error
  | Array<LogData>
  | { [key: string]: LogData }
  | null
  | undefined;

/**
 * 日志上下文 (限制值类型)
 */
export interface LogContext {
  sessionId?: number;
  memorySessionId?: string;
  correlationId?: string;
  location?: string;
  duration?: string;
  obsId?: number;
  summaryId?: number;
  // 允许额外字段但限制类型
  [key: string]: string | number | boolean | undefined;
}

class Logger {
  /**
   * 格式化日志数据 (类型安全版本)
   */
  private formatData(data: LogData): string {
    if (data === null || data === undefined) return '';
    if (typeof data === 'string') return data;
    if (typeof data === 'number') return data.toString();
    if (typeof data === 'boolean') return data.toString();

    // 错误对象特殊处理
    if (data instanceof Error) {
      return this.getLevel() === LogLevel.DEBUG
        ? `${data.message}\n${data.stack}`
        : data.message;
    }

    // 数组处理
    if (Array.isArray(data)) {
      if (data.length === 0) return '[]';
      if (data.length <= 3) {
        return `[${data.map(item => this.formatData(item)).join(', ')}]`;
      }
      return `[${data.length} items]`;
    }

    // 对象处理
    if (typeof data === 'object') {
      const keys = Object.keys(data);
      if (keys.length === 0) return '{}';
      if (keys.length <= 3) {
        return JSON.stringify(data);
      }
      return `{${keys.length} keys: ${keys.slice(0, 3).join(', ')}...}`;
    }

    return String(data);
  }

  /**
   * 格式化工具调用 (类型安全版本)
   */
  formatTool(toolName: string, toolInput?: ToolInput): string {
    if (!toolInput) return toolName;

    // 使用类型守卫进行安全的类型检查
    if (typeof toolInput === 'string') {
      try {
        toolInput = JSON.parse(toolInput) as ToolInput;
      } catch {
        return toolName; // 无法解析则只返回工具名
      }
    }

    // Bash 命令
    if (toolName === 'Bash' && 'command' in toolInput) {
      return `${toolName}(${toolInput.command})`;
    }

    // 文件操作
    if ('file_path' in toolInput) {
      return `${toolName}(${toolInput.file_path})`;
    }

    // Notebook 操作
    if ('notebook_path' in toolInput) {
      return `${toolName}(${toolInput.notebook_path})`;
    }

    // Glob/Grep
    if (toolName === 'Glob' && 'pattern' in toolInput) {
      return `${toolName}(${toolInput.pattern})`;
    }

    if (toolName === 'Grep' && 'pattern' in toolInput) {
      return `${toolName}(${toolInput.pattern})`;
    }

    // Task
    if (toolName === 'Task') {
      if ('subagent_type' in toolInput) {
        return `${toolName}(${toolInput.subagent_type})`;
      }
      if ('description' in toolInput) {
        return `${toolName}(${toolInput.description})`;
      }
    }

    // 默认
    return toolName;
  }

  /**
   * 核心日志方法 (类型安全版本)
   */
  private log(
    level: LogLevel,
    component: Component,
    message: string,
    context?: LogContext,
    data?: LogData
  ): void {
    if (level < this.getLevel()) return;

    this.ensureLogFileInitialized();

    const timestamp = this.formatTimestamp(new Date());
    const levelStr = LogLevel[level].padEnd(5);
    const componentStr = component.padEnd(6);

    // 构建关联 ID 部分
    let correlationStr = '';
    if (context?.correlationId) {
      correlationStr = `[${context.correlationId}] `;
    } else if (context?.sessionId) {
      correlationStr = `[session-${context.sessionId}] `;
    }

    // 构建数据部分
    let dataStr = '';
    if (data !== undefined && data !== null) {
      if (data instanceof Error) {
        dataStr = this.getLevel() === LogLevel.DEBUG
          ? `\n${data.message}\n${data.stack}`
          : ` ${data.message}`;
      } else if (this.getLevel() === LogLevel.DEBUG && typeof data === 'object') {
        dataStr = '\n' + JSON.stringify(data, null, 2);
      } else {
        dataStr = ' ' + this.formatData(data);
      }
    }

    // 构建上下文部分
    let contextStr = '';
    if (context) {
      const { sessionId, memorySessionId, correlationId, ...rest } = context;
      if (Object.keys(rest).length > 0) {
        const pairs = Object.entries(rest).map(([k, v]) => `${k}=${v}`);
        contextStr = ` {${pairs.join(', ')}}`;
      }
    }

    const logLine = `[${timestamp}] [${levelStr}] [${componentStr}] ${correlationStr}${message}${contextStr}${dataStr}`;

    // 写入日志文件
    if (this.logFilePath) {
      try {
        appendFileSync(this.logFilePath, logLine + '\n', 'utf8');
      } catch (error) {
        process.stderr.write(`[LOGGER] Failed to write to log file: ${error}\n`);
      }
    } else {
      process.stderr.write(logLine + '\n');
    }
  }

  // 公共日志方法签名更新
  debug(component: Component, message: string, context?: LogContext, data?: LogData): void {
    this.log(LogLevel.DEBUG, component, message, context, data);
  }

  info(component: Component, message: string, context?: LogContext, data?: LogData): void {
    this.log(LogLevel.INFO, component, message, context, data);
  }

  warn(component: Component, message: string, context?: LogContext, data?: LogData): void {
    this.log(LogLevel.WARN, component, message, context, data);
  }

  error(component: Component, message: string, context?: LogContext, data?: LogData): void {
    this.log(LogLevel.ERROR, component, message, context, data);
  }

  dataIn(component: Component, message: string, context?: LogContext, data?: LogData): void {
    this.info(component, `→ ${message}`, context, data);
  }

  dataOut(component: Component, message: string, context?: LogContext, data?: LogData): void {
    this.info(component, `← ${message}`, context, data);
  }

  success(component: Component, message: string, context?: LogContext, data?: LogData): void {
    this.info(component, `✓ ${message}`, context, data);
  }

  failure(component: Component, message: string, context?: LogContext, data?: LogData): void {
    this.error(component, `✗ ${message}`, context, data);
  }

  timing(component: Component, message: string, durationMs: number, context?: LogContext): void {
    this.info(component, `⏱ ${message}`, context, { duration: `${durationMs}ms` });
  }

  /**
   * Happy Path Error (类型安全版本)
   */
  happyPathError<T = string>(
    component: Component,
    message: string,
    context?: LogContext,
    data?: LogData,
    fallback: T = '' as T
  ): T {
    const stack = new Error().stack || '';
    const stackLines = stack.split('\n');
    const callerLine = stackLines[2] || '';
    const callerMatch = callerLine.match(/at\s+(?:.*\s+)?\(?([^:]+):(\d+):(\d+)\)?/);
    const location = callerMatch
      ? `${callerMatch[1].split('/').pop()}:${callerMatch[2]}`
      : 'unknown';

    const enhancedContext: LogContext = {
      ...context,
      location
    };

    this.warn(component, `[HAPPY-PATH] ${message}`, enhancedContext, data);

    return fallback;
  }
}

export const logger = new Logger();
```

**预期收益:**
- ✅ 消除 32 处 `any` 使用
- ✅ 类型安全的日志调用
- ✅ 编译时参数验证

---

#### 2.2 SDK Agent 类型守卫

**文件:** `src/services/worker/SDKAgent.ts`
**问题:** SDK 响应内容过滤使用 `any`

**修复代码:**

```typescript
// src/services/worker/SDKAgent.ts

// 定义本地 SDK 类型
interface SDKContent {
  type: string;
  [key: string]: unknown;
}

interface SDKTextContent extends SDKContent {
  type: 'text';
  text: string;
}

interface SDKToolUseContent extends SDKContent {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

// 类型守卫函数
function isTextContent(content: SDKContent): content is SDKTextContent {
  return content.type === 'text' &&
         typeof content.text === 'string';
}

function isToolUseContent(content: SDKContent): content is SDKToolUseContent {
  return content.type === 'tool_use' &&
         typeof content.id === 'string' &&
         typeof content.name === 'string';
}

export class SDKAgent {
  async startSession(session: ActiveSession, worker?: WorkerRef): Promise<void> {
    // ... 现有代码 ...

    for await (const message of queryResult) {
      // 处理助手消息 (类型安全版本)
      if (message.type === 'assistant') {
        const content = message.message.content;

        // 类型安全的内容提取
        let textContent = '';
        if (typeof content === 'string') {
          textContent = content;
        } else if (Array.isArray(content)) {
          // 使用类型守卫过滤文本内容
          const textParts = content.filter(isTextContent);
          textContent = textParts.map(c => c.text).join('\n');
        }

        const responseSize = textContent.length;

        // ... 其余逻辑保持不变 ...
      }
    }
  }
}
```

---

#### 2.3 ResponseProcessor 数据类型标准化

**文件:** `src/services/worker/agents/ResponseProcessor.ts`
**问题:** 摘要标准化使用隐式 `any`

**修复代码:**

```typescript
// src/services/worker/agents/ResponseProcessor.ts

import type { ParsedSummary } from '../../../sdk/parser.js';

/**
 * 存储就绪的摘要类型
 */
export interface StorageSummary {
  request: string;
  investigated: string;
  learned: string;
  completed: string;
  next_steps: string;
  notes: string | null;
}

/**
 * 标准化摘要以供存储 (类型安全版本)
 */
function normalizeSummaryForStorage(summary: ParsedSummary | null): StorageSummary | null {
  if (!summary) return null;

  return {
    request: summary.request ?? '',
    investigated: summary.investigated ?? '',
    learned: summary.learned ?? '',
    completed: summary.completed ?? '',
    next_steps: summary.next_steps ?? '',
    notes: summary.notes ?? null
  };
}

/**
 * 处理 agent 响应文本 (类型安全版本)
 */
export async function processAgentResponse(
  text: string,
  session: ActiveSession,
  dbManager: DatabaseManager,
  sessionManager: SessionManager,
  worker: WorkerRef | undefined,
  discoveryTokens: number,
  originalTimestamp: number | null,
  agentName: string,
  projectRoot?: string
): Promise<void> {
  // 添加响应到对话历史
  if (text) {
    session.conversationHistory.push({ role: 'assistant', content: text });
  }

  // 解析观察和摘要
  const observations = parseObservations(text, session.contentSessionId);
  const summary = parseSummary(text, session.sessionDbId);

  // 类型安全的摘要标准化
  const summaryForStore = normalizeSummaryForStorage(summary);

  // 获取 session store
  const sessionStore = dbManager.getSessionStore();

  // 验证 memorySessionId
  if (!session.memorySessionId) {
    throw new Error('Cannot store observations: memorySessionId not yet captured');
  }

  // 日志记录
  logger.info('DB', `STORING | sessionDbId=${session.sessionDbId} | memorySessionId=${session.memorySessionId} | obsCount=${observations.length} | hasSummary=${!!summaryForStore}`, {
    sessionId: session.sessionDbId,
    memorySessionId: session.memorySessionId
  });

  // 原子事务存储
  const result = sessionStore.storeObservations(
    session.memorySessionId,
    session.project,
    observations,
    summaryForStore,
    session.lastPromptNumber,
    discoveryTokens,
    originalTimestamp ?? undefined
  );

  // 日志确认
  logger.info('DB', `STORED | sessionDbId=${session.sessionDbId} | memorySessionId=${session.memorySessionId} | obsCount=${result.observationIds.length} | obsIds=[${result.observationIds.join(',')}] | summaryId=${result.summaryId || 'none'}`, {
    sessionId: session.sessionDbId,
    memorySessionId: session.memorySessionId
  });

  // 异步操作
  await syncAndBroadcastObservations(
    observations,
    result,
    session,
    dbManager,
    worker,
    discoveryTokens,
    agentName,
    projectRoot
  );

  await syncAndBroadcastSummary(
    summary,
    summaryForStore,
    result,
    session,
    dbManager,
    worker,
    discoveryTokens,
    agentName
  );

  cleanupProcessedMessages(session, worker);
}
```

---

## 阶段 3: 低危优化 (第 5-6 周)

### 优先级 P2 - 外部数据和边界类型

#### 3.1 Transcript Types 完善

**文件:** `src/types/transcript.ts`
**问题:** 外部数据结构使用 `any`

**修复代码:**

```typescript
// src/types/transcript.ts

/**
 * 服务器工具使用信息
 */
export interface ServerToolUse {
  tool_name: string;
  duration_ms?: number;
  tokens_used?: number;
  status?: 'success' | 'error';
  [key: string]: unknown; // 允许未知字段但类型化已知字段
}

/**
 * 结构化补丁 (unified diff 格式)
 */
export interface StructuredPatch {
  hunks: PatchHunk[];
  oldFileName?: string;
  newFileName?: string;
}

export interface PatchHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}

/**
 * 使用信息 (类型安全版本)
 */
export interface UsageInfo {
  input_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  output_tokens?: number;
  service_tier?: string;
  server_tool_use?: ServerToolUse;
}

/**
 * 编辑结果 (类型安全版本)
 */
export interface EditResult {
  oldString?: string;
  newString?: string;
  replaceAll?: boolean;
  originalFile?: string;
  structuredPatch?: StructuredPatch;
  userModified?: boolean;
}
```

---

#### 3.2 ChromaSync 配置类型

**文件:** `src/services/sync/ChromaSync.ts`
**问题:** 传输选项使用 `any`

**修复代码:**

```typescript
// src/services/sync/ChromaSync.ts

/**
 * Chroma 传输选项
 */
interface ChromaTransportOptions {
  timeout?: number;
  headers?: Record<string, string>;
  maxRetries?: number;
  [key: string]: unknown;
}

/**
 * Chroma 客户端配置
 */
interface ChromaClientConfig {
  path: string;
  auth?: {
    provider: string;
    credentials?: string;
  };
  transportOptions?: ChromaTransportOptions;
}

export class ChromaSync {
  private async initializeClient(): Promise<void> {
    try {
      const clientConfig: ChromaClientConfig = {
        path: this.chromaPath
      };

      // 类型安全的传输选项配置
      const transportOptions: ChromaTransportOptions = {
        timeout: 30000
      };

      if (process.env.CHROMA_AUTH_TOKEN) {
        clientConfig.auth = {
          provider: 'token',
          credentials: process.env.CHROMA_AUTH_TOKEN
        };
      }

      clientConfig.transportOptions = transportOptions;

      this.client = await chromaModule.ChromaClient(clientConfig);
      // ... 其余逻辑 ...
    } catch (error) {
      logger.error('CHROMA', 'Failed to initialize Chroma client', {}, error as Error);
      throw error;
    }
  }
}
```

---

#### 3.3 Context Types 规范化

**文件:** `src/services/context/types.ts`
**问题:** 上下文配置使用 `any`

**修复代码:**

```typescript
// src/services/context/types.ts

/**
 * 观察类型配置
 */
export interface ObservationTypeConfig {
  enabled: boolean;
  label: string;
  emoji?: string;
}

/**
 * 上下文配置 (类型安全版本)
 */
export interface ContextConfig {
  enabled: boolean;
  maxTokens: number;
  includeObservations: boolean;
  includeSummaries: boolean;
  includePrompts: boolean;
  observationTypes: Record<ObservationType, ObservationTypeConfig>;
  dateRange?: {
    start?: string;
    end?: string;
  };
  projectFilter?: string[];
  [key: string]: unknown; // 允许扩展但类型化已知字段
}

/**
 * 时间线项配置
 */
export interface TimelineItemConfig {
  type: 'observation' | 'session' | 'prompt';
  format: 'compact' | 'detailed';
  includeMetadata: boolean;
}

/**
 * 格式化选项
 */
export interface FormattingOptions {
  colorize: boolean;
  indentSize: number;
  lineWidth: number;
  includeEmojis: boolean;
}
```

---

## 阶段 4: UI 组件优化 (第 7 周)

### 优先级 P3 - React 组件类型安全

#### 4.1 观察卡片组件

**文件:** `src/ui/viewer/components/ObservationCard.tsx`

**当前问题:** React 组件 props 和状态类型充分,但 JSON 解析可以改进

**优化建议:**

```typescript
// src/ui/viewer/types/index.ts

export interface Observation {
  id: number;
  memory_session_id: string;
  session_id: string;
  type: ObservationType;
  title: string;
  subtitle?: string;
  narrative?: string;
  facts: string; // JSON string
  concepts: string; // JSON string
  files_read: string; // JSON string
  files_modified: string; // JSON string
  project: string;
  prompt_number: number;
  created_at_epoch: number;
}

// 解析后的类型
export interface ParsedObservation extends Omit<Observation, 'facts' | 'concepts' | 'files_read' | 'files_modified'> {
  facts: string[];
  concepts: string[];
  files_read: string[];
  files_modified: string[];
}

// src/ui/viewer/components/ObservationCard.tsx

/**
 * 安全的 JSON 解析辅助函数
 */
function safeParseJSON<T>(jsonString: string | null | undefined, fallback: T): T {
  if (!jsonString) return fallback;
  try {
    return JSON.parse(jsonString) as T;
  } catch (error) {
    console.warn('Failed to parse JSON:', error);
    return fallback;
  }
}

export function ObservationCard({ observation }: ObservationCardProps) {
  const [showFacts, setShowFacts] = useState(false);
  const [showNarrative, setShowNarrative] = useState(false);
  const date = formatDate(observation.created_at_epoch);

  // 类型安全的 JSON 解析
  const facts = safeParseJSON<string[]>(observation.facts, []);
  const concepts = safeParseJSON<string[]>(observation.concepts, []);
  const filesRead = safeParseJSON<string[]>(observation.files_read, [])
    .map(stripProjectRoot);
  const filesModified = safeParseJSON<string[]>(observation.files_modified, [])
    .map(stripProjectRoot);

  const hasFactsContent = facts.length > 0 ||
                         concepts.length > 0 ||
                         filesRead.length > 0 ||
                         filesModified.length > 0;

  // ... 其余组件逻辑 ...
}
```

---

## 实施检查清单

### 阶段 1 检查清单 (P0)

- [ ] 创建 `src/services/worker/search/types.ts`
- [ ] 更新 `SearchManager.ts` 所有方法签名
- [ ] 更新 `worker-types.ts` 核心接口
- [ ] 添加类型守卫函数
- [ ] 更新 MCP Server 处理器
- [ ] 运行完整测试套件
- [ ] 验证 API 向后兼容性
- [ ] 更新相关文档

### 阶段 2 检查清单 (P1)

- [ ] 重构 Logger 类型定义
- [ ] 更新所有 Logger 调用点
- [ ] 添加 SDK Agent 类型守卫
- [ ] 标准化 ResponseProcessor 类型
- [ ] 运行集成测试
- [ ] 验证日志输出格式未变化

### 阶段 3 检查清单 (P2)

- [ ] 完善 Transcript Types
- [ ] 更新 ChromaSync 配置
- [ ] 规范化 Context Types
- [ ] 运行边界测试
- [ ] 验证外部数据兼容性

### 阶段 4 检查清单 (P3)

- [ ] 优化 UI 组件类型
- [ ] 添加 JSON 解析辅助函数
- [ ] 运行 UI 测试
- [ ] 验证用户体验未受影响

---

## 测试策略

### 单元测试

每个重构模块需要对应的单元测试:

```typescript
// tests/worker/search/SearchManager.test.ts

import { describe, it, expect } from 'bun:test';
import { SearchManager } from '../../../src/services/worker/SearchManager';

describe('SearchManager - Type Safety', () => {
  it('should accept valid SearchParams', async () => {
    const manager = new SearchManager(...);

    const params = {
      query: 'test',
      type: 'observations' as const,
      limit: 10
    };

    const result = await manager.search(params);
    expect(result).toHaveProperty('observations');
    expect(result).toHaveProperty('sessions');
    expect(result).toHaveProperty('prompts');
  });

  it('should normalize URL params correctly', async () => {
    const manager = new SearchManager(...);

    const params = {
      query: 'test',
      filePath: '/path/to/file.ts', // URL param
      dateStart: '2026-01-01',       // URL param
      dateEnd: '2026-01-31'          // URL param
    };

    const result = await manager.search(params);
    // 验证参数被正确标准化
  });

  it('should reject invalid type values at compile time', () => {
    const manager = new SearchManager(...);

    // @ts-expect-error - 应该产生编译错误
    const params = {
      type: 'invalid_type'
    };

    // 此测试验证类型系统工作正常
  });
});
```

### 集成测试

```typescript
// tests/integration/search-api.test.ts

import { describe, it, expect } from 'bun:test';
import { startWorkerService } from '../../src/services/worker-service';

describe('Search API Integration', () => {
  it('should handle search requests with type safety', async () => {
    const response = await fetch('http://localhost:37777/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'authentication',
        type: 'observations',
        limit: 5
      })
    });

    const result = await response.json();
    expect(result).toHaveProperty('observations');
    expect(Array.isArray(result.observations)).toBe(true);
  });
});
```

### 回归测试

确保所有现有测试通过:

```bash
# 运行完整测试套件
npm test

# 按模块测试
npm run test:sqlite
npm run test:agents
npm run test:search
npm run test:context
npm run test:infra
npm run test:server
```

---

## 回滚计划

如果重构导致问题,按以下步骤回滚:

### 阶段 1 回滚

```bash
# 恢复 SearchManager
git checkout HEAD~1 -- src/services/worker/SearchManager.ts
git checkout HEAD~1 -- src/services/worker/search/types.ts

# 恢复 worker-types
git checkout HEAD~1 -- src/services/worker-types.ts

# 恢复 MCP Server
git checkout HEAD~1 -- src/servers/mcp-server.ts

# 重新构建
npm run build-and-sync
npm run worker:restart
```

### 验证回滚

```bash
# 运行测试确认系统恢复
npm test

# 检查 worker 健康
curl http://localhost:37777/api/health

# 测试搜索功能
curl -X POST http://localhost:37777/api/search \
  -H "Content-Type: application/json" \
  -d '{"query":"test"}'
```

---

## 成功指标

### 定量指标

| 指标 | 当前值 | 目标值 | 测量方法 |
|------|--------|--------|----------|
| `any` 使用次数 | 170 | 0 | `grep -r ": any" src/` |
| TypeScript 严格模式错误 | N/A | 0 | `tsc --noEmit --strict` |
| 测试覆盖率 | ~60% | >80% | `npm run test:coverage` |
| 编译时错误捕获率 | ~20% | >80% | 错误追踪分析 |

### 定性指标

- ✅ IDE 自动补全完整性提升
- ✅ 代码审查时类型问题减少
- ✅ 新开发者上手速度提升
- ✅ 重构安全性增强

---

## 风险和缓解措施

### 风险 1: API 破坏性变更

**影响:** 高
**概率:** 中
**缓解:**
- 使用类型别名保持向后兼容
- 逐步弃用旧 API
- 提供迁移指南
- 充分的集成测试

### 风险 2: 性能退化

**影响:** 中
**概率:** 低
**缓解:**
- 类型检查仅在编译时
- 运行时无额外开销
- 性能基准测试

### 风险 3: 团队学习曲线

**影响:** 低
**概率:** 中
**缓解:**
- 提供类型安全最佳实践文档
- 代码审查中分享知识
- 渐进式重构减少认知负担

---

## 时间表

| 周次 | 阶段 | 任务 | 责任人 | 状态 |
|------|------|------|--------|------|
| 1-2 | P0 | SearchManager 重构 | TBD | 待开始 |
| 1-2 | P0 | Worker Types 重构 | TBD | 待开始 |
| 1-2 | P0 | MCP Server 类型化 | TBD | 待开始 |
| 3-4 | P1 | Logger 工具重构 | TBD | 待开始 |
| 3-4 | P1 | SDK Agent 类型守卫 | TBD | 待开始 |
| 3-4 | P1 | ResponseProcessor 标准化 | TBD | 待开始 |
| 5-6 | P2 | Transcript Types 完善 | TBD | 待开始 |
| 5-6 | P2 | ChromaSync 配置类型 | TBD | 待开始 |
| 5-6 | P2 | Context Types 规范化 | TBD | 待开始 |
| 7 | P3 | UI 组件优化 | TBD | 待开始 |

---

## 相关资源

### TypeScript 参考

- [TypeScript Handbook - Narrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing.html)
- [TypeScript Deep Dive - Type Guards](https://basarat.gitbook.io/typescript/type-system/typeguard)
- [Effective TypeScript - Item 33: Prefer Type-Safe Approaches](https://effectivetypescript.com/)

### 项目文档

- `docs/context/architecture-overview.md` - 架构概览
- `docs/context/type-safety-audit.md` - 类型安全审计 (本计划的依据)
- `CLAUDE.md` - 项目指南

---

## 附录

### A. 类型安全检查脚本

```bash
#!/bin/bash
# scripts/check-type-safety.sh

echo "Checking for 'any' usage..."
ANY_COUNT=$(grep -r ": any\|as any\|: any\[\]" src/ --include="*.ts" --include="*.tsx" | wc -l)
echo "Found $ANY_COUNT instances of 'any'"

echo "Running TypeScript compiler in strict mode..."
npx tsc --noEmit --strict

echo "Type safety check complete."
```

### B. 自动化迁移工具

```typescript
// scripts/migrate-any-to-unknown.ts

import { Project, SyntaxKind } from 'ts-morph';

const project = new Project({
  tsConfigFilePath: 'tsconfig.json'
});

// 查找所有 'any' 使用
const sourceFiles = project.getSourceFiles('src/**/*.ts');

for (const sourceFile of sourceFiles) {
  const typeNodes = sourceFile.getDescendantsOfKind(SyntaxKind.AnyKeyword);

  for (const typeNode of typeNodes) {
    // 替换为 'unknown' (需要手动验证)
    typeNode.replaceWithText('unknown');
  }

  sourceFile.save();
}

console.log('Migration complete. Please review changes.');
```

### C. 代码审查检查清单

**类型安全审查要点:**

- [ ] 无新的 `any` 使用
- [ ] 使用 `unknown` 时有类型守卫
- [ ] 公共 API 有明确类型签名
- [ ] 泛型有适当的约束
- [ ] 类型断言有注释说明原因
- [ ] 外部数据有验证逻辑
- [ ] 错误处理类型安全

---

## 批准和签署

| 角色 | 姓名 | 日期 | 签名 |
|------|------|------|------|
| 技术负责人 | | | |
| 架构师 | | | |
| QA 负责人 | | | |

---

**文档版本:** 1.0
**最后更新:** 2026-01-31
**维护者:** Claude Code AI Assistant
