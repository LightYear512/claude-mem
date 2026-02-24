# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## 项目概述

Claude-mem 是一个 Claude Code 插件,通过自动捕获工具使用观察、使用 Claude Agent SDK 生成语义摘要并注入到未来会话中,实现跨会话的持久化记忆。

**核心技术栈:**
- TypeScript (ES2022, ESNext 模块)
- Bun 运行时(worker 管理和 SQLite)
- Node.js 18+ (构建和钩子执行)
- SQLite3 + FTS5(全文搜索)+ ChromaDB(向量搜索)
- Express.js(HTTP API 服务器,端口 37777)
- React + TypeScript(Web 查看器 UI)
- esbuild(TypeScript 打包工具)

---

## 架构概览

### 五个生命周期钩子
```
SessionStart → UserPromptSubmit → PostToolUse → Stop → SessionEnd
```

1. **SessionStart**: 启动 Bun worker,注入先前会话的上下文
2. **UserPromptSubmit**: 创建数据库会话,保存用户提示
3. **PostToolUse**: 捕获工具执行(每次会话触发 100+ 次)
4. **Stop**: 生成会话摘要
5. **SessionEnd**: 标记会话完成(在 `/clear` 时跳过以保留进行中的工作)

### 核心组件

**钩子** (`src/hooks/*.ts` → `plugin/scripts/*`)
- TypeScript 源码编译为独立的可执行脚本
- 通过 stdin/stdout 与 Claude Code 通信
- 使用特定退出码(0=成功, 1=非阻塞错误, 2=阻塞错误)

**Worker 服务** (`src/services/worker-service.ts` → `plugin/scripts/worker-service.cjs`)
- Express HTTP API,端口 37777(可配置)
- 使用 Claude Agent SDK 异步处理观察
- Server-Sent Events(SSE)实时更新
- 由 Bun 管理进程生命周期

**数据库层** (`src/services/sqlite/`)
- SQLite3 位于 `~/.claude-mem/claude-mem.db`
- FTS5 虚拟表实现全文搜索
- Chroma 向量数据库用于语义搜索(位于 `~/.claude-mem/chroma/`)

**搜索技能** (`plugin/skills/mem-search/`)
- 基于技能的搜索,支持渐进式披露
- HTTP API 端点而非 MCP 工具
- 3 层工作流:search → timeline → get_observations

**查看器 UI** (`src/ui/viewer/` → `plugin/ui/viewer.html`)
- React 应用打包为自包含的 HTML 文件
- 实时内存流可视化,网址 http://localhost:37777
- 无限滚动分页和自动去重

---

## 常用命令

### 构建和同步
```bash
# 构建所有组件(钩子、worker、查看器)
npm run build

# 构建并同步到 marketplace,然后重启 worker
npm run build-and-sync

# 仅同步到已安装的插件位置
npm run sync-marketplace

# 强制同步(覆盖所有文件)
npm run sync-marketplace:force
```

### Worker 管理
```bash
# 启动 worker 服务
npm run worker:start

# 停止 worker 服务
npm run worker:stop

# 重启 worker
npm run worker:restart

# 检查 worker 状态
npm run worker:status

# 查看最近 50 行日志
npm run worker:logs

# 实时跟踪日志
npm run worker:tail
```

### 测试
```bash
# 运行所有测试
npm test

# 测试特定模块
npm run test:sqlite      # SQLite 数据库测试
npm run test:agents      # Agent 逻辑测试
npm run test:search      # 搜索功能测试
npm run test:context     # 上下文生成测试
npm run test:infra       # 基础设施测试
npm run test:server      # 服务器测试

# 运行单个测试文件
bun test tests/sqlite/observations.test.ts
```

### 开发工具
```bash
# 检查待处理队列
npm run queue

# 处理待处理队列
npm run queue:process

# 清除失败队列
npm run queue:clear

# 重新生成 CLAUDE.md 文件
npm run claude-md:regenerate

# 预览模式(不写入文件)
npm run claude-md:dry-run

# 生成 bug 报告
npm run bug-report
```

