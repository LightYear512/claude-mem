# Budget 模块实现记录

**日期:** 2026-02-03
**版本:** v9.0.12
**状态:** ✅ 已完成

---

## 概述

Budget 模块实现了 AI 成本跟踪和预算控制功能，支持多个 AI 提供商的成本管理，采用两阶段提交模式确保数据一致性。

---

## 实现范围

### 核心组件

| 组件 | 文件路径 | 状态 |
|------|----------|------|
| BudgetController | `src/services/worker/budget/BudgetController.ts` | ✅ 完成 |
| 类型定义 | `src/services/worker/budget/types.ts` | ✅ 完成 |
| 定价预设 | `src/services/worker/budget/pricing-presets.ts` | ✅ 完成 |
| 模块导出 | `src/services/worker/budget/index.ts` | ✅ 完成 |
| HTTP 路由 | `src/services/worker/http/routes/BudgetRoutes.ts` | ✅ 完成 |
| 数据库迁移 | Migration v21 | ✅ 完成 |

### Agent 集成

| Agent | 集成方式 | 状态 |
|-------|----------|------|
| GeminiAgent | 每次 API 调用跟踪 (reserve → commit/rollback) | ✅ 完成 |
| OpenRouterAgent | 每次 API 调用跟踪 (reserve → commit/rollback) | ✅ 完成 |
| SDKAgent | 会话级跟踪 (SDK 内部管理调用，累计成本) | ✅ 完成 |

---

## 架构设计

### 两阶段提交模式

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   reserve   │ →  │   API Call  │ →  │   commit    │
│  (预留成本)  │    │   (执行)    │    │  (确认成本)  │
└─────────────┘    └─────────────┘    └─────────────┘
                          │
                          ↓ (失败)
                   ┌─────────────┐
                   │   rollback  │
                   │  (回滚成本)  │
                   └─────────────┘
```

### 乐观锁 + 重试机制

```typescript
// BudgetController 使用版本号实现乐观锁
interface BudgetState {
  version: number;        // 乐观锁版本
  spent_today_micros: number;
  spent_month_micros: number;
  daily_limit_micros: number;
  monthly_limit_micros: number;
}

// 更新时检查版本，冲突则重试（最多 3 次）
```

---

## 关键 API

### BudgetController 方法

```typescript
class BudgetController {
  // 核心事务方法
  reserve(estimatedCost: number, provider: string, sessionDbId?: number): ReserveResult;
  commit(txId: string, adjustmentMicros?: number, actualCostUsd?: number, metadata?: object): boolean;
  rollback(txId: string, reason?: string): boolean;

  // 成本计算方法（使用配置的 preset）
  calculateCost(inputTokens: number, outputTokens: number, cacheCreation?: number, cacheRead?: number): number;
  estimateCost(estimatedInputTokens: number, outputRatio?: number): number;
  isTrackingEnabled(): boolean;

  // 查询方法
  getConfig(): BudgetConfig;
  getCurrentPreset(): PricingPreset;
  getStatistics(): BudgetStatistics;
}
```

### HTTP 端点

| 方法 | 端点 | 描述 |
|------|------|------|
| GET | `/api/budget/status` | 获取预算状态 |
| GET | `/api/budget/statistics` | 获取统计信息 |
| GET | `/api/budget/history` | 获取历史记录 |
| POST | `/api/budget/reset` | 重置预算 |

---

## 定价预设

支持以下预设配置：

| 预设 ID | 提供商 | 计费类型 | 输入价格 ($/M) | 输出价格 ($/M) |
|---------|--------|----------|----------------|----------------|
| `claude-haiku` | Anthropic | paid | $0.25 | $1.25 |
| `claude-sonnet` | Anthropic | paid | $3.00 | $15.00 |
| `gemini-free` | Google | free | $0.00 | $0.00 |
| `gemini-paid` | Google | paid | $0.075 | $0.30 |
| `openrouter-free` | OpenRouter | free | $0.00 | $0.00 |
| `openrouter-paid` | OpenRouter | paid | $0.20 | $0.80 |

---

## 数据库表

### Migration v21 创建的表

```sql
-- budget_state: 全局预算状态（单行）
CREATE TABLE budget_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  budget_date TEXT NOT NULL,
  budget_month TEXT NOT NULL,
  spent_today_micros INTEGER NOT NULL DEFAULT 0,
  spent_month_micros INTEGER NOT NULL DEFAULT 0,
  daily_limit_micros INTEGER NOT NULL DEFAULT 1000000,  -- $1.00
  monthly_limit_micros INTEGER NOT NULL DEFAULT 20000000,  -- $20.00
  version INTEGER NOT NULL DEFAULT 1,  -- 乐观锁版本
  last_update_epoch INTEGER NOT NULL
);

