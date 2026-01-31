# AI 分析功能部署指南

**日期:** 2026-01-31
**状态:** ✅ 代码完成,待构建部署
**测试结果:** ✅ 7/7 单元测试通过

---

## ✅ 已完成的工作

### 1. 核心功能实现

- ✅ **AI Analysis 模块** (`src/services/sqlite/ai-analysis/`)
  - `types.ts` - 类型定义
  - `store.ts` - 存储操作
  - `get.ts` - 查询操作

- ✅ **数据库 Migration 12**
  - 创建 `ai_analysis` 表
  - 创建 `ai_analysis_fts` FTS5 虚拟表
  - 添加 `observations.ai_analysis_id` 外键
  - 创建所有必需的索引和触发器

- ✅ **集成到 SessionStore**
  - 添加 `storeAIAnalysis()` 方法
  - 添加 `getAIAnalysisById()` 方法
  - 添加 `getRecentAIAnalyses()` 方法
  - 添加 `searchAIAnalyses()` 方法
  - 添加 `getObservationsForAnalysis()` 方法
  - 添加 `getExistingAnalysisForObservations()` 方法

- ✅ **导出到公共 API**
  - 在 `src/services/sqlite/index.ts` 中导出所有 AI 分析功能

- ✅ **单元测试**
  - 7 个测试全部通过
  - 覆盖存储、查询、链接、搜索功能

### 2. 修改的文件列表

```
src/services/sqlite/
├── index.ts                      # ✅ 添加 ai-analysis 导出
├── SessionStore.ts               # ✅ 添加 Migration 12 + AI 分析方法
├── ai-analysis.ts                # ✅ 新增
└── ai-analysis/
    ├── types.ts                  # ✅ 新增
    ├── store.ts                  # ✅ 新增
    └── get.ts                    # ✅ 新增

src/services/sqlite/migrations/
└── runner.ts                     # ✅ 添加 Migration 12

tests/ai-analysis/
└── ai-analysis-basic.test.ts     # ✅ 新增 + 修复

docs/context/
├── ai-analysis-testing-plan.md   # ✅ 新增
└── ai-analysis-deployment-guide.md # ✅ 本文档
```

---

## 🚀 部署步骤

### 前提条件

由于项目在 Windows 挂载路径 (`/mnt/e/`),**必须在 Windows 系统中执行构建**。

### 步骤 1: 在 Windows 中打开终端

使用 **PowerShell** 或 **命令提示符(CMD)**:

```powershell
cd E:\WorkSpace\_Other\claude-mem
```

### 步骤 2: 执行完整构建

```powershell
npm run build
```

**预期输出:**
```
🔨 Building claude-mem hooks and worker service...
📌 Version: 9.0.12
📦 Preparing output directories...
✓ Output directories ready
📋 Building React viewer...
✓ React viewer built successfully
🔧 Building worker service...
✓ worker-service.cjs built successfully
🔧 Building MCP server...
✓ mcp-server.cjs built successfully
🔧 Building context generator...
✓ context-generator.cjs built successfully
✨ All hooks and services built successfully!
```

### 步骤 3: 同步到 Marketplace

```powershell
npm run sync-marketplace
```

**预期输出:**
```
📦 Syncing to ~/.claude/plugins/marketplaces/thedotmack/
✓ Synced scripts/
✓ Synced ui/
✓ Synced skills/
✓ Synced modes/
✓ Synced hooks/
✓ Synced package.json
✓ Synced successfully
```

### 步骤 4: 重启 Worker

```powershell
npm run worker:restart
```

**预期输出:**
```
Stopping worker service...
✓ Worker stopped
Starting worker service...
✓ Worker started on port 37777
```

### 步骤 5: 验证数据库迁移

```bash
# 在 WSL2 或 Git Bash 中执行
sqlite3 ~/.claude-mem/claude-mem.db ".tables" | grep ai_analysis
```

**预期输出:**
```
ai_analysis
ai_analysis_fts
ai_analysis_fts_config
ai_analysis_fts_data
ai_analysis_fts_docsize
ai_analysis_fts_idx
```

### 步骤 6: 检查 Migration 版本

```bash
sqlite3 ~/.claude-mem/claude-mem.db "SELECT version FROM schema_versions WHERE version = 12"
```

**预期输出:**
```
12
```

### 步骤 7: 检查 Worker 日志

```powershell
npm run worker:logs
```

查找以下日志:
```
[DB] Creating ai_analysis table with FTS5 support
[DB] Successfully created ai_analysis table with FTS5 support
```

---

## 🧪 测试验证

### 在真实 Claude Code 会话中测试

1. 启动新的 Claude Code 会话
2. 执行一些操作(读取文件、编写代码等)产生观察
3. 让 SDK Agent 生成摘要
4. 检查数据库中的 AI 分析记录