### 向量数据库管理
```bash
# 重置向量数据库(交互式)
npm run vector:reset

# 强制重置向量数据库(无确认)
npm run vector:reset:force
```

### Cursor 集成
```bash
# 安装 Cursor 钩子
npm run cursor:install

# 卸载 Cursor 钩子
npm run cursor:uninstall

# 检查 Cursor 状态
npm run cursor:status

# 运行 Cursor 设置向导
npm run cursor:setup
```

### README 翻译
```bash
# 翻译到所有语言(并行执行)
npm run translate:all

# 按层级翻译
npm run translate:tier1  # 中文、日语、葡萄牙语、韩语、西班牙语、德语、法语
npm run translate:tier2  # 希伯来语、阿拉伯语、俄语、波兰语、捷克语、荷兰语、土耳其语、乌克兰语
npm run translate:tier3  # 越南语、印尼语、泰语、印地语、孟加拉语、罗马尼亚语、瑞典语
npm run translate:tier4  # 意大利语、希腊语、匈牙利语、芬兰语、丹麦语、挪威语
```

---

## 关键文件位置

**源代码:**
- `src/hooks/` - 钩子实现
- `src/services/worker-service.ts` - Worker HTTP 服务
- `src/services/sqlite/` - 数据库层
- `src/servers/mcp-server.ts` - MCP 服务器
- `src/sdk/` - Claude Agent SDK 集成
- `src/ui/viewer/` - React 查看器 UI
- `src/utils/` - 共享工具

**构建输出:**
- `plugin/scripts/` - 编译后的可执行脚本
- `plugin/ui/viewer.html` - 打包的查看器 UI
- `plugin/hooks/hooks.json` - 钩子配置
- `plugin/skills/` - 技能定义

**用户数据:**
- `~/.claude-mem/claude-mem.db` - SQLite 数据库
- `~/.claude-mem/chroma/` - Chroma 向量数据库
- `~/.claude-mem/settings.json` - 用户设置
- `~/.claude-mem/logs/` - Worker 日志

**已安装插件:**
- `~/.claude/plugins/marketplaces/thedotmack/` - 已安装的插件位置

---

## 开发工作流

### 1. 修改代码
编辑 `src/` 目录中的 TypeScript 源文件。

### 2. 构建
```bash
npm run build
```

这将:
- 使用 esbuild 编译 TypeScript
- 打包钩子为独立可执行文件(ESM 格式)
- 打包 worker 服务(CJS 格式,带 `#!/usr/bin/env bun` shebang)
- 打包 MCP 服务器(CJS 格式,带 `#!/usr/bin/env node` shebang)
- 构建 React 查看器 UI 为自包含的 HTML

### 3. 同步并重启
```bash
npm run sync-marketplace
npm run worker:restart
```

或者使用组合命令:
```bash
npm run build-and-sync
```

### 4. 测试
在真实的 Claude Code 会话中测试功能,或运行自动化测试:
```bash
npm test
```

### 5. 手动测试钩子
```bash
# 测试 context hook
echo '{"session_id":"test-123","cwd":"'$(pwd)'","source":"startup"}' | \
  bun plugin/scripts/worker-service.cjs hook claude-code context

# 测试 session-init hook
echo '{"session_id":"test-123","cwd":"'$(pwd)'","prompt":"test"}' | \
  bun plugin/scripts/worker-service.cjs hook claude-code session-init
```

### 6. 检查日志
```bash
npm run worker:logs
```

---

## 构建系统详情

**构建脚本:** `scripts/build-hooks.js`

**构建过程:**
1. 从 `package.json` 读取版本号
2. 创建输出目录(`plugin/scripts/`, `plugin/ui/`)
3. 生成 `plugin/package.json`(运行时依赖元数据)
4. 构建 React 查看器(调用 `scripts/build-viewer.js`)
5. 使用 esbuild 打包 worker 服务
6. 使用 esbuild 打包 MCP 服务器
7. 使用 esbuild 打包 context generator
8. 设置可执行权限(chmod 0o755)

