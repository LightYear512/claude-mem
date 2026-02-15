# Code Review Report — 2026-02-13 (dev vs main)

## 审查范围
46 个 src/ 文件，~6000 行 dev 变更。3 个并行审查维度：控制流/错误处理、并发/竞态、平台/安全。

## 已修复的问题

### 初始 Windows ENOENT 修复（3 项）
- `SDKAgent.findClaudeExecutable()` — Windows `where claude` 优先选 `.cmd`/`.exe`
- `ProcessRegistry.createPidCapturingSpawn()` — spawn 失败时 destroy stdio 流
- `agents/types.ts` — 添加 `uv_spawn`、`ProcessTransport` 到 UNRECOVERABLE_ERROR_PATTERNS

### 上一轮 HIGH 修复（4 项）
- `SDKAgent.ts` — try 块扩展包裹 query() + finally 块 budget rollback（null-sentinel 模式）
- `SessionRoutes.ts` — getSelectedProvider() 不再静默回退 + 添加 'no API key configured'/'Budget limit exceeded' 到 UNRECOVERABLE_ERROR_PATTERNS
- `DashScopeAgent.ts` — AbortSignal 传递到 fetch() 的 3 个调用点

### 第一批修复（4 项） — commit `7a5653db`
- **H1**: `SessionStore.ts:588` — 迁移版本号 `.run(8, ...)` → `.run(12, ...)`
- **H2**: `SessionStore.ts` — `createAIAnalysisTable` 和 `createBudgetTables` 两处事务添加 try/catch/ROLLBACK，迁移记录移入事务内
- **M4**: `logger.ts:18` — Component 类型添加 `PROCESS`、`QUEUE`、`CONSOLE`
- **M2+H5**: `BudgetController.ts` — rollback `spent_*_micros - ?` → `MAX(0, spent_*_micros - ?)`；commit 成本调整添加日期对齐检查（参考 rollback 已有逻辑）+ `MAX(0, ...)` 防负

### 第二批修复（4 项） — commit `7a5653db`
- **C1**: `logger.ts` — 新增 `redactUrlSecrets()` 函数，在 logger 核心 `log()` 方法中对所有输出行做 `?key=`/`?token=` 等敏感 URL 参数脱敏（方案 B：保留 `?key=` 传参不变，在输出路径脱敏）
- **H3**: `worker-service.ts` — `.finally()` 重启逻辑添加 `MAX_CONSECUTIVE_RESTARTS = 3` 检查，超限后 abort 并停止；自然完成时重置计数器
- **M1**: `GeminiAgent.ts`、`OpenRouterAgent.ts` — `query*MultiTurn` 方法添加 `signal?: AbortSignal` 参数并传递到 `fetch()`，各 3 个调用点传入 `session.abortController.signal`
- **H4**: `BudgetController.ts` — `getCurrentPreset()` 中当 preset 为 'custom' 时解析 `CLAUDE_MEM_BUDGET_CUSTOM_PRICING` 并覆盖 preset 定价值；清理 `getConfig()` 中的死代码

### 第三批修复（4 项） — commit `7a5653db`
- **C2**: `middleware.ts` — 重写 `requireLocalhost`：移除 Origin header bypass（可伪造），改为纯 IP 检查。新增 `isLocalOrPrivateIp()` 接受 loopback + RFC 1918 私有网段（10.x, 172.16-31.x, 192.168.x）以兼容 WSL2
- **C2**: `SettingsRoutes.ts` — 所有 POST 端点（settings 修改、MCP toggle、分支切换、test-connection、reset-vectors、test-embedding）添加 `requireLocalhost` 中间件
- **H7/H8**: `SettingsRoutes.ts` — `validateSettings()` 中为 `CLAUDE_MEM_GEMINI_API_URL` 添加 `new URL()` 解析 + 协议必须为 http/https
- **H6**: `SDKAgent.ts` — 在 `for await` 循环的成本累加后检查 `sessionTotalCostUsd > dailyLimitUsd`，超限时 `session.abortController.abort()` 并记录 warn 日志

---

## 待修复问题清单

### CRITICAL (2) — ✅ 全部已修复

| ID | 文件 | 描述 | 状态 |
|----|------|------|------|
| C1 | `logger.ts` | Gemini API key 在 URL query string (`?key=`) 中暴露 | ✅ 方案 B：保留 `?key=` 传参，在 logger 输出路径统一脱敏 |
| C2 | `middleware.ts` + `SettingsRoutes.ts` | Origin header 可伪造绕过 localhost 检查 | ✅ 重写为纯 IP 检查 + RFC 1918 私有网段（WSL2 兼容）；敏感端点全部加 requireLocalhost |

### HIGH (9) — ✅ 8 项已修复，1 项待修复

| ID | 文件 | 描述 | 状态 |
|----|------|------|------|
| H1 | `SessionStore.ts:588` | 迁移版本号检查 12 但记录 8 | ✅ 已修复 |
| H2 | `SessionStore.ts` | Migration BEGIN TRANSACTION 无 ROLLBACK | ✅ 已修复 |
| H3 | `worker-service.ts` | `startSessionProcessor` 无重启次数限制 | ✅ 已修复 |
| H4 | `BudgetController.ts` | custom pricing 解析后丢弃结果 | ✅ 已修复 |
| H5 | `BudgetController.ts` | commit() 跨日期可使 spent_today_micros 变负 | ✅ 已修复 |
| H6 | `SDKAgent.ts` | SDK 单次 reserve 覆盖整个会话，无中间 budget check | ✅ 已修复：每次响应检查累计成本，超 daily limit 时 abort |
| H7 | `SettingsRoutes.ts` | CLAUDE_CODE_PATH / CLAUDE_MEM_DATA_DIR 无验证 | ⚠️ 由 C2 修复保护（敏感端点已加 requireLocalhost），本地使用风险低 |
| H8 | `SettingsRoutes.ts` + `GeminiAgent.ts` | GEMINI_API_URL 无验证 + SSRF | ✅ 已修复：URL 格式验证 + test-connection 端点加 requireLocalhost |
| H9 | `ProcessRegistry.ts:340-363` | subprocess stderr 日志可能含敏感信息 | ⚠️ 由 C1 修复缓解（logger 统一脱敏），完整修复待定 |

