# AI 分析功能测试方案

**日期:** 2026-01-31
**功能:** AI Analysis Module (`src/services/sqlite/ai-analysis/`)
**状态:** 准备测试

---

## 📊 功能概述

新增的 AI 分析模块提供以下功能:

1. **存储 AI 分析结果** - 聚合多个观察的综合分析
2. **关联观察记录** - 将观察链接到分析
3. **全文搜索** - FTS5 搜索分析内容
4. **查询接口** - 按项目/会话/ID 查询

### 实现的文件

```
src/services/sqlite/
├── ai-analysis.ts              # 导出入口
└── ai-analysis/
    ├── types.ts                # 类型定义
    ├── store.ts                # 存储操作
    └── get.ts                  # 查询操作
```

### 数据库表 (Migration 008)

```sql
CREATE TABLE ai_analysis (
  id INTEGER PRIMARY KEY,
  memory_session_id TEXT NOT NULL,
  project TEXT NOT NULL,
  analysis_text TEXT NOT NULL,
  key_insights TEXT,           -- JSON array
  connections TEXT,             -- JSON array
  discovery_tokens INTEGER,
  created_at TEXT,
  created_at_epoch INTEGER
);

-- FTS5 全文搜索表
CREATE VIRTUAL TABLE ai_analysis_fts USING fts5(...);

-- 观察链接
ALTER TABLE observations ADD COLUMN ai_analysis_id INTEGER;
```

---

## 🧪 测试流程

### **阶段 1: 单元测试验证**

运行现有的单元测试:

```bash
# 1. 安装依赖 (如果尚未安装)
npm install

# 2. 运行 AI 分析测试
bun test tests/ai-analysis/ai-analysis-basic.test.ts

# 或者运行所有测试
npm test
```

**预期结果:**
- ✅ 所有 8 个测试通过
- ✅ 表创建成功
- ✅ 存储/查询/链接功能正常
- ✅ 全文搜索工作

---

### **阶段 2: 构建和同步**

将代码构建并部署到 Claude Code 插件:

```bash
# 1. 完整构建
npm run build

# 预期输出:
# 🔨 Building claude-mem hooks and worker service...
# ✓ worker-service.cjs built
# ✓ mcp-server.cjs built
# ✓ context-generator.cjs built

# 2. 同步到 marketplace
npm run sync-marketplace

# 预期输出:
# 📦 Syncing to ~/.claude/plugins/marketplaces/thedotmack/
# ✓ Synced successfully

# 3. 重启 worker
npm run worker:restart

# 预期输出:
# ✓ Worker stopped
# ✓ Worker started on port 37777
```

**关键文件检查:**

```bash
# 验证构建产物
ls -lh plugin/scripts/worker-service.cjs

# 验证同步
ls -lh ~/.claude/plugins/marketplaces/thedotmack/scripts/worker-service.cjs

# 验证版本一致
head -5 plugin/scripts/worker-service.cjs
```

---

### **阶段 3: 数据库迁移验证**

确保现有数据库升级到 Migration 008:

```bash
# 1. 检查当前数据库状态
sqlite3 ~/.claude-mem/claude-mem.db ".tables" | grep ai_analysis

# 预期输出:
# ai_analysis
# ai_analysis_fts

# 2. 检查表结构
sqlite3 ~/.claude-mem/claude-mem.db ".schema ai_analysis"

# 3. 检查观察表是否有新字段
sqlite3 ~/.claude-mem/claude-mem.db "PRAGMA table_info(observations);" | grep ai_analysis_id

# 预期输出:
# 列名包含 ai_analysis_id
```

**如果表不存在:**

Worker 启动时会自动执行迁移。检查日志:

```bash
npm run worker:logs | grep -i "migration\|ai_analysis"

# 预期输出:
# ✅ Created ai_analysis table and linked to observations
```

---

### **阶段 4: API 端点测试** (当前未实现)

⚠️ **注意:** 目前 AI 分析功能仅在数据库层实现,**尚未暴露 HTTP API 端点**。

未来需要在 `src/services/worker/http/routes/` 中添加:

```typescript
// 未来的 API 端点 (待实现)
GET  /api/ai-analysis/:id           // 获取分析详情
GET  /api/ai-analysis/session/:id   // 会话的所有分析
GET  /api/ai-analysis/search        // 搜索分析
POST /api/ai-analysis               // 创建分析 (SDK 调用)
```

---