-- budget_transactions: 两阶段提交事务
CREATE TABLE budget_transactions (
  id TEXT PRIMARY KEY,
  phase TEXT NOT NULL CHECK (phase IN ('reserved', 'committed', 'rolled_back')),
  cost_micros INTEGER NOT NULL,
  provider TEXT NOT NULL,
  observation_id INTEGER,
  session_db_id INTEGER,
  created_at_epoch INTEGER NOT NULL,
  committed_at_epoch INTEGER,
  rolled_back_at_epoch INTEGER,
  error_reason TEXT
);

-- budget_records: 历史成本记录
CREATE TABLE budget_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date_key TEXT NOT NULL,
  month_key TEXT NOT NULL,
  provider TEXT NOT NULL,
  session_db_id INTEGER,
  observation_id INTEGER,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cache_creation_tokens INTEGER DEFAULT 0,
  cache_read_tokens INTEGER DEFAULT 0,
  cost_micros INTEGER NOT NULL,
  price_input_per_m REAL,
  price_output_per_m REAL,
  created_at_epoch INTEGER NOT NULL
);
```

---

## 配置选项

在 `~/.claude-mem/settings.json` 中配置：

```json
{
  "CLAUDE_MEM_BUDGET_ENABLED": true,
  "CLAUDE_MEM_BUDGET_BILLING_TYPE": "paid",
  "CLAUDE_MEM_BUDGET_PRESET": "claude-haiku",
  "CLAUDE_MEM_BUDGET_DAILY_LIMIT_USD": 1.0,
  "CLAUDE_MEM_BUDGET_MONTHLY_LIMIT_USD": 20.0,
  "CLAUDE_MEM_BUDGET_ALERT_THRESHOLD": 0.8
}
```

---

## 提交历史

| 提交 | 描述 |
|------|------|
| `4b21434c` | feat: add budget tracking module for AI cost management |
| `237a2cdb` | feat: integrate BudgetController into Gemini and OpenRouter agents |
| `c95defbd` | feat: integrate BudgetController into SDKAgent |
| `ba1b4be2` | fix: use centralized BudgetController methods for cost calculation |
| `655d5e26` | fix: add isTrackingEnabled check in SDKAgent token cost loop |
| `553f7c84` | feat: add budget tracking database migration (v21) |

---

## 设计决策

### 1. 集中化成本计算

**问题:** 初始实现中，每个 Agent 硬编码了 pricing preset（如 `'gemini-paid'`），没有使用用户配置。

**解决方案:** 在 BudgetController 中添加 `calculateCost()`, `estimateCost()`, `isTrackingEnabled()` 方法，所有 Agent 统一使用这些方法。

### 2. 会话级 vs 调用级跟踪

- **GeminiAgent/OpenRouterAgent:** 每次 API 调用跟踪（精确但开销大）
- **SDKAgent:** 会话级跟踪（SDK 内部管理调用，启动时预留，结束时提交累计成本）

### 3. Free Tier 处理

当 `billingType === 'free'` 时：
- `isTrackingEnabled()` 返回 `false`
- `calculateCost()` 返回 `0`
- 完全跳过预算预留/提交流程

---

## 后续工作

- [ ] UI 集成：在 Web Viewer 中显示预算状态
- [ ] 告警系统：预算达到阈值时通知用户
- [ ] 历史报表：按日/月/提供商的成本报表
- [ ] 预算预测：基于历史数据预测月度成本