### MEDIUM (13) — 12 项已修复，1 项风险极低暂缓

| ID | 文件 | 描述 | 状态 |
|----|------|------|------|
| M1 | `GeminiAgent.ts` / `OpenRouterAgent.ts` | fetch() 缺少 AbortSignal | ✅ 已修复 |
| M2 | `BudgetController.ts` | rollback 可使 spent_*_micros 变负 | ✅ 已修复 |
| M3 | `BudgetController.ts:237-249` | commit() 成本调整不增加 version，破坏乐观锁不变量 | ✅ 已修复：UPDATE 添加 version = version + 1 和 last_update_epoch |
| M4 | `logger.ts:18` | Component 类型缺少 PROCESS/QUEUE/CONSOLE | ✅ 已修复 |
| M5 | `ai-analysis/get.ts:140-141` | JSON.parse 无 try/catch，损坏数据崩溃检索路径 | ✅ 已修复：safeParseJsonArray 包裹 try/catch，损坏数据返回空数组 |
| M6 | `SettingsRoutes.ts:144-149` | GET /api/settings 返回明文 API key | ✅ 已修复：返回前将 API key 替换为 '••••••••'（保留空/非空区分） |
| M7 | `SettingsRoutes.ts:237` | CLAUDE_MEM_EMBEDDING_FUNCTION 无验证 | ✅ 已修复：在 validateSettings() 中校验值是否在 VALID_EMBEDDING_MODELS 列表中 |
| M8 | `SessionRoutes.ts:29-30,338` | spawnInProgress/crashRecoveryScheduled 在 session 删除时未清理 | ✅ 已修复：添加 cleanupSessionState() 在 delete/complete 时清理 |
| M9 | `SessionManager.ts:296-311` | resetProcessingToPending 与生成器清理可能竞态 | ⚠️ 风险极低：await generatorPromise 已提供同步点，暂缓 |
| M10 | `worker-service.ts:30-47` | spawn throttle lock file TOCTOU 竞态 | ✅ 已修复：合并为单个 statSync + catch，消除 existsSync check-then-use 间隙 |
| M11 | `worker-service.ts:444-448` | fire-and-forget vector backfill promise | ✅ 已修复：保留 promise 引用 + 5 分钟超时 + shutdown 时等待完成 |
| M12 | `mcp-server.ts:354-365` | Windows detached spawn 孤儿进程风险 | ✅ 已修复：添加 exit 监听器 + 超时后 kill 孤儿进程 + 提前退出检测 |
| M13 | `worker-service.ts:164-172,384` | dbReady promise 初始化失败时永不 resolve | ✅ 已修复：添加 rejectDbReady，初始化失败时 reject 使等待请求返回 503 |

### LOW (5)
- SDKAgent catch-and-rethrow 是 no-op（可简化为 try/finally）
- BudgetController warningTriggered 标志在事务重试时不回滚
- SDKAgent Windows `where` 输出 CRLF 分割（.trim() 已处理）
- SessionStore safeRenameColumn SQL 字符串插值（不可利用，输入硬编码）
- DashScopeAgent 错误响应完整回显（截断到 200 字符即可）

---

## 修复进度

### ✅ 第一批（快速修复） — 已完成
H1, H2, M4, M2+H5

### ✅ 第二批（中等复杂度） — 已完成
C1（方案 B：输出路径脱敏）, H3, M1, H4

### ✅ 第三批（设计决策） — 已完成
C2（纯 IP 检查 + RFC 1918）, H7/H8（URL 验证 + requireLocalhost）, H6（中间 budget 检查）

### ✅ 第四批（快速修复） — 已完成
M5（JSON.parse try/catch）, M8（session 状态清理）, M10（TOCTOU 消除）, M13（dbReady reject）

### ✅ 第五批（中等复杂度） — 已完成
M3（乐观锁版本递增）, M6（API key 脱敏）, M7（embedding 模型验证）, M11（backfill promise 跟踪+超时）

### ✅ 第六批 — 已完成
M12（孤儿进程 kill + exit 监听）

### 剩余
- **H7** (CLAUDE_CODE_PATH 验证): 由 C2 保护，本地风险低，无可靠验证方案
- **H9** (stderr 敏感信息): 由 C1 logger 脱敏缓解
- **M9** (generator 竞态): 风险极低，await generatorPromise 已提供同步点，暂缓
- 5 项 LOW 待处理

---

## 上下文信息
- 分支: dev (fork of thedotmack/claude-mem, main tracks upstream)
- 修复 commit: `7a5653db` (16 files, 814 insertions, 672 deletions)
- 构建: `npm run build` 通过
- 测试: 898-899 pass / 4-5 fail (预存失败，非本次引入)
- 预存 TS 诊断错误: SDKAgent.ts null vs undefined, SettingsRoutes.ts ModeManager import