### **阶段 5: 真实环境集成测试**

在真实的 Claude Code 会话中测试:

#### **测试场景 1: SDK Agent 生成分析**

1. 启动一个新的 Claude Code 会话
2. 执行多个操作产生观察 (例如: 读取文件、编辑代码、运行命令)
3. 让 SDK Agent 生成摘要时,检查是否创建 AI 分析

**验证方法:**

```bash
# 查看最新的 AI 分析
sqlite3 ~/.claude-mem/claude-mem.db \
  "SELECT id, substr(analysis_text, 1, 50) as text,
          datetime(created_at_epoch/1000, 'unixepoch') as created
   FROM ai_analysis
   ORDER BY created_at_epoch DESC
   LIMIT 5;"
```

#### **测试场景 2: 观察链接**

验证观察是否正确链接到分析:

```bash
# 查看链接的观察
sqlite3 ~/.claude-mem/claude-mem.db \
  "SELECT o.id, o.type, o.title, o.ai_analysis_id
   FROM observations o
   WHERE ai_analysis_id IS NOT NULL
   LIMIT 10;"
```

#### **测试场景 3: 全文搜索**

测试 FTS5 搜索功能:

```bash
# 搜索包含 "bug" 的分析
sqlite3 ~/.claude-mem/claude-mem.db \
  "SELECT a.id, substr(a.analysis_text, 1, 100)
   FROM ai_analysis a
   JOIN ai_analysis_fts fts ON a.id = fts.rowid
   WHERE fts MATCH 'bug'
   LIMIT 5;"
```

---

## 🔍 故障排查

### 问题 1: 构建失败

```bash
# 检查依赖
npm install

# 检查 TypeScript 编译
npx tsc --noEmit

# 手动构建 worker
node scripts/build-hooks.js
```

### 问题 2: Migration 未执行

```bash
# 检查当前 migration 版本
sqlite3 ~/.claude-mem/claude-mem.db \
  "SELECT version FROM migrations ORDER BY version DESC LIMIT 1;"

# 如果 < 8,手动触发迁移:
# 停止 worker
npm run worker:stop

# 删除旧进程锁 (如果存在)
rm -f ~/.claude-mem/worker.lock

# 重启 worker (会自动执行迁移)
npm run worker:start

# 查看迁移日志
npm run worker:logs | grep migration
```

### 问题 3: 模块导入错误

如果看到 `Cannot find module 'ai-analysis'`:

1. 确认 `src/services/sqlite/index.ts` 包含导出:
   ```typescript
   export * from './ai-analysis.js';
   ```

2. 重新构建:
   ```bash
   npm run build
   npm run sync-marketplace
   npm run worker:restart
   ```

### 问题 4: Worker 无法启动

```bash
# 检查端口占用
lsof -i :37777

# 强制停止
npm run worker:stop

# 清理进程
pkill -f worker-service

# 重启
npm run worker:start
```

---

## ✅ 成功标准

测试通过的标志:

- [x] 单元测试全部通过
- [x] 构建无错误
- [x] Worker 成功启动
- [x] 数据库表创建成功
- [x] 可以存储 AI 分析
- [x] 可以查询 AI 分析
- [x] 观察正确链接
- [x] FTS5 搜索工作
- [x] 在真实会话中产生数据

---

## 📝 测试记录

### 测试日期: _________

| 测试项 | 状态 | 备注 |
|--------|------|------|
| 单元测试 | ⬜ 通过 / ⬜ 失败 | |
| 构建 | ⬜ 通过 / ⬜ 失败 | |
| 同步 | ⬜ 通过 / ⬜ 失败 | |
| Migration | ⬜ 通过 / ⬜ 失败 | |
| Worker 启动 | ⬜ 通过 / ⬜ 失败 | |
| 真实会话测试 | ⬜ 通过 / ⬜ 失败 | |

### 发现的问题:

```
(在此记录测试中发现的问题)
```

---

## 🚀 下一步

测试通过后的后续工作:

1. **添加 HTTP API 端点** - 在 `src/services/worker/http/routes/` 中实现
2. **集成到 Web Viewer** - 在 UI 中显示 AI 分析
3. **优化提示词** - 改进 SDK 生成的分析质量
4. **添加批量分析** - 实现 implementation-plan.md 中的高级功能
5. **文档更新** - 更新 docs/public/ 中的用户文档

---

**文档版本:** v1.0
**最后更新:** 2026-01-31