### 手动数据库查询

```bash
# 查看 AI 分析记录
sqlite3 ~/.claude-mem/claude-mem.db \
  "SELECT id, substr(analysis_text, 1, 50) as text,
          datetime(created_at_epoch/1000, 'unixepoch') as created
   FROM ai_analysis
   ORDER BY created_at_epoch DESC
   LIMIT 5;"

# 查看链接的观察
sqlite3 ~/.claude-mem/claude-mem.db \
  "SELECT o.id, o.type, o.title, o.ai_analysis_id
   FROM observations o
   WHERE ai_analysis_id IS NOT NULL
   LIMIT 10;"

# 测试全文搜索
sqlite3 ~/.claude-mem/claude-mem.db \
  "SELECT a.id, substr(a.analysis_text, 1, 100)
   FROM ai_analysis a
   JOIN ai_analysis_fts fts ON a.id = fts.rowid
   WHERE ai_analysis_fts MATCH 'database OR optimization'
   LIMIT 5;"
```

---

## ❌ 故障排查

### 问题 1: 构建失败 - esbuild 平台不匹配

**症状:**
```
Error: You installed esbuild for another platform
```

**解决方案:**
- **必须在 Windows 中构建** (PowerShell/CMD)
- 或者在 WSL2 原生路径重新安装依赖

### 问题 2: Migration 12 未执行

**症状:**
```sql
sqlite> SELECT * FROM ai_analysis;
Error: no such table: ai_analysis
```

**诊断:**
```bash
# 检查 migration 版本
sqlite3 ~/.claude-mem/claude-mem.db "SELECT version FROM schema_versions ORDER BY version"

# 检查 worker 日志
npm run worker:logs | grep -i "migration\|ai_analysis"
```

**解决方案:**
```bash
# 停止 worker
npm run worker:stop

# 删除进程锁
rm -f ~/.claude-mem/worker.lock

# 重启 worker (会自动执行迁移)
npm run worker:start
```

### 问题 3: 观察无法链接到分析

**症状:**
```
SQLiteError: FOREIGN KEY constraint failed
```

**原因:** `memory_session_id` 在 `sdk_sessions` 表中不存在

**解决方案:**
确保先创建会话记录再创建 AI 分析。

---

## 📊 功能验证清单

部署后验证以下功能:

- [ ] Migration 12 已应用 (version = 12 in schema_versions)
- [ ] `ai_analysis` 表已创建
- [ ] `ai_analysis_fts` FTS5 表已创建
- [ ] `observations.ai_analysis_id` 列已添加
- [ ] Worker 成功启动(端口 37777)
- [ ] 可以存储 AI 分析记录
- [ ] 可以查询 AI 分析记录
- [ ] 可以搜索 AI 分析(FTS5)
- [ ] 观察可以链接到分析
- [ ] 在真实会话中产生 AI 分析数据

---

## 🔄 回滚流程

如果部署后出现问题,使用以下步骤回滚:

```bash
# 1. 停止 worker
npm run worker:stop

# 2. 恢复备份(如果有)
cp ~/.claude-mem/backup/claude-mem-YYYYMMDD.db ~/.claude-mem/claude-mem.db

# 3. 切换到旧版本
cd /path/to/claude-mem
git checkout v9.0.11  # 或之前的版本

# 4. 重新构建和同步
npm run build
npm run sync-marketplace

# 5. 重启 worker
npm run worker:start
```

---

## 📝 下一步

AI 分析功能现在已集成到数据库层,但还需要以下后续工作:

### 短期(必需)
1. **HTTP API 端点** - 在 `src/services/worker/http/routes/` 中添加 AI 分析 API
2. **SDK 集成** - 修改 SDK Agent 使用 AI 分析功能
3. **Web Viewer UI** - 在查看器中显示 AI 分析

### 中期(可选)
4. **优化提示词** - 改进分析质量
5. **批量分析** - 实现 implementation-plan.md 中的批量处理
6. **成本控制** - 添加预算管理

### 长期(扩展)
7. **分类洞察** - 实现 `categorized_insights` 表
8. **对话线程** - 实现 `conversation_threads` 表
9. **项目进度** - 实现 `project_progress` 表
10. **知识图谱** - 实现 `knowledge_entities` 和 `knowledge_relationships` 表

---

## 📚 相关文档

- **测试计划:** `docs/context/ai-analysis-testing-plan.md`
- **实施计划:** `docs/context/implementation-plan.md`
- **架构设计:** `docs/context/architecture-design.md`
- **主文档:** `CLAUDE.md`

---

**文档版本:** v1.0
**最后更新:** 2026-01-31
**作者:** Claude Code Assistant