**esbuild 配置:**
- 平台: `node`
- 目标: `node18`
- 格式: Worker/MCP=`cjs`, Hooks=`esm`
- 压缩: `true`
- 外部依赖: `bun:sqlite`(Bun 内置)
- 定义: `__DEFAULT_PACKAGE_VERSION__` 注入版本号

---

## 隐私标签处理

用户可以使用 `<private>content</private>` 标签防止内容存储。

**实现位置:**
- 标签剥离发生在钩子层(边缘处理)
- 数据到达 worker/数据库之前完成
- 共享工具: `src/utils/tag-stripping.ts`

---

## 退出码策略

钩子使用特定退出码符合 Claude Code 钩子契约:

- **退出 0**: 成功或优雅关闭(Windows Terminal 关闭标签页)
- **退出 1**: 非阻塞错误(stderr 显示给用户,继续执行)
- **退出 2**: 阻塞错误(stderr 传递给 Claude 处理)

**理念:** Worker/钩子错误使用退出码 0 防止 Windows Terminal 标签页累积。wrapper/plugin 层处理重启逻辑。ERROR 级别日志仍然保留用于诊断。

---

## 数据库架构

**主表:**
- `sessions` - 会话元数据
- `observations` - 工具使用观察
- `session_summaries` - AI 生成的摘要
- `prompts` - 用户提示历史

**FTS5 虚拟表:**
- `observations_fts` - 观察内容全文搜索
- `sessions_fts` - 会话数据全文搜索
- `prompts_fts` - 提示全文搜索

**Chroma 向量数据库:**
- 语义相似度搜索
- 混合搜索策略(关键词 + 语义)

**迁移:**
- `src/services/sqlite/migrations.ts` - 数据库迁移定义
- 自动在 worker 启动时运行

---

## 配置

设置在 `~/.claude-mem/settings.json` 中管理(首次运行时自动创建默认值)。

**关键设置:**
- `workerPort` - HTTP API 端口(默认 37777)
- `CLAUDE_MEM_WORKER_HOST` - Worker 绑定地址(默认 `127.0.0.1`)。WSL2/Docker 用户如需从外部访问,可设为 `0.0.0.0`
- `dataDir` - 数据目录(默认 `~/.claude-mem`)
- `logLevel` - 日志级别(DEBUG, INFO, WARN, ERROR)
- `contextConfig` - 上下文注入设置
- `CLAUDE_MEM_EMBEDDING_FUNCTION` - Embedding 模型配置(默认 'default')

### 修改设置后重启 Worker

修改 `~/.claude-mem/settings.json` 后,需要重启 worker 使设置生效:

```bash
# 方式 1: 通过 HTTP API 关闭(推荐,下次 Claude Code 交互时自动重启)
curl -X POST http://127.0.0.1:37777/api/admin/shutdown

# 方式 2: 开发环境中使用 npm 命令
npm run worker:restart
```

### Embedding 模型配置

Claude-mem 使用 ChromaDB 进行语义向量搜索。你可以配置不同的 embedding 模型以优化特定语言的搜索质量。

**配置位置:**
`~/.claude-mem/settings.json`

**配置示例:**
```json
{
  "CLAUDE_MEM_EMBEDDING_FUNCTION": "default"
}
```

**支持的 Embedding 模型:**

1. **default** (默认)
   - 模型: `all-MiniLM-L6-v2`
   - 维度: 384
   - 语言: 英文
   - 特点: 快速,轻量级,适合英文为主的项目

2. **multilingual** (多语言)
   - 模型: `multilingual-MiniLM-L12-v2`
   - 维度: 384
   - 语言: 50+ 语言(包括中文)
   - 特点: 支持多语言,适合混合语言项目
   - 配置值: `sentence-transformers/multilingual-MiniLM-L12-v2`

3. **中文优化模型**
   - 模型: `text2vec-base-chinese`
   - 维度: 768
   - 语言: 中文
   - 特点: 中文语义理解最佳
   - 配置值: `shibing624/text2vec-base-chinese`

4. **高质量多语言模型**
   - 模型: `paraphrase-multilingual-mpnet-base-v2`
   - 维度: 768
   - 语言: 50+ 语言
   - 特点: 更好的语义理解,但速度较慢
   - 配置值: `sentence-transformers/paraphrase-multilingual-mpnet-base-v2`

**更改 Embedding 模型的步骤:**

1. 编辑配置文件:
   ```bash
   # 打开设置文件
   nano ~/.claude-mem/settings.json

   # 修改 CLAUDE_MEM_EMBEDDING_FUNCTION 为所需模型
   # 例如: "CLAUDE_MEM_EMBEDDING_FUNCTION": "sentence-transformers/multilingual-MiniLM-L12-v2"
   ```

2. 重置向量数据库:
   ```bash
   # ⚠️ 警告: 这将删除所有现有向量数据
   npm run vector:reset
   ```

3. 重启 worker 服务:
   ```bash
   npm run worker:restart
   ```

4. 向量会自动重新索引(在后台进行)

**重要提示:**
- ⚠️ 更改 embedding 模型需要重建整个向量数据库
- 不同模型的向量维度可能不同,不支持混合维度
- 首次使用新模型时会自动下载(可能需要几分钟)
- 模型大小范围: 100MB-1GB
- Windows 平台目前不支持 Chroma 向量搜索

使用设置管理器读取/写入设置:
```typescript
import { SettingsManager } from './src/shared/SettingsDefaultsManager';
const settings = SettingsManager.load();
```

---

## 文档

**公开文档:** https://docs.claude-mem.ai (Mintlify)
- **源码:** `docs/public/` - MDX 文件
- **配置:** `docs/public/docs.json` - 导航和元数据
- **部署:** 推送到 main 分支时自动部署

**内部文档:** `docs/context/` - 规划文档、审计、参考资料

**不要将规划/设计文档放在 `docs/public/` 中 - 仅用于用户文档。**

---

## Pro 功能架构

Claude-mem 在开源核心功能和可选 Pro 功能之间有明确分离。

**开源核心**(本仓库):
- localhost:37777 上的所有 worker API 端点完全开放可访问
- Pro 功能是无头的 - 本代码库中没有专有 UI 元素
- Pro 集成点最小化:许可证密钥设置,隧道配置逻辑

**Pro 功能**(即将推出,外部):
- 增强 UI(Memory Stream)连接到与开源查看器相同的 localhost:37777 端点
- 高级过滤、时间轴擦除、搜索工具等附加功能
- 通过许可证验证控制访问,而非修改核心端点

---

## 重要注意事项

### Changelog 自动生成
**不要手动编辑 CHANGELOG.md** - 它由 `npm run changelog:generate` 自动生成。

### 测试理念
Claude-mem 依赖**真实使用场景和手动测试**而非传统单元测试。优先考虑:
1. 手动验证 - 在实际 Claude Code 会话中测试功能
2. 集成测试 - 端到端运行完整系统
3. 数据库检查 - 通过 SQLite 查询验证数据正确性
4. CLI 工具 - 用于检查系统状态的交互式工具
5. 可观察性 - 全面的日志记录和 worker 健康检查

**原因:** 钩子行为高度依赖 Claude Code 的运行时环境,SDK 交互需要真实的 API 调用和响应,SQLite 和 Bun 运行时提供稳定性保证。

### 构建产物
构建产物(`plugin/scripts/`, `plugin/ui/`)由源代码生成。修改源代码(`src/`)而非构建产物。

### 依赖管理
- **Bun**: 所有平台自动安装(如果缺失)
- **uv**: 所有平台自动安装(如果缺失,为 Chroma 提供 Python)
- **Node.js 18+**: 必需(构建和钩子执行)

### 版本控制
发布时更新多个位置的版本号:
1. `package.json` - 主版本
2. `plugin/.claude-plugin/plugin.json` - 插件元数据
3. `CLAUDE.md` 顶部 - 开发文档
4. `README.md` 版本徽章 - 用户文档

或使用 `npm version` 命令自动化部分步骤。

### Fork 项目开发原则

本项目是 upstream (thedotmack/claude-mem) 的 fork,`main` 分支跟踪 upstream,`dev` 分支是我们的开发分支。

**分析问题时必须区分问题来源:**
- **upstream 的 bug** → 修复必须谨慎,因为我们的改动可能导致后续 merge upstream 时产生冲突或难以合并。应优先考虑:向 upstream 提 issue/PR、以最小侵入方式修复、或等待 upstream 自行修复。
- **我们 dev 分支的 bug** → 直接修复即可,不影响 upstream 合并。

**分析方法:**
```bash
# 查看某文件仅在 dev 上的改动(我们的修改)
git log --oneline dev --not main -- <file>

# 查看某文件在 main 上的改动(upstream 的修改)
git log --oneline main -- <file>

# 检查某个 commit 属于哪个分支
git branch --contains <commit-hash>
```

**修改 upstream 代码的注意事项:**
- 尽量保持与 upstream 代码结构一致,避免大范围重构
- 修复 upstream bug 时,优先在不改动 upstream 文件的前提下用 wrapper/override 方式处理
- 如果必须修改 upstream 文件,记录修改原因和对应的 upstream issue 编号

---

## 调试

### 启用调试日志
```bash
export DEBUG=claude-mem:*
npm run worker:restart
npm run worker:logs
```

### 检查数据库
```bash
sqlite3 ~/.claude-mem/claude-mem.db

# 查看架构
.schema observations

# 查询数据
SELECT * FROM observations LIMIT 10;
```

### 跟踪观察
使用 correlation ID 跟踪管道中的观察:
```bash
sqlite3 ~/.claude-mem/claude-mem.db
SELECT correlation_id, tool_name, created_at
FROM observations
WHERE session_id = 'YOUR_SESSION_ID'
ORDER BY created_at;
```

### 检查 worker 健康
```bash
# Worker 状态
curl http://localhost:37777/api/health

# 待处理队列
curl http://localhost:37777/api/pending-queue

# 数据库完整性
sqlite3 ~/.claude-mem/claude-mem.db "PRAGMA integrity_check;"
```

---

## 代码审查清单

日常开发和 `/review` 命令共用的审查规则。发现新的反模式时应及时补充。

### 控制流与错误处理
- switch/case 必须有 `break`/`return`，尤其是 `process.exit()` 后面
- Hook 退出码契约：0=成功, 1=非阻塞错误, 2=阻塞错误
- Worker 错误用退出码 0（防止 Windows Terminal 标签页累积）
- 不吞异常：catch 块必须 log 或 re-throw，禁止空 catch
- async 函数必须 `await`，不允许 fire-and-forget
- `process.exit()` 前必须 `await` 所有未完成的异步操作

### 并发与竞态条件
- 端口绑定需要重试或冲突检测
- 进程启动后必须等待就绪信号，不能假设立即可用
- PID 文件的读写需要原子操作（避免 TOCTOU）
- 健康检查区分 liveness vs readiness
- `setTimeout`/`setInterval` 在关闭时必须清理
- DB 写操作使用事务保护，避免 read-then-write 竞态

### 平台兼容性
- 避免硬编码 Unix 路径，使用 `path.join()` 和跨平台 API
- `localhost` vs `127.0.0.1`：WSL2 场景下注意 Origin 检查
- 文件权限（chmod）在 Windows 上不生效，需要条件处理
- 进程管理（detached, unref, stdio）在不同平台行为不同

### 安全
- 用户输入不直接传入 shell 命令（防注入）
- 文件路径需验证，防止路径穿越
- SQL 使用参数化查询，禁止字符串拼接
- API 边界做输入长度和类型校验
- 错误信息不暴露 secrets/tokens

---

## 许可证

**主项目:** AGPL-3.0 - 如果在网络服务器上修改和部署,必须提供源代码。

**Ragtime 目录:** PolyForm Noncommercial License 1.0.0(单独许可)- 参见 `ragtime/LICENSE`。
